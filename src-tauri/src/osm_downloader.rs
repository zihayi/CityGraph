use reqwest::{Client, StatusCode};
use serde::{Deserialize, Serialize};
use std::{collections::HashMap, sync::Mutex, time::{Duration, Instant}};
use tauri::{ipc::Channel, State};
use tokio::sync::{watch, Mutex as AsyncMutex};

const USER_AGENT: &str = "CityGraph/0.2.0 (+https://github.com/zihayi/CityGraph)";
const MAP_URL: &str = "https://api.openstreetmap.org/api/0.6/map";
const SEARCH_URL: &str = "https://photon.komoot.io/api/";
const MAX_BYTES: usize = 32 * 1024 * 1024;
const TILE_EDGE_KM: f64 = 2.0;
const MIN_TIMEOUT_TILE_EDGE_KM: f64 = 0.25;
const MAX_CONSECUTIVE_TIMEOUT_SPLITS: usize = 3;

#[derive(Clone, Copy, Debug, Deserialize, Serialize)]
pub struct OsmBounds {
    pub south: f64,
    pub west: f64,
    pub north: f64,
    pub east: f64,
}

impl OsmBounds {
    fn valid(&self) -> bool {
        [self.south, self.west, self.north, self.east].iter().all(|value| value.is_finite())
            && self.south >= -85.0 && self.north <= 85.0 && self.west >= -180.0 && self.east <= 180.0
            && self.south < self.north && self.west < self.east
    }

    fn validate_download(&self) -> Result<(), String> {
        if !self.valid() { return Err("invalidBounds".into()); }
        let height = (self.north - self.south).to_radians() * 6371.0088;
        let width = (self.east - self.west).to_radians() * 6371.0088 * ((self.south + self.north) / 2.0).to_radians().cos();
        if width < 0.01 || height < 0.01 { return Err("invalidBounds".into()); }
        Ok(())
    }

    fn split(&self) -> [Self; 4] {
        let latitude = (self.south + self.north) / 2.0;
        let longitude = (self.west + self.east) / 2.0;
        [
            Self { north: latitude, east: longitude, ..*self },
            Self { north: latitude, west: longitude, ..*self },
            Self { south: latitude, east: longitude, ..*self },
            Self { south: latitude, west: longitude, ..*self },
        ]
    }

    fn dimensions_km(&self) -> (f64, f64) {
        let latitude = if self.south <= 0.0 && self.north >= 0.0 { 0.0 } else { self.south.abs().min(self.north.abs()) };
        let height = (self.north - self.south).to_radians() * 6371.0088;
        let width = (self.east - self.west).to_radians() * 6371.0088 * latitude.to_radians().cos();
        (width, height)
    }

    fn download_children(&self) -> Option<Vec<Self>> {
        let (width, height) = self.dimensions_km();
        // A long narrow selection must not be rejected just because a four-way
        // split would make its short edge smaller than the API's minimum.
        let children = if width > height * 3.0 {
            let middle = (self.west + self.east) / 2.0;
            vec![Self { east: middle, ..*self }, Self { west: middle, ..*self }]
        } else if height > width * 3.0 {
            let middle = (self.south + self.north) / 2.0;
            vec![Self { north: middle, ..*self }, Self { south: middle, ..*self }]
        } else { self.split().to_vec() };
        children.iter().all(|child| child.validate_download().is_ok()).then_some(children)
    }

    fn timeout_children(&self) -> Option<Vec<Self>> {
        let (width, height) = self.dimensions_km();
        if width.max(height) <= MIN_TIMEOUT_TILE_EDGE_KM { None } else { self.download_children() }
    }
}

