//! SimConnect ağ protokolü (SimConnect.dll olmadan).
//!
//! SimConnect.dll, simle aslında yerel bir TCP soketi ya da adlandırılmış boru üzerinden ikili paketlerle konuşur.
//! Bu modül o paketleri doğrudan üretir ve çözer; böylece Modstead Microsoft'un dağıtım lisanslı DLL'sini taşımaz
//! ve ek bağımlılık gerekmez. Paket düzeni açık kaynak `node-simconnect` (EvenAR, LGPL) ile resmî SDK yapılarından
//! (`SIMCONNECT_RECV_*`) çıkarıldı; MSFS 2020 "KittyHawk" (5) ve MSFS 2024 "SunRise" (6) sürümleri desteklenir.
//!
//! İstemciden sunucuya paket: `[boyut][protokol][0xF0000000 | işlev][gönderim no][alanlar…]` (küçük endian).
//! Sunucudan istemciye paket: `[boyut][protokol][alım türü][alanlar…]`.
//! Metinler sabit uzunlukta, sıfırla doldurulmuş Latin-1 dizgilerdir.

use std::fmt;

/// MSFS 2020 (ve 2024'ün geriye uyumlu kipi).
pub const PROTO_KITTYHAWK: u32 = 5;
/// MSFS 2024.
pub const PROTO_SUNRISE: u32 = 6;

/// Kullanıcının uçağı.
pub const OBJECT_USER: u32 = 0;
pub const UNUSED: u32 = 0xFFFF_FFFF;
const MAX_PATH: usize = 260;

/// Veri tanımı alan türleri (`SIMCONNECT_DATATYPE`).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[repr(u32)]
pub enum DataType {
    Int32 = 1,
    Float64 = 4,
    String32 = 6,
    String64 = 7,
    String256 = 9,
    /// `SIMCONNECT_DATA_INITPOSITION`: enlem, boylam, irtifa (ft), yunuslama, yatış, yön (f64), yerde, hız (u32).
    InitPosition = 12,
}

impl DataType {
    pub fn size(self) -> usize {
        match self {
            DataType::Int32 => 4,
            DataType::Float64 => 8,
            DataType::String32 => 32,
            DataType::String64 => 64,
            DataType::String256 => 256,
            DataType::InitPosition => 56,
        }
    }
}

/// Veri gönderim sıklığı (`SIMCONNECT_PERIOD`).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[repr(u32)]
pub enum Period {
    Never = 0,
    Once = 1,
    VisualFrame = 2,
    SimFrame = 3,
    Second = 4,
}

/// Veri isteği bayrakları.
pub const DATA_FLAG_CHANGED: u32 = 1;

/// `SimConnect_EnumerateSimObjectsAndLiveries` / veri isteği nesne türü.
pub const SIMOBJECT_AIRCRAFT: u32 = 2;
pub const SIMOBJECT_HELICOPTER: u32 = 3;

/// `SimConnect_RequestAllFacilities` / tesis listesi türü.
pub const FACILITY_AIRPORT: u32 = 0;

/// Akış olayları (yalnızca MSFS 2024, `SIMCONNECT_FLOW_EVENT_ID`).
pub mod flow {
    pub const FLT_LOAD: u32 = 1;
    pub const FLT_LOADED: u32 = 2;
    pub const TELEPORT_START: u32 = 3;
    pub const TELEPORT_DONE: u32 = 4;
    pub const BACK_ON_TRACK_START: u32 = 5;
    pub const BACK_ON_TRACK_DONE: u32 = 6;
    pub const SKIP_START: u32 = 7;
    pub const SKIP_DONE: u32 = 8;
    pub const BACK_TO_MAIN_MENU: u32 = 9;
    pub const RTC_START: u32 = 10;
    pub const RTC_END: u32 = 11;
    pub const REPLAY_START: u32 = 12;
    pub const REPLAY_END: u32 = 13;
    pub const FLIGHT_START: u32 = 14;
    pub const FLIGHT_END: u32 = 15;
    pub const PLANE_CRASH: u32 = 16;

