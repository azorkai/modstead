//! Kariyer haritasının raster karoları (`GET /api/tiles/<katman>/<z>/<x>/<y>`, bkz. `hud_server`). XYZ düzeni,
//! Web Mercator (EPSG:3857), 256 px.
//!
//! Katmanlar:
//! - `relief`: çevrimdışı, ikiliye gömülü. Natural Earth II gölgeli kabartma ve su (kamu malı), Web Mercator'a
//!   izdüşürülmüş z0-5 JPEG piramidi (`games/msfs/data/relief.tiles`; üreten betik `games/msfs/tools/relief_tiles.py`,
//!   biçim orada).
//! - `sat`: çevrimiçi uydu görüntüsü. EOX "Sentinel-2 cloudless" 2016 katmanı (CC BY 4.0), `tiles.maps.eox.at`
//!   (MSFS'in `GameInfo.hosts` görsel listesinde). Çekirdeğin `media` istemcisiyle (izin listesi, HTTPS, Modstead'in
//!   kimliği) indirilir; diskte önbelleğe alınır (`<yerel>/games/msfs/tiles/sat/z/x/y.jpg`, 512 MB sınırı, en eski
//!   dosyalar silinir). Aynı karonun eşzamanlı istekleri tek indirmeye iner; aynı anda en çok 4 indirme yapılır;
//!   başarısız karo kısa süre yeniden istenmez; bağlantı yoksa bir süre hiç denenmez (istemci `relief`'e düşer).
//!
//! JPEG seçildi: simin içindeki panelin tarayıcısı (Coherent GT) WebP açmaz; karolar orada da çizilir.

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::{Arc, Mutex, OnceLock};
use std::time::{Duration, Instant, SystemTime};

use modstead_core::http::Http;
use serde::Serialize;
use tokio::sync::{OnceCell, Semaphore};

use super::{Career, hud_server};

/// Uydu karolarının sunucusu (MSFS `GameInfo.hosts.media`).
pub const SAT_HOST: &str = "tiles.maps.eox.at";
/// Sentinel-2 cloudless 2016 (CC BY 4.0), Web Mercator; `g` = GoogleMapsCompatible matris kümesi. Sıra
/// WMTS'teki gibi `{TileMatrix}/{TileRow}/{TileCol}` = `z/y/x`.
const SAT_LAYER: &str = "s2cloudless_3857";
const SAT_MAX_ZOOM: u8 = 13;
/// Lisansın istediği atıf (WMTS yetenek belgesindeki katman özetiyle aynı).
const SAT_ATTRIBUTION: &str = "EOxCloudless https://cloudless.eox.at by EOX IT Services GmbH (Contains modified Copernicus Sentinel data 2016)";

static RELIEF_PACK: &[u8] = include_bytes!("../../data/relief.tiles");

/// Önbellek sınırı ve süpürmede inilecek düzey.
const CACHE_CAP: u64 = 512 * 1024 * 1024;
/// Her bu kadar yeni karoda bir (ve açılıştan sonraki ilk karoda) önbellek süpürülür.
const SWEEP_EVERY: usize = 400;
/// Aynı anda en çok bu kadar karo indirilir.
const MAX_FETCHES: usize = 4;
/// Tek karo isteğinin süresi (bağlantı dahil).
const FETCH_TIMEOUT: Duration = Duration::from_secs(8);
/// İstemcinin bekleyeceği en uzun süre (sıra beklemesi dahil).
const REQUEST_TIMEOUT: Duration = Duration::from_secs(20);
/// Başarısız karo bu süre yeniden istenmez; sunucuda olmayan karo daha uzun.
const RETRY_AFTER: Duration = Duration::from_secs(60);
const MISSING_FOR: Duration = Duration::from_secs(30 * 60);
/// Bağlantı hatasından sonra bu süre hiçbir karo indirilmez (çevrimdışı: istemciler hemen yedeğe düşsün).
const OFFLINE_FOR: Duration = Duration::from_secs(15);
/// Karo için kabul edilen en büyük yanıt.
const MAX_TILE_BYTES: usize = 2 * 1024 * 1024;

