//! Kabuk komutları: oyunlar arası işler (ana sayfa, ilk kurulum, ayarlar, hesaplar, görevler).
//! Oyuna özel komutlar oyun paketlerinde (`<id>_…`).

use std::sync::Arc;

use futures_util::future::join_all;
use modstead_core::nexus::{self, NexusUser, RateLimit};
use modstead_core::security::defender;
use modstead_core::settings::{Settings, SettingsPatch};
use modstead_core::{AppError, AppResult, GameInfo, GameRegistry, GameStatus, InstallCandidate, JobSnapshot, Services, credentials, nxm};
use serde::Serialize;
use serde_json::{Value, json};
use tauri::{AppHandle, State};
use tauri_plugin_opener::OpenerExt;

use crate::ShellState;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppInfo {
    pub version: String,
    pub data_dir: String,
    pub local_dir: String,
    pub language: String,
    pub defender_available: bool,
    pub games: Vec<GameInfo>,
}

#[tauri::command]
pub fn app_info(services: State<'_, Arc<Services>>, registry: State<'_, GameRegistry>) -> AppInfo {
    AppInfo {
        version: services.version.clone(),
        data_dir: services.paths.data.to_string_lossy().into_owned(),
        local_dir: services.paths.local.to_string_lossy().into_owned(),
        language: modstead_core::i18n::resolved().into(),
        defender_available: defender::available(),
        games: registry.infos(),
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GameStatusEntry {
    pub id: String,
    pub status: GameStatus,
}

/// Tüm oyunların durumu (ana sayfa). Oyunlar paralel sorgulanır.
#[tauri::command]
pub async fn games_status(registry: State<'_, GameRegistry>) -> AppResult<Vec<GameStatusEntry>> {
    let games = registry.all().to_vec();
    let statuses = join_all(games.iter().map(|g| g.status())).await;
    Ok(games.iter().zip(statuses).map(|(g, status)| GameStatusEntry { id: g.info().id.into(), status }).collect())
}

#[tauri::command]
pub async fn game_status(registry: State<'_, GameRegistry>, id: String) -> AppResult<GameStatus> {
    let game = registry.require(&id)?;
    Ok(game.status().await)
}

#[tauri::command]
pub async fn game_detect(registry: State<'_, GameRegistry>, id: String) -> AppResult<Vec<InstallCandidate>> {
    let game = registry.require(&id)?;
    Ok(game.detect().await)
}

#[tauri::command]
pub async fn game_set_path(registry: State<'_, GameRegistry>, id: String, path: String) -> AppResult<GameStatus> {
    if path.len() > 1024 || path.contains('\0') {
        return Err(AppError::security(tr("geçersiz yol", "invalid path")));
    }
    let game = registry.require(&id)?;
    game.set_install_path(path).await
}

#[tauri::command]
pub async fn game_launch(registry: State<'_, GameRegistry>, id: String) -> AppResult<()> {
    let game = registry.require(&id)?;
    game.launch().await
}

/// Pencereye bırakılan arşivleri bir oyuna kurar.
#[tauri::command]
pub async fn game_install_files(registry: State<'_, GameRegistry>, id: String, paths: Vec<String>) -> AppResult<Vec<JobSnapshot>> {
    let paths: Vec<String> = paths.into_iter().filter(|p| p.len() < 1024 && !p.contains('\0')).take(32).collect();
    let game = registry.require(&id)?;
    game.install_files(paths).await
}

fn tr(tr: &str, en: &str) -> String {
    if modstead_core::i18n::is_en() { en.into() } else { tr.into() }
}

// ───────────── Ayarlar ─────────────

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SettingsView {
    #[serde(flatten)]
    pub settings: Settings,
    pub resolved_language: String,
}

fn view(settings: Settings) -> SettingsView {
    SettingsView { settings, resolved_language: modstead_core::i18n::resolved().into() }
}

#[tauri::command]
pub fn settings_get(services: State<'_, Arc<Services>>) -> SettingsView {
    view(services.settings())
}

#[tauri::command]
pub fn settings_update(services: State<'_, Arc<Services>>, patch: SettingsPatch) -> AppResult<SettingsView> {
    Ok(view(services.update_settings(|s| s.apply(patch))?))
}

// ───────────── Nexus ve diğer anahtarlar ─────────────

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NexusStatus {
    pub has_key: bool,
    pub user: Option<NexusUser>,
    pub rate_limit: Option<RateLimit>,
    pub error: Option<String>,
}

/// Nexus hesabı. `verify` doğruysa anahtar Nexus'ta yeniden doğrulanır (ağ ister).
#[tauri::command]
pub async fn nexus_status(services: State<'_, Arc<Services>>, shell: State<'_, ShellState>, verify: bool) -> AppResult<NexusStatus> {
    let key = credentials::get(credentials::NEXUS_KEY)?.filter(|k| !k.is_empty());
    let Some(key) = key else {
        return Ok(NexusStatus { has_key: false, user: None, rate_limit: None, error: None });
    };
    let cached = shell.nexus_user.read().unwrap().clone();
    if !verify && cached.is_some() {
        return Ok(NexusStatus { has_key: true, user: cached, rate_limit: None, error: None });
    }
    match nexus::validate_key(&services.http, &key).await {
        Ok((user, rl)) => {
            *shell.nexus_user.write().unwrap() = Some(user.clone());
            Ok(NexusStatus { has_key: true, user: Some(user), rate_limit: Some(rl), error: None })
        }
        Err(e) => Ok(NexusStatus { has_key: true, user: None, rate_limit: None, error: Some(e.to_string()) }),
    }
}

/// Anahtarı önce Nexus'ta doğrular, sonra Kimlik Bilgisi Yöneticisi'ne yazar.
#[tauri::command]
pub async fn nexus_set_key(services: State<'_, Arc<Services>>, shell: State<'_, ShellState>, key: String) -> AppResult<NexusStatus> {
    let key = key.trim().to_string();
    if key.is_empty() || key.len() > 512 || !key.chars().all(|c| c.is_ascii_graphic()) {
        return Err(AppError::msg(tr("geçersiz anahtar", "invalid key")));
    }
    let (user, rl) = nexus::validate_key(&services.http, &key).await?;
    credentials::set(credentials::NEXUS_KEY, &key)?;
    *shell.nexus_user.write().unwrap() = Some(user.clone());
    Ok(NexusStatus { has_key: true, user: Some(user), rate_limit: Some(rl), error: None })
}

#[tauri::command]
pub fn nexus_clear_key(shell: State<'_, ShellState>) -> AppResult<()> {
    credentials::delete(credentials::NEXUS_KEY)?;
    *shell.nexus_user.write().unwrap() = None;
    Ok(())
}

fn secret_target(kind: &str) -> AppResult<&'static str> {
    match kind {
        "virustotal" => Ok(credentials::VIRUSTOTAL_KEY),
        "github" => Ok(credentials::GITHUB_TOKEN),
        _ => Err(AppError::msg(tr("bilinmeyen anahtar türü", "unknown key kind"))),
    }
}

/// Hangi isteğe bağlı anahtarların kayıtlı olduğu (değerler asla arayüze dönmez).
#[tauri::command]
pub fn secrets_status() -> Value {
    json!({
        "virustotal": credentials::has(credentials::VIRUSTOTAL_KEY),
        "github": credentials::has(credentials::GITHUB_TOKEN),
    })
}

#[tauri::command]
pub fn secret_set(kind: String, value: String) -> AppResult<Value> {
    let value = value.trim().to_string();
    if value.is_empty() || value.len() > 512 || !value.chars().all(|c| c.is_ascii_graphic()) {
        return Err(AppError::msg(tr("geçersiz anahtar", "invalid key")));
    }
    credentials::set(secret_target(&kind)?, &value)?;
    Ok(secrets_status())
}

#[tauri::command]
pub fn secret_clear(kind: String) -> AppResult<Value> {
    credentials::delete(secret_target(&kind)?)?;
    Ok(secrets_status())
}

// ───────────── nxm:// ─────────────

#[tauri::command]
pub fn nxm_status() -> AppResult<nxm::NxmStatus> {
    nxm::status()
}

/// Modstead'i nxm:// işleyicisi yapar; önceki işleyici (ör. Vortex) saklanır.
#[tauri::command]
pub fn nxm_register(services: State<'_, Arc<Services>>) -> AppResult<nxm::NxmStatus> {
    let previous = nxm::register()?;
    services.update_settings(|s| {
        s.nxm_registered = true;
        if s.nxm_previous_command.is_none() {
            s.nxm_previous_command = previous;
        }
    })?;
    nxm::status()
}

/// Kaydı kaldırır ve önceki işleyiciyi geri verir.
#[tauri::command]
pub fn nxm_unregister(services: State<'_, Arc<Services>>) -> AppResult<nxm::NxmStatus> {
    let previous = services.settings().nxm_previous_command;
    nxm::unregister(previous.as_deref())?;
    services.update_settings(|s| {
        s.nxm_registered = false;
        s.nxm_previous_command = None;
    })?;
    nxm::status()
}

/// Kullanıcı onayladıktan sonra bağlantıyı ilgili oyuna iletir.
#[tauri::command]
pub async fn nxm_open(registry: State<'_, GameRegistry>, url: String) -> AppResult<JobSnapshot> {
    let link = nexus::parse_nxm(&url)?;
    let game = registry.by_nexus_domain(&link.domain).ok_or_else(|| {
        AppError::msg(format!("{}: {}", tr("Bu Nexus bağlantısı Modstead'in yönettiği bir oyuna ait değil", "This Nexus link is not for a game Modstead manages"), link.domain))
    })?;
    game.handle_nxm(url).await
}

/// Açılışta ya da ikinci örnekten gelen, arayüzün henüz almadığı bağlantı ve dosyalar.
#[tauri::command]
pub fn pending_take(shell: State<'_, ShellState>, registry: State<'_, GameRegistry>) -> Value {
    let nxm: Vec<Value> = std::mem::take(&mut *shell.pending_nxm.lock().unwrap()).iter().map(|u| crate::nxm_payload(&registry, u)).collect();
    let files = std::mem::take(&mut *shell.pending_files.lock().unwrap());
    json!({ "nxm": nxm, "files": files })
}

// ───────────── Görevler ─────────────

#[tauri::command]
pub fn jobs_list(services: State<'_, Arc<Services>>) -> Vec<JobSnapshot> {
    services.jobs.list()
}

#[tauri::command]
pub fn job_cancel(services: State<'_, Arc<Services>>, id: String) {
    if let Some(job) = services.jobs.get(&id) {
        job.cancel();
    }
}

/// Görevi listeden kaldırır; oyun karantina klasörünü temizler.
#[tauri::command]
pub fn job_dismiss(services: State<'_, Arc<Services>>, registry: State<'_, GameRegistry>, id: String) {
    if let Some(job) = services.jobs.dismiss(&id) {
        if let Some(game) = registry.get(&job.game()) {
            game.discard_job(&job);
        }
    }
}

#[tauri::command]
pub fn jobs_clear(services: State<'_, Arc<Services>>, registry: State<'_, GameRegistry>) -> Vec<JobSnapshot> {
    for job in services.jobs.clear_finished() {
        if let Some(game) = registry.get(&job.game()) {
            game.discard_job(&job);
        }
    }
    services.jobs.list()
}

// ───────────── Açıcılar ─────────────

/// Kabuğun açabileceği siteler (oyunların güvenilir/bilinen kaynakları da eklenir).
const OPEN_HOSTS: &[&str] = &[
    "nexusmods.com",
    "github.com",
    "smapi.io",
    "steamcommunity.com",
    "store.steampowered.com",
    "virustotal.com",
    "stardewvalleywiki.com",
    "flightsim.to",
    "moddb.com",
    "taleworlds.com",
    "docs.bannerlordmodding.com",
];

#[tauri::command]
pub fn open_url(app: AppHandle, registry: State<'_, GameRegistry>, url: String) -> AppResult<()> {
    let parsed = url::Url::parse(&url).map_err(|_| AppError::security(tr("geçersiz adres", "invalid address")))?;
    let host = parsed.host_str().unwrap_or("").trim_start_matches("www.").to_ascii_lowercase();
    let game_hosts = registry.all().iter().flat_map(|g| g.info().trusted_sources.iter().chain(g.info().known_sources.iter()).map(|(d, _)| *d)).collect::<Vec<_>>();
    let allowed = OPEN_HOSTS.iter().chain(game_hosts.iter()).any(|d| host == *d || host.ends_with(&format!(".{d}")));
    if parsed.scheme() != "https" || !allowed {
        return Err(AppError::security(format!("{}: {host}", tr("bu adres açılamaz", "this address cannot be opened"))));
    }
    app.opener().open_url(parsed.as_str(), None::<&str>).map_err(AppError::other)
}

/// Uygulamanın veri ya da günlük klasörünü Gezgin'de açar.
#[tauri::command]
pub fn open_app_folder(app: AppHandle, services: State<'_, Arc<Services>>, kind: String) -> AppResult<()> {
    let dir = match kind.as_str() {
        "data" => services.paths.data.clone(),
        "local" => services.paths.local.clone(),
        "logs" => services.paths.logs(),
        _ => return Err(AppError::msg(tr("bilinmeyen klasör", "unknown folder"))),
    };
    std::fs::create_dir_all(&dir)?;
    app.opener().open_path(dir.to_string_lossy(), None::<&str>).map_err(AppError::other)
}
