use base64::{engine::general_purpose::STANDARD as BASE64, Engine};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    collections::HashSet,
    fs,
    path::{Path, PathBuf},
    time::{Duration, SystemTime},
};
use tauri::Manager;
mod osm_downloader;

const MAX_CUSTOM_LOGO_BYTES: usize = 8 * 1024 * 1024;
const DEEPSEEK_ENDPOINT: &str = "https://api.deepseek.com/chat/completions";
const MAX_DEEPSEEK_API_KEY_BYTES: usize = 512;
const MAX_DEEPSEEK_MODEL_BYTES: usize = 128;
const MAX_DEEPSEEK_PROMPT_BYTES: usize = 100_000;
const MAX_DEEPSEEK_SYSTEM_PROMPT_BYTES: usize = 20_000;
const MAX_DEEPSEEK_RESPONSE_BYTES: usize = 1024 * 1024;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SaveFiles {
    metadata: String,
    map: String,
    roads: String,
    zones: String,
    buildings: Option<String>,
    facilities: Option<String>,
    ai: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SaveSlot {
    folder_name: String,
    save_name: String,
    map_name: String,
    created_at: String,
    updated_at: String,
    autosave: bool,
    thumbnail: Option<String>,
}

#[derive(Deserialize)]
struct DeepSeekResponse {
    choices: Vec<DeepSeekChoice>,
}

#[derive(Deserialize)]
struct DeepSeekChoice {
    message: DeepSeekMessage,
}

#[derive(Deserialize)]
struct DeepSeekMessage {
    content: String,
}

fn validate_deepseek_request(api_key: &str, model: &str, prompt: &str) -> Result<(), &'static str> {
    if api_key.trim().is_empty() {
        return Err("missing-key");
    }
    if model.trim().is_empty() || prompt.trim().is_empty() {
        return Err("invalid-request");
    }
    if api_key.len() > MAX_DEEPSEEK_API_KEY_BYTES
        || model.len() > MAX_DEEPSEEK_MODEL_BYTES
        || prompt.len() > MAX_DEEPSEEK_PROMPT_BYTES
        || api_key.chars().any(char::is_control)
        || model.chars().any(char::is_control)
    {
        return Err("invalid-request");
    }
    Ok(())
}

fn parse_deepseek_response(body: &[u8]) -> Result<String, &'static str> {
    let response: DeepSeekResponse =
        serde_json::from_slice(body).map_err(|_| "invalid-response")?;
    response
        .choices
        .into_iter()
        .next()
        .map(|choice| choice.message.content)
        .filter(|content| !content.trim().is_empty())
        .ok_or("invalid-response")
}

async fn read_limited_response(mut response: reqwest::Response) -> Result<Vec<u8>, &'static str> {
    if response.content_length().unwrap_or(0) > MAX_DEEPSEEK_RESPONSE_BYTES as u64 {
        return Err("invalid-response");
    }

    let mut body = Vec::new();
    while let Some(chunk) = response.chunk().await.map_err(|_| "network")? {
        if body.len().saturating_add(chunk.len()) > MAX_DEEPSEEK_RESPONSE_BYTES {
            return Err("invalid-response");
        }
        body.extend_from_slice(&chunk);
    }
    Ok(body)
}