/// Tarayıcı önbelleği: gömülü katman uygulama sürümüyle değişebilir; uydu görüntüsü sabittir (2016).
const RELIEF_MAX_AGE: u32 = 7 * 24 * 3600;
const SAT_MAX_AGE: u32 = 30 * 24 * 3600;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum Layer {
    Relief,
    Sat,
}

impl Layer {
    fn parse(s: &str) -> Option<Layer> {
        match s {
            "relief" => Some(Layer::Relief),
            "sat" => Some(Layer::Sat),
            _ => None,
        }
    }

    fn zoom_range(self) -> (u8, u8) {
        match self {
            Layer::Relief => relief().map_or((0, 0), |p| (p.min_zoom, p.max_zoom)),
            Layer::Sat => (0, SAT_MAX_ZOOM),
        }
    }
}

/// Karonun adresi.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct TileId {
    pub z: u8,
    pub x: u32,
    pub y: u32,
}

/// `<katman>/<z>/<x>/<y>`: yalnızca ondalık rakamlar (işaret, boşluk, uzantı, `..` yok), x ve y `2^z`'den küçük,
/// z katmanın aralığında. Uymayan her şey `None` (404).
pub fn parse_path(rest: &str) -> Option<(Layer, TileId)> {
    let mut parts = rest.split('/');
    let layer = Layer::parse(parts.next()?)?;
    let num = |s: Option<&str>, max_len: usize| -> Option<u32> {
        let s = s?;
        (!s.is_empty() && s.len() <= max_len && s.bytes().all(|b| b.is_ascii_digit())).then(|| s.parse().ok()).flatten()
    };
    let z = num(parts.next(), 2)?;
    let x = num(parts.next(), 8)?;
    let y = num(parts.next(), 8)?;
    if parts.next().is_some() {
        return None;
    }
    let (min, max) = layer.zoom_range();
    if z < u32::from(min) || z > u32::from(max) || x >= (1 << z) || y >= (1 << z) {
        return None;
    }
    Some((layer, TileId { z: z as u8, x, y }))
}

/// Verilen karo.
#[derive(Debug)]
pub struct Tile {
    pub body: Vec<u8>,
    pub mime: &'static str,
    pub max_age: u32,
}

/// Karo verilemedi.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Miss {
    /// Böyle bir karo yok (yol, aralık ya da sunucuda yok): 404.
    NotFound,
    /// Çevrimiçi karo şu an alınamıyor (ağ yok, sunucu hatası, izin listesi): 503, istemci yedeğe düşer.
    Unavailable(String),
}

/// `GET /api/tiles/<rest>`. Uydu karosu gerekirse bağlantı iş parçacığında beklenir (`hud_server` gibi).
pub fn get(rest: &str, career: Option<&Arc<Career>>) -> Result<Tile, Miss> {
    let (layer, id) = parse_path(rest).ok_or(Miss::NotFound)?;
    match layer {
        Layer::Relief => {
            let pack = relief().ok_or(Miss::NotFound)?;
            let body = pack.get(id).ok_or(Miss::NotFound)?;
            Ok(Tile { body: body.to_vec(), mime: pack.mime(), max_age: RELIEF_MAX_AGE })
        }
        Layer::Sat => {
            let c = career.ok_or_else(|| Miss::Unavailable("career unavailable".into()))?;
            let root = sat_root(&c.services.paths.game_local(crate::ID));
            let body = tauri::async_runtime::block_on(sat(&c.services.http, &root, id))?;
            Ok(Tile { body: body.to_vec(), mime: "image/jpeg", max_age: SAT_MAX_AGE })
        }
    }
}

