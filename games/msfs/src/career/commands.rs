//! Kariyer komutları (`msfs_career_…`); arayüzdeki karşılıkları `games/msfs/ui/career/api.ts`.

use std::sync::Arc;

use modstead_core::prelude::*;
use serde::Serialize;
use tauri::State;

use super::aircraft::Class;
use super::airports::{Airport, Size, db, distance_nm};
use super::model::{Job, LedgerEntry, LogEntry};
use super::tracker::TrackPoint;
use super::{AircraftOption, Career, CareerView, CreateRequest, Live, jobs};
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
pub async fn msfs_career_create(game: G<'_>, request: CreateRequest) -> AppResult<CareerView> {
    run(&game, move |c| {
        c.create(request)?;
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
    run(&game, |c| Ok(c.installed_aircraft())).await
}

#[tauri::command]
pub async fn msfs_career_refresh_aircraft(game: G<'_>) -> AppResult<()> {
    run(&game, |c| {
        c.send(super::link::Command::RefreshAircraft);
        Ok(())
    })
    .await
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
pub async fn msfs_career_launch(game: G<'_>) -> AppResult<()> {
    run(&game, |c| c.launch()).await
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
    let sizes: &[Size] = match detail {
        0 => &[Size::Large],
        1 => &[Size::Large, Size::Medium],
        _ => &[Size::Large, Size::Medium, Size::Small, Size::Seaplane],
    };
    Ok(db()
        .in_box(south, west, north, east, sizes, 400)
        .into_iter()
        .map(|a| MapAirport { icao: a.icao.clone(), name: a.name.clone(), size: a.size, lat: a.lat, lon: a.lon, runway: a.runway.clone() })
        .collect())
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