#[tauri::command(rename_all = "camelCase")]
async fn deepseek_citygraph_ai(
    api_key: String,
    model: String,
    system_prompt: String,
    prompt: String,
) -> Result<String, String> {
    validate_deepseek_request(&api_key, &model, &prompt).map_err(str::to_string)?;
    if system_prompt.trim().is_empty()
        || system_prompt.len() > MAX_DEEPSEEK_SYSTEM_PROMPT_BYTES
        || system_prompt
            .chars()
            .any(|character| character.is_control() && !matches!(character, '\n' | '\r' | '\t'))
    {
        return Err("invalid-request".to_string());
    }
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(45))
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .map_err(|_| "network".to_string())?;
    let response = client
        .post(DEEPSEEK_ENDPOINT)
        .bearer_auth(api_key.trim())
        .json(&serde_json::json!({
            "model": model.trim(),
            "messages": [
                { "role": "system", "content": system_prompt },
                { "role": "user", "content": prompt }
            ],
            "response_format": { "type": "json_object" }
        }))
        .send()
        .await
        .map_err(|_| "network".to_string())?;
    let status = response.status();
    if status == reqwest::StatusCode::UNAUTHORIZED || status == reqwest::StatusCode::FORBIDDEN {
        return Err("unauthorized".to_string());
    }
    if status == reqwest::StatusCode::TOO_MANY_REQUESTS {
        return Err("rate-limited".to_string());
    }
    if status.is_server_error() {
        return Err("server".to_string());
    }
    if status.is_client_error() {
        return Err("invalid-request".to_string());
    }
    if !status.is_success() {
        return Err("invalid-response".to_string());
    }
    let body = read_limited_response(response)
        .await
        .map_err(str::to_string)?;
    parse_deepseek_response(&body).map_err(str::to_string)
}

fn executable_dir() -> Result<PathBuf, String> {
    let executable = std::env::current_exe().map_err(|error| error.to_string())?;
    executable
        .parent()
        .map(Path::to_path_buf)
        .ok_or_else(|| "Invalid executable path".to_string())
}

fn program_root_dir() -> Result<PathBuf, String> {
    let executable = executable_dir()?;
    for ancestor in executable.ancestors() {
        if ancestor.join("package.json").is_file() && ancestor.join("src-tauri").is_dir() {
            return Ok(ancestor.to_path_buf());
        }
    }
    Ok(executable)
}

fn program_data_dir() -> Result<PathBuf, String> {
    Ok(program_root_dir()?.join("data"))
}

fn decode_logo_data_url(data_url: &str) -> Result<(&'static str, Vec<u8>), String> {
    let (header, encoded) = data_url
        .split_once(',')
        .ok_or_else(|| "Invalid logo data".to_string())?;
    let extension = match header.to_ascii_lowercase().as_str() {
        "data:image/png;base64" => "png",
        "data:image/jpeg;base64" => "jpg",
        "data:image/webp;base64" => "webp",
        _ => return Err("Unsupported logo type".to_string()),
    };
    if encoded.len() > MAX_CUSTOM_LOGO_BYTES * 4 / 3 + 4 {
        return Err("Logo is too large".to_string());
    }
    let bytes = BASE64
        .decode(encoded)
        .map_err(|_| "Invalid logo data".to_string())?;
    if bytes.len() > MAX_CUSTOM_LOGO_BYTES {
        return Err("Logo is too large".to_string());
    }
    if !logo_bytes_match_extension(extension, &bytes) {
        return Err("Logo content does not match its type".to_string());
    }
    Ok((extension, bytes))
}

fn logo_bytes_match_extension(extension: &str, bytes: &[u8]) -> bool {
    match extension {
        "png" => bytes.starts_with(&[0x89, b'P', b'N', b'G', 0x0d, 0x0a, 0x1a, 0x0a]),
        "jpg" => bytes.starts_with(&[0xff, 0xd8, 0xff]),
        "webp" => bytes.len() >= 12 && &bytes[..4] == b"RIFF" && &bytes[8..12] == b"WEBP",
        _ => false,
    }
}

fn store_logo_data_url_in(directory: &Path, data_url: &str) -> Result<String, String> {
    let (extension, bytes) = decode_logo_data_url(data_url)?;
    store_logo_bytes_in(directory, extension, &bytes)
}

