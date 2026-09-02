use serde::Serialize;
use std::{
    fs,
    path::PathBuf,
    time::{Duration, SystemTime},
};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SaveFiles {
    metadata: String,
    map: String,
    roads: String,
    zones: String,
    buildings: Option<String>,
    facilities: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SaveSlot {
    folder_name: String,
    updated_at: String,
    autosave: bool,
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
) -> Result<String, String> {
    let folder = PathBuf::from(parent_path).join(folder_name);
    fs::create_dir_all(folder.join("assets")).map_err(|error| error.to_string())?;
    fs::write(folder.join("buildings.json"), buildings).map_err(|error| error.to_string())?;
    fs::write(folder.join("facilities.json"), facilities).map_err(|error| error.to_string())?;
    fs::write(folder.join("map.json"), map).map_err(|error| error.to_string())?;
    fs::write(folder.join("roads.json"), roads).map_err(|error| error.to_string())?;
    fs::write(folder.join("zones.json"), zones).map_err(|error| error.to_string())?;
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
    Ok(SaveFiles {
        metadata: fs::read_to_string(folder.join("metadata.json"))
            .map_err(|error| error.to_string())?,
        map: fs::read_to_string(folder.join("map.json")).map_err(|error| error.to_string())?,
        roads: fs::read_to_string(folder.join("roads.json")).map_err(|error| error.to_string())?,
        zones: fs::read_to_string(folder.join("zones.json"))
            .unwrap_or_else(|_| "{\"zones\":[]}".to_string()),
        buildings: fs::read_to_string(folder.join("buildings.json")).ok(),
        facilities: fs::read_to_string(folder.join("facilities.json")).ok(),
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
        saves.push(SaveSlot {
            folder_name: entry.file_name().to_string_lossy().into_owned(),
            updated_at: updated_at.to_string(),
            autosave: metadata
                .get("autosave")
                .and_then(|value| value.as_bool())
                .unwrap_or(false),
        });
    }
    saves.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));
    Ok(saves)
}

#[tauri::command]
fn prune_auto_saves(
    parent_path: String,
    max_slots: usize,
    retention_days: u64,
) -> Result<(), String> {
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
    let cutoff = SystemTime::now()
        .checked_sub(Duration::from_secs(retention_days.max(1) * 86_400))
        .unwrap_or(SystemTime::UNIX_EPOCH);
    for (index, (path, modified)) in saves.into_iter().enumerate() {
        if index >= max_slots.max(1) || modified < cutoff {
            fs::remove_dir_all(path).map_err(|error| error.to_string())?;
        }
    }
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            save_city_files,
            load_city_files,
            list_city_saves,
            prune_auto_saves
        ])
        .run(tauri::generate_context!())
        .expect("error while running CityGraph");
}