    pub fn name(id: u32) -> &'static str {
        match id {
            FLT_LOAD => "FLT_LOAD",
            FLT_LOADED => "FLT_LOADED",
            TELEPORT_START => "TELEPORT_START",
            TELEPORT_DONE => "TELEPORT_DONE",
            BACK_ON_TRACK_START => "BACK_ON_TRACK_START",
            BACK_ON_TRACK_DONE => "BACK_ON_TRACK_DONE",
            SKIP_START => "SKIP_START",
            SKIP_DONE => "SKIP_DONE",
            BACK_TO_MAIN_MENU => "BACK_TO_MAIN_MENU",
            RTC_START => "RTC_START",
            RTC_END => "RTC_END",
            REPLAY_START => "REPLAY_START",
            REPLAY_END => "REPLAY_END",
            FLIGHT_START => "FLIGHT_START",
            FLIGHT_END => "FLIGHT_END",
            PLANE_CRASH => "PLANE_CRASH",
            _ => "NONE",
        }
    }
}

// ---------- Paket üretimi ----------

/// Bir istemci paketi. `finish` boyutu ve gönderim numarasını yazar.
pub struct Packet {
    buf: Vec<u8>,
}

impl Packet {
    pub fn new(protocol: u32, function: u32) -> Self {
        let mut buf = Vec::with_capacity(128);
        buf.extend_from_slice(&0u32.to_le_bytes());
        buf.extend_from_slice(&protocol.to_le_bytes());
        buf.extend_from_slice(&(0xF000_0000 | function).to_le_bytes());
        buf.extend_from_slice(&0u32.to_le_bytes());
        Packet { buf }
    }

    pub fn u32(mut self, v: u32) -> Self {
        self.buf.extend_from_slice(&v.to_le_bytes());
        self
    }

    pub fn f32(mut self, v: f32) -> Self {
        self.buf.extend_from_slice(&v.to_le_bytes());
        self
    }

    pub fn byte(mut self, v: u8) -> Self {
        self.buf.push(v);
        self
    }

    pub fn bytes(mut self, v: &[u8]) -> Self {
        self.buf.extend_from_slice(v);
        self
    }

    /// Sabit uzunlukta dizgi: Latin-1'e çevrilir, sığmazsa kesilir (son bayt her zaman sıfır).
    pub fn str(mut self, s: &str, len: usize) -> Self {
        let mut out = latin1(s);
        out.truncate(len.saturating_sub(1));
        out.resize(len, 0);
        self.buf.extend_from_slice(&out);
        self
    }

    pub fn finish(mut self, send_id: u32) -> Vec<u8> {
        let size = self.buf.len() as u32;
        self.buf[0..4].copy_from_slice(&size.to_le_bytes());
        self.buf[12..16].copy_from_slice(&send_id.to_le_bytes());
        self.buf
    }
}

/// Latin-1 dışı karakterler (ör. Türkçe "ş") simin dosya yollarını bozar; '?' yazılır.
/// Yollarda bu olmasın diye Modstead uçuş dosyalarını ASCII bir klasöre yazar.
fn latin1(s: &str) -> Vec<u8> {
    s.chars().map(|c| if (c as u32) < 256 { c as u8 } else { b'?' }).collect()
}

/// İstemcinin gönderdiği işlevler. Numaralar SimConnect.dll'deki işlev sırasıdır.
#[derive(Debug, Clone, PartialEq)]
pub enum Request {
    Open { app: String },
    MapClientEventToSimEvent { event: u32, name: String },
    TransmitClientEvent { object: u32, event: u32, data: u32, group: u32, flags: u32 },
    AddToDataDefinition { define: u32, name: String, units: String, datatype: DataType, epsilon: f32 },
    ClearDataDefinition { define: u32 },
    RequestDataOnSimObject { request: u32, define: u32, object: u32, period: Period, flags: u32, interval: u32 },
    /// Etiketsiz tek nesne verisi (`data` tanımdaki sırayla paketlenmiş değerler).
    SetDataOnSimObject { define: u32, object: u32, data: Vec<u8> },
    SubscribeToSystemEvent { event: u32, name: String },
    RequestSystemState { request: u32, state: String },
    FlightLoad { path: String },
    FlightPlanLoad { path: String },
    AddToFacilityDefinition { define: u32, field: String },
    RequestFacilityData { define: u32, request: u32, icao: String, region: String },
    EnumerateSimObjectsAndLiveries { request: u32, kind: u32 },
    SubscribeToFlowEvent,
    RequestAllFacilities { request: u32, kind: u32 },
}