// ---------- Bilgi (`msfs_career_tiles_info`) ----------

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TilesInfo {
    /// Bilgisayardaki sunucunun kökü (`http://127.0.0.1:<port>`); sunucu çalışmıyorsa `None`.
    pub base: Option<String>,
    pub layers: Vec<LayerInfo>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LayerInfo {
    pub id: &'static str,
    pub min_zoom: u8,
    pub max_zoom: u8,
    pub online: bool,
    /// Görüntü gösterilirken haritada görünmesi gereken atıf.
    pub attribution: &'static str,
    pub license: &'static str,
    pub license_url: &'static str,
}

pub fn info() -> TilesInfo {
    let (rmin, rmax) = Layer::Relief.zoom_range();
    TilesInfo {
        base: hud_server::port().map(|p| format!("http://127.0.0.1:{p}")),
        layers: vec![
            LayerInfo {
                id: "relief",
                min_zoom: rmin,
                max_zoom: rmax,
                online: false,
                attribution: "Natural Earth",
                license: "Public Domain",
                license_url: "https://www.naturalearthdata.com/about/terms-of-use/",
            },
            LayerInfo {
                id: "sat",
                min_zoom: 0,
                max_zoom: SAT_MAX_ZOOM,
                online: true,
                attribution: SAT_ATTRIBUTION,
                license: "CC BY 4.0",
                license_url: "https://creativecommons.org/licenses/by/4.0/",
            },
        ],
    }
}

// ---------- Gömülü paket ----------

/// `relief.tiles`: başlık (12 bayt), dizin (karo başına u32 başlangıç + u32 uzunluk), veriler.
pub struct Pack {
    data: &'static [u8],
    pub min_zoom: u8,
    pub max_zoom: u8,
    format: u8,
}

impl Pack {
    pub fn parse(data: &'static [u8]) -> Option<Pack> {
        if data.len() < 12 || &data[..4] != b"MSTL" || data[4] != 1 {
            return None;
        }
        let (min_zoom, max_zoom, format) = (data[5], data[6], data[7]);
        let count = u32::from_le_bytes(data[8..12].try_into().ok()?) as u64;
        if min_zoom > max_zoom || max_zoom > 12 || !matches!(format, 1 | 2) || count != level_start(min_zoom, max_zoom + 1) {
            return None;
        }
        if 12 + count * 8 > data.len() as u64 {
            return None;
        }
        Some(Pack { data, min_zoom, max_zoom, format })
    }

    pub fn mime(&self) -> &'static str {
        if self.format == 1 { "image/webp" } else { "image/jpeg" }
    }

    pub fn get(&self, id: TileId) -> Option<&'static [u8]> {
        if id.z < self.min_zoom || id.z > self.max_zoom || id.x >= (1 << id.z) || id.y >= (1 << id.z) {
            return None;
        }
        let i = level_start(self.min_zoom, id.z) + u64::from(id.y) * (1u64 << id.z) + u64::from(id.x);
        let at = (12 + i * 8) as usize;
        let rd = |o: usize| u32::from_le_bytes(self.data[o..o + 4].try_into().unwrap()) as usize;
        let (off, len) = (rd(at), rd(at + 4));
        let end = off.checked_add(len)?;
        (len > 0 && end <= self.data.len()).then(|| &self.data[off..end])
    }
}

/// `min_zoom`'dan `z`'ye kadarki (z hariç) düzeylerin karo sayısı: Σ 4^k.
fn level_start(min_zoom: u8, z: u8) -> u64 {
    (u32::from(min_zoom)..u32::from(z)).map(|k| 1u64 << (2 * k)).sum()
}

fn relief() -> Option<&'static Pack> {
    static P: OnceLock<Option<Pack>> = OnceLock::new();
    P.get_or_init(|| Pack::parse(RELIEF_PACK)).as_ref()
}

// ---------- Uydu ----------

/// Önbellek kökü: `<oyunun yerel klasörü>/tiles/sat`.
pub fn sat_root(game_local: &Path) -> PathBuf {
    game_local.join("tiles").join("sat")
}

/// Karonun diskteki yeri: `<kök>/z/x/y.jpg` (bileşenler yalnızca rakam).
pub fn cache_path(root: &Path, id: TileId) -> PathBuf {
    root.join(id.z.to_string()).join(id.x.to_string()).join(format!("{}.jpg", id.y))
}

fn sat_url(id: TileId) -> String {
    format!("https://{SAT_HOST}/wmts/1.0.0/{SAT_LAYER}/default/g/{}/{}/{}.jpg", id.z, id.y, id.x)
}

fn is_jpeg(b: &[u8]) -> bool {
    b.len() > 3 && b[..3] == [0xFF, 0xD8, 0xFF]
}

type Shared = Arc<OnceCell<Result<Arc<Vec<u8>>, Miss>>>;

