//! Havalimanı veritabanı (uygulamaya gömülü) ve coğrafi hesaplar.
//!
//! Kaynak OurAirports (kamu malı); `tools/airports.py` CSV'lerden `airports.tsv`yi üretir. MSFS 2024 bağlıyken
//! simin kendi tesis listesi de alınır; iş üretimi o listede olmayan havalimanlarını (sahnede bulunmayan) atlar.

use std::collections::HashMap;
use std::sync::OnceLock;

use serde::Serialize;

use super::aircraft::ClassInfo;

const DATA: &str = include_str!("airports.tsv");

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum Size {
    Large,
    Medium,
    Small,
    Seaplane,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum Surface {
    Paved,
    Unpaved,
    Water,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Airport {
    pub icao: String,
    pub size: Size,
    pub name: String,
    pub city: String,
    pub country: String,
    pub lat: f64,
    pub lon: f64,
    pub elevation_ft: i32,
    pub runway_ft: u32,
    pub surface: Surface,
    pub lighted: bool,
    pub scheduled: bool,
    /// En uzun pistin uçları ("05/23").
    pub runway: String,
}

impl Airport {
    /// Bu sınıf buraya inip kalkabilir mi?
    pub fn suits(&self, c: &ClassInfo) -> bool {
        if c.min_runway_ft == 0 {
            return self.surface != Surface::Water || c.unpaved;
        }
        match self.surface {
            Surface::Water => false,
            Surface::Unpaved if !c.unpaved => false,
            _ => self.runway_ft >= c.min_runway_ft,
        }
    }
}

pub struct AirportDb {
    pub list: Vec<Airport>,
    by_icao: HashMap<String, usize>,
    /// 2°×2° hücreler → dizinler.
    grid: HashMap<(i32, i32), Vec<usize>>,
}

const CELL: f64 = 2.0;

fn cell(lat: f64, lon: f64) -> (i32, i32) {
    ((lat / CELL).floor() as i32, (lon / CELL).floor() as i32)
}

impl AirportDb {
    pub fn parse(text: &str) -> AirportDb {
        let mut list = Vec::with_capacity(32_000);
        for line in text.lines() {
            if line.starts_with('#') || line.is_empty() {
                continue;
            }
            let f: Vec<&str> = line.split('\t').collect();
            if f.len() < 13 {
                continue;
            }
            let size = match f[1] {
                "L" => Size::Large,
                "M" => Size::Medium,
                "W" => Size::Seaplane,
                _ => Size::Small,
            };
            let surface = match f[9] {
                "P" => Surface::Paved,
                "W" => Surface::Water,
                _ => Surface::Unpaved,
            };
            list.push(Airport {
                icao: f[0].to_string(),
                size,
                name: f[2].to_string(),
                city: f[3].to_string(),
                country: f[4].to_string(),
                lat: f[5].parse().unwrap_or(0.0),
                lon: f[6].parse().unwrap_or(0.0),
                elevation_ft: f[7].parse().unwrap_or(0),
                runway_ft: f[8].parse().unwrap_or(0),
                surface,
                lighted: f[10] == "1",
                scheduled: f[11] == "1",
                runway: f[12].to_string(),
            });
        }
        let mut by_icao = HashMap::with_capacity(list.len());
        let mut grid: HashMap<(i32, i32), Vec<usize>> = HashMap::new();
        for (i, a) in list.iter().enumerate() {
            by_icao.insert(a.icao.clone(), i);
            grid.entry(cell(a.lat, a.lon)).or_default().push(i);
        }
        AirportDb { list, by_icao, grid }
    }

    pub fn get(&self, icao: &str) -> Option<&Airport> {
        self.by_icao.get(&icao.trim().to_ascii_uppercase()).map(|&i| &self.list[i])
    }

    /// `lat/lon` çevresinde `max_nm` içindeki havalimanları (yaklaşık hücre taraması + gerçek mesafe).
    pub fn within(&self, lat: f64, lon: f64, max_nm: f64) -> Vec<(&Airport, f64)> {
        let deg_lat = max_nm / 60.0;
        let deg_lon = (max_nm / (60.0 * lat.to_radians().cos().abs().max(0.05))).min(180.0);
        let (c0, c1) = (cell(lat - deg_lat, lon - deg_lon), cell(lat + deg_lat, lon + deg_lon));
        let mut out = Vec::new();
        for y in c0.0..=c1.0 {
            for x in c0.1..=c1.1 {
                // Tarih değiştirme çizgisinin öbür yanı.
                let xs = [x, x - (360.0 / CELL) as i32, x + (360.0 / CELL) as i32];
                for xx in xs {
                    if let Some(ids) = self.grid.get(&(y, xx)) {
                        for &i in ids {
                            let a = &self.list[i];
                            let d = distance_nm(lat, lon, a.lat, a.lon);
                            if d <= max_nm {
                                out.push((a, d));
                            }
                        }
                    }
                }
            }
        }
        out.sort_by(|a, b| a.1.total_cmp(&b.1));
        out.dedup_by(|a, b| a.0.icao == b.0.icao);
        out
    }

    /// Enlem/boylam kutusundaki havalimanları; önce büyükler, sonra uzun pistliler, en çok `limit` tane.
    /// Boylamlar haritadaki gibi açılmış olabilir (−180'den küçük ya da 180'den büyük); tarih çizgisi aşılır.
    pub fn in_box(&self, south: f64, west: f64, north: f64, east: f64, sizes: &[Size], limit: usize) -> Vec<&Airport> {
        let span = (east - west).clamp(0.0, 360.0);
        let lon_in = |lon: f64| span >= 360.0 || (lon - west).rem_euclid(360.0) <= span;
        let cells = (360.0 / CELL) as i32;
        let (y0, y1) = ((south / CELL).floor() as i32, (north / CELL).floor() as i32);
        let (x0, x1) = ((west / CELL).floor() as i32, (west + span) / CELL);
        let x1 = (x1.floor() as i32).min(x0 + cells - 1);
        let mut out = Vec::new();
        for y in y0..=y1 {
            for x in x0..=x1 {
                // Hücre dizinini −90…89 aralığına sar.
                let xx = (x + cells / 2).rem_euclid(cells) - cells / 2;
                for &i in self.grid.get(&(y, xx)).map(Vec::as_slice).unwrap_or_default() {
                    let a = &self.list[i];
                    if a.lat >= south && a.lat <= north && lon_in(a.lon) && sizes.contains(&a.size) {
                        out.push(a);
                    }
                }
            }
        }
        let rank = |s: Size| match s {
            Size::Large => 0,
            Size::Medium => 1,
            Size::Small => 2,
            Size::Seaplane => 3,
        };
        out.sort_by(|a, b| rank(a.size).cmp(&rank(b.size)).then(b.runway_ft.cmp(&a.runway_ft)));
        out.truncate(limit);
        out
    }

    /// En yakın havalimanı (`max_nm` içinde).
    pub fn nearest(&self, lat: f64, lon: f64, max_nm: f64) -> Option<(&Airport, f64)> {
        self.within(lat, lon, max_nm).into_iter().next()
    }

    /// Ad, şehir ya da kimlikle arama (kimlik eşleşmesi ve büyük havalimanları önce).
    pub fn search(&self, query: &str, limit: usize) -> Vec<&Airport> {
        let q = fold(query.trim());
        if q.len() < 2 {
            return Vec::new();
        }
        let mut hits: Vec<(u32, &Airport)> = self
            .list
            .iter()
            .filter_map(|a| {
                let icao = a.icao.to_ascii_lowercase();
                let rank = if icao == q {
                    0
                } else if icao.starts_with(&q) {
                    1
                } else if fold(&a.city).starts_with(&q) || fold(&a.name).starts_with(&q) {
                    2
                } else if fold(&a.name).contains(&q) || fold(&a.city).contains(&q) {
                    3
                } else {
                    return None;
                };
                let size = match a.size {
                    Size::Large => 0,
                    Size::Medium => 1,
                    Size::Small => 2,
                    Size::Seaplane => 3,
                };
                Some((rank * 10 + size, a))
            })
            .collect();
        hits.sort_by(|a, b| a.0.cmp(&b.0).then_with(|| a.1.icao.cmp(&b.1.icao)));
        hits.into_iter().take(limit).map(|(_, a)| a).collect()
    }
}

/// Aramada Türkçe harfler ve büyük/küçük harf fark etmesin ("istanbul" → "İstanbul").
fn fold(s: &str) -> String {
    s.chars()
        .flat_map(|c| c.to_lowercase())
        .map(|c| match c {
            'ı' | 'i' | 'î' | 'ï' => 'i',
            'ş' => 's',
            'ğ' => 'g',
            'ü' | 'û' => 'u',
            'ö' => 'o',
            'ç' => 'c',
            'â' | 'á' | 'à' | 'ä' | 'ã' => 'a',
            'é' | 'è' | 'ê' | 'ë' => 'e',
            'ó' | 'ò' | 'ô' => 'o',
            'ú' | 'ù' => 'u',
            'ñ' => 'n',
            c => c,
        })
        .filter(|c| *c != '\u{307}')
        .collect()
}

pub fn db() -> &'static AirportDb {
    static DB: OnceLock<AirportDb> = OnceLock::new();
    DB.get_or_init(|| AirportDb::parse(DATA))
}

/// Büyük çember mesafesi (deniz mili).
pub fn distance_nm(lat1: f64, lon1: f64, lat2: f64, lon2: f64) -> f64 {
    let (p1, p2) = (lat1.to_radians(), lat2.to_radians());
    let dp = p2 - p1;
    let dl = (lon2 - lon1).to_radians();
    let a = (dp / 2.0).sin().powi(2) + p1.cos() * p2.cos() * (dl / 2.0).sin().powi(2);
    2.0 * 3440.065 * a.sqrt().atan2((1.0 - a).sqrt())
}

/// Başlangıç kerterizi (derece, gerçek kuzey).
pub fn bearing_deg(lat1: f64, lon1: f64, lat2: f64, lon2: f64) -> f64 {
    let (p1, p2) = (lat1.to_radians(), lat2.to_radians());
    let dl = (lon2 - lon1).to_radians();
    let y = dl.sin() * p2.cos();
    let x = p1.cos() * p2.sin() - p1.sin() * p2.cos() * dl.cos();
    (y.atan2(x).to_degrees() + 360.0) % 360.0
}

/// Havalimanı referans noktasından metre cinsinden doğu/kuzey kaymasıyla yeni konum.
pub fn offset(lat: f64, lon: f64, east_m: f64, north_m: f64) -> (f64, f64) {
    let dlat = north_m / 111_320.0;
    let dlon = east_m / (111_320.0 * lat.to_radians().cos().max(0.01));
    (lat + dlat, lon + dlon)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::career::aircraft::{Class, info};

    #[test]
    fn embedded_db_loads_with_known_airports() {
        let d = db();
        assert!(d.list.len() > 25_000, "{}", d.list.len());
        let ist = d.get("ltfm").expect("İstanbul Havalimanı");
        assert_eq!(ist.size, Size::Large);
        assert!(ist.runway_ft > 10_000);
        assert_eq!(ist.surface, Surface::Paved);
        assert!(d.get("KJFK").is_some() && d.get("EGLL").is_some());
    }

    #[test]
    fn distances_are_plausible() {
        // İstanbul (LTFM) → Antalya (LTAI) ≈ 300 nm.
        let d = db();
        let (a, b) = (d.get("LTFM").unwrap(), d.get("LTAI").unwrap());
        let nm = distance_nm(a.lat, a.lon, b.lat, b.lon);
        assert!((270.0..330.0).contains(&nm), "{nm}");
        let brg = bearing_deg(a.lat, a.lon, b.lat, b.lon);
        assert!((150.0..200.0).contains(&brg), "{brg}");
    }

    #[test]
    fn spatial_query_finds_neighbours() {
        let d = db();
        let a = d.get("LTBA").unwrap();
        let near = d.within(a.lat, a.lon, 40.0);
        assert_eq!(near[0].0.icao, "LTBA");
        assert!(near.iter().any(|(x, _)| x.icao == "LTFJ"));
        assert!(near.iter().all(|(_, nm)| *nm <= 40.0));
        // Tarih değiştirme çizgisi yakınında da çalışır (Fiji).
        let nadi = d.get("NFFN").unwrap();
        assert!(!d.within(nadi.lat, nadi.lon, 300.0).is_empty());
    }

    #[test]
    fn box_query_ranks_and_wraps() {
        let d = db();
        let all = [Size::Large, Size::Medium, Size::Small, Size::Seaplane];
        // İstanbul çevresi: önce büyükler, küçük alanlar da var.
        let ist = d.in_box(40.6, 28.0, 41.5, 29.8, &all, 500);
        let pos = |icao: &str| ist.iter().position(|a| a.icao == icao);
        assert!(pos("LTFM").unwrap() < pos("LTBW").unwrap());
        assert!(ist.iter().all(|a| (40.6..=41.5).contains(&a.lat) && (28.0..=29.8).contains(&a.lon)));
        assert!(d.in_box(40.6, 28.0, 41.5, 29.8, &[Size::Large], 500).iter().all(|a| a.size == Size::Large));
        assert_eq!(d.in_box(40.6, 28.0, 41.5, 29.8, &all, 3).len(), 3);
        // Açılmış boylamlarla tarih çizgisinin iki yanı: Fiji (177°D) ve Tonga (175°B = 185°).
        let pacific = d.in_box(-25.0, 175.0, -15.0, 186.0, &[Size::Large], 50);
        assert!(pacific.iter().any(|a| a.icao == "NFFN") && pacific.iter().any(|a| a.icao == "NFTF"));
        let west = d.in_box(-25.0, -185.0, -15.0, -174.0, &[Size::Large], 50);
        assert!(west.iter().any(|a| a.icao == "NFFN") && west.iter().any(|a| a.icao == "NFTF"));
    }

    #[test]
    fn search_handles_turkish_and_codes() {
        let d = db();
        let r = d.search("antalya", 5);
        assert!(r.iter().any(|a| a.icao == "LTAI"), "{:?}", r.iter().map(|a| &a.icao).collect::<Vec<_>>());
        assert_eq!(d.search("LTFJ", 3)[0].icao, "LTFJ");
        assert!(d.search("x", 3).is_empty());
    }

    #[test]
    fn runway_suitability() {
        let d = db();
        let big = d.get("LTFM").unwrap();
        assert!(big.suits(info(Class::Widebody)));
        assert!(big.suits(info(Class::LightPiston)));
        assert!(big.suits(info(Class::Helicopter)));
        let short = Airport { runway_ft: 1800, surface: Surface::Unpaved, ..big.clone() };
        assert!(short.suits(info(Class::LightPiston)));
        assert!(!short.suits(info(Class::PistonTwin)));
        assert!(!short.suits(info(Class::Narrowbody)));
    }
}