impl Request {
    pub fn encode(&self, protocol: u32, send_id: u32) -> Vec<u8> {
        let p = |f: u32| Packet::new(protocol, f);
        let packet = match self {
            Request::Open { app } => {
                let (alias, major, minor, build_major, build_minor) =
                    if protocol >= PROTO_SUNRISE { ("RS", 12, 2, 282174, 999) } else { ("HK", 11, 0, 62651, 3) };
                p(0x01)
                    .str(app, 256)
                    .u32(0)
                    .byte(0)
                    .str(alias, 3)
                    .u32(major)
                    .u32(minor)
                    .u32(build_major)
                    .u32(build_minor)
            }
            Request::MapClientEventToSimEvent { event, name } => p(0x04).u32(*event).str(name, 256),
            Request::TransmitClientEvent { object, event, data, group, flags } => {
                p(0x05).u32(*object).u32(*event).u32(*data).u32(*group).u32(*flags)
            }
            Request::AddToDataDefinition { define, name, units, datatype, epsilon } => {
                p(0x0c).u32(*define).str(name, 256).str(units, 256).u32(*datatype as u32).f32(*epsilon).u32(UNUSED)
            }
            Request::ClearDataDefinition { define } => p(0x0d).u32(*define),
            Request::RequestDataOnSimObject { request, define, object, period, flags, interval } => p(0x0e)
                .u32(*request)
                .u32(*define)
                .u32(*object)
                .u32(*period as u32)
                .u32(*flags)
                .u32(0)
                .u32(*interval)
                .u32(0),
            Request::SetDataOnSimObject { define, object, data } => {
                p(0x10).u32(*define).u32(*object).u32(0).u32(1).u32(data.len() as u32).bytes(data)
            }
            Request::SubscribeToSystemEvent { event, name } => p(0x17).u32(*event).str(name, 256),
            Request::RequestSystemState { request, state } => p(0x35).u32(*request).str(state, 256),
            Request::FlightLoad { path } => p(0x3d).str(path, MAX_PATH),
            Request::FlightPlanLoad { path } => p(0x3f).str(path, MAX_PATH),
            Request::AddToFacilityDefinition { define, field } => p(0x45).u32(*define).str(field, 256),
            Request::RequestFacilityData { define, request, icao, region } => {
                p(0x46).u32(*define).u32(*request).str(icao, 16).str(region, 4)
            }
            Request::EnumerateSimObjectsAndLiveries { request, kind } => p(0x5b).u32(*request).u32(*kind),
            Request::SubscribeToFlowEvent => p(0x5c),
            // C API'deki sıra: önce liste türü, sonra istek kimliği (ters giderse sim kimliği tür sanar: istisna 27).
            Request::RequestAllFacilities { request, kind } => p(0x5e).u32(*kind).u32(*request),
        };
        packet.finish(send_id)
    }

    /// Bu işlev yalnızca MSFS 2024 protokolünde var mı?
    pub fn needs_sunrise(&self) -> bool {
        matches!(self, Request::EnumerateSimObjectsAndLiveries { .. } | Request::SubscribeToFlowEvent | Request::RequestAllFacilities { .. })
    }
}

// ---------- Paket çözümü ----------

/// Sunucudan gelen bir paketi okumak için imleç. Taşma hata değil, sıfır döner (kısa paketler yutulur).
pub struct Reader<'a> {
    data: &'a [u8],
    pos: usize,
}

impl<'a> Reader<'a> {
    pub fn new(data: &'a [u8]) -> Self {
        Reader { data, pos: 0 }
    }

    pub fn remaining(&self) -> usize {
        self.data.len().saturating_sub(self.pos)
    }