#[derive(Default)]
struct SatState {
    /// Şu an indirilen karolar: aynı karoyu isteyenler aynı sonucu bekler.
    inflight: Mutex<HashMap<TileId, Shared>>,
    /// Başarısız karolar: ne zamana kadar yeniden istenmeyecek ve neden.
    failed: Mutex<HashMap<TileId, (Instant, Miss)>>,
    /// Bağlantı hatasından sonra bu ana kadar hiç indirme yapılmaz.
    offline_until: Mutex<Option<Instant>>,
    writes: AtomicUsize,
    sweeping: AtomicBool,
}

fn state() -> &'static SatState {
    static S: OnceLock<SatState> = OnceLock::new();
    S.get_or_init(SatState::default)
}

fn permits() -> &'static Semaphore {
    static P: OnceLock<Semaphore> = OnceLock::new();
    P.get_or_init(|| Semaphore::new(MAX_FETCHES))
}

/// Uydu karosu: önce disk, sonra (gerekirse) sunucu.
pub async fn sat(http: &Http, root: &Path, id: TileId) -> Result<Arc<Vec<u8>>, Miss> {
    if id.z > SAT_MAX_ZOOM || id.x >= (1 << id.z) || id.y >= (1 << id.z) {
        return Err(Miss::NotFound);
    }
    let path = cache_path(root, id);
    if let Some(b) = read_cached(&path) {
        return Ok(Arc::new(b));
    }
    let s = state();
    {
        let mut failed = s.failed.lock().unwrap();
        if let Some((until, miss)) = failed.get(&id) {
            if Instant::now() < *until {
                return Err(miss.clone());
            }
            failed.remove(&id);
        }
    }
    let cell: Shared = s.inflight.lock().unwrap().entry(id).or_default().clone();
    let out = match tokio::time::timeout(REQUEST_TIMEOUT, cell.get_or_init(|| fetch(http, root, id))).await {
        Ok(r) => r.clone(),
        Err(_) => Err(Miss::Unavailable("timed out".into())),
    };
    let mut inflight = s.inflight.lock().unwrap();
    if inflight.get(&id).is_some_and(|c| Arc::ptr_eq(c, &cell)) && cell.initialized() {
        inflight.remove(&id);
    }
    out
}

/// Tek indirme (aynı karo için bir kez çalışır); sonucu diske ya da başarısızlık listesine yazar.
async fn fetch(http: &Http, root: &Path, id: TileId) -> Result<Arc<Vec<u8>>, Miss> {
    let s = state();
    let r = download(http, id).await;
    match &r {
        Ok(bytes) => {
            if modstead_core::fsx::atomic_write(&cache_path(root, id), bytes).is_ok() {
                let n = s.writes.fetch_add(1, Ordering::Relaxed);
                if n % SWEEP_EVERY == 0 {
                    schedule_sweep(root.to_path_buf());
                }
            }
        }
        Err(miss) => {
            let ttl = if *miss == Miss::NotFound { MISSING_FOR } else { RETRY_AFTER };
            let mut failed = s.failed.lock().unwrap();
            if failed.len() > 4096 {
                let now = Instant::now();
                failed.retain(|_, (until, _)| *until > now);
            }
            failed.insert(id, (Instant::now() + ttl, miss.clone()));
        }
    }
    r.map(Arc::new)
}

