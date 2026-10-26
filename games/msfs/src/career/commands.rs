//! Kariyer komutları (`msfs_career_…`); arayüzdeki karşılıkları `games/msfs/ui/career/api.ts`.

use std::sync::Arc;

use modstead_core::prelude::*;
use serde::Serialize;
use tauri::State;

use super::aircraft::Class;
use super::airports::{Airport, Size, db, distance_nm};
use super::model::{Job, LedgerEntry, LogEntry, StartAt};
use super::tracker::TrackPoint;
use super::deck::{self, DeckInfo};
use super::paths::{self, CareerPath, PathInfo};
use super::progression::Difficulty;
use super::{AircraftOption, Career, CareerView, Live, NewCareer, jobs};
use crate::Msfs;

type G<'a> = State<'a, Msfs>;

/// Kariyer işini arka plan iş parçacığında çalıştırır (dosya yazar).
async fn run<T: Send + 'static>(game: &Msfs, f: impl FnOnce(&Career) -> AppResult<T> + Send + 'static) -> AppResult<T> {
    let c: Arc<Career> = game.career();
    tokio::task::spawn_blocking(move || f(&c)).await?
}

#[tauri::command]
pub async fn msfs_career_state(game: G<'_>) -> AppResult<CareerView> {
    run(&game, |c| Ok(c.view())).await
}

#[tauri::command]
pub async fn msfs_career_create(game: G<'_>, request: NewCareer) -> AppResult<CareerView> {
    run(&game, move |c| {
        match request.path {
            Some(path) => c.create_in(request.request, path)?,
            None => c.create(request.request)?,
        }
        Ok(c.view())
    })
    .await
}

/// Kariyer yollarının kataloğu (kayıt ekranı ve yol değiştirme): paketler seçilen zorlukla ölçeklenir.
#[tauri::command]
pub async fn msfs_career_paths(game: G<'_>, difficulty: Option<Difficulty>) -> AppResult<Vec<PathInfo>> {
    run(&game, move |c| {
        let d = difficulty.or_else(|| c.lock_data().pilot.as_ref().map(|p| p.difficulty)).unwrap_or_default();
        Ok(paths::catalog(db(), d))
    })
    .await
}

/// Kariyer yolunu değiştirir (lisans, saat, para ve itibar kalır).
#[tauri::command]
pub async fn msfs_career_set_path(game: G<'_>, path: CareerPath) -> AppResult<CareerView> {
    run(&game, move |c| {
        c.set_path(path)?;
        Ok(c.view())
    })
    .await
}

#[tauri::command]
pub async fn msfs_career_reset(game: G<'_>) -> AppResult<()> {
    run(&game, |c| {
        c.reset();
        Ok(())
    })
    .await
}

/// Gerçek hava: panodaki varışların ve aktif işin METAR'ları (önbellekte olmayanlar aviationweather.gov'dan).
#[tauri::command]
pub async fn msfs_career_weather(game: G<'_>) -> AppResult<Vec<super::weather::Metar>> {
    let career = game.career();
    weather(&career).await
}

/// `msfs_career_weather`'ın gövdesi; uçuş ekranının uzaktan çağrısı da bunu kullanır (`hud_server`).
pub async fn weather(career: &Career) -> AppResult<Vec<super::weather::Metar>> {
    let targets = career.weather_targets();
    let want = career.weather_wanted(&targets);
    if !want.is_empty() {
        let http = &career.services.http;
        let url = http.ensure_allowed(&super::weather::url(&want))?;
        match http.client.get(url).send().await {
            Ok(r) if r.status().is_success() => {
                let body = r.text().await.unwrap_or_default();
                let items = super::weather::parse_json(&body, modstead_core::fsx::now_ts());
                career.note("hava", format!("METAR: {} istendi, {} geldi", want.len(), items.len()));
                career.weather_store(items);
                career.changed();
            }
            Ok(r) => career.note("hava", format!("METAR alınamadı: HTTP {}", r.status())),
            Err(e) => career.note("hava", format!("METAR alınamadı: {e}")),
        }
    }
    let refs: Vec<&str> = targets.iter().map(|s| s.as_str()).collect();
    Ok(career.weather_for(&refs).into_iter().flatten().collect())
}