    pub fn rest(&self) -> &'a [u8] {
        &self.data[self.pos.min(self.data.len())..]
    }

    fn take(&mut self, n: usize) -> &'a [u8] {
        let start = self.pos.min(self.data.len());
        let end = (self.pos + n).min(self.data.len());
        self.pos += n;
        &self.data[start..end]
    }

    pub fn u32(&mut self) -> u32 {
        let b = self.take(4);
        if b.len() < 4 { 0 } else { u32::from_le_bytes([b[0], b[1], b[2], b[3]]) }
    }

    pub fn i32(&mut self) -> i32 {
        self.u32() as i32
    }

    pub fn f32(&mut self) -> f32 {
        f32::from_bits(self.u32())
    }

    pub fn f64(&mut self) -> f64 {
        let b = self.take(8);
        if b.len() < 8 { 0.0 } else { f64::from_le_bytes([b[0], b[1], b[2], b[3], b[4], b[5], b[6], b[7]]) }
    }

    pub fn u8(&mut self) -> u8 {
        self.take(1).first().copied().unwrap_or(0)
    }

    /// Sabit uzunlukta, sıfırla biten Latin-1 dizgi.
    pub fn str(&mut self, len: usize) -> String {
        let b = self.take(len);
        let end = b.iter().position(|&c| c == 0).unwrap_or(b.len());
        b[..end].iter().map(|&c| c as char).collect::<String>().trim().to_string()
    }
}

/// Simin tesis listesindeki bir havalimanı (`SIMCONNECT_DATA_FACILITY_AIRPORT`).
#[derive(Debug, Clone, PartialEq)]
pub struct FacilityAirport {
    pub icao: String,
    pub region: String,
    pub lat: f64,
    pub lon: f64,
    pub alt_m: f64,
}

/// Sunucudan gelen iletiler (yalnızca Modstead'in kullandıkları ayrıntılı çözülür).
#[derive(Debug, Clone, PartialEq)]
pub enum Recv {
    Open { app: String, version: (u32, u32, u32, u32) },
    Exception { exception: u32, send_id: u32, index: u32 },
    Quit,
    Event { group: u32, event: u32, data: u32 },
    EventFilename { event: u32, file: String },
    SimObjectData { request: u32, object: u32, define: u32, data: Vec<u8> },
    SystemState { request: u32, int: u32, float: f32, text: String },
    AirportList { request: u32, entry: u32, out_of: u32, airports: Vec<FacilityAirport> },
    FacilityData { request: u32, kind: u32, is_list_item: bool, item_index: u32, list_size: u32, data: Vec<u8> },
    FacilityDataEnd { request: u32 },
    Liveries { request: u32, entry: u32, out_of: u32, items: Vec<(String, String)> },
    Flow { event: u32, flt: String },
    Other(u32),
}

/// Alım türleri (`SIMCONNECT_RECV_ID`).
mod recv_id {
    pub const EXCEPTION: u32 = 1;
    pub const OPEN: u32 = 2;
    pub const QUIT: u32 = 3;
    pub const EVENT: u32 = 4;
    pub const EVENT_FILENAME: u32 = 6;
    pub const SIMOBJECT_DATA: u32 = 8;
    pub const SYSTEM_STATE: u32 = 15;
    pub const AIRPORT_LIST: u32 = 18;
    pub const FACILITY_DATA: u32 = 28;
    pub const FACILITY_DATA_END: u32 = 29;
    pub const ENUMERATE_SIMOBJECT_AND_LIVERY_LIST: u32 = 38;
    pub const FLOW_EVENT: u32 = 39;
}