fn store_logo_bytes_in(directory: &Path, extension: &str, bytes: &[u8]) -> Result<String, String> {
    let hash = Sha256::digest(&bytes);
    let filename = format!("{hash:x}.{extension}");
    fs::create_dir_all(directory).map_err(|error| error.to_string())?;
    let path = directory.join(&filename);
    if !path.exists() {
        fs::write(path, bytes).map_err(|error| error.to_string())?;
    }
    Ok(format!("custom-logo:{filename}"))
}

fn migrate_logo_references(value: &mut serde_json::Value, directory: &Path) -> usize {
    let root = program_root_dir().ok();
    migrate_logo_references_at(value, directory, root.as_deref())
}

fn store_local_asset_logo(root: &Path, directory: &Path, reference: &str) -> Result<String, String> {
    let asset = reference.strip_prefix("asset:").ok_or("Invalid asset reference")?;
    let (folder, filename) = if let Some(filename) = asset.strip_prefix("university/") {
        ("assets/university/Logo", filename)
    } else if let Some(filename) = asset.strip_prefix("enterprise/") {
        ("assets/enterprise/Logo", filename)
    } else { ("assets/logo", asset) };
    if filename.is_empty() || filename == "." || filename == ".." || filename.chars().any(|character| character.is_control() || matches!(character, '/' | '\\' | ':')) {
        return Err("Invalid asset filename".into());
    }
    let base = root.join(folder).canonicalize().map_err(|error| error.to_string())?;
    let path = base.join(filename).canonicalize().map_err(|error| error.to_string())?;
    if !path.starts_with(&base) { return Err("Invalid asset path".into()); }
    let metadata = fs::metadata(&path).map_err(|error| error.to_string())?;
    if !metadata.is_file() || metadata.len() > MAX_CUSTOM_LOGO_BYTES as u64 { return Err("Logo is too large".into()); }
    let extension = path.extension().and_then(|value| value.to_str()).unwrap_or("").to_ascii_lowercase();
    let extension = if extension == "jpeg" { "jpg" } else { &extension };
    let bytes = fs::read(&path).map_err(|error| error.to_string())?;
    if bytes.len() > MAX_CUSTOM_LOGO_BYTES || !logo_bytes_match_extension(extension, &bytes) { return Err("Unsupported local logo".into()); }
    store_logo_bytes_in(directory, extension, &bytes)
}

fn migrate_logo_references_at(value: &mut serde_json::Value, directory: &Path, root: Option<&Path>) -> usize {
    match value {
        serde_json::Value::Array(items) => items
            .iter_mut()
            .map(|item| migrate_logo_references_at(item, directory, root))
            .sum(),
        serde_json::Value::Object(fields) => {
            let mut migrated = 0;
            for (key, value) in fields {
                if matches!(key.as_str(), "logo" | "emblemDataUrl" | "metroLogo") {
                    let replacement = value.as_str().and_then(|item| {
                        if item.starts_with("data:image/") { store_logo_data_url_in(directory, item).ok() }
                        else if item.starts_with("asset:") { root.and_then(|root| store_local_asset_logo(root, directory, item).ok()) }
                        else { None }
                    });
                    if let Some(reference) = replacement {
                        *value = serde_json::Value::String(reference);
                        migrated += 1;
                        continue;
                    }
                }
                migrated += migrate_logo_references_at(value, directory, root);
            }
            migrated
        }
        _ => 0,
    }
}

fn migrate_logo_file(path: &Path, directory: &Path) -> Result<(), String> {
    if !path.exists() {
        return Ok(());
    }
    let content = fs::read_to_string(path).map_err(|error| error.to_string())?;
    if !content.contains("data:image/") && !content.contains("asset:") {
        return Ok(());
    }
    let mut value = serde_json::from_str(&content).map_err(|error| error.to_string())?;
    if migrate_logo_references(&mut value, directory) > 0 {
        fs::write(
            path,
            serde_json::to_vec_pretty(&value).map_err(|error| error.to_string())?,
        )
        .map_err(|error| error.to_string())?;
    }
    Ok(())
}