#[tauri::command]
pub async fn msfs_career_maintain(game: G<'_>, id: String, heavy: bool) -> AppResult<i64> {
    run(&game, move |c| c.maintain(&id, heavy)).await
}

#[tauri::command]
pub async fn msfs_career_insure(game: G<'_>, id: String, on: bool) -> AppResult<()> {
    run(&game, move |c| c.insure(&id, on)).await
}

#[tauri::command]
pub async fn msfs_career_appeal(game: G<'_>, id: String, code: String) -> AppResult<LogEntry> {
    run(&game, move |c| c.appeal(&id, &code)).await
}

#[tauri::command]
pub async fn msfs_career_medical(game: G<'_>) -> AppResult<i64> {
    game.career().renew_medical()
}

#[tauri::command]
pub async fn msfs_career_rest(game: G<'_>) -> AppResult<i64> {
    game.career().rest()
}

#[tauri::command]
pub async fn msfs_career_board(game: G<'_>) -> AppResult<Vec<Job>> {
    run(&game, |c| c.board()).await
}

#[tauri::command]
pub async fn msfs_career_accept(game: G<'_>, id: String) -> AppResult<()> {
    run(&game, move |c| c.accept(&id)).await
}

#[tauri::command]
pub async fn msfs_career_cancel(game: G<'_>) -> AppResult<()> {
    run(&game, |c| c.cancel()).await
}

#[tauri::command]
pub async fn msfs_career_aircraft(game: G<'_>) -> AppResult<Vec<AircraftOption>> {
    let g: Msfs = game.inner().clone();
    // Mod uçakları son taramadan (değişmediyse önbellekten); sonra simin listesi ve uçulan uçaklarla birleşir.
    tokio::task::spawn_blocking(move || {
        super::addons::refresh(&g, false);
        Ok(g.career().installed_aircraft())
    })
    .await?
}

/// Simden uçak listesini yeniden ister ve diski yeniden tarar (Community'ye elle eklenen mod uçakları da görünsün).
#[tauri::command]
pub async fn msfs_career_refresh_aircraft(game: G<'_>) -> AppResult<()> {
    let g: Msfs = game.inner().clone();
    tokio::task::spawn_blocking(move || {
        let c = g.career();
        c.send(super::link::Command::RefreshAircraft);
        super::addons::refresh(&g, true);
        c.changed();
        Ok(())
    })
    .await?
}

/// Mod uçağının paketindeki küçük resim (ham bayt; arayüz `blob:` adresine çevirir). `livery` verilirse o boyanınki.
#[tauri::command]
pub async fn msfs_career_aircraft_thumb(title: String, livery: Option<String>) -> AppResult<tauri::ipc::Response> {
    let bytes = tokio::task::spawn_blocking(move || super::addons::thumbnail(&title, livery.as_deref())).await??;
    Ok(tauri::ipc::Response::new(bytes))
}

/// Uçağın yükü ve yakıtı kendi EFB'sinden mi yönetilir: `Some` elle seçer, `None` otomatiğe döner.
#[tauri::command]
pub async fn msfs_career_set_loading(game: G<'_>, title: String, own: Option<bool>) -> AppResult<()> {
    run(&game, move |c| super::addons::set_own_loading(c, &title, own)).await
}

#[tauri::command]
pub async fn msfs_career_pick_aircraft(game: G<'_>, title: String, livery: String, fleet_id: Option<String>) -> AppResult<()> {
    run(&game, move |c| c.pick_aircraft(&title, &livery, fleet_id)).await
}

#[tauri::command]
pub async fn msfs_career_set_class(game: G<'_>, title: String, class: Option<Class>) -> AppResult<()> {
    run(&game, move |c| c.set_class(&title, class)).await
}

#[tauri::command]
pub async fn msfs_career_launch(game: G<'_>, start: Option<StartAt>) -> AppResult<()> {
    run(&game, move |c| c.launch(start)).await
}