/// Bir paketin gövdesini (boyut alanından sonrası) çözer.
pub fn decode(body: &[u8]) -> Recv {
    let mut r = Reader::new(body);
    let protocol = r.u32();
    let id = r.u32();
    match id {
        recv_id::OPEN => {
            let app = r.str(256);
            let version = (r.u32(), r.u32(), r.u32(), r.u32());
            Recv::Open { app, version }
        }
        recv_id::EXCEPTION => Recv::Exception { exception: r.u32(), send_id: r.u32(), index: r.u32() },
        recv_id::QUIT => Recv::Quit,
        recv_id::EVENT => Recv::Event { group: r.u32(), event: r.u32(), data: r.u32() },
        recv_id::EVENT_FILENAME => {
            let _group = r.u32();
            let event = r.u32();
            let _data = r.u32();
            Recv::EventFilename { event, file: r.str(MAX_PATH) }
        }
        recv_id::SIMOBJECT_DATA => {
            let request = r.u32();
            let object = r.u32();
            let define = r.u32();
            let _flags = r.u32();
            let _entry = r.u32();
            let _out_of = r.u32();
            let _count = r.u32();
            Recv::SimObjectData { request, object, define, data: r.rest().to_vec() }
        }
        recv_id::SYSTEM_STATE => Recv::SystemState { request: r.u32(), int: r.u32(), float: r.f32(), text: r.str(MAX_PATH) },
        recv_id::AIRPORT_LIST => {
            let request = r.u32();
            let size = r.u32();
            let entry = r.u32();
            let out_of = r.u32();
            let ident_len = if protocol >= PROTO_SUNRISE { 9 } else { 6 };
            let mut airports = Vec::with_capacity(size as usize);
            for _ in 0..size {
                if r.remaining() < ident_len + 3 + 24 {
                    break;
                }
                airports.push(FacilityAirport { icao: r.str(ident_len), region: r.str(3), lat: r.f64(), lon: r.f64(), alt_m: r.f64() });
            }
            Recv::AirportList { request, entry, out_of, airports }
        }
        recv_id::FACILITY_DATA => {
            let request = r.u32();
            let _unique = r.u32();
            let _parent = r.u32();
            let kind = r.u32();
            let is_list_item = r.u32() == 1;
            let item_index = r.u32();
            let list_size = r.u32();
            Recv::FacilityData { request, kind, is_list_item, item_index, list_size, data: r.rest().to_vec() }
        }
        recv_id::FACILITY_DATA_END => Recv::FacilityDataEnd { request: r.u32() },
        recv_id::ENUMERATE_SIMOBJECT_AND_LIVERY_LIST => {
            let request = r.u32();
            let size = r.u32();
            let entry = r.u32();
            let out_of = r.u32();
            let mut items = Vec::with_capacity(size as usize);
            for _ in 0..size {
                if r.remaining() < 512 {
                    break;
                }
                items.push((r.str(256), r.str(256)));
            }
            Recv::Liveries { request, entry, out_of, items }
        }
        recv_id::FLOW_EVENT => Recv::Flow { event: r.u32(), flt: r.str(256) },
        other => Recv::Other(other),
    }
}

/// Bayt akışını paketlere böler (TCP parça parça getirir).
#[derive(Default)]
pub struct Framer {
    buf: Vec<u8>,
}

impl Framer {
    pub fn push(&mut self, bytes: &[u8]) {
        self.buf.extend_from_slice(bytes);
    }

    /// Tamamlanmış bir paketin gövdesi (boyut alanı hariç). Bozuk boyut akışı sıfırlar.
    pub fn next(&mut self) -> Option<Vec<u8>> {
        if self.buf.len() < 4 {
            return None;
        }
        let size = u32::from_le_bytes([self.buf[0], self.buf[1], self.buf[2], self.buf[3]]) as usize;
        if !(12..=16 * 1024 * 1024).contains(&size) {
            self.buf.clear();
            return None;
        }
        if self.buf.len() < size {
            return None;
        }
        let body = self.buf[4..size].to_vec();
        self.buf.drain(..size);
        Some(body)
    }
}

/// Hata adları günlükte okunabilsin (`SIMCONNECT_EXCEPTION`).
pub struct ExceptionName(pub u32);