fn is_custom_logo_filename(filename: &str) -> bool {
    let Some((hash, extension)) = filename.rsplit_once('.') else {
        return false;
    };
    hash.len() == 64
        && hash
            .bytes()
            .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
        && matches!(extension, "png" | "jpg" | "webp")
}

fn valid_custom_logo_file(path: &Path, filename: &str) -> bool {
    let Some((expected_hash, extension)) = filename.rsplit_once('.') else {
        return false;
    };
    let Ok(bytes) = fs::read(path) else {
        return false;
    };
    logo_bytes_match_extension(extension, &bytes)
        && format!("{:x}", Sha256::digest(&bytes)) == expected_hash
}

fn restore_save_logo_assets(folder: &Path, directory: &Path) -> Result<(), String> {
    let assets = folder.join("assets");
    if !assets.exists() {
        return Ok(());
    }
    for entry in fs::read_dir(assets).map_err(|error| error.to_string())? {
        let entry = entry.map_err(|error| error.to_string())?;
        let filename = entry.file_name().to_string_lossy().into_owned();
        if !entry
            .file_type()
            .map_err(|error| error.to_string())?
            .is_file()
            || !is_custom_logo_filename(&filename)
            || !valid_custom_logo_file(&entry.path(), &filename)
        {
            continue;
        }
        fs::create_dir_all(directory).map_err(|error| error.to_string())?;
        let target = directory.join(filename);
        if !target.exists() {
            fs::copy(entry.path(), target).map_err(|error| error.to_string())?;
        }
    }
    Ok(())
}

fn collect_custom_logo_filenames(value: &serde_json::Value, filenames: &mut HashSet<String>) {
    match value {
        serde_json::Value::String(reference) => {
            if let Some(filename) = reference.strip_prefix("custom-logo:") {
                if is_custom_logo_filename(filename) {
                    filenames.insert(filename.to_string());
                }
            }
        }
        serde_json::Value::Array(items) => {
            for item in items {
                collect_custom_logo_filenames(item, filenames);
            }
        }
        serde_json::Value::Object(fields) => {
            for value in fields.values() {
                collect_custom_logo_filenames(value, filenames);
            }
        }
        _ => {}
    }
}

fn sync_save_logo_assets(folder: &Path, directory: &Path) -> Result<(), String> {
    let mut filenames = HashSet::new();
    for name in ["map.json", "zones.json", "facilities.json"] {
        let Ok(content) = fs::read_to_string(folder.join(name)) else {
            continue;
        };
        let Ok(value) = serde_json::from_str(&content) else {
            continue;
        };
        collect_custom_logo_filenames(&value, &mut filenames);
    }
    if filenames.is_empty() {
        return Ok(());
    }
    let assets = folder.join("assets");
    fs::create_dir_all(&assets).map_err(|error| error.to_string())?;
    for filename in filenames {
        let source = directory.join(&filename);
        let target = assets.join(&filename);
        if source.exists() && !target.exists() {
            fs::copy(source, target).map_err(|error| error.to_string())?;
        }
    }
    Ok(())
}

fn custom_logo_response(request: tauri::http::Request<Vec<u8>>) -> tauri::http::Response<Vec<u8>> {
    let filename = request.uri().path().trim_start_matches('/');
    if !is_custom_logo_filename(filename) {
        return tauri::http::Response::builder()
            .status(400)
            .body(Vec::new())
            .unwrap();
    }
    let extension = filename
        .rsplit_once('.')
        .map(|(_, value)| value)
        .unwrap_or_default();
    let content_type = match extension {
        "png" => "image/png",
        "jpg" => "image/jpeg",
        "webp" => "image/webp",
        _ => "application/octet-stream",
    };
    match program_data_dir().and_then(|directory| {
        fs::read(directory.join("logos").join(filename)).map_err(|error| error.to_string())
    }) {
        Ok(bytes) => tauri::http::Response::builder()
            .header("Content-Type", content_type)
            .header("Cache-Control", "public, max-age=31536000, immutable")
            .header("Access-Control-Allow-Origin", "*")
            .header("Cross-Origin-Resource-Policy", "cross-origin")
            .body(bytes)
            .unwrap(),
        Err(_) => tauri::http::Response::builder()
            .status(404)
            .body(Vec::new())
            .unwrap(),
    }
}