async fn download(http: &Http, id: TileId) -> Result<Vec<u8>, Miss> {
    let s = state();
    if s.offline_until.lock().unwrap().is_some_and(|t| Instant::now() < t) {
        return Err(Miss::Unavailable("offline".into()));
    }
    let url = url::Url::parse(&sat_url(id)).map_err(|e| Miss::Unavailable(e.to_string()))?;
    if !http.media_allowed(&url) {
        return Err(Miss::Unavailable(format!("{SAT_HOST} is not an allowed server")));
    }
    let _permit = permits().acquire().await.map_err(|e| Miss::Unavailable(e.to_string()))?;
    let offline = |e: &dyn std::fmt::Display| {
        *s.offline_until.lock().unwrap() = Some(Instant::now() + OFFLINE_FOR);
        Miss::Unavailable(e.to_string())
    };
    let mut resp = match http.media.get(url).timeout(FETCH_TIMEOUT).send().await {
        Ok(r) => r,
        Err(e) if e.is_connect() || e.is_timeout() => return Err(offline(&e)),
        Err(e) => return Err(Miss::Unavailable(e.to_string())),
    };
    match resp.status().as_u16() {
        200 => {}
        400 | 404 => return Err(Miss::NotFound),
        code => return Err(Miss::Unavailable(format!("HTTP {code}"))),
    }
    if resp.content_length().is_some_and(|n| n > MAX_TILE_BYTES as u64) {
        return Err(Miss::Unavailable("tile too large".into()));
    }
    let mut body = Vec::with_capacity(48 * 1024);
    loop {
        match resp.chunk().await {
            Ok(Some(c)) => {
                if body.len() + c.len() > MAX_TILE_BYTES {
                    return Err(Miss::Unavailable("tile too large".into()));
                }
                body.extend_from_slice(&c);
            }
            Ok(None) => break,
            Err(e) if e.is_timeout() => return Err(offline(&e)),
            Err(e) => return Err(Miss::Unavailable(e.to_string())),
        }
    }
    if !is_jpeg(&body) {
        return Err(Miss::Unavailable("not a JPEG".into()));
    }
    Ok(body)
}

/// Diskteki karo; bozuksa silinir. Bir günden eski erişim zamanı yenilenir (süpürme en az kullanılanı siler).
fn read_cached(path: &Path) -> Option<Vec<u8>> {
    let b = std::fs::read(path).ok()?;
    if !is_jpeg(&b) {
        let _ = std::fs::remove_file(path);
        return None;
    }
    let stale = std::fs::metadata(path)
        .and_then(|m| m.modified())
        .ok()
        .and_then(|t| SystemTime::now().duration_since(t).ok())
        .is_some_and(|age| age > Duration::from_secs(24 * 3600));
    if stale {
        let _ = std::fs::File::options().write(true).open(path).and_then(|f| f.set_modified(SystemTime::now()));
    }
    Some(b)
}

fn schedule_sweep(root: PathBuf) {
    let s = state();
    if s.sweeping.swap(true, Ordering::AcqRel) {
        return;
    }
    let spawned = std::thread::Builder::new().name("modstead-tile-sweep".into()).spawn(move || {
        let (n, bytes) = sweep(&root, CACHE_CAP);
        if n > 0 {
            log::info!("uydu karo önbelleği: {n} dosya silindi ({} MB)", bytes / 1024 / 1024);
        }
        state().sweeping.store(false, Ordering::Release);
    });
    if spawned.is_err() {
        s.sweeping.store(false, Ordering::Release);
    }
}