#[tauri::command]
pub async fn msfs_career_reposition(game: G<'_>) -> AppResult<()> {
    run(&game, |c| c.reposition()).await
}

#[tauri::command]
pub async fn msfs_career_finish(game: G<'_>) -> AppResult<LogEntry> {
    run(&game, |c| c.finish()).await
}

#[tauri::command]
pub async fn msfs_career_abandon(game: G<'_>) -> AppResult<Option<LogEntry>> {
    run(&game, |c| c.abandon()).await
}

#[tauri::command]
pub async fn msfs_career_logbook(game: G<'_>) -> AppResult<Vec<LogEntry>> {
    run(&game, |c| Ok(c.logbook())).await
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FlightDetail {
    pub entry: LogEntry,
    pub track: Vec<TrackPoint>,
    pub from: Option<Airport>,
    pub to: Option<Airport>,
    pub arrived: Option<Airport>,
}

#[tauri::command]
pub async fn msfs_career_flight(game: G<'_>, id: String) -> AppResult<FlightDetail> {
    run(&game, move |c| {
        let (entry, track) = c.flight(&id)?;
        Ok(FlightDetail {
            from: db().get(&entry.job.from).cloned(),
            to: db().get(&entry.job.to).cloned(),
            arrived: db().get(&entry.arrived).cloned(),
            entry,
            track,
        })
    })
    .await
}

#[tauri::command]
pub async fn msfs_career_checkride(game: G<'_>, license: String) -> AppResult<()> {
    run(&game, move |c| c.start_checkride(&license)).await
}

#[tauri::command]
pub async fn msfs_career_travel(game: G<'_>, icao: String) -> AppResult<i64> {
    run(&game, move |c| c.travel(&icao)).await
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AirportHit {
    #[serde(flatten)]
    pub airport: Airport,
    /// Pilotun bulunduğu yerden uzaklık ve bilet ücreti (kariyer varsa).
    pub distance_nm: Option<f64>,
    pub ticket: Option<i64>,
}

#[tauri::command]
pub async fn msfs_career_airports(game: G<'_>, query: String) -> AppResult<Vec<AirportHit>> {
    run(&game, move |c| {
        let pilot = c.lock_data().pilot.clone();
        let here = pilot.as_ref().and_then(|p| db().get(&p.location));
        Ok(db()
            .search(&query, 12)
            .into_iter()
            .map(|a| AirportHit {
                distance_nm: here.map(|h| (distance_nm(h.lat, h.lon, a.lat, a.lon) * 10.0).round() / 10.0),
                ticket: match (here, &pilot) {
                    (Some(h), Some(p)) => Some(jobs::travel_cost(h, a, p)),
                    _ => None,
                },
                airport: a.clone(),
            })
            .collect())
    })
    .await
}

/// Haritadaki havalimanı: çizim ve ipucu için gereken kadarı.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MapAirport {
    pub icao: String,
    pub name: String,
    pub size: Size,
    pub lat: f64,
    pub lon: f64,
    /// En uzun pistin uçları ("05/23"); harita simgesinin yönü buradan.
    pub runway: String,
}

/// Haritada görünen kutudaki havalimanları. `detail`: 0 yalnızca büyükler, 1 ortalar da, 2 hepsi.
#[tauri::command]
pub async fn msfs_career_map_airports(south: f64, west: f64, north: f64, east: f64, detail: u8) -> AppResult<Vec<MapAirport>> {
    Ok(map_airports(south, west, north, east, detail))
}

/// `msfs_career_map_airports`'un gövdesi (uçuş ekranının uzaktan çağrısı da kullanır).
pub fn map_airports(south: f64, west: f64, north: f64, east: f64, detail: u8) -> Vec<MapAirport> {
    let sizes: &[Size] = match detail {
        0 => &[Size::Large],
        1 => &[Size::Large, Size::Medium],
        _ => &[Size::Large, Size::Medium, Size::Small, Size::Seaplane],
    };
    db().in_box(south, west, north, east, sizes, 400)
        .into_iter()
        .map(|a| MapAirport { icao: a.icao.clone(), name: a.name.clone(), size: a.size, lat: a.lat, lon: a.lon, runway: a.runway.clone() })
        .collect()
}

/// Sim içi panelin (HUD) durumu: kütüphanede kurulu mu, hangi simlere bağlı.
#[tauri::command]
pub async fn msfs_career_hud(game: G<'_>) -> AppResult<super::hud::HudStatus> {
    let g: Msfs = game.inner().clone();
    Ok(tokio::task::spawn_blocking(move || super::hud::status(&g)).await?)
}

/// Paneli kurar ya da günceller ve simlere bağlar (simler kapalı olmalı).
#[tauri::command]
pub async fn msfs_career_hud_install(game: G<'_>) -> AppResult<super::hud::HudStatus> {
    let g: Msfs = game.inner().clone();
    tokio::task::spawn_blocking(move || {
        let s = super::hud::install(&g)?;
        g.rescan();
        g.changed();
        Ok(s)
    })
    .await?
}

/// Ana menü kutusunun durumu (paket, sim sürümü, kurulduğu sürüm).
#[tauri::command]
pub async fn msfs_career_menu(game: G<'_>) -> AppResult<super::menu::MenuStatus> {
    let g: Msfs = game.inner().clone();
    Ok(tokio::task::spawn_blocking(move || super::menu::status(&g)).await?)
}

#[tauri::command]
pub async fn msfs_career_menu_install(game: G<'_>) -> AppResult<super::menu::MenuStatus> {
    let g: Msfs = game.inner().clone();
    tokio::task::spawn_blocking(move || {
        let s = super::menu::install(&g)?;
        g.rescan();
        g.changed();
        Ok(s)
    })
    .await?
}

#[tauri::command]
pub async fn msfs_career_menu_remove(game: G<'_>) -> AppResult<super::menu::MenuStatus> {
    let g: Msfs = game.inner().clone();
    tokio::task::spawn_blocking(move || {
        let s = super::menu::remove(&g)?;
        g.rescan();
        g.changed();
        Ok(s)
    })
    .await?
}

#[tauri::command]
pub async fn msfs_career_menu_queue(game: G<'_>, on: bool) -> AppResult<super::menu::MenuStatus> {
    let g: Msfs = game.inner().clone();
    Ok(tokio::task::spawn_blocking(move || super::menu::queue(&g, on)).await?)
}

/// "Sim kapanınca kur": sim açıkken kurulamayan paneli sim kapanır kapanmaz kurar.
#[tauri::command]
pub async fn msfs_career_hud_queue(game: G<'_>, on: bool) -> AppResult<super::hud::HudStatus> {
    let g: Msfs = game.inner().clone();
    Ok(tokio::task::spawn_blocking(move || super::hud::queue(&g, on)).await?)
}

/// Paneli kütüphaneden ve simlerden kaldırır (simler kapalıyken).
#[tauri::command]
pub async fn msfs_career_hud_remove(game: G<'_>) -> AppResult<super::hud::HudStatus> {
    let g: Msfs = game.inner().clone();
    tokio::task::spawn_blocking(move || {
        let s = super::hud::remove(&g)?;
        g.rescan();
        g.changed();
        Ok(s)
    })
    .await?
}

#[tauri::command]
pub async fn msfs_career_buy(game: G<'_>, class: Class, title: String) -> AppResult<()> {
    run(&game, move |c| c.buy(class, &title)).await
}

#[tauri::command]
pub async fn msfs_career_sell(game: G<'_>, id: String) -> AppResult<i64> {
    run(&game, move |c| c.sell(&id)).await
}

#[tauri::command]
pub async fn msfs_career_repair(game: G<'_>, id: String) -> AppResult<i64> {
    run(&game, move |c| c.repair(&id)).await
}

#[tauri::command]
pub async fn msfs_career_borrow(game: G<'_>, amount: i64) -> AppResult<i64> {
    run(&game, move |c| c.borrow(amount)).await
}

#[tauri::command]
pub async fn msfs_career_repay(game: G<'_>, amount: i64) -> AppResult<i64> {
    run(&game, move |c| c.repay(amount)).await
}

#[tauri::command]
pub async fn msfs_career_ledger(game: G<'_>) -> AppResult<Vec<LedgerEntry>> {
    run(&game, |c| Ok(c.ledger())).await
}

#[tauri::command]
pub fn msfs_career_live(game: G<'_>) -> Live {
    game.career().live()
}

#[tauri::command]
pub async fn msfs_career_simbrief(game: G<'_>) -> AppResult<Option<String>> {
    run(&game, |c| Ok(c.simbrief_url())).await
}

/// Kariyer günlüğünün son satırları (bkz. `career::journal`).
#[tauri::command]
pub async fn msfs_career_journal(game: G<'_>, limit: Option<usize>) -> AppResult<Vec<String>> {
    let n = limit.unwrap_or(200).min(2000);
    run(&game, move |c| Ok(c.journal_tail(n))).await
}

/// Günlük dosyasını Gezgin'de seçili gösterir.
#[tauri::command]
pub async fn msfs_career_reveal_journal(game: G<'_>) -> AppResult<()> {
    run(&game, |c| {
        let path = c.journal_path();
        modstead_core::platform::hidden_command("explorer.exe").arg(format!("/select,{}", path.display())).spawn()?;
        Ok(())
    })
    .await
}

/// Aktif işin uçuş planını yazar ve klasörünü Gezgin'de açar (PLN'yi EFB'ye sürüklemek için).
#[tauri::command]
pub async fn msfs_career_reveal_plan(game: G<'_>) -> AppResult<()> {
    run(&game, |c| {
        let dir = c.write_plan()?;
        modstead_core::platform::hidden_command("explorer.exe").arg(&dir).spawn()?;
        Ok(())
    })
    .await
}

/// Aktif uçuşun şimdiye kadarki izi (`FlightDetail.track` ile aynı biçim); aktif takip yoksa boş.
#[tauri::command]
pub async fn msfs_career_track(game: G<'_>) -> AppResult<Vec<TrackPoint>> {
    run(&game, |c| Ok(c.active_track())).await
}

// ---------- Uçuş ekranı (bkz. `deck`) ----------

/// Uçuş ekranının adresleri, yerel ağ durumu ve QR kodu.
#[tauri::command]
pub async fn msfs_career_deck_info(game: G<'_>) -> AppResult<DeckInfo> {
    let c = game.career();
    Ok(tokio::task::spawn_blocking(move || deck::info(&c)).await?)
}

/// Yerel ağ kipini açar ya da kapatır (açınca Windows güvenlik duvarı ilk seferde izin sorabilir).
#[tauri::command]
pub async fn msfs_career_deck_set_lan(game: G<'_>, on: bool) -> AppResult<DeckInfo> {
    let c = game.career();
    tokio::task::spawn_blocking(move || deck::set_lan(&c, on)).await?
}

/// Yeni yerel ağ anahtarı: eski adres ve QR kodu geçersiz olur.
#[tauri::command]
pub async fn msfs_career_deck_rotate(game: G<'_>) -> AppResult<DeckInfo> {
    let c = game.career();
    tokio::task::spawn_blocking(move || deck::rotate(&c)).await?
}

/// Uçuş ekranı penceresini açar ya da öne getirir (async: pencere ana iş parçacığında kurulmasın diye).
#[tauri::command]
pub async fn msfs_career_deck_open() -> AppResult<()> {
    tokio::task::spawn_blocking(deck::open_window).await?
}

// ---------- Harita karoları (bkz. `tiles`) ----------

/// Harita katmanları ve karoların alınacağı yerel sunucu (`<base>/api/tiles/<katman>/<z>/<x>/<y>`).
#[tauri::command]
pub async fn msfs_career_tiles_info() -> AppResult<super::tiles::TilesInfo> {
    Ok(super::tiles::info())
}