#[tauri::command]
fn store_custom_logo(data_url: String) -> Result<String, String> {
    store_logo_data_url_in(&program_data_dir()?.join("logos"), &data_url)
}

fn copy_missing_files(
    source: &std::path::Path,
    destination: &std::path::Path,
) -> Result<(), String> {
    if !source.exists() {
        return Ok(());
    }
    fs::create_dir_all(destination).map_err(|error| error.to_string())?;
    for entry in fs::read_dir(source).map_err(|error| error.to_string())? {
        let entry = entry.map_err(|error| error.to_string())?;
        let target = destination.join(entry.file_name());
        if entry
            .file_type()
            .map_err(|error| error.to_string())?
            .is_dir()
        {
            copy_missing_files(&entry.path(), &target)?;
        } else if !target.exists() {
            fs::copy(entry.path(), target).map_err(|error| error.to_string())?;
        }
    }
    Ok(())
}

#[tauri::command]
fn citygraph_data_path() -> Result<String, String> {
    let data = program_data_dir()?;
    fs::create_dir_all(&data).map_err(|error| error.to_string())?;
    data.into_os_string()
        .into_string()
        .map_err(|_| "Invalid data path".to_string())
}

#[tauri::command]
fn citygraph_saves_path(app: tauri::AppHandle) -> Result<String, String> {
    let saves = program_root_dir()?.join("save");
    fs::create_dir_all(&saves).map_err(|error| error.to_string())?;
    if let Ok(previous) = app.path().app_data_dir() {
        copy_missing_files(&previous.join("saves"), &saves)?;
    }
    copy_missing_files(&executable_dir()?.join("data").join("saves"), &saves)?;
    saves
        .into_os_string()
        .into_string()
        .map_err(|_| "Invalid save path".to_string())
}

#[tauri::command]
fn startup_save_name() -> Option<String> {
    let mut arguments = std::env::args().skip(1);
    while let Some(argument) = arguments.next() {
        if argument == "--save" {
            return arguments.next().filter(|value| !value.trim().is_empty());
        }
        if let Some(value) = argument.strip_prefix("--save=") {
            if !value.trim().is_empty() {
                return Some(value.to_string());
            }
        }
    }
    None
}