/// Önbellek `cap`'i aşıyorsa en eski dosyalardan başlayarak `cap`'in %90'ına iner; yarım kalmış geçici dosyaları
/// da siler. Silinen dosya sayısını ve baytı döner.
pub fn sweep(root: &Path, cap: u64) -> (usize, u64) {
    let mut files: Vec<(SystemTime, u64, PathBuf)> = Vec::new();
    let mut total = 0u64;
    let (mut removed, mut freed) = (0usize, 0u64);
    for e in walkdir::WalkDir::new(root).follow_links(false).into_iter().flatten() {
        if !e.file_type().is_file() {
            continue;
        }
        let Ok(m) = e.metadata() else { continue };
        let mtime = m.modified().unwrap_or(SystemTime::UNIX_EPOCH);
        let name = e.file_name().to_string_lossy();
        if name.ends_with(".tmp") {
            if SystemTime::now().duration_since(mtime).is_ok_and(|a| a > Duration::from_secs(3600)) && std::fs::remove_file(e.path()).is_ok() {
                removed += 1;
                freed += m.len();
            }
            continue;
        }
        total += m.len();
        files.push((mtime, m.len(), e.into_path()));
    }
    if total <= cap {
        return (removed, freed);
    }
    files.sort_by_key(|(t, _, _)| *t);
    let target = cap / 10 * 9;
    for (_, len, p) in files {
        if total <= target {
            break;
        }
        if std::fs::remove_file(&p).is_ok() {
            total -= len;
            removed += 1;
            freed += len;
        }
    }
    (removed, freed)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn id(z: u8, x: u32, y: u32) -> TileId {
        TileId { z, x, y }
    }

    #[test]
    fn paths_are_strict() {
        assert_eq!(parse_path("relief/0/0/0"), Some((Layer::Relief, id(0, 0, 0))));
        assert_eq!(parse_path("relief/5/31/31"), Some((Layer::Relief, id(5, 31, 31))));
        assert_eq!(parse_path("sat/13/8191/0"), Some((Layer::Sat, id(13, 8191, 0))));
        for bad in [
            "",
            "relief",
            "relief/0/0",
            "relief/0/0/0/",
            "relief/0/0/0/0",
            "relief/0/0/0.jpg",
            "relief/1/2/0",
            "relief/1/0/2",
            "relief/6/0/0",
            "sat/14/0/0",
            "sat/-1/0/0",
            "sat/+1/0/0",
            "sat/1/ 0/0",
            "sat/1/0x1/0",
            "sat/../0/0",
            "sat/1/../0",
            "sat/1/%2e%2e/0",
            "sat/001/0/0",
            "sat/3/123456789/0",
            "sat/99999999999/0/0",
            "osm/0/0/0",
            "Relief/0/0/0",
        ] {
            assert_eq!(parse_path(bad), None, "{bad}");
        }
    }

    #[test]
    fn relief_pack_has_every_tile() {
        let p = relief().expect("gömülü paket okunamadı");
        assert_eq!((p.min_zoom, p.max_zoom), (0, 5));
        assert_eq!(p.mime(), "image/jpeg");
        let z0 = p.get(id(0, 0, 0)).unwrap();
        assert!(is_jpeg(z0) && z0.ends_with(&[0xFF, 0xD9]), "{:?}", &z0[..4]);
        for z in 0..=5u8 {
            let n = 1u32 << z;
            for (x, y) in [(0, 0), (n - 1, 0), (0, n - 1), (n - 1, n - 1), (n / 2, n / 3)] {
                assert!(p.get(id(z, x, y)).is_some_and(is_jpeg), "{z}/{x}/{y}");
            }
        }
        assert!(p.get(id(6, 0, 0)).is_none() && p.get(id(2, 4, 0)).is_none());
        let t = get("relief/3/4/2", None).unwrap();
        assert_eq!((t.mime, t.max_age), ("image/jpeg", RELIEF_MAX_AGE));
        assert_eq!(get("relief/6/0/0", None).unwrap_err(), Miss::NotFound);
    }

    #[test]
    fn pack_header_is_validated() {
        assert!(Pack::parse(b"").is_none());
        assert!(Pack::parse(b"MSTL\x01\x00\x00\x02\x01\x00\x00\x00").is_none(), "dizin eksik");
        assert!(Pack::parse(b"XXXX\x01\x00\x00\x02\x01\x00\x00\x00\x14\x00\x00\x00\x03\x00\x00\x00").is_none());
        // Tek karoluk elle yazılmış paket: dizin veriyi gösteriyor.
        static ONE: &[u8] = b"MSTL\x01\x00\x00\x02\x01\x00\x00\x00\x14\x00\x00\x00\x03\x00\x00\x00\xFF\xD8\xFF";
        let p = Pack::parse(ONE).unwrap();
        assert_eq!(p.get(id(0, 0, 0)), Some(&[0xFF, 0xD8, 0xFF][..]));
        // Dizin dosyanın dışını gösterirse karo yok sayılır.
        static BAD: &[u8] = b"MSTL\x01\x00\x00\x02\x01\x00\x00\x00\x14\x00\x00\x00\x09\x00\x00\x00\xFF\xD8\xFF";
        assert_eq!(Pack::parse(BAD).unwrap().get(id(0, 0, 0)), None);
        assert_eq!(level_start(0, 6), 1365);
        assert_eq!(level_start(2, 3), 16);
    }

    #[test]
    fn cache_layout_and_url() {
        let root = sat_root(Path::new("L"));
        assert_eq!(cache_path(&root, id(7, 70, 45)), Path::new("L").join("tiles").join("sat").join("7").join("70").join("45.jpg"));
        // WMTS sırası: z/satır(y)/sütun(x).
        assert_eq!(sat_url(id(3, 4, 2)), "https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless_3857/default/g/3/2/4.jpg");
        assert!(crate::INFO.hosts.media.contains(&SAT_HOST));
    }

    #[test]
    fn info_lists_both_layers() {
        let i = info();
        let v = serde_json::to_value(&i).unwrap();
        assert_eq!(v["layers"][0]["id"], "relief");
        assert_eq!(v["layers"][0]["maxZoom"], 5);
        assert_eq!(v["layers"][0]["online"], false);
        assert_eq!(v["layers"][1]["id"], "sat");
        assert_eq!(v["layers"][1]["maxZoom"], 13);
        assert_eq!(v["layers"][1]["online"], true);
        assert!(v["layers"][1]["attribution"].as_str().unwrap().contains("Copernicus Sentinel data 2016"));
    }

    #[test]
    fn sat_respects_the_allowlist_and_caches_on_disk() {
        let root = std::env::temp_dir().join(format!("modstead-tiles-{}", modstead_core::fsx::short_id()));
        // Çekirdek listesinde EOX yok: ağa hiç çıkmadan 503.
        let http = Http::new(modstead_core::http::HttpPolicy::core(), "Modstead-test");
        let r = tauri::async_runtime::block_on(sat(&http, &root, id(2, 1, 1)));
        assert!(matches!(r, Err(Miss::Unavailable(_))), "{r:?}");
        // Diskteki geçerli karo ağa çıkmadan verilir; bozuk olan silinir.
        let p = cache_path(&root, id(2, 3, 3));
        modstead_core::fsx::atomic_write(&p, &[0xFF, 0xD8, 0xFF, 0xE0, 1, 2]).unwrap();
        assert_eq!(tauri::async_runtime::block_on(sat(&http, &root, id(2, 3, 3))).unwrap().len(), 6);
        let bad = cache_path(&root, id(2, 0, 3));
        modstead_core::fsx::atomic_write(&bad, b"<html>").unwrap();
        assert!(tauri::async_runtime::block_on(sat(&http, &root, id(2, 0, 3))).is_err());
        assert!(!bad.exists());
        assert_eq!(tauri::async_runtime::block_on(sat(&http, &root, id(14, 0, 0))).unwrap_err(), Miss::NotFound);
        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn sweep_removes_the_oldest_first() {
        let root = std::env::temp_dir().join(format!("modstead-sweep-{}", modstead_core::fsx::short_id()));
        let old = SystemTime::now() - Duration::from_secs(3 * 24 * 3600);
        for i in 0..10u32 {
            let p = cache_path(&root, id(4, i, 0));
            modstead_core::fsx::atomic_write(&p, &[0u8; 100]).unwrap();
            // 0 en eski, 9 en yeni.
            let t = old + Duration::from_secs(u64::from(i) * 60);
            std::fs::File::options().write(true).open(&p).unwrap().set_modified(t).unwrap();
        }
        assert_eq!(sweep(&root, 2000), (0, 0), "sınırın altında dokunulmaz");
        let (n, bytes) = sweep(&root, 500);
        // %90'a (450 bayt) iner: 4 dosya kalır.
        assert_eq!((n, bytes), (6, 600));
        for i in 0..10u32 {
            assert_eq!(cache_path(&root, id(4, i, 0)).exists(), i >= 6, "{i}");
        }
        let _ = std::fs::remove_dir_all(&root);
    }

    /// Gerçek sunucudan tek bir z3 karosu (ağ ister): `cargo test -p game-msfs -- --ignored sat_fetch_live`.
    #[test]
    #[ignore]
    fn sat_fetch_live() {
        let root = std::env::temp_dir().join(format!("modstead-tiles-live-{}", modstead_core::fsx::short_id()));
        let policy = modstead_core::http::HttpPolicy::core().with(&crate::INFO.hosts);
        let http = Http::new(policy, &modstead_core::http::user_agent(env!("CARGO_PKG_VERSION")));
        let t = id(3, 4, 2);
        let b = tauri::async_runtime::block_on(sat(&http, &root, t)).expect("karo alınamadı");
        assert!(is_jpeg(&b) && b.len() > 1000, "{} bayt", b.len());
        assert_eq!(std::fs::read(cache_path(&root, t)).unwrap(), *b);
        println!("z3/4/2: {} bayt", b.len());
        let _ = std::fs::remove_dir_all(&root);
    }
}