impl fmt::Display for ExceptionName {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        const NAMES: [&str; 26] = [
            "NONE",
            "ERROR",
            "SIZE_MISMATCH",
            "UNRECOGNIZED_ID",
            "UNOPENED",
            "VERSION_MISMATCH",
            "TOO_MANY_GROUPS",
            "NAME_UNRECOGNIZED",
            "TOO_MANY_EVENT_NAMES",
            "EVENT_ID_DUPLICATE",
            "TOO_MANY_MAPS",
            "TOO_MANY_OBJECTS",
            "TOO_MANY_REQUESTS",
            "WEATHER_INVALID_PORT",
            "WEATHER_INVALID_METAR",
            "WEATHER_UNABLE_TO_GET_OBSERVATION",
            "WEATHER_UNABLE_TO_CREATE_STATION",
            "WEATHER_UNABLE_TO_REMOVE_STATION",
            "INVALID_DATA_TYPE",
            "INVALID_DATA_SIZE",
            "DATA_ERROR",
            "INVALID_ARRAY",
            "CREATE_OBJECT_FAILED",
            "LOAD_FLIGHTPLAN_FAILED",
            "OPERATION_INVALID_FOR_OBJECT_TYPE",
            "ILLEGAL_OPERATION",
        ];
        match NAMES.get(self.0 as usize) {
            Some(n) => write!(f, "{n}"),
            None => write!(f, "EXCEPTION_{}", self.0),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn le(b: &[u8], at: usize) -> u32 {
        u32::from_le_bytes([b[at], b[at + 1], b[at + 2], b[at + 3]])
    }

    #[test]
    fn open_packet_matches_reference_layout() {
        let b = Request::Open { app: "Modstead".into() }.encode(PROTO_SUNRISE, 0);
        // başlık 16 + ad 256 + u32 + bayt + takma ad 3 + 4×u32
        assert_eq!(b.len(), 16 + 256 + 4 + 1 + 3 + 16);
        assert_eq!(le(&b, 0) as usize, b.len());
        assert_eq!(le(&b, 4), PROTO_SUNRISE);
        assert_eq!(le(&b, 8), 0xF000_0001);
        assert_eq!(&b[16..24], b"Modstead");
        assert_eq!(b[24], 0);
        assert_eq!(&b[277..280], b"RS\0");
        assert_eq!(le(&b, 280), 12);
        assert_eq!(le(&b, 292), 999);
        let k = Request::Open { app: "Modstead".into() }.encode(PROTO_KITTYHAWK, 3);
        assert_eq!(&k[277..280], b"HK\0");
        assert_eq!(le(&k, 280), 11);
        assert_eq!(le(&k, 12), 3);
    }

    #[test]
    fn data_definition_and_request_layout() {
        let b = Request::AddToDataDefinition {
            define: 7,
            name: "PLANE LATITUDE".into(),
            units: "degrees".into(),
            datatype: DataType::Float64,
            epsilon: 0.0,
        }
        .encode(PROTO_KITTYHAWK, 1);
        assert_eq!(b.len(), 16 + 4 + 256 + 256 + 4 + 4 + 4);
        assert_eq!(le(&b, 8), 0xF000_000C);
        assert_eq!(le(&b, 16), 7);
        assert_eq!(&b[20..34], b"PLANE LATITUDE");
        assert_eq!(le(&b, 16 + 4 + 512), 4);
        assert_eq!(le(&b, b.len() - 4), UNUSED);

        let r = Request::RequestDataOnSimObject { request: 1, define: 7, object: OBJECT_USER, period: Period::SimFrame, flags: 0, interval: 5 }
            .encode(PROTO_SUNRISE, 2);
        assert_eq!(r.len(), 16 + 32);
        assert_eq!(le(&r, 28), 3);
        assert_eq!(le(&r, 40), 5);

        // Tesis listesi: tür kimlikten önce gelir (SimConnect_RequestAllFacilities(h, type, RequestID)).
        let f = Request::RequestAllFacilities { request: 5, kind: FACILITY_AIRPORT }.encode(PROTO_SUNRISE, 3);
        assert_eq!(f.len(), 16 + 8);
        assert_eq!(le(&f, 8), 0xF000_005E);
        assert_eq!(le(&f, 16), FACILITY_AIRPORT);
        assert_eq!(le(&f, 20), 5);
    }

    #[test]
    fn long_strings_are_truncated_and_terminated() {
        let long = "x".repeat(400);
        let b = Request::FlightLoad { path: long }.encode(PROTO_SUNRISE, 0);
        assert_eq!(b.len(), 16 + 260);
        assert_eq!(b[16 + 259], 0);
        let t = Request::FlightLoad { path: "C:\\Uçuş\\a.flt".into() }.encode(PROTO_SUNRISE, 0);
        // "ç" Latin-1'de var, "ş" yok.
        assert_eq!(&t[16..29], b"C:\\U\xe7u?\\a.flt");
    }

    fn recv(protocol: u32, id: u32, fields: &[u8]) -> Vec<u8> {
        let mut v = protocol.to_le_bytes().to_vec();
        v.extend_from_slice(&id.to_le_bytes());
        v.extend_from_slice(fields);
        v
    }

    #[test]
    fn decodes_open_event_and_data() {
        let mut f = vec![0u8; 256];
        f[..7].copy_from_slice(b"KittyHa");
        for v in [12u32, 2, 282174, 999, 12, 0, 0, 0, 0, 0] {
            f.extend_from_slice(&v.to_le_bytes());
        }
        match decode(&recv(6, 2, &f)) {
            Recv::Open { app, version } => {
                assert_eq!(app, "KittyHa");
                assert_eq!(version, (12, 2, 282174, 999));
            }
            other => panic!("{other:?}"),
        }

        let mut e = Vec::new();
        for v in [0u32, 42, 1] {
            e.extend_from_slice(&v.to_le_bytes());
        }
        assert_eq!(decode(&recv(6, 4, &e)), Recv::Event { group: 0, event: 42, data: 1 });

        let mut d = Vec::new();
        for v in [10u32, 0, 7, 0, 1, 1, 2] {
            d.extend_from_slice(&v.to_le_bytes());
        }
        d.extend_from_slice(&41.5f64.to_le_bytes());
        d.extend_from_slice(&29.0f64.to_le_bytes());
        match decode(&recv(6, 8, &d)) {
            Recv::SimObjectData { request, define, data, .. } => {
                assert_eq!((request, define), (10, 7));
                let mut r = Reader::new(&data);
                assert_eq!(r.f64(), 41.5);
                assert_eq!(r.f64(), 29.0);
            }
            other => panic!("{other:?}"),
        }
    }

    #[test]
    fn decodes_airport_list_by_protocol() {
        let mut f = Vec::new();
        for v in [5u32, 1, 0, 1] {
            f.extend_from_slice(&v.to_le_bytes());
        }
        let mut ident = b"LTFM".to_vec();
        ident.resize(9, 0);
        f.extend_from_slice(&ident);
        f.extend_from_slice(b"LT\0");
        for v in [41.275f64, 28.752, 99.0] {
            f.extend_from_slice(&v.to_le_bytes());
        }
        match decode(&recv(PROTO_SUNRISE, 18, &f)) {
            Recv::AirportList { request, airports, .. } => {
                assert_eq!(request, 5);
                assert_eq!(airports.len(), 1);
                assert_eq!(airports[0].icao, "LTFM");
                assert_eq!(airports[0].region, "LT");
                assert_eq!(airports[0].lon, 28.752);
            }
            other => panic!("{other:?}"),
        }
    }

    #[test]
    fn framer_handles_split_and_joined_packets() {
        let a = Request::SubscribeToFlowEvent.encode(PROTO_SUNRISE, 0);
        let b = Request::RequestAllFacilities { request: 1, kind: FACILITY_AIRPORT }.encode(PROTO_SUNRISE, 1);
        let mut all = a.clone();
        all.extend_from_slice(&b);
        let mut fr = Framer::default();
        fr.push(&all[..5]);
        assert!(fr.next().is_none());
        fr.push(&all[5..]);
        assert_eq!(fr.next().unwrap().len(), a.len() - 4);
        assert_eq!(fr.next().unwrap().len(), b.len() - 4);
        assert!(fr.next().is_none());
        // Bozuk boyut akışı sıfırlar, sonsuza dek beklemez.
        fr.push(&[1, 0, 0, 0, 9, 9]);
        assert!(fr.next().is_none());
        assert!(fr.buf.is_empty());
    }

    #[test]
    fn reader_is_forgiving_on_short_input() {
        let mut r = Reader::new(&[1, 0]);
        assert_eq!(r.u32(), 0);
        assert_eq!(r.f64(), 0.0);
        assert_eq!(r.str(10), "");
    }
}