#[tauri::command]
fn load_app_settings() -> Result<Option<String>, String> {
    let path = program_data_dir()?.join("settings.json");
    if !path.exists() {
        return Ok(None);
    }
    fs::read_to_string(path)
        .map(Some)
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn save_app_settings(settings: String) -> Result<(), String> {
    let data = program_data_dir()?;
    fs::create_dir_all(&data).map_err(|error| error.to_string())?;
    fs::write(data.join("settings.json"), settings).map_err(|error| error.to_string())
}

#[tauri::command]
fn save_city_files(
    parent_path: String,
    folder_name: String,
    metadata: String,
    map: String,
    roads: String,
    zones: String,
    buildings: String,
    facilities: String,
    ai: String,
) -> Result<String, String> {
    let folder = PathBuf::from(parent_path).join(folder_name);
    fs::create_dir_all(folder.join("assets")).map_err(|error| error.to_string())?;
    fs::write(folder.join("buildings.json"), buildings).map_err(|error| error.to_string())?;
    fs::write(folder.join("facilities.json"), facilities).map_err(|error| error.to_string())?;
    fs::write(folder.join("ai.json"), ai).map_err(|error| error.to_string())?;
    fs::write(folder.join("map.json"), map).map_err(|error| error.to_string())?;
    fs::write(folder.join("roads.json"), roads).map_err(|error| error.to_string())?;
    fs::write(folder.join("zones.json"), zones).map_err(|error| error.to_string())?;
    sync_save_logo_assets(&folder, &program_data_dir()?.join("logos"))?;
    // Metadata is the save's commit marker, so incomplete writes keep their previous version visible.
    fs::write(folder.join("metadata.json"), metadata).map_err(|error| error.to_string())?;
    folder
        .into_os_string()
        .into_string()
        .map_err(|_| "Invalid save path".to_string())
}

#[tauri::command]
fn load_city_files(folder_path: String) -> Result<SaveFiles, String> {
    let folder = PathBuf::from(folder_path);
    let logo_directory = program_data_dir()?.join("logos");
    restore_save_logo_assets(&folder, &logo_directory)?;
    migrate_logo_file(&folder.join("zones.json"), &logo_directory)?;
    migrate_logo_file(&folder.join("facilities.json"), &logo_directory)?;
    migrate_logo_file(&folder.join("map.json"), &logo_directory)?;
    sync_save_logo_assets(&folder, &logo_directory)?;
    Ok(SaveFiles {
        metadata: fs::read_to_string(folder.join("metadata.json"))
            .map_err(|error| error.to_string())?,
        map: fs::read_to_string(folder.join("map.json")).map_err(|error| error.to_string())?,
        roads: fs::read_to_string(folder.join("roads.json")).map_err(|error| error.to_string())?,
        zones: fs::read_to_string(folder.join("zones.json"))
            .unwrap_or_else(|_| "{\"zones\":[]}".to_string()),
        buildings: fs::read_to_string(folder.join("buildings.json")).ok(),
        facilities: fs::read_to_string(folder.join("facilities.json")).ok(),
        ai: fs::read_to_string(folder.join("ai.json")).ok(),
    })
}

#[tauri::command]
fn list_city_saves(parent_path: String) -> Result<Vec<SaveSlot>, String> {
    let parent = PathBuf::from(parent_path);
    if !parent.exists() {
        return Ok(Vec::new());
    }
    let mut saves = Vec::new();
    for entry in fs::read_dir(parent).map_err(|error| error.to_string())? {
        let entry = entry.map_err(|error| error.to_string())?;
        if !entry
            .file_type()
            .map_err(|error| error.to_string())?
            .is_dir()
        {
            continue;
        }
        let Ok(content) = fs::read_to_string(entry.path().join("metadata.json")) else {
            continue;
        };
        let Ok(metadata) = serde_json::from_str::<serde_json::Value>(&content) else {
            continue;
        };
        let Some(updated_at) = metadata.get("updatedAt").and_then(|value| value.as_str()) else {
            continue;
        };
        let folder_name = entry.file_name().to_string_lossy().into_owned();
        saves.push(SaveSlot {
            save_name: metadata
                .get("saveName")
                .and_then(|value| value.as_str())
                .unwrap_or(&folder_name)
                .to_string(),
            map_name: metadata
                .get("mapName")
                .and_then(|value| value.as_str())
                .unwrap_or(&folder_name)
                .to_string(),
            created_at: metadata
                .get("createdAt")
                .and_then(|value| value.as_str())
                .unwrap_or(updated_at)
                .to_string(),
            folder_name,
            updated_at: updated_at.to_string(),
            autosave: metadata
                .get("autosave")
                .and_then(|value| value.as_bool())
                .unwrap_or(false),
            thumbnail: metadata
                .get("thumbnail")
                .and_then(|value| value.as_str())
                .filter(|value| value.starts_with("data:image/"))
                .map(str::to_string),
        });
    }
    saves.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));
    Ok(saves)
}