// Enumerate the initial grid lazily: even a very large selection does not
// allocate millions of pending bounds before cancellation is possible.
struct OsmTileGrid { bounds: OsmBounds, columns: usize, rows: usize, next: usize }
impl OsmTileGrid {
    fn new(bounds: OsmBounds) -> Self {
        let (width, height) = bounds.dimensions_km();
        Self { bounds, columns: (width / TILE_EDGE_KM).ceil().max(1.0) as usize, rows: (height / TILE_EDGE_KM).ceil().max(1.0) as usize, next: 0 }
    }
}
impl Iterator for OsmTileGrid {
    type Item = OsmBounds;
    fn next(&mut self) -> Option<Self::Item> {
        if self.next >= self.columns * self.rows { return None; }
        let row = self.next / self.columns; let column = self.next % self.columns; self.next += 1;
        let b = self.bounds; let dx = (b.east - b.west) / self.columns as f64; let dy = (b.north - b.south) / self.rows as f64;
        Some(OsmBounds { south: b.south + row as f64 * dy, west: b.west + column as f64 * dx, north: if row + 1 == self.rows { b.north } else { b.south + (row + 1) as f64 * dy }, east: if column + 1 == self.columns { b.east } else { b.west + (column + 1) as f64 * dx } })
    }
    fn size_hint(&self) -> (usize, Option<usize>) { let remaining = self.columns * self.rows - self.next; (remaining, Some(remaining)) }
}
impl ExactSizeIterator for OsmTileGrid {}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OsmSearchResult {
    id: String,
    name: String,
    display_name: String,
    latitude: f64,
    longitude: f64,
    bounds: Option<OsmBounds>,
}

#[derive(Default)]
struct SearchState {
    last_request: Option<Instant>,
    cache: HashMap<String, (Instant, Vec<OsmSearchResult>)>,
}