#[tauri::command]
fn prune_auto_saves(parent_path: String, max_slots: usize) -> Result<(), String> {
    let parent = PathBuf::from(parent_path);
    if !parent.exists() {
        return Ok(());
    }
    let mut saves = Vec::new();
    for entry in fs::read_dir(&parent).map_err(|error| error.to_string())? {
        let entry = entry.map_err(|error| error.to_string())?;
        if !entry
            .file_type()
            .map_err(|error| error.to_string())?
            .is_dir()
        {
            continue;
        }
        let Ok(content) = fs::read_to_string(entry.path().join("metadata.json")) else {
            continue;
        };
        let Ok(metadata) = serde_json::from_str::<serde_json::Value>(&content) else {
            continue;
        };
        if metadata.get("autosave").and_then(|value| value.as_bool()) != Some(true) {
            continue;
        }
        let modified = entry
            .metadata()
            .and_then(|value| value.modified())
            .unwrap_or(SystemTime::UNIX_EPOCH);
        saves.push((entry.path(), modified));
    }
    saves.sort_by(|a, b| b.1.cmp(&a.1));
    for (index, (path, _)) in saves.into_iter().enumerate() {
        if index >= max_slots.max(1) {
            fs::remove_dir_all(path).map_err(|error| error.to_string())?;
        }
    }
    Ok(())
}