#[derive(Default)]
pub struct OsmNetworkState {
    search: AsyncMutex<SearchState>,
    downloads: Mutex<HashMap<String, watch::Sender<bool>>>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadProgress {
    completed_tiles: usize,
    total_tiles: usize,
    bytes: usize,
    stage: &'static str,
}

#[derive(Serialize)]
pub struct DownloadResult {
    parts: Vec<String>,
    bounds: OsmBounds,
    bytes: usize,
}

fn client(timeout: u64) -> Result<Client, String> {
    Client::builder().user_agent(USER_AGENT).connect_timeout(Duration::from_secs(10))
        .timeout(Duration::from_secs(timeout)).build().map_err(|_| "network".into())
}

fn network_error(error: reqwest::Error) -> String {
    if error.is_connect() { "connection".into() } else if error.is_timeout() { "timeout".into() } else if error.is_body() || error.is_decode() { "interrupted".into() } else { "network".into() }
}

// Retry a complete tile, never append a partially received response to the map.
// Dropping this future (the download cancellation select) also cancels backoff.
async fn request_body(client: &Client, endpoint: &str, query: &[(&str, String)], limit: usize, progress: impl FnMut(usize, bool)) -> Result<(StatusCode, Vec<u8>), String> {
    request_body_with_policy(client, endpoint, query, limit, false, progress).await
}

async fn request_body_with_policy(client: &Client, endpoint: &str, query: &[(&str, String)], limit: usize, split_timeouts: bool, mut progress: impl FnMut(usize, bool)) -> Result<(StatusCode, Vec<u8>), String> {
    for attempt in 0..3 {
        let mut retry_after = None;
        let result = match client.get(endpoint).query(query).send().await {
            Err(error) => Err(network_error(error)),
            Ok(response) => {
                let status = response.status();
                retry_after = response.headers().get(reqwest::header::RETRY_AFTER).and_then(|value| value.to_str().ok()).and_then(|value| value.parse::<u64>().ok());
                if status.is_success() || status == StatusCode::BAD_REQUEST {
                    bounded_body(response, if status.is_success() { limit } else { 64 * 1024 }, |bytes| progress(bytes, false)).await.map(|body| (status, body))
                } else if status == StatusCode::TOO_MANY_REQUESTS { Err("rateLimited".into()) }
                else if status == StatusCode::REQUEST_TIMEOUT || status == StatusCode::GATEWAY_TIMEOUT { Err("timeout".into()) }
                else if status.is_server_error() { Err("serverUnavailable".into()) }
                else { Err("rejected".into()) }
            }
        };
        match result {
            Ok(body) => return Ok(body),
            Err(error) => {
                let retryable = matches!(error.as_str(), "network" | "connection" | "interrupted" | "timeout" | "serverUnavailable" | "rateLimited");
                if split_timeouts && error == "timeout" {
                    if let Some(seconds) = retry_after { if seconds > 10 { return Err("serverUnavailable".into()); } tokio::time::sleep(Duration::from_secs(seconds)).await; }
                    return Err(error);
                }
                if !retryable || attempt == 2 || retry_after.is_some_and(|seconds| seconds > 10) { return Err(error); }
                progress(0, true);
                tokio::time::sleep(Duration::from_secs(retry_after.unwrap_or(1 << attempt).max(1))).await;
            }
        }
    }
    unreachable!()
}

async fn bounded_body(mut response: reqwest::Response, limit: usize, mut progress: impl FnMut(usize)) -> Result<Vec<u8>, String> {
    if response.content_length().unwrap_or(0) > limit as u64 { return Err("tooLarge".into()); }
    let mut body = Vec::new(); let mut updated = Instant::now();
    while let Some(chunk) = response.chunk().await.map_err(network_error)? {
        if body.len().saturating_add(chunk.len()) > limit { return Err("tooLarge".into()); }
        body.extend_from_slice(&chunk);
        if updated.elapsed() >= Duration::from_millis(150) { progress(body.len()); updated = Instant::now(); }
    }
    progress(body.len()); Ok(body)
}

fn parse_search(body: &[u8]) -> Result<Vec<OsmSearchResult>, String> {
    let value: serde_json::Value = serde_json::from_slice(body).map_err(|_| "invalidResponse")?;
    let features = value.get("features").and_then(|item| item.as_array()).ok_or("invalidResponse")?;
    let mut result = Vec::new(); let mut seen = std::collections::HashSet::new();
    for feature in features.iter().take(20) {
        let properties = &feature["properties"];
        let Some(coordinates) = feature["geometry"]["coordinates"].as_array() else { continue; };
        let (Some(longitude), Some(latitude)) = (coordinates.first().and_then(|v| v.as_f64()), coordinates.get(1).and_then(|v| v.as_f64())) else { continue; };
        if !latitude.is_finite() || !longitude.is_finite() || latitude.abs() > 85.0 || longitude.abs() > 180.0 { continue; }
        let name = properties["name"].as_str().or_else(|| properties["street"].as_str()).unwrap_or("");
        if name.is_empty() { continue; }
        let id = format!("{}:{}:{latitude}:{longitude}", properties["osm_type"].as_str().unwrap_or(""), properties["osm_id"]);
        if !seen.insert(id.clone()) { continue; }
        let mut parts = vec![name.to_string()];
        for key in ["district", "city", "state", "country"] {
            if let Some(part) = properties[key].as_str() { if !part.is_empty() && !parts.iter().any(|value| value == part) { parts.push(part.to_string()); } }
        }
        let bounds = properties["extent"].as_array().and_then(|values| {
            let bounds = OsmBounds { west: values.first()?.as_f64()?, north: values.get(1)?.as_f64()?, east: values.get(2)?.as_f64()?, south: values.get(3)?.as_f64()? };
            bounds.valid().then_some(bounds)
        });
        result.push(OsmSearchResult { id, name: name.to_string(), display_name: parts.join(" · "), latitude, longitude, bounds });
    }
    Ok(result)
}

#[tauri::command(rename_all = "camelCase")]
pub async fn osm_search_places(query: String, latitude: f64, longitude: f64, state: State<'_, OsmNetworkState>) -> Result<Vec<OsmSearchResult>, String> {
    let query = query.trim();
    if query.is_empty() || query.chars().count() > 160 || !latitude.is_finite() || !longitude.is_finite() || latitude.abs() > 85.0 || longitude.abs() > 180.0 { return Err("invalidBounds".into()); }
    let key = format!("{}:{latitude:.3}:{longitude:.3}", query.to_lowercase());
    let mut search = state.search.lock().await;
    if let Some((time, results)) = search.cache.get(&key) { if time.elapsed() < Duration::from_secs(3600) { return Ok(results.clone()); } }
    if let Some(last) = search.last_request { if let Some(wait) = Duration::from_secs(1).checked_sub(last.elapsed()) { tokio::time::sleep(wait).await; } }
    search.last_request = Some(Instant::now());
    let (status, body) = request_body(&client(20)?, SEARCH_URL, &[("q", query.to_string()), ("lat", latitude.to_string()), ("lon", longitude.to_string()), ("limit", "6".into())], 1024 * 1024, |_, _| {}).await?;
    if !status.is_success() { return Err("rejected".into()); }
    let results = parse_search(&body)?;
    if search.cache.len() >= 32 { search.cache.clear(); }
    search.cache.insert(key, (Instant::now(), results.clone())); Ok(results)
}

fn node_limit_response(status: StatusCode, body: &str) -> bool {
    status == StatusCode::BAD_REQUEST && (body.to_ascii_lowercase().contains("too many nodes") || body.to_ascii_lowercase().contains("maximum bbox"))
}

async fn download_from(bounds: OsmBounds, on_progress: Channel<DownloadProgress>, endpoint: &str) -> Result<DownloadResult, String> {
    bounds.validate_download()?;
    let client = client(60)?;
    let mut grid = OsmTileGrid::new(bounds); let mut total_tiles = grid.len();
    let mut pending = Vec::new(); let mut parts = Vec::new(); let mut bytes = 0; let mut consecutive_timeout_splits = 0;
    let _ = on_progress.send(DownloadProgress { completed_tiles: 0, total_tiles, bytes: 0, stage: "preparing" });
    while let Some(tile) = pending.pop().or_else(|| grid.next()) {
        let _ = on_progress.send(DownloadProgress { completed_tiles: parts.len(), total_tiles, bytes, stage: "downloading" });
        let bbox = format!("{},{},{},{}", tile.west, tile.south, tile.east, tile.north);
        let timeout_children = tile.timeout_children();
        let response = request_body_with_policy(&client, endpoint, &[("bbox", bbox)], MAX_BYTES - bytes, timeout_children.is_some() || consecutive_timeout_splits > 0, |downloaded, retrying| {
            let _ = on_progress.send(DownloadProgress { completed_tiles: parts.len(), total_tiles, bytes: bytes + downloaded, stage: if retrying { "retrying" } else { "downloading" } });
        }).await;
        let (status, body) = match response {
            Ok(response) => response,
            Err(error) => {
                if error != "timeout" || consecutive_timeout_splits >= MAX_CONSECUTIVE_TIMEOUT_SPLITS { return Err(error); }
                let Some(children) = timeout_children else { return Err(error); };
                consecutive_timeout_splits += 1; total_tiles += children.len() - 1;
                pending.extend(children.into_iter().rev());
                let _ = on_progress.send(DownloadProgress { completed_tiles: parts.len(), total_tiles, bytes, stage: "splitting" });
                continue;
            }
        };
        if status == StatusCode::BAD_REQUEST {
            if node_limit_response(status, &String::from_utf8_lossy(&body)) {
                let children = tile.download_children().ok_or("tooLarge")?;
                total_tiles += children.len() - 1;
                pending.extend(children.into_iter().rev());
                let _ = on_progress.send(DownloadProgress { completed_tiles: parts.len(), total_tiles, bytes, stage: "splitting" });
                continue;
            }
            return Err("invalidBounds".into());
        }
        bytes += body.len();
        let xml = String::from_utf8(body).map_err(|_| "invalidResponse")?;
        if !xml.contains("<osm ") || !xml.trim_end().ends_with("</osm>") || xml.contains("<error>") || xml.contains("<remark>") { return Err("invalidResponse".into()); }
        parts.push(xml);
        consecutive_timeout_splits = 0;
    }
    let _ = on_progress.send(DownloadProgress { completed_tiles: parts.len(), total_tiles: parts.len(), bytes, stage: "complete" });
    Ok(DownloadResult { parts, bounds, bytes })
}

#[tauri::command(rename_all = "camelCase")]
pub async fn osm_download_region(request_id: String, bounds: OsmBounds, on_progress: Channel<DownloadProgress>, state: State<'_, OsmNetworkState>) -> Result<DownloadResult, String> {
    bounds.validate_download()?;
    if request_id.is_empty() || request_id.len() > 100 { return Err("invalidBounds".into()); }
    let (tx, mut rx) = watch::channel(false);
    {
        let mut downloads = state.downloads.lock().map_err(|_| "network")?;
        if !downloads.is_empty() { return Err("busy".into()); }
        downloads.insert(request_id.clone(), tx);
    }
    let result = tokio::select! { result = download_from(bounds, on_progress, MAP_URL) => result, _ = rx.changed() => Err("cancelled".into()) };
    state.downloads.lock().map_err(|_| "network")?.remove(&request_id);
    result
}

#[tauri::command(rename_all = "camelCase")]
pub fn osm_cancel_download(request_id: String, state: State<'_, OsmNetworkState>) -> Result<(), String> {
    if let Some(sender) = state.downloads.lock().map_err(|_| "network")?.get(&request_id) { let _ = sender.send(true); }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn initial_tiles_are_bounded_contiguous_and_cover_the_whole_selection() {
        for bounds in [OsmBounds { south: 30.0, west: 120.0, north: 30.06, east: 120.06 }, OsmBounds { south: 80.0, west: 179.94, north: 80.04, east: 180.0 }] {
            let grid = OsmTileGrid::new(bounds); let columns = grid.columns; let count = grid.len(); let tiles: Vec<_> = grid.collect();
            assert!(count > 1); assert_eq!(tiles.len(), count);
            assert_eq!(tiles[0].south, bounds.south); assert_eq!(tiles[0].west, bounds.west);
            assert_eq!(tiles.last().unwrap().north, bounds.north); assert_eq!(tiles.last().unwrap().east, bounds.east);
            for (index, tile) in tiles.iter().enumerate() {
                let (width, height) = tile.dimensions_km(); assert!(width <= TILE_EDGE_KM + 1e-8 && height <= TILE_EDGE_KM + 1e-8); assert!(tile.validate_download().is_ok());
                if index % columns != 0 { assert_eq!(tiles[index - 1].east, tile.west); }
                if index >= columns { assert_eq!(tiles[index - columns].north, tile.south); }
            }
        }
        let grid = OsmTileGrid::new(OsmBounds { south: -85.0, west: -180.0, north: 85.0, east: 180.0 });
        assert!(grid.len() > 1_000_000); assert!(std::mem::size_of_val(&grid) < 128);
    }
    #[test]
    fn narrow_tiles_split_along_their_long_edge_and_tiny_timeouts_stop_subdividing() {
        let narrow = OsmBounds { south: 30.0, west: 120.0, north: 30.01, east: 120.0002 };
        let children = narrow.download_children().unwrap(); assert_eq!(children.len(), 2);
        assert_eq!(children[0].west, narrow.west); assert_eq!(children[1].east, narrow.east);
        assert_eq!(children[0].north, children[1].south); assert!(children.iter().all(|tile| tile.validate_download().is_ok()));
        assert!(OsmBounds { south: 30.0, west: 120.0, north: 30.001, east: 120.001 }.timeout_children().is_none());
    }
    async fn serve_responses(responses: Vec<String>) -> (String, tokio::task::JoinHandle<()>) {
        use tokio::io::{AsyncReadExt, AsyncWriteExt};
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let endpoint = format!("http://{}/map", listener.local_addr().unwrap());
        let task = tokio::spawn(async move {
            for response in responses {
                let (mut stream, _) = listener.accept().await.unwrap(); let mut buffer = [0; 4096];
                stream.read(&mut buffer).await.unwrap(); stream.write_all(response.as_bytes()).await.unwrap();
            }
        });
        (endpoint, task)
    }
    #[tokio::test]
    async fn retries_server_errors_and_truncated_transfers_without_duplicating_data() {
        let xml = "<osm version=\"0.6\"><node id=\"1\" lat=\"30\" lon=\"120\"/></osm>";
        let (endpoint, server) = serve_responses(vec![
            "HTTP/1.1 503 Unavailable\r\nContent-Length: 0\r\nConnection: close\r\n\r\n".into(),
            "HTTP/1.1 200 OK\r\nContent-Length: 1000\r\nConnection: close\r\n\r\n<osm ".into(),
            format!("HTTP/1.1 200 OK\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{xml}", xml.len()),
        ]).await;
        let result = download_from(OsmBounds { south: 30.0, west: 120.0, north: 30.01, east: 120.01 }, Channel::new(|_| Ok(())), &endpoint).await.unwrap();
        assert_eq!(result.parts, vec![xml]); assert_eq!(result.bytes, xml.len()); server.await.unwrap();
    }
    #[tokio::test]
    async fn splits_a_gateway_timeout_without_refetching_completed_initial_tiles() {
        let xml = "<osm version=\"0.6\"><node id=\"1\" lat=\"30\" lon=\"120\"/></osm>";
        let ok = format!("HTTP/1.1 200 OK\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{xml}", xml.len());
        let (endpoint, server) = serve_responses(vec![ok.clone(), "HTTP/1.1 504 Gateway Timeout\r\nContent-Length: 0\r\nConnection: close\r\n\r\n".into(), ok.clone(), ok.clone(), ok.clone(), ok]).await;
        let events = std::sync::Arc::new(Mutex::new(Vec::<serde_json::Value>::new())); let captured = events.clone();
        let progress = Channel::new(move |body| { if let tauri::ipc::InvokeResponseBody::Json(json) = body { captured.lock().unwrap().push(serde_json::from_str(&json).unwrap()); } Ok(()) });
        let result = download_from(OsmBounds { south: 30.0, west: 120.0, north: 30.01, east: 120.03 }, progress, &endpoint).await.unwrap();
        assert_eq!(result.parts.len(), 5); assert_eq!(result.bytes, xml.len() * 5); server.await.unwrap();
        let events = events.lock().unwrap(); assert_eq!(events[0]["totalTiles"], 2);
        let split = events.iter().find(|event| event["stage"] == "splitting").unwrap();
        assert_eq!(split["completedTiles"], 1); assert_eq!(split["totalTiles"], 5); assert_eq!(split["bytes"], xml.len());
        assert_eq!(events.last().unwrap()["stage"], "complete");
    }
    #[tokio::test]
    async fn stops_adaptive_splitting_when_the_service_keeps_timing_out() {
        let timeout = "HTTP/1.1 504 Gateway Timeout\r\nContent-Length: 0\r\nConnection: close\r\n\r\n".to_string();
        let (endpoint, server) = serve_responses(vec![timeout; MAX_CONSECUTIVE_TIMEOUT_SPLITS + 1]).await;
        let result = download_from(OsmBounds { south: 30.0, west: 120.0, north: 30.016, east: 120.016 }, Channel::new(|_| Ok(())), &endpoint).await;
        assert!(matches!(result, Err(error) if error == "timeout")); server.await.unwrap();
    }
    #[tokio::test]
    async fn response_deadlines_return_to_the_splitter_without_retrying_the_same_bbox() {
        use tokio::io::AsyncReadExt;
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap(); let endpoint = format!("http://{}/map", listener.local_addr().unwrap());
        let server = tokio::spawn(async move { let (mut stream, _) = listener.accept().await.unwrap(); let mut buffer = [0; 4096]; stream.read(&mut buffer).await.unwrap(); tokio::time::sleep(Duration::from_millis(200)).await; });
        let client = Client::builder().timeout(Duration::from_millis(50)).build().unwrap();
        assert_eq!(request_body_with_policy(&client, &endpoint, &[], 1024, true, |_, _| {}).await.unwrap_err(), "timeout");
        server.await.unwrap();
    }
    #[tokio::test]
    async fn gateway_backoff_does_not_trigger_more_subdivision_requests() {
        let (endpoint, server) = serve_responses(vec!["HTTP/1.1 504 Gateway Timeout\r\nRetry-After: 60\r\nContent-Length: 0\r\nConnection: close\r\n\r\n".into()]).await;
        let result = download_from(OsmBounds { south: 30.0, west: 120.0, north: 30.01, east: 120.01 }, Channel::new(|_| Ok(())), &endpoint).await;
        assert!(matches!(result, Err(error) if error == "serverUnavailable")); server.await.unwrap();
    }
    #[tokio::test]
    async fn respects_long_retry_after_and_does_not_retry_rejected_requests() {
        for (status, headers, expected) in [("429 Too Many Requests", "Retry-After: 60\r\n", "rateLimited"), ("403 Forbidden", "", "rejected")] {
            let (endpoint, server) = serve_responses(vec![format!("HTTP/1.1 {status}\r\n{headers}Content-Length: 0\r\nConnection: close\r\n\r\n")]).await;
            assert_eq!(request_body(&client(2).unwrap(), &endpoint, &[], 1024, |_, _| {}).await.unwrap_err(), expected);
            server.await.unwrap();
        }
    }
    #[tokio::test]
    async fn retry_wait_can_be_cancelled() {
        let (endpoint, server) = serve_responses(vec!["HTTP/1.1 503 Unavailable\r\nContent-Length: 0\r\nConnection: close\r\n\r\n".into()]).await;
        let client = client(2).unwrap(); let mut retrying = false;
        let result = tokio::time::timeout(Duration::from_millis(200), request_body(&client, &endpoint, &[], 1024, |_, retry| retrying |= retry)).await;
        assert!(result.is_err()); assert!(retrying); server.await.unwrap();
    }
    #[tokio::test]
    async fn continues_node_limit_subdivision_beyond_two_levels() {
        use tokio::io::{AsyncReadExt, AsyncWriteExt};
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let endpoint = format!("http://{}/map", listener.local_addr().unwrap());
        let server = tokio::spawn(async move {
            for index in 0..13 {
                let (mut stream, _) = listener.accept().await.unwrap(); let mut request = vec![0; 4096];
                let size = stream.read(&mut request).await.unwrap(); let request = String::from_utf8_lossy(&request[..size]);
                assert!(request.contains("bbox=")); assert!(request.to_ascii_lowercase().contains("citygraph/0.2.0"));
                let (status, body) = if index < 3 { ("400 Bad Request", "You requested too many nodes (limit is 50000)".to_string()) }
                    else { ("200 OK", format!("<osm version=\"0.6\"><node id=\"{index}\" lat=\"30.24\" lon=\"120.14\"/></osm>")) };
                let response = format!("HTTP/1.1 {status}\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}", body.len());
                stream.write_all(response.as_bytes()).await.unwrap();
            }
        });
        let bounds = OsmBounds { south: 30.24, west: 120.14, north: 30.25, east: 120.15 };
        let result = download_from(bounds, Channel::new(|_| Ok(())), &endpoint).await.unwrap();
        assert_eq!(result.parts.len(), 10); assert_eq!(result.bytes, result.parts.iter().map(String::len).sum::<usize>());
        server.await.unwrap();
    }
    #[test]
    fn accepts_large_areas_and_rejects_reversed_tiny_and_non_finite_bounds() {
        let bounds = OsmBounds { south: 30.24, west: 120.14, north: 30.25, east: 120.15 };
        assert!(bounds.validate_download().is_ok());
        assert!(OsmBounds { south: 50.0, ..bounds }.validate_download().is_err());
        assert!(OsmBounds { west: f64::NAN, ..bounds }.validate_download().is_err());
        assert!(OsmBounds { north: 31.0, east: 122.0, ..bounds }.validate_download().is_ok());
        assert!(OsmBounds { north: bounds.south + 0.000001, ..bounds }.validate_download().is_err());
    }
    #[test]
    fn subdivisions_cover_the_requested_rectangle() {
        let bounds = OsmBounds { south: 30.0, west: 120.0, north: 30.02, east: 120.02 };
        let parts = bounds.split();
        assert_eq!(parts[0].south, bounds.south); assert_eq!(parts[3].north, bounds.north);
        assert_eq!(parts[0].east, parts[1].west); assert_eq!(parts[0].north, parts[2].south);
        assert!(parts.iter().all(|part| part.valid()));
    }
    #[test]
    fn only_node_limit_errors_trigger_subdivision() {
        assert!(node_limit_response(StatusCode::BAD_REQUEST, "You requested too many nodes (limit is 50000)"));
        assert!(!node_limit_response(StatusCode::BAD_REQUEST, "The latitudes must be between -90 and 90"));
        assert!(!node_limit_response(StatusCode::TOO_MANY_REQUESTS, "too many nodes"));
    }
    #[test]
    fn parses_and_deduplicates_places_without_trusting_invalid_coordinates() {
        let body = br#"{"features":[{"geometry":{"coordinates":[120.14,30.24]},"properties":{"osm_type":"R","osm_id":1,"name":"West Lake","city":"Hangzhou","extent":[120.1,30.3,120.2,30.2]}},{"geometry":{"coordinates":[120.14,30.24]},"properties":{"osm_type":"R","osm_id":1,"name":"West Lake"}},{"geometry":{"coordinates":[500,500]},"properties":{"name":"Invalid"}}]}"#;
        let result = parse_search(body).unwrap();
        assert_eq!(result.len(), 1); assert_eq!(result[0].name, "West Lake");
        assert_eq!(result[0].bounds.unwrap().south, 30.2);
        assert!(parse_search(b"{}").is_err());
    }
}