#[tauri::command]
fn clear_recovery_saves() -> Result<(), String> {
    let recovery = program_data_dir()?.join("recovery");
    if recovery.exists() {
        fs::remove_dir_all(recovery).map_err(|error| error.to_string())?;
    }
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(osm_downloader::OsmNetworkState::default())
        .register_uri_scheme_protocol("citygraph-logo", |_context, request| {
            custom_logo_response(request)
        })
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            osm_downloader::osm_search_places,
            osm_downloader::osm_download_region,
            osm_downloader::osm_cancel_download,
            deepseek_citygraph_ai,
            citygraph_data_path,
            citygraph_saves_path,
            startup_save_name,
            store_custom_logo,
            load_app_settings,
            save_app_settings,
            save_city_files,
            load_city_files,
            list_city_saves,
            prune_auto_saves,
            clear_recovery_saves
        ])
        .run(tauri::generate_context!())
        .expect("error while running CityGraph");
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temporary_directory(name: &str) -> PathBuf {
        std::env::temp_dir().join(format!(
            "citygraph-{name}-{}-{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(SystemTime::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ))
    }

    #[test]
    fn validates_deepseek_request_fields() {
        assert_eq!(
            validate_deepseek_request("", "deepseek-chat", "plan"),
            Err("missing-key")
        );
        assert_eq!(
            validate_deepseek_request("key", " ", "plan"),
            Err("invalid-request")
        );
        assert_eq!(
            validate_deepseek_request("key", "deepseek-chat", "\n"),
            Err("invalid-request")
        );
        assert_eq!(
            validate_deepseek_request("key", &"m".repeat(MAX_DEEPSEEK_MODEL_BYTES + 1), "plan"),
            Err("invalid-request")
        );
        assert_eq!(
            validate_deepseek_request("key", "deepseek-chat", "plan"),
            Ok(())
        );
    }

    #[test]
    fn parses_first_deepseek_message_content() {
        let body = br#"{"choices":[{"message":{"content":"{\"density\":0.7}"}},{"message":{"content":"ignored"}}]}"#;
        assert_eq!(parse_deepseek_response(body).unwrap(), r#"{"density":0.7}"#);
    }

    #[test]
    fn rejects_invalid_deepseek_responses() {
        assert_eq!(
            parse_deepseek_response(b"not json"),
            Err("invalid-response")
        );
        assert_eq!(
            parse_deepseek_response(br#"{"choices":[]}"#),
            Err("invalid-response")
        );
        assert_eq!(
            parse_deepseek_response(br#"{"choices":[{"message":{"content":" "}}]}"#),
            Err("invalid-response")
        );
    }

    #[test]
    fn stores_custom_logos_by_content_hash_and_deduplicates_them() {
        let directory = temporary_directory("logo-store");
        let bytes = [0x89, b'P', b'N', b'G', 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3];
        let data_url = format!("data:image/png;base64,{}", BASE64.encode(bytes));
        let first = store_logo_data_url_in(&directory, &data_url).unwrap();
        let second = store_logo_data_url_in(&directory, &data_url).unwrap();
        assert_eq!(first, second);
        assert!(first.starts_with("custom-logo:"));
        assert_eq!(fs::read_dir(&directory).unwrap().count(), 1);
        fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn restores_legacy_personal_logos_without_embedding_them_in_the_executable() {
        let root = temporary_directory("local-asset-logo");
        let originals = root.join("assets/university/Logo"); let directory = root.join("data/logos");
        fs::create_dir_all(&originals).unwrap();
        let bytes = [0x89, b'P', b'N', b'G', 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3];
        fs::write(originals.join("school.png"), bytes).unwrap();
        let mut value = serde_json::json!({ "logo": "asset:university/school.png", "thumbnail": "asset:university/school.png" });
        assert_eq!(migrate_logo_references_at(&mut value, &directory, Some(&root)), 1);
        assert!(value["logo"].as_str().unwrap().starts_with("custom-logo:"));
        assert_eq!(value["thumbnail"], "asset:university/school.png");
        assert_eq!(fs::read(originals.join("school.png")).unwrap(), bytes);
        assert!(store_local_asset_logo(&root, &directory, "asset:university/../../private.png").is_err());
        assert!(store_local_asset_logo(&root, &directory, "asset:university/C:\\private.png").is_err());
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn migrates_only_logo_fields_and_reuses_duplicate_images() {
        let directory = temporary_directory("logo-migration");
        let bytes = [0xff, 0xd8, 0xff, 1, 2, 3];
        let data_url = format!("data:image/jpeg;base64,{}", BASE64.encode(bytes));
        let mut value = serde_json::json!({ "metroLogo": data_url, "universities": [{ "logo": data_url }], "companies": [{ "logo": data_url }], "thumbnail": data_url });
        assert_eq!(migrate_logo_references(&mut value, &directory), 3);
        assert_eq!(
            value["universities"][0]["logo"],
            value["companies"][0]["logo"]
        );
        assert_eq!(value["metroLogo"], value["universities"][0]["logo"]);
        assert!(value["thumbnail"]
            .as_str()
            .unwrap()
            .starts_with("data:image/"));
        assert_eq!(fs::read_dir(&directory).unwrap().count(), 1);
        fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn keeps_custom_logos_portable_with_their_save() {
        let root = temporary_directory("portable-logo");
        let directory = root.join("logos");
        let folder = root.join("save");
        fs::create_dir_all(&folder).unwrap();
        let bytes = [b'R', b'I', b'F', b'F', 0, 0, 0, 0, b'W', b'E', b'B', b'P'];
        let data_url = format!("data:image/webp;base64,{}", BASE64.encode(bytes));
        let reference = store_logo_data_url_in(&directory, &data_url).unwrap();
        fs::write(
            folder.join("zones.json"),
            serde_json::json!({ "universities": [{ "logo": reference }] }).to_string(),
        )
        .unwrap();
        sync_save_logo_assets(&folder, &directory).unwrap();
        let filename = reference.strip_prefix("custom-logo:").unwrap();
        assert!(folder.join("assets").join(filename).exists());

        fs::remove_dir_all(&directory).unwrap();
        restore_save_logo_assets(&folder, &directory).unwrap();
        assert!(directory.join(filename).exists());
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn rejects_mismatched_and_oversized_logo_data() {
        assert!(decode_logo_data_url("data:image/png;base64,ZmFrZQ==").is_err());
        assert!(!is_custom_logo_filename("../logo.png"));
        assert!(is_custom_logo_filename(&format!("{}.webp", "a".repeat(64))));
    }
}
