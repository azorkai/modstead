// Modstead Kariyer paneli (MSFS araç çubuğu). Yalnızca gösterir: bütün hesap Modstead'dedir.
// Veri iki yoldan gelir:
// 1. Modstead, SimConnect üzerinden saniyede bir L:MODSTEAD_HUD_* değişkenlerini yazar (games/msfs/src/career/hud.rs).
//    SEQ her yazımda artar; birkaç saniye artmazsa Modstead kapalıdır ve panel "bağlı değil" der. Durum, rota, puan ve
//    evre buradan gelir; panelin temeli budur.
// 2. Modstead'in yerel sunucusu (yalnızca 127.0.0.1, hud_server.rs) ayrıntıları verir: canlı uçuş (1 sn), kariyer
//    durumu (5 sn), uçulan iz (10 sn), varış havası (5 dk), haritadaki havalimanları ve harita karoları (kabartma ya
//    da uydu). Sunucuya ulaşılamazsa panel bunlarsız çalışır (harita koyu zeminde yalnızca uçağı ve panel açıkken
//    uçulan izi gösterir).
// Harita her karede simin değişkenlerini doğrudan okur (konum, pruva); saniyelik veriyi beklemez. Karolar ve rota alttaki
// tuvalde yalnızca görünüm değişince çizilir; her karede yalnızca uçak ve çevresi (bkz. "Harita" bölümü).
// Simin JS motoru eskidir: ES2015 ile sınırlı kalınır (async, ?. ve ?? yok, nesne yayma yok, ok işlevi yok). Tek bir
// sözdizimi hatası bütün paneli boş bırakır (ilk gerçek denemede dizgedeki bir satır sonu yüzünden böyle oldu); hud.rs
// testi dizgeleri denetler ve şablon dizgesini (ters tırnak) reddeder.
// Türkçe metinler büyük harfle yazılır: simin motoru text-transform ile "i"yi "I" yapar, "İ" yapmaz.
// Simin yazı tipinde sağ ok yok: "–", "·", "−", "…" kullanılır. Simde fare tıklaması yalnızca data-input-group taşıyan
// öğelere ulaşır (bütün düğmelerde var).

var MS_PREFIX = "L:MODSTEAD_HUD_";
var MS_STALE_MS = 4000;
var MS_CONNECT_MS = 2500;
var MS_LANG_KEY = "MODSTEAD_HUD_LANG";
var MS_TAB_KEY = "MODSTEAD_HUD_TABS";
var MS_LAYER_KEY = "MODSTEAD_HUD_MAPLAYER";
// Harita karoları (hud_server.rs → /api/tiles/<katman>/<z>/<x>/<y>; tiles.rs): önbellekteki en az resim sayısı ve
// aynı anda en çok istek (sunucu uyduyu da en çok 4'er indirir; canlı veri istekleri sıra beklemesin).
var MS_TILE_CACHE = 64;
var MS_TILE_LOADS = 4;
// Yerel sunucunun portları (hud_server.rs → PORTS; yükleyici de aynı sırayla dener).
var MS_PORTS = [47213, 47214, 47215];
var MS_APP = "modstead-career-hud";
// Tasarımın çizildiği içerik boyutu (px) ve yazı boyutu: boş durumlar ve sekmeli dar yerleşim bununla ölçeklenir
// (bütün ölçüler em cinsinden; JS kökün yazı boyutunu panelin boyutuna göre ayarlar).
var MS_DESIGN = { w: 330, h: 310, font: 15, min: 10, max: 30 };
// Boş durumlar geniş ve alçak panelde bu ölçüyle (em) büyür (tek sütun, metin yana yayılır).
var MS_DESIGN_WIDE = { w: 40, h: 11.7 };
// Aktif işin yerleşimleri (ölçüler em). Panelin boyutuna göre en zengini seçilir; yazı MS_READ_PX'ten küçülmez.
//   compact: sekmeler (özet · harita · ayrıntı)           side: harita solda, sağda sekmeler (özet · ayrıntı)
//   tall: dar ve uzun panel, hepsi alt alta             stack: harita üstte, altında özet ve ayrıntı yan yana
//   full: harita solda, sağda özet ve ayrıntı yan yana    big: harita solda, sağda özet ve altında ayrıntı
// Aynı derecedekilerden yazısı büyük olan seçilir.
var MS_LAYOUTS = [
	{ id: "compact", w: 22, h: 20.7, rank: 1, tabs: ["sum", "map", "info"] },
	{ id: "side", w: 40, h: 18, rank: 2, tabs: ["sum", "info"] },
	{ id: "tall", w: 22, h: 50, rank: 3, tabs: [] },
	{ id: "stack", w: 36, h: 37, rank: 3, tabs: [] },
	{ id: "full", w: 58, h: 24, rank: 4, tabs: [] },
	{ id: "big", w: 45, h: 38, rank: 4, tabs: [] },
];
var MS_READ_PX = 13.5;
// Kontrol kapısı sırası: hud.rs → CHECK_IDS ile aynı. Her kontrol taban-4 bir basamak: 0 yok, 1 tamam, 2 eksik, 3 öneri.
var MS_CHECK_IDS = ["connected", "in_flight", "at_departure", "aircraft", "slew", "fuel", "payload"];
// tracker.rs → Phase sırası (0–9) → evre çizelgesindeki adım (-1: henüz başlamadı, 8: hepsi bitti).
var MS_PHASE_STEP = [-1, 0, 1, 2, 3, 4, 5, 6, 7, 8];
// hud.rs → KINDS sırası (L:…_KIND); sunucudan gelen iş türü adla gelir.
var MS_KINDS = ["training", "cargo", "passenger", "charter", "ferry", "bush", "medical", "airline", "checkride"];
// Elle yakınlaştırma basamakları: görünümün kısa kenarının yarısı (nm).
var MS_ZOOMS = [1, 2, 3, 5, 8, 12, 20, 30, 50, 80, 120, 200, 300, 500, 800];
var MS_LB_PER_KG = 2.20462;

var MS_TEXT = {
	tr: {
		sub: "Kariyer",
		connecting: "Modstead'e bağlanıyor",
		connectingBody: "Modstead açıksa birkaç saniye içinde bağlanır.",
		offline: "Modstead bağlı değil",
		offlineBody: "Kariyer uçuşları Modstead açıkken takip edilir. Modstead'i aç; panel kendiliğinden bağlanır.",
		noCareer: "Kariyer başlatılmadı",
		noCareerBody: "Pilotunu oluştur; ilk işler burada görünür.",
		noCareerPath: ["Modstead", "MSFS", "Kariyer"],
		idle: "Aktif iş yok",
		idleBody: "Bir iş seç; rota, evre ve puan burada izlenir.",
		idlePath: ["Kariyer", "İş ilanları"],
		states: ["", "", "Hazırlanıyor", "Kalkışa hazır", "Uçuşta", "Kesildi"],
		phases: ["Uçuş öncesi", "Taksi", "Kalkış", "Tırmanış", "Seyir", "Alçalma", "Yaklaşma", "İniş koşusu", "Taksi", "Park"],
		steps: ["Taksi", "Kalkış", "Tırmanış", "Seyir", "Alçalma", "Yaklaşma", "İniş", "Park"],
		kinds: ["EĞİTİM", "KARGO", "YOLCU", "CHARTER", "TESLİMAT", "ARAZİ", "AMBULANS", "HAVAYOLU", "SINAV"],
		kindsMore: { tour: "TUR", skydive: "PARAŞÜT", survey: "HAVA FOTOĞRAFI", sar: "ARAMA-KURTARMA" },
		tabs: { sum: "ÖZET", map: "HARİTA", info: "AYRINTI" },
		remaining: "KALAN",
		eta: "VARIŞ",
		distance: "MESAFE",
		total: "TOPLAM",
		block: "SÜRE",
		score: "PUAN",
		land: "SON İNİŞ",
		pay: "ÜCRET",
		due: "TESLİM",
		late: "gecikti",
		next: "Sonra: ",
		done: "Uçuş tamam",
		gate: "KONTROL KAPISI",
		checks: {
			connected: "Sim bağlı",
			in_flight: "Simde uçuş açık",
			at_departure: "Kalkış havalimanında",
			aircraft: "Uçak uygun",
			slew: "Slew kapalı",
			fuel: "Yakıt yeterli",
			payload: "Yük yüklendi",
		},
		penalties: function (n) { return n + " kesinti"; },
		readyNote: "Motor çalışırken park frenini bırakıp hareket edince takip başlar.",
		interrupted: "Aynı yerden sürdürünce takip devam eder.",
		gs: "YER HIZI",
		alt: "İRTİFA",
		vs: "DİKEY",
		hdg: "PRUVA",
		wind: "RÜZGÂR",
		calm: "Sakin",
		headw: "KARŞI",
		tailw: "ARKA",
		cross: "YAN",
		fromLeft: "SOL",
		fromRight: "SAĞ",
		fuel: "YAKIT",
		atDest: "VARIŞTA",
		plan: "PLAN",
		destWx: "VARIŞ HAVASI",
		noWx: "Hava bilgisi yok",
		rwy: "PİST",
		rwyLen: "UZUNLUK",
		rwyNeed: "GEREKEN",
		pens: "SON KESİNTİLER",
		noPens: "Kesinti yok",
		window: "PENCEREDE AÇ",
		tablet: "TABLETTE AÇ",
		windowOk: "Uçuş ekranı masaüstünde açıldı.",
		windowFail: "Uçuş ekranı açılamadı.",
		tabletHow: "Tablet aynı Wi-Fi ağında olsun: kodu okut ya da adresi tarayıcıya yaz.",
		tabletOff: "Tablet erişimi kapalı. Modstead'de aç:",
		tabletPath: ["Kariyer", "Uçuş ekranı", "Tablet erişimi"],
		close: "KAPAT",
		loading: "Yükleniyor…",
		noServer: "Modstead'in yerel sunucusuna ulaşılamadı.",
		mapWait: "Konum bekleniyor",
		auto: "OTO",
		layers: { relief: "HARİTA", sat: "UYDU" },
		events: {
			overspeed: "Aşırı hız",
			stall: "Stall uyarısı",
			flap_overspeed: "Flap hız sınırı",
			bank: "Aşırı yatış",
			bank_low: "Yere yakın aşırı yatış",
			pitch: "Aşırı yunuslama",
			g_limit: "G sınırı",
			speed_10k: "10.000 ft altında hız sınırı",
			taxi_speed: "Hızlı taksi",
			bounce: "Sekme",
			low_fuel: "Az yakıtla iniş",
			unstable_approach: "Kararsız yaklaşmayla iniş",
			approach_unstable: "Kararsız yaklaşma kapısı",
			tail_strike: "Kuyruk sürtmesi",
			long_landing: "Uzun iniş",
			short_landing: "Eşikten önce teker koyma",
			off_centerline: "Eksenden sapma",
			overweight_takeoff: "Azami kalkış ağırlığı aşıldı",
			overweight_landing: "Azami iniş ağırlığı aşıldı",
			vfr_imc: "Yetkisiz bulut/düşük görüş",
			oxygen: "Oksijensiz yüksek irtifa",
			landing: "İniş sertliği",
			landing_g: "İniş G kuvveti",
			landing_bank: "İnişte yatış",
			teleport: "Işınlanma / faz atlama",
			slew: "Havada slew",
			refuel_airborne: "Havada yakıt ekleme",
			crash: "Kaza",
			airborne_start: "Uçuş havada başladı",
			go_around: "Pas geçme",
		},
		min: "dk",
		h: "sa",
		d: "g",
		nm: "nm",
		dec: ",",
		thousands: ".",
	},
	en: {
		sub: "Career",
		connecting: "Connecting to Modstead",
		connectingBody: "If Modstead is open, it connects in a few seconds.",
		offline: "Modstead not connected",
		offlineBody: "Career flights are tracked while Modstead is open. Open Modstead; the panel connects by itself.",
		noCareer: "No career yet",
		noCareerBody: "Create your pilot; your first jobs show up here.",
		noCareerPath: ["Modstead", "MSFS", "Career"],
		idle: "No active job",
		idleBody: "Pick a job; route, phase and score are followed here.",
		idlePath: ["Career", "Job board"],
		states: ["", "", "Preparing", "Ready for departure", "In flight", "Interrupted"],
		phases: ["Preflight", "Taxi", "Takeoff", "Climb", "Cruise", "Descent", "Approach", "Rollout", "Taxi", "Parked"],
		steps: ["Taxi", "Takeoff", "Climb", "Cruise", "Descent", "Approach", "Landing", "Park"],
		kinds: ["TRAINING", "CARGO", "PASSENGER", "CHARTER", "FERRY", "BUSH", "MEDICAL", "AIRLINE", "CHECKRIDE"],
		kindsMore: { tour: "TOUR", skydive: "SKYDIVE", survey: "SURVEY", sar: "SEARCH & RESCUE" },
		tabs: { sum: "SUMMARY", map: "MAP", info: "DETAILS" },
		remaining: "REMAINING",
		eta: "ETA",
		distance: "DISTANCE",
		total: "TOTAL",
		block: "BLOCK TIME",
		score: "SCORE",
		land: "LAST LANDING",
		pay: "PAY",
		due: "DUE IN",
		late: "late",
		next: "Next: ",
		done: "Flight complete",
		gate: "PRE-FLIGHT GATE",
		checks: {
			connected: "Sim connected",
			in_flight: "Flight open in the sim",
			at_departure: "At departure airport",
			aircraft: "Aircraft suitable",
			slew: "Slew off",
			fuel: "Enough fuel",
			payload: "Payload loaded",
		},
		penalties: function (n) { return n + (n === 1 ? " deduction" : " deductions"); },
		readyNote: "Tracking starts when you release the parking brake with the engine running and move.",
		interrupted: "Resume from the same spot to keep tracking.",
		gs: "GND SPD",
		alt: "ALTITUDE",
		vs: "VERT SPD",
		hdg: "HEADING",
		wind: "WIND",
		calm: "Calm",
		headw: "HEAD",
		tailw: "TAIL",
		cross: "CROSS",
		fromLeft: "L",
		fromRight: "R",
		fuel: "FUEL",
		atDest: "AT DEST",
		plan: "PLAN",
		destWx: "DEST WEATHER",
		noWx: "No weather report",
		rwy: "RWY",
		rwyLen: "LENGTH",
		rwyNeed: "NEEDED",
		pens: "LAST DEDUCTIONS",
		noPens: "No deductions",
		window: "OPEN IN WINDOW",
		tablet: "OPEN ON TABLET",
		windowOk: "Flight deck opened on the desktop.",
		windowFail: "Could not open the flight deck.",
		tabletHow: "Keep the tablet on the same Wi-Fi: scan the code or type the address into its browser.",
		tabletOff: "Tablet access is off. Turn it on in Modstead:",
		tabletPath: ["Career", "Flight deck", "Tablet access"],
		close: "CLOSE",
		loading: "Loading…",
		noServer: "Could not reach Modstead's local server.",
		mapWait: "Waiting for position",
		auto: "AUTO",
		layers: { relief: "MAP", sat: "SAT" },
		events: {
			overspeed: "Overspeed",
			stall: "Stall warning",
			flap_overspeed: "Flap speed exceeded",
			bank: "Excessive bank",
			bank_low: "Steep bank near the ground",
			pitch: "Excessive pitch",
			g_limit: "G limit",
			speed_10k: "Speed limit below 10,000 ft",
			taxi_speed: "Fast taxi",
			bounce: "Bounce",
			low_fuel: "Low fuel at landing",
			unstable_approach: "Landing from an unstable approach",
			approach_unstable: "Unstable approach gate",
			tail_strike: "Tail strike",
			long_landing: "Long landing",
			short_landing: "Touchdown before the threshold",
			off_centerline: "Off the centreline",
			overweight_takeoff: "Maximum takeoff weight exceeded",
			overweight_landing: "Maximum landing weight exceeded",
			vfr_imc: "Cloud or low visibility without IR",
			oxygen: "High altitude without oxygen",
			landing: "Landing firmness",
			landing_g: "Landing G force",
			landing_bank: "Bank at touchdown",
			teleport: "Teleport / phase skip",
			slew: "Slew in the air",
			refuel_airborne: "Refuel in the air",
			crash: "Crash",
			airborne_start: "Flight started in the air",
			go_around: "Go-around",
		},
		min: "min",
		h: "h",
		d: "d",
		nm: "nm",
		dec: ".",
		thousands: ",",
	},
};

/** ICAO kodu taban-37 sayı olarak gelir: 1–10 rakam, 11–36 harf, küçük basamak önce. */
function msDecodeIcao(v) {
	var n = Math.round(v);
	var out = "";
	while (n > 0) {
		var d = n % 37;
		out += d <= 10 ? String.fromCharCode(47 + d) : String.fromCharCode(54 + d);
		n = Math.floor(n / 37);
	}
	return out;
}

/** Süre parçaları: [[sayı, birim], ...] (gün ve saat ya da saat ve dakika). */
function msDurationParts(min, t) {
	var m = Math.max(0, Math.round(min));
	if (m < 60) return [[m, t.min]];
	if (m < 1440) return [[Math.floor(m / 60), t.h], [m % 60, t.min]];
	return [[Math.floor(m / 1440), t.d], [Math.floor((m % 1440) / 60), t.h]];
}

function msGroup(v, sep) {
	var s = String(Math.round(Math.abs(v)));
	var out = "";
	for (var i = 0; i < s.length; i++) {
		if (i > 0 && (s.length - i) % 3 === 0) out += sep;
		out += s.charAt(i);
	}
	return (v < 0 && Math.round(Math.abs(v)) > 0 ? "−" : "") + out;
}

/** tracker.rs → grade ile aynı eşikler. */
function msGrade(score) {
	if (score >= 95) return "A+";
	if (score >= 88) return "A";
	if (score >= 78) return "B";
	if (score >= 65) return "C";
	if (score >= 50) return "D";
	return "F";
}

function msEscape(s) {
	return String(s).split("&").join("&amp;").split("<").join("&lt;").split(">").join("&gt;");
}

/** Sayı + birim dizisi: büyük rakam, küçük birim. */
function msNumHtml(parts) {
	var html = "";
	for (var i = 0; i < parts.length; i++) {
		html += "<span class=\"ms-num\">" + msEscape(parts[i][0]) + "</span>";
		if (parts[i][1]) html += "<span class=\"ms-unit\">" + msEscape(parts[i][1]) + "</span>";
		else if (i < parts.length - 1) html += " ";
	}
	return html;
}

/** Küçük, sönük etiket (alt satırlarda). */
function msK(s) {
	return "<span class=\"ms-k\">" + msEscape(s) + "</span>";
}

function msNum(x) {
	return typeof x === "number" && isFinite(x);
}

/** Pruva/yön: 001–360. */
function msDeg3(d) {
	var n = Math.round(((d % 360) + 360) % 360);
	if (n === 0) n = 360;
	return ("00" + n).slice(-3) + "°";
}

/** -180..180 */
function msWrap180(d) {
	var x = ((d + 180) % 360 + 360) % 360 - 180;
	return x;
}

function msRad(d) {
	return d * Math.PI / 180;
}

/** İki nokta arası büyük daire mesafesi (nm). */
function msDistNm(lat1, lon1, lat2, lon2) {
	var p1 = msRad(lat1);
	var p2 = msRad(lat2);
	var dp = p2 - p1;
	var dl = msRad(lon2 - lon1);
	var a = Math.sin(dp / 2) * Math.sin(dp / 2) + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) * Math.sin(dl / 2);
	return 2 * 3440.065 * Math.atan2(Math.sqrt(a), Math.sqrt(Math.max(0, 1 - a)));
}

/** Büyük daire üzerinde f (0–1) oranındaki nokta: [enlem, boylam]. */
function msGcPoint(lat1, lon1, lat2, lon2, f) {
	var p1 = msRad(lat1);
	var l1 = msRad(lon1);
	var p2 = msRad(lat2);
	var l2 = msRad(lon2);
	var d = 2 * Math.asin(Math.sqrt(Math.pow(Math.sin((p2 - p1) / 2), 2) + Math.cos(p1) * Math.cos(p2) * Math.pow(Math.sin((l2 - l1) / 2), 2)));
	if (d < 1e-9) return [lat1, lon1];
	var A = Math.sin((1 - f) * d) / Math.sin(d);
	var B = Math.sin(f * d) / Math.sin(d);
	var x = A * Math.cos(p1) * Math.cos(l1) + B * Math.cos(p2) * Math.cos(l2);
	var y = A * Math.cos(p1) * Math.sin(l1) + B * Math.cos(p2) * Math.sin(l2);
	var z = A * Math.sin(p1) + B * Math.sin(p2);
	return [Math.atan2(z, Math.sqrt(x * x + y * y)) * 180 / Math.PI, Math.atan2(y, x) * 180 / Math.PI];
}

/** Rüzgârın bir yöne göre bileşenleri: head > 0 karşıdan, cross > 0 sağdan (kt). */
function msWindComps(windDir, windKt, course) {
	var a = msRad(windDir - course);
	return { head: windKt * Math.cos(a), cross: windKt * Math.sin(a) };
}

/** "05/23", "17L/35R" → [50, 230, …] (pist uçlarının yönleri). */
function msRunwayHeadings(rw) {
	var out = [];
	var parts = String(rw || "").split("/");
	for (var i = 0; i < parts.length; i++) {
		var n = parseInt(parts[i], 10);
		if (n >= 1 && n <= 36) out.push({ end: parts[i], hdg: n * 10 });
	}
	return out;
}

/** Halkalar ve ızgara için "yuvarlak" değer. */
function msNice(x, steps) {
	var best = steps[0];
	for (var i = 0; i < steps.length; i++) if (steps[i] <= x) best = steps[i];
	return best;
}

// --- Harita izdüşümü (Web Mercator, karolarla aynı) --------------------------------------------------------------
// Dünya 0–1 karesi: x batıdan doğuya, y kuzeyden güneye. İzdüşüm V: S (dünya genişliğinin piksel karşılığı), merkez
// (mx, my), ekrandaki merkez (cx, cy) ve boyut (w, h).

function msMercX(lon) {
	return (lon + 180) / 360;
}

/** Kutuplara yakın kırpılır (karolar ±85,05°'ye kadar). */
function msMercY(lat) {
	var s = Math.sin(msRad(Math.max(-85.05, Math.min(85.05, lat))));
	return 0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI);
}

function msMercLat(y) {
	var k = Math.PI * (1 - 2 * y);
	return Math.atan((Math.exp(k) - Math.exp(-k)) / 2) * 180 / Math.PI;
}

/** Dünya genişliği 1 iken boylam farkı: -0,5..0,5. */
function msWrapHalf(d) {
	return d - Math.round(d);
}

/** Görünümden ({ lat, lon, r }) izdüşüm. r: sığdırma alanının (sol üstten uw × uh) kısa kenarının yarısı (nm, merkezin
 *  enleminde); alanın dışında kalan sağ sütun ve alt şerit düğmelere ayrılır. */
function msProj(v, uw, uh, w, h) {
	var kpx = Math.min(uw, uh) / 2 / v.r;
	return { S: kpx * 21600 * Math.max(0.02, Math.cos(msRad(v.lat))), mx: msMercX(v.lon), my: msMercY(v.lat), cx: uw / 2, cy: uh / 2, w: w, h: h };
}

/** Ekrandaki yer [x, y] (CSS pikseli). */
function msPt(V, lat, lon) {
	return [V.cx + msWrapHalf(msMercX(lon) - V.mx) * V.S, V.cy + (msMercY(lat) - V.my) * V.S];
}

/** Verilen enlemde 1 nm kaç piksel (Mercator ölçeği enlemle büyür). */
function msPxNm(V, lat) {
	return V.S / (21600 * Math.max(0.02, Math.cos(msRad(lat))));
}

/** msfs_career_tiles_info → { relief, sat }: { id, lo, hi, attr } (bilinmeyen katmanlar atlanır); katman yoksa null. */
function msTilesInfo(data) {
	var ls = data && data.layers && typeof data.layers.length === "number" ? data.layers : [];
	var out = {};
	var any = false;
	for (var i = 0; i < ls.length; i++) {
		var l = ls[i];
		if (!l || (l.id !== "relief" && l.id !== "sat")) continue;
		var lo = msNum(l.minZoom) ? Math.max(0, Math.round(l.minZoom)) : 0;
		var hi = msNum(l.maxZoom) ? Math.min(20, Math.round(l.maxZoom)) : l.id === "sat" ? 13 : 5;
		if (hi < lo) continue;
		out[l.id] = { id: l.id, lo: lo, hi: hi, attr: typeof l.attribution === "string" ? l.attribution : "" };
		any = true;
	}
	return any ? out : null;
}

// --- Harita çizimi -----------------------------------------------------------------------------------------------
// Havacılık haritası gibi: rota eflatun, kuleli (büyük, orta) meydanlar mavi, küçükler gri; çizgiler ve yazılar koyu
// kenarlı, hem açık renkli kabartmada hem uyduda okunur.
var MS_COURSE = "#ff4fd8";
var MS_TRACK = "#ff8a3d";
var MS_ACCENT = "#ff8a3d";
var MS_TWR = "#6fb6ff";
var MS_CASE = "rgba(8, 9, 12, 0.72)";
var MS_CASE_SOFT = "rgba(8, 9, 12, 0.5)";

function msFont(ctx, em, scale, bold) {
	ctx.font = (bold ? "bold " : "") + Math.max(9, Math.round(em * scale)) + "px Roboto-Regular, Roboto, sans-serif";
}

/** Koyu haleli yazı. */
function msLabel(ctx, text, x, y, color, align) {
	ctx.textAlign = align || "left";
	ctx.textBaseline = "middle";
	ctx.lineJoin = "round";
	ctx.lineWidth = 3.2;
	ctx.strokeStyle = "rgba(8, 9, 12, 0.88)";
	if (ctx.strokeText) ctx.strokeText(text, x, y);
	ctx.fillStyle = color;
	ctx.fillText(text, x, y);
}

function msDash(ctx, em, on) {
	if (ctx.setLineDash) ctx.setLineDash(on ? [Math.max(3, em * 0.35), Math.max(3, em * 0.3)] : []);
}

/** Köşeleri yuvarlak dikdörtgen yolu. */
function msRoundRect(ctx, x, y, w, h, r) {
	var k = Math.min(r, w / 2, h / 2);
	ctx.beginPath();
	ctx.moveTo(x + k, y);
	ctx.lineTo(x + w - k, y);
	ctx.quadraticCurveTo(x + w, y, x + w, y + k);
	ctx.lineTo(x + w, y + h - k);
	ctx.quadraticCurveTo(x + w, y + h, x + w - k, y + h);
	ctx.lineTo(x + k, y + h);
	ctx.quadraticCurveTo(x, y + h, x, y + h - k);
	ctx.lineTo(x, y + k);
	ctx.quadraticCurveTo(x, y, x + k, y);
	ctx.closePath();
}

/** Havalimanı simgesi. cls: 2 büyük, 1 orta (kuleli: mavi halka; pist yönü verildiyse çubuk, büyükte halkadan taşar),
 *  0 küçük (gri halka). Halkanın yarıçapı döner. */
function msAptMark(ctx, x, y, em, cls, hdg) {
	var r = em * (cls === 2 ? 0.3 : cls === 1 ? 0.24 : 0.16);
	var col = cls > 0 ? MS_TWR : "#b4bac5";
	var lw = Math.max(1.5, em * (cls > 0 ? 0.1 : 0.085));
	ctx.beginPath();
	ctx.arc(x, y, r, 0, Math.PI * 2);
	ctx.fillStyle = "rgba(10, 12, 16, 0.78)";
	ctx.fill();
	ctx.lineWidth = lw + 2;
	ctx.strokeStyle = MS_CASE;
	ctx.stroke();
	if (hdg !== null) {
		var a = msRad(hdg);
		var l = cls === 2 ? em * 0.55 : r * 0.95;
		var sx = Math.sin(a) * l;
		var sy = Math.cos(a) * l;
		ctx.beginPath();
		ctx.moveTo(x - sx, y + sy);
		ctx.lineTo(x + sx, y - sy);
		ctx.lineCap = "butt";
		var bw = Math.max(2, em * 0.13);
		if (cls === 2) {
			ctx.lineWidth = bw + 2;
			ctx.strokeStyle = MS_CASE;
			ctx.stroke();
		}
		ctx.lineWidth = bw;
		ctx.strokeStyle = col;
		ctx.stroke();
	}
	ctx.beginPath();
	ctx.arc(x, y, r, 0, Math.PI * 2);
	ctx.lineWidth = lw;
	ctx.strokeStyle = col;
	ctx.stroke();
	return r;
}

class ModsteadCareerPanel extends TemplateElement {
	constructor() {
		super(...arguments);
		this.msSeq = 0;
		this.msFirstAt = 0;
		this.msSeenAt = 0;
		this.msLang = null;
		this.msTimer = null;
		this.msEl = {};
		this.msHtml = {};
		this.msUi = null;
		this.msBrand = null;
		this.msFont = 0;
		this.msSizeCls = "";
		this.msStepCount = 0;
		this.msCheckKey = "";
		this.msLay = MS_LAYOUTS[0];
		this.msLayId = "";
		this.msTabs = { compact: "sum", side: "sum" };
		this.msNarrow = false;
		this.msJob = false;
		this.msState = -1;
		this.msA = null;
		this.msTel = null;
		this.msJobKey = "";
		// Yerel sunucu: adres, istekler, son yanıtlar.
		this.msNet = { base: null, probing: false, probeAt: 0, fails: 0, noCall: false, busy: {}, req: {}, at: {}, failAt: {}, xhrs: [],
			live: null, state: null, wx: null, wxFor: "", deck: null, deckErr: null };
		// Harita: görünüm, yakınlaştırma, iz, havalimanları.
		this.msView = null;
		this.msZoom = null;
		this.msMapAt = 0;
		this.msMapEmpty = false;
		this.msRaf = 0;
		this.msRafCb = null;
		this.msTrack = [];
		this.msTail = [];
		this.msTailAt = 0;
		this.msApt = { box: null, det: -1, list: [], busy: false, at: 0, failAt: 0 };
		this.msAptCache = {};
		this.msAptKeys = [];
		this.msFuel = [];
		// Alttaki tuval: son çizildiği izdüşüm (V), anahtar ve yeniden çizim isteği; sağ alt köşenin ölçüsü.
		this.msBase = { V: null, key: "", dirty: true };
		this.msFoot = { w: 0, h: 0, lift: 0 };
		this.msMapErr = "";
		// Karolar: seçilen katman, sunucunun katman bilgisi, resim önbelleği (anahtar "katman/z/x/y").
		this.msLayer = "relief";
		this.msTiles = { for: null, info: null, none: false, busy: false, at: 0, failAt: 0, cache: {}, count: 0, loading: 0,
			gen: 0, frame: 0, need: 0, max: MS_TILE_CACHE, cors: true, okEver: false, errs: {}, down: {}, retryAt: 0 };
		// Pencere ve tablet.
		this.msDeckOpen = false;
		this.msDeckStamp = 0;
		this.msQrFail = false;
		this.msWinBusy = false;
		this.msToast = { text: "", err: false, until: 0 };
		this.msClick = null;
	}

	connectedCallback() {
		super.connectedCallback();
		var self = this;
		// Öğe <head>'deki betikle tanımlandığı için çocuklar henüz ayrıştırılmamış olabilir: bağlama ilk güncellemede.
		this.msTimer = setInterval(function () { self.msUpdate(); }, 500);
		if (!this.msClick) {
			this.msClick = function (e) { self.msOnClick(e); };
			this.addEventListener("click", this.msClick);
		}
		if (typeof window.MS_HUD_BASE === "string" && window.MS_HUD_BASE) this.msNet.base = window.MS_HUD_BASE;
		this.msRafCb = function () { self.msMapFrame(); };
		if (typeof requestAnimationFrame === "function") this.msRaf = requestAnimationFrame(this.msRafCb);
		this.msUpdate();
	}

	disconnectedCallback() {
		if (this.msTimer) clearInterval(this.msTimer);
		this.msTimer = null;
		if (this.msRaf && typeof cancelAnimationFrame === "function") cancelAnimationFrame(this.msRaf);
		this.msRaf = 0;
		this.msRafCb = null;
		var x = this.msNet.xhrs;
		for (var i = 0; i < x.length; i++) {
			try { x[i].abort(); } catch (e) {}
		}
		this.msNet.xhrs = [];
		super.disconnectedCallback();
	}

	msBind() {
		if (this.msEl.root) return true;
		var root = this.querySelector("#ms-root");
		if (!root) return false;
		this.msUi = this.querySelector("ingame-ui");
		// MSFS 2024 SU2 sonrası panel bazen gizli sınıfla açılıyor.
		if (this.msUi && this.msUi.classList) this.msUi.classList.remove("hide");
		var ids = ["root", "empty", "empty-title", "empty-body", "empty-path", "empty-alt", "job", "kind", "state", "from", "to",
			"track-fill", "track-dot", "l-a", "a", "l-b", "b", "row-flight", "l-score", "score", "l-land", "land", "row-pay", "l-pay", "pay",
			"l-due", "due", "phases", "steps", "step-now", "step-next", "gate", "gate-title", "gate-count", "checks", "note",
			"head", "main", "slot-side", "slot-main", "slot-instr", "tabs", "mapbox", "map", "map-base", "map-note", "zauto",
			"map-foot", "lyr", "lyr-relief", "lyr-sat", "map-attr", "strip", "sl-a", "sv-a", "sl-b", "sv-b", "sl-gs", "sv-gs",
			"sl-alt", "sv-alt", "cols", "sum", "info", "instr", "l-gs", "gs", "l-alt", "alt", "l-vs", "vs", "l-hdg", "hdg",
			"l-wind", "wind", "wind-sub", "l-fuel", "fuel", "fuel-sub", "row-wx", "l-wx", "wx", "wx-rwy", "wx-len",
			"l-ipay", "ipay", "l-idue", "idue", "pens-box", "l-pens", "pens", "btn-window", "btn-tablet", "act-window", "act-tablet", "toast",
			"deck", "deck-title", "deck-close", "deck-qr", "deck-img", "deck-url", "deck-msg", "deck-path"];
		for (var i = 0; i < ids.length; i++) this.msEl[ids[i]] = this.querySelector("#ms-" + ids[i]);
		var stored = typeof GetStoredData === "function" ? GetStoredData(MS_LANG_KEY) : null;
		if (stored === "tr" || stored === "en") this.msLang = stored;
		var tabs = typeof GetStoredData === "function" ? GetStoredData(MS_TAB_KEY) : null;
		if (tabs) {
			var pairs = String(tabs).split(",");
			for (var j = 0; j < pairs.length; j++) {
				var kv = pairs[j].split(":");
				if (kv.length === 2 && (kv[0] === "compact" || kv[0] === "side")) this.msTabs[kv[0]] = kv[1];
			}
		}
		var layer = typeof GetStoredData === "function" ? GetStoredData(MS_LAYER_KEY) : null;
		if (layer === "relief" || layer === "sat") this.msLayer = layer;
		var self = this;
		var img = this.msEl["deck-img"];
		if (img) {
			img.onerror = function () { self.msQrFail = true; };
			img.onload = function () { self.msQrFail = false; };
		}
		return true;
	}

	/** Simin başlık çubuğuna kendi başlığımız: durum noktası + MODSTEAD + Kariyer. Başlık şablonu geç kurulabilir. */
	msBrandHeader(t, mode) {
		if (!this.msBrand) {
			var wrap = this.querySelector("ingame-ui-header .wrap");
			if (!wrap) return;
			var b = document.createElement("span");
			b.className = "ms-brand";
			b.innerHTML = "<span class=\"ms-brand-dot\"></span><span class=\"ms-brand-name\">MODSTEAD</span><span class=\"ms-brand-sub\"></span>";
			wrap.insertBefore(b, wrap.firstChild);
			this.msBrand = { root: b, sub: b.querySelector(".ms-brand-sub") };
			if (this.msUi) this.msUi.classList.add("ms-branded");
		}
		var cls = "ms-brand ms-brand-" + (mode === "offline" ? "off" : mode === "connecting" ? "wait" : "on");
		if (this.msBrand.root.className !== cls) this.msBrand.root.className = cls;
		if (this.msBrand.sub.textContent !== t.sub) this.msBrand.sub.textContent = t.sub;
	}

	/** Yerleşimi ve yazı boyutunu panelin iç boyutuna göre seçer; bütün yerleşim em ile ölçeklenir. */
	msFit(job) {
		var root = this.msEl.root;
		var w = root.clientWidth;
		var h = root.clientHeight;
		if (!w || !h) return;
		var lay = MS_LAYOUTS[0];
		var f = Math.min(w / lay.w, h / lay.h);
		if (!job) f = Math.max(f, Math.min(w / MS_DESIGN_WIDE.w, h / MS_DESIGN_WIDE.h));
		if (job) {
			for (var i = 1; i < MS_LAYOUTS.length; i++) {
				var L = MS_LAYOUTS[i];
				var fl = Math.min(w / L.w, h / L.h);
				// Yeni yerleşime geçerken biraz pay: sınırda gidip gelmesin.
				var need = L.id === this.msLayId ? MS_READ_PX - 0.4 : MS_READ_PX;
				if (fl < need) continue;
				if (L.rank > lay.rank || (L.rank === lay.rank && fl > f)) {
					lay = L;
					f = fl;
				}
			}
		}
		f = Math.max(MS_DESIGN.min, Math.min(MS_DESIGN.max, f));
		if (Math.abs(f - this.msFont) > 0.05) {
			this.msFont = f;
			root.style.fontSize = f.toFixed(2) + "px";
		}
		this.msLay = lay;
		if (lay.id !== this.msLayId) {
			this.msLayId = lay.id;
			this.msArrange(lay.id);
		}
		var tab = "";
		if (lay.tabs.length) {
			tab = this.msTabs[lay.id];
			if (lay.tabs.indexOf(tab) < 0) tab = lay.tabs[0];
		}
		this.msTab = tab;
		// Dar sütunda kontrol listesi tek sütuna iner (bir önceki ölçümle).
		var sum = this.msEl.sum;
		var sw = sum && sum.clientWidth ? sum.clientWidth : w;
		this.msNarrow = sw / f < 18.5;
		this.msSizeCls = " ms-lay-" + lay.id + (tab ? " ms-tab-" + tab : "") + (this.msNarrow ? " is-narrow" : "");
	}

	/** Öğeyi yerine taşır (zaten oradaysa dokunmaz). */
	msPlace(id, parent, before) {
		var el = this.msEl[id];
		if (!el || !parent || el === before) return;
		if (el.parentNode === parent && el.nextSibling === before) return;
		parent.insertBefore(el, before);
	}

	/** Yerleşime göre taşınan öğeler: harita (yan yana yerleşimlerde solda, diğerlerinde başlığın altında), sekmeler
	 *  (side'da başlık satırında) ve göstergeler (stack'te haritanın altında boydan boya, full ve big'de haritanın altında). */
	msArrange(id) {
		var e = this.msEl;
		var side = id === "side" || id === "full" || id === "big";
		this.msPlace("mapbox", side ? e["slot-side"] : e["slot-main"], null);
		if (id === "side") this.msPlace("tabs", e.head, e.state);
		else this.msPlace("tabs", e.main, e["slot-main"]);
		if (id === "stack") this.msPlace("instr", e["slot-instr"], null);
		else if (id === "full" || id === "big") this.msPlace("instr", e["slot-side"], null);
		else if (e.info) this.msPlace("instr", e.info, e.info.firstChild === e.instr ? e.instr.nextSibling : e.info.firstChild);
	}

	msV(name) {
		var x = SimVar.GetSimVarValue(MS_PREFIX + name, "number");
		return typeof x === "number" && isFinite(x) ? x : 0;
	}

	/** Simin kendi değişkeni (uçağın konumu, hızı…); yoksa null. */
	msSim(name, unit) {
		try {
			var x = SimVar.GetSimVarValue(name, unit);
			return typeof x === "number" && isFinite(x) ? x : null;
		} catch (e) {
			return null;
		}
	}

	msSet(id, text) {
		var e = this.msEl[id];
		if (e && e.textContent !== text) e.textContent = text;
	}

	msSetHtml(id, html) {
		var e = this.msEl[id];
		if (e && this.msHtml[id] !== html) {
			this.msHtml[id] = html;
			e.innerHTML = html;
		}
	}

	msSetClass(id, cls) {
		var e = this.msEl[id];
		if (e && e.className !== cls) e.className = cls;
	}

	msShow(id, on) {
		var e = this.msEl[id];
		var d = on ? "" : "none";
		if (e && e.style.display !== d) e.style.display = d;
	}

	msUpdate() {
		if (!this.msBind()) return;
		var now = Date.now();
		var seq = this.msV("SEQ");
		// İlk okuma yalnızca başlangıç: L: değişkeni Modstead kapandıktan sonra da son değerinde kalır.
		if (this.msFirstAt === 0) {
			this.msFirstAt = now;
			this.msSeq = seq;
		} else if (seq > 0 && seq !== this.msSeq) {
			this.msSeq = seq;
			this.msSeenAt = now;
		}
		var live = this.msSeenAt > 0 && now - this.msSeenAt < MS_STALE_MS;
		if (live) {
			var lang = this.msV("LANG") === 1 ? "en" : "tr";
			if (lang !== this.msLang) {
				this.msLang = lang;
				if (typeof SetStoredData === "function") SetStoredData(MS_LANG_KEY, lang);
			}
		}
		var t = MS_TEXT[this.msLang || "tr"];
		var state = live ? Math.round(this.msV("STATE")) : -1;
		var mode;
		if (!live) mode = this.msSeenAt === 0 && now - this.msFirstAt < MS_CONNECT_MS ? "connecting" : "offline";
		else mode = ["nocareer", "idle", "prep", "ready", "flying", "interrupted"][state] || "idle";
		var job = state >= 2;
		this.msJob = job;
		this.msState = state;
		if (!job) this.msDeckOpen = false;

		this.msFit(job);
		this.msBrandHeader(t, mode);
		var cls = "ms-root ms-" + mode + this.msSizeCls + (this.msDeckOpen ? " ms-deck-open" : "");
		if (this.msEl.root.className !== cls) this.msEl.root.className = cls;

		if (job) {
			this.msTel = this.msTele(now);
			this.msTrackJob(now);
			this.msA = this.msActive();
		}
		this.msPoll(state, now);

		if (!job) {
			this.msShow("job", false);
			this.msShow("empty", true);
			this.msRenderEmpty(mode, t);
		} else {
			this.msShow("empty", false);
			this.msShow("job", true);
			this.msRenderJob(state, t);
			this.msAutoHide(this.msEl.sum);
			this.msAutoHide(this.msEl.info);
		}
	}

	msRenderEmpty(mode, t) {
		var title = "";
		var body = "";
		var path = null;
		var alt = "";
		if (mode === "connecting") {
			title = t.connecting;
			body = t.connectingBody;
		} else if (mode === "offline") {
			title = t.offline;
			body = t.offlineBody;
			// Dil hiç öğrenilmediyse (ilk açılış, Modstead kapalı) ikinci dilde de yaz.
			if (!this.msLang) alt = MS_TEXT.en.offline + ". " + MS_TEXT.en.offlineBody;
		} else if (mode === "nocareer") {
			title = t.noCareer;
			body = t.noCareerBody;
			path = t.noCareerPath;
		} else {
			title = t.idle;
			body = t.idleBody;
			path = t.idlePath;
		}
		this.msSet("empty-title", title);
		this.msSet("empty-body", body);
		this.msSet("empty-alt", alt);
		this.msShow("empty-alt", alt !== "");
		var html = this.msPathHtml(path);
		this.msSetHtml("empty-path", html);
		this.msShow("empty-path", html !== "");
	}

	/** Modstead'de izlenecek yol: kutucuklar ve aralarında açılı ok. */
	msPathHtml(path) {
		var html = "";
		if (path) {
			for (var i = 0; i < path.length; i++) {
				if (i > 0) html += "<span class=\"ms-path-sep\"></span>";
				html += "<span class=\"ms-path-item\">" + msEscape(path[i]) + "</span>";
			}
		}
		return html;
	}

	msRenderJob(state, t) {
		var flying = state === 4;
		var interrupted = state === 5;
		var prep = state === 2 || state === 3;
		var a = this.msA;

		var kind = a && a.job ? a.job.kind : "";
		var ki = MS_KINDS.indexOf(kind);
		var kname = ki >= 0 ? t.kinds[ki] : t.kindsMore[kind];
		this.msSet("kind", kname || t.kinds[Math.round(this.msV("KIND"))] || t.kinds[1]);
		var phase = Math.round(this.msV("PHASE"));
		// Uçuştaki evre aşağıdaki çizelgede yazar; burada yalnızca durum.
		this.msSet("state", t.states[state] || "");
		this.msSetClass("state", "ms-state ms-state-" + (flying ? "fly" : interrupted ? "warn" : state === 3 ? "ok" : "wait"));

		this.msSet("from", msDecodeIcao(this.msV("FROM")));
		this.msSet("to", msDecodeIcao(this.msV("TO")));

		var dist = this.msV("DIST_NM");
		var total = this.msV("TOTAL_NM");
		var done = prep || total <= 0 ? 0 : Math.min(1, Math.max(0, (total - dist) / total));
		var pct = (done * 100).toFixed(1) + "%";
		var fill = this.msEl["track-fill"];
		if (fill.style.width !== pct) fill.style.width = pct;
		var dot = this.msEl["track-dot"];
		if (dot.style.left !== pct) dot.style.left = pct;

		var eta = this.msV("ETA_MIN");
		var aHtml;
		var bHtml;
		if (prep) {
			this.msSet("l-a", t.distance);
			aHtml = msNumHtml([[msGroup(total, t.thousands), t.nm]]);
			this.msSet("l-b", t.block);
			bHtml = eta >= 0 ? msNumHtml(msDurationParts(eta, t)) : msNumHtml([["—", ""]]);
		} else {
			this.msSet("l-a", t.remaining);
			var d = dist < 10 ? (Math.round(dist * 10) / 10).toFixed(1).replace(".", t.dec) : msGroup(dist, t.thousands);
			aHtml = msNumHtml([[d, t.nm]]);
			if (interrupted) {
				// Kesik uçuşta varış süresi anlamsız: toplam mesafe.
				this.msSet("l-b", t.total);
				bHtml = msNumHtml([[msGroup(total, t.thousands), t.nm]]);
			} else {
				this.msSet("l-b", t.eta);
				bHtml = eta >= 0 ? msNumHtml(msDurationParts(eta, t)) : msNumHtml([["—", ""]]);
			}
		}
		this.msSetHtml("a", aHtml);
		this.msSetHtml("b", bHtml);

		this.msShow("row-flight", !prep);
		if (!prep) {
			this.msSet("l-score", t.score);
			var score = this.msV("SCORE");
			var events = Math.round(this.msV("EVENTS"));
			if (score >= 0) {
				var s = Math.round(score);
				var html = msNumHtml([[s, ""]]) + "<span class=\"ms-grade\">" + msGrade(s) + "</span>";
				if (events > 0) html += "<span class=\"ms-pen\">" + msEscape(t.penalties(events)) + "</span>";
				this.msSetHtml("score", html);
			} else {
				this.msSetHtml("score", msNumHtml([["—", ""]]));
			}
			this.msSetClass("score", "ms-value" + (score >= 0 && score < 65 ? " ms-warn" : ""));
			this.msSet("l-land", t.land);
			var fpm = this.msV("LAND_FPM");
			if (fpm > 0) {
				var g = this.msV("LAND_G").toFixed(2).replace(".", t.dec);
				this.msSetHtml("land", msNumHtml([[msGroup(fpm, t.thousands), "fpm"]]) + "<span class=\"ms-sep\"></span>" + msNumHtml([[g, "G"]]));
			} else {
				this.msSetHtml("land", msNumHtml([["—", ""]]));
			}
		}

		this.msSet("l-pay", t.pay);
		this.msSet("l-ipay", t.pay);
		var payHtml = msNumHtml([["$" + msGroup(this.msV("PAY"), t.thousands), ""]]);
		this.msSetHtml("pay", payHtml);
		this.msSetHtml("ipay", payHtml);
		this.msSet("l-due", t.due);
		this.msSet("l-idue", t.due);
		var due = this.msV("DUE_MIN");
		var dueHtml = due >= 0 ? msNumHtml(msDurationParts(due, t))
			: msNumHtml(msDurationParts(-due, t)) + "<span class=\"ms-late\">" + msEscape(t.late) + "</span>";
		this.msSetHtml("due", dueHtml);
		this.msSetHtml("idue", dueHtml);
		this.msSetClass("due", "ms-value" + (due < 0 ? " ms-warn" : ""));
		this.msSetClass("idue", "ms-value" + (due < 0 ? " ms-warn" : ""));

		this.msShow("phases", flying);
		if (flying) this.msRenderPhases(phase, t);
		this.msShow("gate", prep);
		if (prep) this.msRenderGate(t, state === 3);

		var note = "";
		if (interrupted) note = t.interrupted;
		else if (state === 3) note = t.readyNote;
		this.msSet("note", note);
		this.msShow("note", note !== "");
		this.msSetClass("note", "ms-note" + (interrupted ? " ms-note-warn" : ""));

		this.msRenderTabs(t);
		this.msRenderStrip(t, aHtml, bHtml);
		this.msRenderInfo(state, t, a);
		this.msRenderMapUi(t);
		this.msRenderDeck(t);
	}

	/** Evre çizelgesi: biten adımlar dolu, şimdiki vurgulu, kalanlar sönük. */
	msRenderPhases(phase, t) {
		var steps = t.steps;
		if (this.msStepCount !== steps.length) {
			var html = "";
			for (var i = 0; i < steps.length; i++) html += "<span class=\"ms-step\"></span>";
			this.msEl.steps.innerHTML = html;
			this.msStepCount = steps.length;
		}
		var cur = phase >= 0 && phase < MS_PHASE_STEP.length ? MS_PHASE_STEP[phase] : -1;
		var items = this.msEl.steps.children;
		for (var j = 0; j < items.length; j++) {
			var c = "ms-step" + (j < cur ? " is-done" : j === cur ? " is-now" : "");
			if (items[j].className !== c) items[j].className = c;
		}
		if (cur >= steps.length) {
			this.msSet("step-now", t.done);
			this.msSet("step-next", "");
		} else {
			this.msSet("step-now", phase >= 0 ? t.phases[phase] || "" : "");
			this.msSet("step-next", cur + 1 < steps.length ? t.next + steps[cur + 1] : "");
		}
	}

	/** Kontrol kapısı: Modstead'deki kontrollerin adları ve durumları. Hazırken yalnızca kalan öneriler listelenir. */
	msRenderGate(t, ready) {
		var code = Math.round(this.msV("CHECK_LIST"));
		var ok = Math.round(this.msV("CHECKS_OK"));
		var total = Math.round(this.msV("CHECKS_TOTAL"));
		this.msSet("gate-title", t.gate);
		this.msSet("gate-count", total > 0 ? ok + "/" + total : "");
		this.msSetClass("gate-count", "ms-gate-count" + (total > 0 && ok >= total ? " is-ok" : ""));
		var key = code + ":" + (this.msLang || "tr") + (ready ? ":r" : "");
		if (key === this.msCheckKey) return;
		this.msCheckKey = key;
		var html = "";
		var n = code;
		for (var i = 0; i < MS_CHECK_IDS.length; i++) {
			var s = n % 4;
			n = Math.floor(n / 4);
			if (s === 0 || (ready && s === 1)) continue;
			var c = s === 1 ? "is-ok" : s === 2 ? "is-fail" : "is-warn";
			html += "<div class=\"ms-check " + c + "\"><span class=\"ms-check-mark\"></span><span class=\"ms-check-label\">"
				+ msEscape(t.checks[MS_CHECK_IDS[i]]) + "</span></div>";
		}
		this.msEl.checks.innerHTML = html;
	}

	msRenderTabs(t) {
		var box = this.msEl.tabs;
		if (!box) return;
		var items = box.children;
		for (var i = 0; i < items.length; i++) {
			var id = items[i].getAttribute("data-ms-tab");
			var on = this.msLay.tabs.indexOf(id) >= 0;
			var d = on ? "" : "none";
			if (items[i].style.display !== d) items[i].style.display = d;
			var c = "ms-tab" + (id === this.msTab ? " is-on" : "");
			if (items[i].className !== c) items[i].className = c;
			var label = items[i].firstChild;
			if (label && label.textContent !== t.tabs[id]) label.textContent = t.tabs[id];
		}
	}

	/** Dar yerleşimde harita sekmesinin altındaki şerit: kalan, varış, yer hızı, irtifa. */
	msRenderStrip(t, aHtml, bHtml) {
		if (!(this.msLay.id === "compact" && this.msTab === "map")) return;
		var tel = this.msTel;
		this.msSet("sl-a", this.msEl["l-a"].textContent);
		this.msSetHtml("sv-a", aHtml);
		this.msSet("sl-b", this.msEl["l-b"].textContent);
		this.msSetHtml("sv-b", bHtml);
		this.msSet("sl-gs", t.gs);
		this.msSetHtml("sv-gs", tel && msNum(tel.gs) ? msNumHtml([[Math.round(tel.gs), "kt"]]) : msNumHtml([["—", ""]]));
		this.msSet("sl-alt", t.alt);
		this.msSetHtml("sv-alt", tel && msNum(tel.alt) ? msNumHtml([[msGroup(Math.round(tel.alt / 10) * 10, t.thousands), "ft"]]) : msNumHtml([["—", ""]]));
	}

	/** Ayrıntılar: göstergeler, rüzgâr, yakıt, varış havası, son kesintiler, düğmeler. */
	msRenderInfo(state, t, a) {
		var tel = this.msTel;
		var dash = msNumHtml([["—", ""]]);
		// Göstergeler.
		this.msSet("l-gs", t.gs);
		this.msSet("l-alt", t.alt);
		this.msSet("l-vs", t.vs);
		this.msSet("l-hdg", t.hdg);
		this.msSetHtml("gs", tel && msNum(tel.gs) ? msNumHtml([[Math.round(tel.gs), "kt"]]) : dash);
		this.msSetHtml("alt", tel && msNum(tel.alt) ? msNumHtml([[msGroup(Math.round(tel.alt / 10) * 10, t.thousands), "ft"]]) : dash);
		if (tel && msNum(tel.vs)) {
			var vs = Math.round(tel.vs / 10) * 10;
			this.msSetHtml("vs", msNumHtml([[(vs > 0 ? "+" : "") + msGroup(vs, t.thousands), "fpm"]]));
		} else {
			this.msSetHtml("vs", dash);
		}
		var hdg = tel ? (msNum(tel.hdgM) ? tel.hdgM : tel.hdgT) : null;
		this.msSetHtml("hdg", msNum(hdg) ? msNumHtml([[msDeg3(hdg), ""]]) : dash);

		// Rüzgâr (uçağın yerinde) ve izlenen yöne göre bileşenleri.
		this.msSet("l-wind", t.wind);
		if (tel && msNum(tel.windKt) && msNum(tel.windDir)) {
			if (tel.windKt < 1) {
				this.msSetHtml("wind", msNumHtml([[t.calm, ""]]));
				this.msSetHtml("wind-sub", "");
			} else {
				this.msSetHtml("wind", msNumHtml([[msDeg3(tel.windDir), ""], [Math.round(tel.windKt), "kt"]]));
				var course = msNum(tel.trk) && msNum(tel.gs) && tel.gs > 30 ? tel.trk : tel.hdgT;
				this.msSetHtml("wind-sub", msNum(course) ? this.msCompsHtml(msWindComps(tel.windDir, tel.windKt, course), t) : "");
			}
		} else {
			this.msSetHtml("wind", dash);
			this.msSetHtml("wind-sub", "");
		}

		// Yakıt: uçakta olan; uçuşta varışta kalacak tahmini, hazırlıkta planlanan blok yakıtı.
		this.msSet("l-fuel", t.fuel);
		var fob = tel && msNum(tel.fuel) ? tel.fuel : null;
		var fuelF = a && a.dispatch && a.dispatch.fuel ? a.dispatch.fuel : null;
		this.msSetHtml("fuel", fob !== null ? msNumHtml([[msGroup(fob, t.thousands), "lb"]]) : dash);
		var sub = "";
		var subCls = "ms-sub";
		if (state === 2 || state === 3) {
			var planLb = fuelF && fuelF.blockKg > 0 ? fuelF.blockKg * MS_LB_PER_KG : a && a.job && a.job.plan ? a.job.plan.fuelKg * MS_LB_PER_KG : 0;
			if (planLb > 0) {
				sub = msK(t.plan) + " " + msEscape(msGroup(planLb, t.thousands));
				var minLb = fuelF && fuelF.minimumKg > 0 ? fuelF.minimumKg * MS_LB_PER_KG : planLb;
				if (fob !== null && fob < minLb) subCls += " ms-warn";
			}
		} else if (fob !== null) {
			var rate = this.msBurnLbH(a);
			var eta = this.msV("ETA_MIN");
			if (rate !== null && eta >= 0) {
				var left = fob - rate * eta / 60;
				sub = msK(t.atDest) + " ≈" + msEscape(msGroup(Math.max(left, -99999), t.thousands));
				var reserve = fuelF && fuelF.finalReserveKg > 0 ? fuelF.finalReserveKg * MS_LB_PER_KG : 0;
				if (left < 0) subCls += " ms-bad";
				else if (left < reserve) subCls += " ms-warn";
			}
		}
		this.msSetHtml("fuel-sub", sub);
		this.msSetClass("fuel-sub", subCls);

		this.msRenderWx(t, a, tel);
		this.msRenderPens(t);

		this.msSet("btn-window", this.msWinBusy ? "…" : t.window);
		this.msSet("btn-tablet", t.tablet);
		this.msSetClass("act-tablet", "ms-btn ms-btn-2" + (this.msDeckOpen ? " is-on" : ""));
		var now = Date.now();
		var toast = now < this.msToast.until ? this.msToast.text : "";
		this.msSet("toast", toast);
		this.msShow("toast", toast !== "");
		this.msSetClass("toast", "ms-toast" + (this.msToast.err ? " is-err" : ""));
	}

	/** "KARŞI 8 · YAN 5 SAĞDAN" */
	msCompsHtml(c, t) {
		var head = Math.round(c.head);
		var cross = Math.round(Math.abs(c.cross));
		var html = msK(head >= 0 ? t.headw : t.tailw) + " " + Math.abs(head) + "<span class=\"ms-dotsep\">·</span>" + msK(t.cross) + " " + cross;
		if (cross >= 1) html += " " + msK(c.cross > 0 ? t.fromRight : t.fromLeft);
		return html;
	}

	/** Varış havası: METAR kategorisi, rüzgâr, uygun pist ucuna göre bileşenler, pist uzunluğu. */
	msRenderWx(t, a, tel) {
		var to = a && a.job ? a.job.to : msDecodeIcao(this.msV("TO"));
		this.msSet("l-wx", t.destWx + (to ? " · " + to : ""));
		var m = null;
		var list = this.msNet.wx;
		if (list && typeof list.length === "number") {
			for (var i = 0; i < list.length; i++) if (list[i] && list[i].icao === to) m = list[i];
		}
		var len = "";
		var arr = a && a.dispatch ? a.dispatch.arrival : null;
		if (arr && arr.availableFt > 0) {
			len = msK(t.rwyLen) + " " + msEscape(msGroup(arr.availableFt, t.thousands)) + " ft";
			if (arr.requiredFt > 0) len += "<span class=\"ms-dotsep\">·</span>" + msK(t.rwyNeed) + " " + msEscape(msGroup(arr.requiredFt, t.thousands)) + " ft";
		}
		this.msSetHtml("wx-len", len);
		this.msShow("wx-len", len !== "");
		if (!m) {
			this.msSetHtml("wx", msNumHtml([["—", ""]]));
			this.msSetHtml("wx-rwy", msEscape(t.noWx));
			return;
		}
		var cat = String(m.category || "VFR");
		var html = "<span class=\"ms-cat ms-cat-" + msEscape(cat.toLowerCase()) + "\">" + msEscape(cat) + "</span>";
		var kt = msNum(m.windKt) ? m.windKt : 0;
		if (kt < 1) {
			html += msNumHtml([[t.calm, ""]]);
		} else {
			html += msNumHtml([[msNum(m.windDir) ? msDeg3(m.windDir) : "VRB", ""], [Math.round(kt), "kt"]]);
			if (msNum(m.gustKt) && m.gustKt > kt) html += msNumHtml([["G" + Math.round(m.gustKt), ""]]);
		}
		this.msSetHtml("wx", html);
		// Pist ucu: dispatch bir uç verdiyse o, yoksa en uzun pistin en çok karşıdan rüzgâr alan ucu. Pist numaraları
		// manyetik, METAR rüzgârı gerçek yön: sapma uçağın gerçek ve manyetik pruvasının farkından (yakın varışta yeterli).
		var rwy = "";
		if (kt >= 1 && msNum(m.windDir)) {
			var ends = msRunwayHeadings(a && a.to ? a.to.runway : "");
			if (arr && arr.runway) {
				var only = msRunwayHeadings(arr.runway);
				if (only.length) ends = [only[0]];
			}
			var magvar = tel && msNum(tel.hdgT) && msNum(tel.hdgM) ? msWrap180(tel.hdgT - tel.hdgM) : 0;
			var best = null;
			for (var j = 0; j < ends.length; j++) {
				var c = msWindComps(m.windDir - magvar, kt, ends[j].hdg);
				if (!best || c.head > best.c.head) best = { end: ends[j].end, c: c };
			}
			if (best) rwy = msK(t.rwy) + " " + msEscape(best.end) + "<span class=\"ms-dotsep\">·</span>" + this.msCompsHtml(best.c, t);
		}
		this.msSetHtml("wx-rwy", rwy);
	}

	/** Son üç puan kesintisi (yeni olan üstte). */
	msRenderPens(t) {
		var L = this.msNet.live;
		var fl = L && L.flight ? L.flight : null;
		this.msShow("pens-box", !!fl);
		if (!fl) return;
		this.msSet("l-pens", t.pens);
		var ev = fl.events && typeof fl.events.length === "number" ? fl.events : [];
		var pen = [];
		for (var i = 0; i < ev.length; i++) if (ev[i] && ev[i].penalty > 0) pen.push(ev[i]);
		pen.sort(function (x, y) { return (y.t || 0) - (x.t || 0); });
		var html = "";
		for (var j = 0; j < pen.length && j < 3; j++) {
			var name = t.events[pen[j].code] || String(pen[j].code || "");
			html += "<div class=\"ms-pen-row\"><span class=\"ms-pen-pts\">−" + Math.round(pen[j].penalty) + "</span><span class=\"ms-pen-name\">"
				+ msEscape(name) + "</span></div>";
		}
		if (!html) html = "<div class=\"ms-pen-none\">" + msEscape(t.noPens) + "</div>";
		this.msSetHtml("pens", html);
	}

	msRenderMapUi(t) {
		this.msSet("zauto", t.auto);
		this.msSetClass("zauto", "ms-zbtn ms-zauto" + (this.msZoom === null ? " is-on" : ""));
		this.msSet("map-note", t.mapWait);
		this.msSetClass("map-note", "ms-map-note" + (this.msMapEmpty ? " is-on" : ""));
		// Katman seçimi yalnızca sunucu karo verebiliyorsa; uydu şu an verilemiyorsa (çevrimdışı) sönük, altta kabartma.
		var T = this.msTiles;
		this.msShow("lyr", !!T.info);
		if (!T.info) return;
		this.msSet("lyr-relief", t.layers.relief);
		this.msSet("lyr-sat", t.layers.sat);
		var satDown = !T.info.sat || (T.down.sat && Date.now() - T.down.sat < 60000);
		this.msSetClass("lyr-relief", "ms-lyr-btn" + (this.msLayer === "relief" ? " is-on" : ""));
		this.msSetClass("lyr-sat", "ms-lyr-btn" + (this.msLayer === "sat" ? " is-on" : "") + (satDown ? " is-down" : ""));
	}

	/** Tablet penceresi: yerel ağ adresi ve karekodu, ya da tablet erişiminin nasıl açılacağı. */
	msRenderDeck(t) {
		if (!this.msDeckOpen) return;
		var n = this.msNet;
		this.msSet("deck-title", t.tablet);
		this.msSet("deck-close", t.close);
		var info = n.deck;
		var lan = info && info.lan ? info.lan : null;
		var url = "";
		var msg = "";
		var err = "";
		var path = null;
		var qr = false;
		if (!n.base) {
			msg = t.noServer;
		} else if (!info && !n.deckErr) {
			msg = t.loading;
		} else if (!info) {
			msg = n.deckErr.message || t.noServer;
		} else if (lan && lan.enabled && lan.url) {
			url = String(lan.url);
			msg = t.tabletHow;
			qr = true;
			if (lan.error) err = String(lan.error);
		} else {
			msg = t.tabletOff;
			path = t.tabletPath;
			if (lan && lan.error) err = String(lan.error);
		}
		this.msSet("deck-url", url);
		this.msShow("deck-url", url !== "");
		this.msSetHtml("deck-msg", msEscape(msg) + (err ? "<div class=\"ms-deck-err\">" + msEscape(err) + "</div>" : ""));
		var ph = this.msPathHtml(path);
		this.msSetHtml("deck-path", ph);
		this.msShow("deck-path", ph !== "");
		// Karekod: sunucunun resmi; yüklenemezse deck bilgisindeki SVG metni.
		var box = this.msEl["deck-qr"];
		var img = this.msEl["deck-img"];
		var show = qr && !!box;
		if (show && img) {
			var src = n.base + "/api/deck/qr.svg?t=" + this.msDeckStamp;
			if (img.getAttribute("src") !== src) {
				this.msQrFail = false;
				img.src = src;
			}
			if (this.msQrFail) {
				var svg = info && typeof info.qrSvg === "string" ? info.qrSvg : "";
				if (svg.indexOf("<svg") >= 0) {
					if (this.msHtml["deck-qr-svg"] !== svg) {
						this.msHtml["deck-qr-svg"] = svg;
						var holder = box.querySelector(".ms-deck-svg");
						if (!holder) {
							holder = document.createElement("div");
							holder.className = "ms-deck-svg";
							box.appendChild(holder);
						}
						holder.innerHTML = svg;
					}
					img.style.display = "none";
				} else {
					show = false;
				}
			} else {
				img.style.display = "";
				var h = box.querySelector(".ms-deck-svg");
				if (h) {
					box.removeChild(h);
					this.msHtml["deck-qr-svg"] = "";
				}
			}
		}
		this.msShow("deck-qr", show);
		if (show) {
			// Karekod mümkün olduğunca büyük: gövdenin yüksekliği ya da genişliğinin yarısı.
			var body = box.parentNode;
			var size = Math.max(60, Math.floor(Math.min(body.clientHeight, body.clientWidth * 0.5)));
			var px = size + "px";
			if (box.style.width !== px) {
				box.style.width = px;
				box.style.height = px;
			}
		}
	}

	/** Bölüm taşıyorsa önemi en az olan parçaları (data-pri küçük olan önce) gizler. */
	msAutoHide(sec) {
		if (!sec || !sec.clientHeight) return;
		var items = sec.querySelectorAll("[data-pri]");
		var list = [];
		for (var i = 0; i < items.length; i++) {
			var it = items[i];
			if (it.classList.contains("ms-cut")) it.classList.remove("ms-cut");
			list.push(it);
		}
		if (sec.scrollHeight <= sec.clientHeight + 1) return;
		list.sort(function (x, y) { return parseFloat(x.getAttribute("data-pri")) - parseFloat(y.getAttribute("data-pri")); });
		var cut = [];
		for (var j = 0; j < list.length; j++) {
			if (!list[j].offsetHeight) continue;
			list[j].classList.add("ms-cut");
			cut.push(list[j]);
			if (sec.scrollHeight <= sec.clientHeight + 1) break;
		}
		// Büyük bir parça gizlenince yer açılmış olabilir: önemliden başlayarak sığanları geri getir.
		for (var k = cut.length - 2; k >= 0; k--) {
			cut[k].classList.remove("ms-cut");
			if (sec.scrollHeight > sec.clientHeight + 1) cut[k].classList.add("ms-cut");
		}
	}

	// --- Simden doğrudan okuma -----------------------------------------------------------------------------------

	/** Uçağın anlık değerleri: simin değişkenlerinden; uçuş yüklenmemişse (konum 0,0) sunucunun canlı verisinden. */
	msTele(now) {
		var lat = this.msSim("PLANE LATITUDE", "degrees");
		var lon = this.msSim("PLANE LONGITUDE", "degrees");
		if (lat !== null && lon !== null && (Math.abs(lat) > 0.0001 || Math.abs(lon) > 0.0001)) {
			return {
				lat: lat,
				lon: lon,
				hdgT: this.msSim("PLANE HEADING DEGREES TRUE", "degrees"),
				hdgM: this.msSim("PLANE HEADING DEGREES MAGNETIC", "degrees"),
				trk: this.msSim("GPS GROUND TRUE TRACK", "degrees"),
				gs: this.msSim("GROUND VELOCITY", "knots"),
				alt: this.msSim("INDICATED ALTITUDE", "feet"),
				vs: this.msSim("VERTICAL SPEED", "feet per minute"),
				ground: this.msSim("SIM ON GROUND", "bool") > 0.5,
				windDir: this.msSim("AMBIENT WIND DIRECTION", "degrees"),
				windKt: this.msSim("AMBIENT WIND VELOCITY", "knots"),
				fuel: this.msSim("FUEL TOTAL QUANTITY WEIGHT", "pounds"),
			};
		}
		var L = this.msNet.live;
		var tl = L && L.telemetry ? L.telemetry : null;
		if (tl && now - (this.msNet.at.live || 0) < 5000) {
			var env = L.env || null;
			return { lat: tl.lat, lon: tl.lon, hdgT: tl.heading, hdgM: null, trk: null, gs: tl.gsKt, alt: tl.altFt, vs: tl.vsFpm,
				ground: !!tl.onGround, windDir: env ? env.windDir : null, windKt: env ? env.windKt : null, fuel: tl.fuelLb };
		}
		return null;
	}

	/** Haritadaki uçak: her karede simden konum ve gerçek pruva. */
	msAcNow() {
		var lat = this.msSim("PLANE LATITUDE", "degrees");
		var lon = this.msSim("PLANE LONGITUDE", "degrees");
		if (lat !== null && lon !== null && (Math.abs(lat) > 0.0001 || Math.abs(lon) > 0.0001)) {
			var h = this.msSim("PLANE HEADING DEGREES TRUE", "degrees");
			return { lat: lat, lon: lon, hdg: h === null ? 0 : h };
		}
		var tel = this.msTel;
		if (tel && msNum(tel.lat) && msNum(tel.lon)) return { lat: tel.lat, lon: tel.lon, hdg: msNum(tel.hdgT) ? tel.hdgT : 0 };
		return null;
	}

	/** Sunucudaki aktif iş (yalnızca L: değişkenlerindeki işle aynıysa: sunucu verisi birkaç saniye eski olabilir). */
	msActive() {
		var s = this.msNet.state;
		var a = s && s.active ? s.active : null;
		if (!a || !a.job) return null;
		var from = msDecodeIcao(this.msV("FROM"));
		var to = msDecodeIcao(this.msV("TO"));
		if (from && to && (a.job.from !== from || a.job.to !== to)) return null;
		return a;
	}

	/** İş değişince iz, yakıt örnekleri ve harita görünümü sıfırlanır; uçarken uçağın izi örneklenir. */
	msTrackJob(now) {
		var key = Math.round(this.msV("FROM")) + ">" + Math.round(this.msV("TO"));
		if (key !== this.msJobKey) {
			this.msJobKey = key;
			this.msTrack = [];
			this.msTail = [];
			this.msFuel = [];
			this.msView = null;
			this.msBase.dirty = true;
			this.msNet.wx = null;
			this.msNet.wxFor = "";
			this.msNet.req.track = 0;
		}
		var tel = this.msTel;
		if (this.msState !== 4 || !tel) return;
		if (now - this.msTailAt >= 2000) {
			var last = this.msTail.length ? this.msTail[this.msTail.length - 1] : this.msTrack.length ? this.msTrack[this.msTrack.length - 1] : null;
			if (!last || msDistNm(last[0], last[1], tel.lat, tel.lon) > 0.05) {
				this.msTail.push([tel.lat, tel.lon]);
				if (this.msTail.length > 3000) this.msTail.splice(0, 1000);
				this.msTailAt = now;
				this.msBase.dirty = true;
			}
		}
		// Yakıt akışı: son dört dakikanın örnekleri (yakıt eklenirse baştan).
		if (msNum(tel.fuel)) {
			var f = this.msFuel;
			var lastF = f.length ? f[f.length - 1] : null;
			if (lastF && tel.fuel > lastF.f + 2) {
				f.length = 0;
				lastF = null;
			}
			if (!lastF || now - lastF.t >= 5000) f.push({ t: now, f: tel.fuel });
			while (f.length > 2 && now - f[0].t > 240000) f.shift();
		}
	}

	/** Saatlik yakıt tüketimi (lb/sa): ölçülen akış, yoksa uçuşun ortalaması, yoksa plan. */
	msBurnLbH(a) {
		var s = this.msFuel;
		if (s.length >= 2) {
			var dt = (s[s.length - 1].t - s[0].t) / 3600000;
			var d = s[0].f - s[s.length - 1].f;
			if (dt >= 1 / 60 && d > 0) return d / dt;
		}
		var L = this.msNet.live;
		var fl = L && L.flight ? L.flight : null;
		if (fl && fl.elapsedS > 300 && fl.fuelUsedLb > 0) return fl.fuelUsedLb / (fl.elapsedS / 3600);
		if (a && a.dispatch && a.dispatch.fuel && a.job && a.job.plan && a.job.plan.airMin > 0 && a.dispatch.fuel.tripKg > 0) {
			return a.dispatch.fuel.tripKg * MS_LB_PER_KG / (a.job.plan.airMin / 60);
		}
		return null;
	}

	// --- Tıklamalar ---------------------------------------------------------------------------------------------

	msOnClick(e) {
		var n = e.target;
		while (n && n !== this && n.getAttribute) {
			var act = n.getAttribute("data-ms-act");
			var tab = n.getAttribute("data-ms-tab");
			if (act || tab) {
				if (tab) this.msSetTab(tab);
				else this.msAct(act);
				this.msUpdate();
				return;
			}
			n = n.parentNode;
		}
	}

	msSetTab(tab) {
		var id = this.msLay.id;
		if (this.msLay.tabs.indexOf(tab) < 0) return;
		this.msTabs[id] = tab;
		if (typeof SetStoredData === "function") SetStoredData(MS_TAB_KEY, "compact:" + this.msTabs.compact + ",side:" + this.msTabs.side);
	}

	msAct(act) {
		var v = this.msView;
		var r = v ? v.r : 20;
		var i;
		if (act === "zin") {
			var zi = MS_ZOOMS[0];
			for (i = 0; i < MS_ZOOMS.length; i++) if (MS_ZOOMS[i] < r * 0.9) zi = MS_ZOOMS[i];
			this.msZoom = zi;
		} else if (act === "zout") {
			var zo = MS_ZOOMS[MS_ZOOMS.length - 1];
			for (i = MS_ZOOMS.length - 1; i >= 0; i--) if (MS_ZOOMS[i] > r * 1.1) zo = MS_ZOOMS[i];
			this.msZoom = zo;
		} else if (act === "zauto") {
			this.msZoom = null;
		} else if (act === "lyr-relief" || act === "lyr-sat") {
			this.msLayer = act === "lyr-sat" ? "sat" : "relief";
			// Uydu yeniden seçilince hemen denenir (çevrimdışı diye bekletilmez).
			if (this.msLayer === "sat") {
				this.msTiles.down.sat = 0;
				this.msTiles.errs.sat = 0;
			}
			this.msBase.dirty = true;
			if (typeof SetStoredData === "function") SetStoredData(MS_LAYER_KEY, this.msLayer);
		} else if (act === "window") {
			this.msOpenWindow();
		} else if (act === "tablet") {
			this.msDeckOpen = !this.msDeckOpen;
			if (this.msDeckOpen) {
				this.msDeckStamp = Date.now();
				this.msNet.deck = null;
				this.msNet.deckErr = null;
				this.msNet.req.deck = 0;
			}
		} else if (act === "deck-close") {
			this.msDeckOpen = false;
		}
	}

	/** Modstead'in "Uçuş ekranı" penceresini masaüstünde açar. */
	msOpenWindow() {
		var t = MS_TEXT[this.msLang || "tr"];
		var self = this;
		if (!this.msNet.base) {
			this.msSay(t.noServer, true);
			return;
		}
		if (this.msWinBusy) return;
		this.msWinBusy = true;
		this.msXhr("POST", "/api/deck/open", {}, 8000, function (err) {
			self.msWinBusy = false;
			if (err) self.msSay(err.message || t.windowFail, true);
			else self.msSay(t.windowOk, false);
			self.msUpdate();
		});
	}

	msSay(text, err) {
		this.msToast = { text: text, err: err, until: Date.now() + 6000 };
	}

	// --- Yerel sunucu -------------------------------------------------------------------------------------------

	msXhr(method, path, body, timeoutMs, done) {
		var n = this.msNet;
		var base = n.base;
		var x = new XMLHttpRequest();
		var over = false;
		var timer = null;
		var finish = function (err, data) {
			if (over) return;
			over = true;
			if (timer) clearTimeout(timer);
			for (var i = 0; i < n.xhrs.length; i++) {
				if (n.xhrs[i] === x) {
					n.xhrs.splice(i, 1);
					break;
				}
			}
			// Üst üste başarısızlık: Modstead başka portta yeniden açılmış olabilir; adres yeniden aranır.
			if (err && err.status === 0) {
				n.fails += 1;
				if (n.fails >= 6 && n.base === base) {
					n.base = null;
					n.fails = 0;
				}
			} else {
				n.fails = 0;
			}
			try { done(err, data); } catch (e) {}
		};
		timer = setTimeout(function () {
			try { x.abort(); } catch (e) {}
			finish({ status: 0, message: "" }, null);
		}, timeoutMs);
		x.onreadystatechange = function () {
			if (x.readyState !== 4) return;
			var data = null;
			try { data = x.responseText ? JSON.parse(x.responseText) : null; } catch (e) { data = null; }
			if (x.status >= 200 && x.status < 300) finish(null, data);
			else finish({ status: x.status, message: data && data.error ? String(data.error) : "" }, null);
		};
		try {
			x.open(method, base + path, true);
			if (body !== null) x.setRequestHeader("Content-Type", "application/json");
			n.xhrs.push(x);
			x.send(body !== null ? JSON.stringify(body) : null);
		} catch (e) {
			finish({ status: 0, message: "" }, null);
		}
	}

	/** Modstead komutu (GET /api/call/<komut>?a=<JSON>). Eski sunucuda yoksa (404) bilinen eski uca düşer. */
	msCall(cmd, args, legacy, timeoutMs, done) {
		var n = this.msNet;
		var self = this;
		if (legacy && n.noCall) {
			this.msXhr("GET", legacy, null, timeoutMs, done);
			return;
		}
		var path = "/api/call/" + cmd + (args ? "?a=" + encodeURIComponent(JSON.stringify(args)) : "");
		this.msXhr("GET", path, null, timeoutMs, function (err, data) {
			if (err && err.status === 404 && legacy) {
				n.noCall = true;
				self.msXhr("GET", legacy, null, timeoutMs, done);
				return;
			}
			done(err, data);
		});
	}

	/** Yükleyici sunucunun adresini vermediyse (eski paket) portlar sırayla denenir. */
	msProbe(now) {
		var n = this.msNet;
		if (n.probing || now - n.probeAt < 10000) return;
		n.probing = true;
		n.probeAt = now;
		var i = 0;
		var next = function () {
			if (i >= MS_PORTS.length) {
				n.probing = false;
				return;
			}
			var base = "http://127.0.0.1:" + MS_PORTS[i];
			i += 1;
			var x = new XMLHttpRequest();
			var over = false;
			var end = function (ok) {
				if (over) return;
				over = true;
				if (ok) {
					n.base = base;
					n.noCall = false;
					n.fails = 0;
					n.probing = false;
				} else {
					next();
				}
			};
			var timer = setTimeout(function () {
				try { x.abort(); } catch (e) {}
				end(false);
			}, 800);
			x.onreadystatechange = function () {
				if (x.readyState !== 4) return;
				clearTimeout(timer);
				var info = null;
				try { info = x.status === 200 ? JSON.parse(x.responseText) : null; } catch (e) { info = null; }
				end(!!(info && info.app === MS_APP));
			};
			try {
				x.open("GET", base + "/hud/v", true);
				x.send();
			} catch (e) {
				clearTimeout(timer);
				end(false);
			}
		};
		next();
	}

	/** Ayrıntı istekleri: canlı uçuş 1 sn, kariyer 5 sn, iz 10 sn, hava 5 dk, tablet bilgisi (açıkken) 3 sn. */
	msPoll(state, now) {
		var n = this.msNet;
		if (!n.base) {
			this.msProbe(now);
			return;
		}
		if (state < 2) return;
		this.msPollTiles(now);
		var self = this;
		var due = function (kind, every) {
			if (n.busy[kind]) return false;
			var wait = n.failAt[kind] && n.failAt[kind] >= (n.at[kind] || 0) ? Math.max(every, 5000) : every;
			return now - (n.req[kind] || 0) >= wait;
		};
		var get = function (kind, cmd, args, legacy, timeoutMs, ok) {
			n.busy[kind] = true;
			n.req[kind] = now;
			self.msCall(cmd, args, legacy, timeoutMs, function (err, data) {
				n.busy[kind] = false;
				if (err) {
					n.failAt[kind] = Date.now();
					if (kind === "deck") n.deckErr = err;
					return;
				}
				n.at[kind] = Date.now();
				ok(data);
			});
		};
		if (due("live", 1000)) get("live", "msfs_career_live", null, "/api/live", 3000, function (d) { n.live = d; });
		if (due("state", n.state ? 5000 : 1500)) get("state", "msfs_career_state", null, "/api/state", 5000, function (d) { n.state = d; });
		var to = msDecodeIcao(this.msV("TO"));
		if (to && (n.wxFor !== to ? !n.busy.wx : due("wx", n.wx ? 300000 : 60000))) {
			n.wxFor = to;
			get("wx", "msfs_career_weather", null, null, 15000, function (d) { n.wx = d; });
		}
		if ((state === 4 || state === 5) && due("track", 10000)) {
			get("track", "msfs_career_track", null, null, 5000, function (d) { self.msOnTrack(d); });
		}
		if (this.msDeckOpen && due("deck", 3000)) {
			get("deck", "msfs_career_deck_info", null, null, 4000, function (d) {
				n.deck = d;
				n.deckErr = null;
			});
		}
	}

	msOnTrack(data) {
		var pts = data && typeof data.length === "number" ? data : data && data.track && typeof data.track.length === "number" ? data.track : null;
		if (!pts) return;
		var out = [];
		for (var i = 0; i < pts.length; i++) {
			var p = pts[i];
			if (p && msNum(p[0]) && msNum(p[1])) out.push([p[0], p[1]]);
		}
		// Sunucunun izi panelin açıldığı andan öncesini de içerir; boş geldiyse paneldeki örnekler kalır.
		if (out.length) {
			this.msTrack = out;
			this.msTail = [];
			this.msBase.dirty = true;
		}
	}

	// --- Harita ---------------------------------------------------------------------------------------------------
	// İzdüşüm Web Mercator (karolarla aynı), kuzey yukarıda. Görünüm (msView) { lat, lon, r }: merkez ve kısa kenarın
	// yarısı (nm, merkezin enleminde). İki tuval: alttaki (ms-map-base) karolar, ızgara, havalimanları, rota ve uçulan
	// iz; yalnızca görünüm kayınca ya da yeni veri (karo, iz, havalimanı) gelince yeniden çizilir. Üstteki (ms-map) her
	// karede: uçak, izin son parçası, menzil halkası, rüzgâr.

	msMapFrame() {
		if (!this.msRafCb) return;
		this.msRaf = requestAnimationFrame(this.msRafCb);
		var box = this.msEl.mapbox;
		if (!box || !this.msJob || this.msDeckOpen) return;
		var w = box.clientWidth;
		var h = box.clientHeight;
		if (w < 24 || h < 24) return;
		var now = Date.now();
		// Saniyede en çok ~30 kare.
		if (now - this.msMapAt < 30) return;
		var dt = this.msMapAt ? Math.min(0.5, (now - this.msMapAt) / 1000) : 0;
		this.msMapAt = now;
		var cv = this.msEl.map;
		var bcv = this.msMapBaseCanvas();
		if (!cv || !cv.getContext || !bcv || !bcv.getContext) return;
		var dpr = window.devicePixelRatio || 1;
		var cw = Math.round(w * dpr);
		var ch = Math.round(h * dpr);
		if (cv.width !== cw || cv.height !== ch || bcv.width !== cw || bcv.height !== ch) {
			cv.width = cw;
			cv.height = ch;
			bcv.width = cw;
			bcv.height = ch;
			this.msBase.dirty = true;
		}
		var ctx = cv.getContext("2d");
		var bctx = bcv.getContext("2d");
		if (!ctx || !bctx) return;
		try {
			this.msDrawMap(ctx, bctx, w, h, dpr, dt, now);
			this.msMapErr = "";
		} catch (e) {
			// Tek bir karenin hatası paneli durdurmasın (deneme sayfası msMapErr'i okur).
			this.msMapErr = String(e && e.message ? e.message : e);
		}
	}

	/** Alttaki tuval; işaretlemede yoksa (eski gövde) oluşturulur. */
	msMapBaseCanvas() {
		var b = this.msEl["map-base"];
		if (b) return b;
		var top = this.msEl.map;
		if (!top || !top.parentNode) return null;
		b = document.createElement("canvas");
		b.id = "ms-map-base";
		b.className = "ms-map";
		top.parentNode.insertBefore(b, top);
		this.msEl["map-base"] = b;
		return b;
	}

	/** Otomatik görünüm: uçak ve varış (hazırlıkta kalkış da) Mercator düzleminde kenar payıyla sığar; elle
	 *  yakınlaştırmada uçak ortada. */
	msMapTarget(w, h, em, ac, dep, arr, objs) {
		var c = ac || arr || dep;
		if (!c) return null;
		if (this.msZoom !== null) return { lat: c.lat, lon: c.lon, r: this.msZoom };
		var pts = [];
		if (ac) pts.push(ac);
		if (arr) pts.push(arr);
		// Uçuşun ilk yarısında bütün rota görünür, sonra uçak ve varış.
		var all = dep && arr && ac && msDistNm(ac.lat, ac.lon, arr.lat, arr.lon) > 0.5 * msDistNm(dep.lat, dep.lon, arr.lat, arr.lon);
		if (dep && (!ac || this.msState !== 4 || all)) pts.push(dep);
		for (var i = 0; i < objs.length; i++) if (objs[i] && msNum(objs[i].lat) && msNum(objs[i].lon)) pts.push(objs[i]);
		var x0 = msMercX(pts[0].lon);
		var wx = 1e9;
		var ex = -1e9;
		var ny = 1e9;
		var sy = -1e9;
		for (var j = 0; j < pts.length; j++) {
			var x = x0 + msWrapHalf(msMercX(pts[j].lon) - x0);
			var y = msMercY(pts[j].lat);
			if (x < wx) wx = x;
			if (x > ex) ex = x;
			if (y < ny) ny = y;
			if (y > sy) sy = y;
		}
		var clat = msMercLat((ny + sy) / 2);
		var clon = msWrap180((wx + ex) / 2 * 360 - 180);
		var m = em * 2.4;
		var S = 1e12;
		if (ex > wx) S = Math.min(S, Math.max(20, w - 2 * m) / (ex - wx));
		if (sy > ny) S = Math.min(S, Math.max(20, h - 2 * m) / (sy - ny));
		var r = 2.5;
		if (S < 1e12) r = Math.max(r, Math.min(w, h) * 21600 * Math.max(0.02, Math.cos(msRad(clat))) / (2 * S));
		return { lat: clat, lon: clon, r: r };
	}

	msDrawMap(ctx, bctx, w, h, dpr, dt, now) {
		var em = this.msFont || 15;
		// Sağdaki yakınlaştırma düğmelerinin sütunu ve sağ alttaki katman seçimiyle atfın yüksekliği (kenar payını aşanı)
		// sığdırmada sayılmaz: varış düğmelerin altında kalmasın.
		var uw = Math.max(20, w - em * 2.7);
		var uh = Math.max(20, h - Math.max(0, this.msFoot.h - em * 1.2));
		var a = this.msA;
		var ac = this.msAcNow();
		var dep = a && a.from && msNum(a.from.lat) ? a.from : null;
		var arr = a && a.to && msNum(a.to.lat) ? a.to : null;
		var objs = a && a.job && a.job.objectives && typeof a.job.objectives.length === "number" ? a.job.objectives : [];
		var target = this.msMapTarget(uw, uh, em, ac, dep, arr, objs);
		this.msMapEmpty = !target;
		var B = this.msBase;
		if (!target) {
			if (B.V) {
				bctx.setTransform(1, 0, 0, 1, 0, 0);
				bctx.clearRect(0, 0, w * dpr + 2, h * dpr + 2);
				ctx.setTransform(1, 0, 0, 1, 0, 0);
				ctx.clearRect(0, 0, w * dpr + 2, h * dpr + 2);
				B.V = null;
				this.msMapFoot(null, w, em);
			}
			return;
		}
		var v = this.msView;
		if (!v || dt === 0 || msDistNm(v.lat, v.lon, target.lat, target.lon) > target.r * 4 || v.r > target.r * 8 || v.r < target.r / 8) {
			v = this.msView = { lat: target.lat, lon: target.lon, r: target.r };
		} else {
			// Yumuşak geçiş (yaklaşık 0,3 sn).
			var k = 1 - Math.exp(-dt / 0.3);
			v.lat += (target.lat - v.lat) * k;
			v.lon = msWrap180(v.lon + msWrap180(target.lon - v.lon) * k);
			v.r = Math.exp(Math.log(v.r) + (Math.log(target.r) - Math.log(v.r)) * k);
		}
		var V = msProj(v, uw, uh, w, h);
		var key = [w, h, dpr, Math.round(em * 100), this.msLang, this.msLayer, this.msState, this.msJobKey,
			dep ? dep.icao + dep.runway + dep.runwayFt : "", arr ? arr.icao + arr.runway + arr.runwayFt : "", objs.length].join("|");
		var o = B.V;
		// Görünüm yarım pikselden az kaydıysa alttaki tuval olduğu gibi kalır; üstteki de aynı izdüşümle çizilir.
		if (!B.dirty && B.key === key && o && Math.abs(Math.log(V.S / o.S)) < 0.002 && Math.abs(msWrapHalf(V.mx - o.mx) * V.S) < 0.6
			&& Math.abs((V.my - o.my) * V.S) < 0.6 && Math.abs(V.cx - o.cx) < 0.5 && Math.abs(V.cy - o.cy) < 0.5) {
			V = o;
		} else {
			B.dirty = false;
			B.key = key;
			B.V = V;
			this.msDrawBase(bctx, V, dpr, em, dep, arr, objs, now);
		}
		this.msDrawTop(ctx, V, dpr, em, ac);
		this.msMaybeAirports(V, now);
		var T = this.msTiles;
		if (T.retryAt && now >= T.retryAt) {
			T.retryAt = 0;
			B.dirty = true;
		}
	}

	/** Alttaki tuval: karolar, ızgara, hedefler, havalimanları, rota, uçulan iz, kalkış ve varış, kuzey imi. */
	msDrawBase(ctx, V, dpr, em, dep, arr, objs, now) {
		var w = V.w;
		var h = V.h;
		ctx.setTransform(1, 0, 0, 1, 0, 0);
		ctx.clearRect(0, 0, w * dpr + 2, h * dpr + 2);
		var ras = this.msDrawTiles(ctx, V, dpr, now);
		ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
		var foot = this.msMapFoot(ras, w, em);
		if (ras) {
			// Hafif karartma: açık renkli kabartmada beyaz yazılar ve rota daha iyi okunur (sönük kabartma zaten koyu).
			ctx.fillStyle = "rgba(6, 8, 12, " + (ras.id === "sat" ? 0.1 : (0.2 * ras.alpha).toFixed(3)) + ")";
			ctx.fillRect(0, 0, w, h);
		}
		this.msDrawGrid(ctx, V, em, !!ras);

		// Hava işi hedefleri.
		for (var oi = 0; oi < objs.length; oi++) {
			var o = objs[oi];
			if (!o || !msNum(o.lat) || !msNum(o.lon)) continue;
			var op = msPt(V, o.lat, o.lon);
			var orad = Math.max(em * 0.4, (o.radiusNm || 0.5) * msPxNm(V, o.lat));
			ctx.beginPath();
			ctx.arc(op[0], op[1], orad, 0, Math.PI * 2);
			msDash(ctx, em, true);
			ctx.lineWidth = 3.5;
			ctx.strokeStyle = MS_CASE;
			ctx.stroke();
			ctx.lineWidth = 1.5;
			ctx.strokeStyle = "#3fcf8f";
			ctx.stroke();
			msDash(ctx, em, false);
			if (o.name) {
				msFont(ctx, em, 0.62, true);
				msLabel(ctx, String(o.name), op[0], op[1] - orad - em * 0.5, "#5fe0a6", "center");
			}
		}

		var marks = this.msMarks(ctx, V, em, dep, arr, foot);
		this.msDrawAirports(ctx, V, em, marks, foot);
		if (dep && arr) this.msDrawCourse(ctx, V, em, dep, arr);
		this.msDrawTrail(ctx, V, em);
		this.msDrawMarks(ctx, V, em, marks);

		// Kuzey imi (sol üst).
		var nx = em * 0.95;
		var ny = em * 0.85;
		ctx.beginPath();
		ctx.moveTo(nx, ny - em * 0.45);
		ctx.lineTo(nx + em * 0.3, ny + em * 0.15);
		ctx.lineTo(nx, ny);
		ctx.lineTo(nx - em * 0.3, ny + em * 0.15);
		ctx.closePath();
		ctx.lineJoin = "round";
		ctx.lineWidth = 2.5;
		ctx.strokeStyle = MS_CASE;
		ctx.stroke();
		ctx.fillStyle = "#d4d8e0";
		ctx.fill();
		msFont(ctx, em, 0.6, true);
		msLabel(ctx, "N", nx, ny + em * 0.62, "#d4d8e0", "center");
	}

	/** Enlem/boylam ızgarası: harita kaydıkça hareket hissi verir (karoların üstünde daha sönük). */
	msDrawGrid(ctx, V, em, ras) {
		var pxDeg = V.S / 360;
		var steps = [0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10, 20];
		var gs = steps[steps.length - 1];
		for (var i = steps.length - 1; i >= 0; i--) if (steps[i] * pxDeg >= em * 5) gs = steps[i];
		ctx.lineWidth = 1;
		ctx.strokeStyle = ras ? "rgba(255, 255, 255, 0.07)" : "rgba(255, 255, 255, 0.045)";
		msDash(ctx, em, false);
		ctx.beginPath();
		var latTop = msMercLat(V.my - V.cy / V.S);
		var latBot = msMercLat(V.my + (V.h - V.cy) / V.S);
		for (var la = Math.ceil(latBot / gs) * gs, c1 = 0; la <= latTop && c1 < 80; la += gs, c1++) {
			var yy = Math.round(V.cy + (msMercY(la) - V.my) * V.S) + 0.5;
			ctx.moveTo(0, yy);
			ctx.lineTo(V.w, yy);
		}
		var lonL = (V.mx - V.cx / V.S) * 360 - 180;
		var lonR = (V.mx + (V.w - V.cx) / V.S) * 360 - 180;
		for (var lo = Math.ceil(lonL / gs) * gs, c2 = 0; lo <= lonR && c2 < 80; lo += gs, c2++) {
			var xx = Math.round(V.cx + ((lo + 180) / 360 - V.mx) * V.S) + 0.5;
			ctx.moveTo(xx, 0);
			ctx.lineTo(xx, V.h);
		}
		ctx.stroke();
	}

	/** Üstteki tuval (her kare): izin son parçası, menzil halkası, uçak, rüzgâr. */
	msDrawTop(ctx, V, dpr, em, ac) {
		var w = V.w;
		var h = V.h;
		ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
		ctx.clearRect(0, 0, w, h);
		var center = ac ? msPt(V, ac.lat, ac.lon) : [V.cx, V.cy];

		// Uçulan izin son örnekten uçağa uzanan parçası.
		var tr = this.msTrack;
		var tail = this.msTail;
		var last = tail.length ? tail[tail.length - 1] : tr.length ? tr[tr.length - 1] : null;
		if (last && ac && this.msState === 4) {
			var q = msPt(V, last[0], last[1]);
			var lw = Math.max(2, em * 0.17);
			ctx.beginPath();
			ctx.moveTo(q[0], q[1]);
			ctx.lineTo(center[0], center[1]);
			ctx.lineCap = "round";
			ctx.lineWidth = lw + 2.5;
			ctx.strokeStyle = MS_CASE_SOFT;
			ctx.stroke();
			ctx.lineWidth = lw;
			ctx.strokeStyle = MS_TRACK;
			ctx.stroke();
		}

		// Menzil halkası (uçağın çevresinde).
		var v = this.msView;
		var ring = msNice(v.r * 0.55, [0.25, 0.5, 1, 2, 3, 5, 10, 15, 20, 25, 50, 100, 150, 200, 250, 500, 1000]);
		var rpx = ring * msPxNm(V, ac ? ac.lat : v.lat);
		if (rpx > em * 1.5) {
			ctx.beginPath();
			ctx.arc(center[0], center[1], rpx, 0, Math.PI * 2);
			msDash(ctx, em, true);
			ctx.lineWidth = 3;
			ctx.strokeStyle = "rgba(8, 9, 12, 0.28)";
			ctx.stroke();
			ctx.lineWidth = 1;
			ctx.strokeStyle = "rgba(255, 255, 255, 0.5)";
			ctx.stroke();
			msDash(ctx, em, false);
			msFont(ctx, em, 0.62, true);
			var ang = -Math.PI / 4;
			var t2 = String(ring).replace(".", MS_TEXT[this.msLang || "tr"].dec) + " nm";
			msLabel(ctx, t2, center[0] + Math.cos(ang) * rpx + em * 0.2, center[1] + Math.sin(ang) * rpx - em * 0.2, "#c3c8d2", "left");
		}

		// Uçak.
		if (ac) {
			var s = em * 0.95;
			ctx.save();
			ctx.translate(center[0], center[1]);
			ctx.rotate(msRad(ac.hdg));
			ctx.beginPath();
			var shape = [[0, -1], [0.13, -0.68], [0.13, -0.22], [1, 0.22], [1, 0.38], [0.13, 0.18], [0.1, 0.68], [0.4, 0.88], [0.4, 1],
				[0, 0.93], [-0.4, 1], [-0.4, 0.88], [-0.1, 0.68], [-0.13, 0.18], [-1, 0.38], [-1, 0.22], [-0.13, -0.22], [-0.13, -0.68]];
			for (var k2 = 0; k2 < shape.length; k2++) {
				if (k2 === 0) ctx.moveTo(shape[k2][0] * s, shape[k2][1] * s);
				else ctx.lineTo(shape[k2][0] * s, shape[k2][1] * s);
			}
			ctx.closePath();
			ctx.lineJoin = "round";
			ctx.lineWidth = 2.5;
			ctx.strokeStyle = "rgba(10, 11, 14, 0.95)";
			ctx.stroke();
			ctx.fillStyle = "#ffffff";
			ctx.fill();
			ctx.restore();
		}

		// Rüzgâr oku (sol alt; atıf boydan boya uzanıyorsa onun üstünde).
		var tel = this.msTel;
		if (tel && msNum(tel.windDir) && msNum(tel.windKt) && tel.windKt >= 1) {
			var wx0 = em * 1.15;
			var wy0 = h - em * 1.25 - (this.msFoot ? this.msFoot.lift : 0);
			var wa = msRad(tel.windDir + 180);
			var wl = em * 0.62;
			ctx.save();
			ctx.translate(wx0, wy0);
			ctx.rotate(wa);
			ctx.beginPath();
			ctx.moveTo(0, wl);
			ctx.lineTo(0, -wl);
			ctx.moveTo(-wl * 0.45, -wl * 0.4);
			ctx.lineTo(0, -wl);
			ctx.lineTo(wl * 0.45, -wl * 0.4);
			ctx.lineCap = "round";
			ctx.lineJoin = "round";
			ctx.lineWidth = Math.max(1.5, em * 0.12) + 2.5;
			ctx.strokeStyle = MS_CASE;
			ctx.stroke();
			ctx.lineWidth = Math.max(1.5, em * 0.12);
			ctx.strokeStyle = "#d4d8e0";
			ctx.stroke();
			ctx.restore();
			msFont(ctx, em, 0.62, true);
			msLabel(ctx, msDeg3(tel.windDir) + " " + Math.round(tel.windKt) + " kt", wx0 + em * 0.95, wy0, "#d4d8e0", "left");
		}
	}

	/** Katman seçimi ve karoların atfı (yalnızca raster görünürken). Sağ alt köşenin ölçüsü döner: oraya yazı konmaz;
	 *  atıf boydan boya uzanıyorsa rüzgâr oku yukarı kalkar. */
	msMapFoot(ras, w, em) {
		var t = MS_TEXT[this.msLang || "tr"];
		var attr = ras ? ras.attr : "";
		this.msShow("lyr", !!this.msTiles.info);
		if (this.msTiles.info) {
			this.msSet("lyr-relief", t.layers.relief);
			this.msSet("lyr-sat", t.layers.sat);
		}
		this.msSet("map-attr", attr);
		this.msShow("map-attr", attr !== "");
		var f = this.msEl["map-foot"];
		var at = this.msEl["map-attr"];
		var out = { w: 0, h: 0, lift: 0 };
		if (f && f.offsetWidth) {
			out.w = f.offsetWidth;
			out.h = f.offsetHeight;
		}
		if (at && attr && at.offsetWidth > w - em * 8) out.lift = at.offsetHeight;
		this.msFoot = out;
		return out;
	}

	/** Kalkış ve varışın yeri ve etiket kutusu (diğer havalimanlarının yazıları bunlara binmez). Etiket sağda; sağda
	 *  düğmelere (yakınlaştırma, katman seçimi) ya da kenara çarpıyorsa solda. */
	msMarks(ctx, V, em, dep, arr, foot) {
		var out = [];
		var list = [[dep, false], [arr, true]];
		var keep = [[V.w - em * 2.9, 0, V.w, em * 7]];
		if (foot.w) keep.push([V.w - foot.w - em * 0.2, V.h - foot.h - em * 0.2, V.w, V.h]);
		var free = function (b) {
			if (b[2] > V.w - em * 0.3) return false;
			for (var k = 0; k < keep.length; k++) {
				var o = keep[k];
				if (b[0] < o[2] && b[2] > o[0] && b[1] < o[3] && b[3] > o[1]) return false;
			}
			return true;
		};
		msFont(ctx, em, 0.74, true);
		for (var i = 0; i < 2; i++) {
			var ap = list[i][0];
			if (!ap) continue;
			if (i === 0 && arr && ap.icao === arr.icao) continue;
			var isArr = list[i][1];
			var p = msPt(V, ap.lat, ap.lon);
			var rr = em * (isArr ? 0.44 : 0.36);
			var text = String(ap.icao || "");
			var tw = ctx.measureText ? ctx.measureText(text).width : text.length * em * 0.48;
			var pad = em * 0.3;
			var bw = tw + pad * 2;
			var bh = em * 1.1;
			var bx = p[0] + rr + em * 0.3;
			if (!free([bx, p[1] - bh / 2, bx + bw, p[1] + bh / 2])) bx = p[0] - rr - em * 0.3 - bw;
			out.push({ ap: ap, isArr: isArr, p: p, rr: rr, text: text, pad: pad, box: [bx, p[1] - bh / 2, bx + bw, p[1] + bh / 2] });
		}
		return out;
	}

	/** Kalkış ve varış: halka, pist (yakında gerçek uzunlukla, uzakta simge boyunda) ve ICAO etiketi. */
	msDrawMarks(ctx, V, em, marks) {
		var near = this.msView && this.msView.r <= 40;
		for (var i = 0; i < marks.length; i++) {
			var m = marks[i];
			var ap = m.ap;
			var p = m.p;
			var col = m.isArr ? MS_ACCENT : "#d4d8e0";
			ctx.beginPath();
			ctx.arc(p[0], p[1], m.rr, 0, Math.PI * 2);
			ctx.fillStyle = "rgba(14, 15, 19, 0.92)";
			ctx.fill();
			ctx.lineWidth = Math.max(2, em * 0.14) + 2.5;
			ctx.strokeStyle = MS_CASE;
			ctx.stroke();
			var rws = msRunwayHeadings(ap.runway);
			if (rws.length) {
				var rl = (near ? Math.max(em * 0.9, (ap.runwayFt || 0) / 6076 * msPxNm(V, ap.lat)) : em * 0.9) / 2;
				var ra = msRad(rws[0].hdg);
				var sx = Math.sin(ra) * rl;
				var sy = Math.cos(ra) * rl;
				ctx.beginPath();
				ctx.moveTo(p[0] - sx, p[1] + sy);
				ctx.lineTo(p[0] + sx, p[1] - sy);
				ctx.lineCap = "butt";
				if (rl > m.rr) {
					ctx.lineWidth = Math.max(2.5, em * 0.2) + 2.5;
					ctx.strokeStyle = MS_CASE;
					ctx.stroke();
				}
				ctx.lineWidth = Math.max(2.5, em * 0.2);
				ctx.strokeStyle = m.isArr ? "#ffffff" : "#d4d8e0";
				ctx.stroke();
			}
			ctx.beginPath();
			ctx.arc(p[0], p[1], m.rr, 0, Math.PI * 2);
			ctx.lineWidth = Math.max(2, em * 0.14);
			ctx.strokeStyle = col;
			ctx.stroke();
			// Etiket: koyu kutu, varışta vurgu renginde kenar.
			var b = m.box;
			msRoundRect(ctx, b[0], b[1], b[2] - b[0], b[3] - b[1], em * 0.22);
			ctx.fillStyle = "rgba(14, 15, 19, 0.9)";
			ctx.fill();
			ctx.lineWidth = m.isArr ? 1.5 : 1;
			ctx.strokeStyle = m.isArr ? MS_ACCENT : "rgba(255, 255, 255, 0.25)";
			ctx.stroke();
			msFont(ctx, em, 0.74, true);
			ctx.textAlign = "left";
			ctx.textBaseline = "middle";
			ctx.fillStyle = m.isArr ? "#ffffff" : "#d4d8e0";
			ctx.fillText(m.text, b[0] + m.pad, (b[1] + b[3]) / 2 + 0.5);
		}
	}

	/** Planlanan rota: kalkıştan varışa büyük daire (Mercator'da kavisli), koyu kenarlı eflatun çizgi ve yön okları. */
	msDrawCourse(ctx, V, em, dep, arr) {
		var dist = msDistNm(dep.lat, dep.lon, arr.lat, arr.lon);
		var segs = Math.max(1, Math.min(96, Math.ceil(dist / 10)));
		var pts = [];
		for (var si = 0; si <= segs; si++) {
			var gp = msGcPoint(dep.lat, dep.lon, arr.lat, arr.lon, si / segs);
			pts.push(msPt(V, gp[0], gp[1]));
		}
		ctx.beginPath();
		for (var i = 0; i < pts.length; i++) {
			if (i === 0) ctx.moveTo(pts[i][0], pts[i][1]);
			else ctx.lineTo(pts[i][0], pts[i][1]);
		}
		var lw = Math.max(2, em * 0.15);
		ctx.lineJoin = "round";
		ctx.lineCap = "round";
		msDash(ctx, em, false);
		ctx.lineWidth = lw + 3;
		ctx.strokeStyle = MS_CASE_SOFT;
		ctx.stroke();
		ctx.lineWidth = lw;
		ctx.strokeStyle = MS_COURSE;
		ctx.stroke();

		// Yön okları: aralıklı, uçlardaki işaretlerin üstüne binmeden.
		var total = 0;
		for (var j = 1; j < pts.length; j++) total += Math.sqrt(Math.pow(pts[j][0] - pts[j - 1][0], 2) + Math.pow(pts[j][1] - pts[j - 1][1], 2));
		var step = Math.max(em * 5, 60);
		if (total < em * 4) return;
		var d = total < step * 1.5 ? total / 2 : step * 0.75;
		var run = 0;
		var count = 0;
		var sz = em * 0.42;
		for (var k = 1; k < pts.length && count < 80; k++) {
			var ax = pts[k - 1][0];
			var ay = pts[k - 1][1];
			var bx = pts[k][0];
			var by = pts[k][1];
			var L = Math.sqrt((bx - ax) * (bx - ax) + (by - ay) * (by - ay));
			while (L > 0 && d <= run + L && count < 80) {
				var f = (d - run) / L;
				var x = ax + (bx - ax) * f;
				var y = ay + (by - ay) * f;
				if (d > em * 1.6 && total - d > em * 1.6 && x > -em && y > -em && x < V.w + em && y < V.h + em) {
					ctx.save();
					ctx.translate(x, y);
					ctx.rotate(Math.atan2(by - ay, bx - ax));
					ctx.beginPath();
					ctx.moveTo(sz * 0.65, 0);
					ctx.lineTo(-sz * 0.5, -sz * 0.6);
					ctx.lineTo(-sz * 0.18, 0);
					ctx.lineTo(-sz * 0.5, sz * 0.6);
					ctx.closePath();
					ctx.lineJoin = "round";
					ctx.lineWidth = 2;
					ctx.strokeStyle = MS_CASE;
					ctx.stroke();
					ctx.fillStyle = MS_COURSE;
					ctx.fill();
					ctx.restore();
					count += 1;
				}
				d += step;
			}
			run += L;
		}
	}

	/** Uçulan iz (son örneğe kadar; uçağa uzanan parça üstteki tuvalde). */
	msDrawTrail(ctx, V, em) {
		var all = [this.msTrack, this.msTail];
		if (all[0].length + all[1].length < 2) return;
		ctx.beginPath();
		var started = false;
		var lx = -1e9;
		var ly = -1e9;
		for (var ti = 0; ti < 2; ti++) {
			var pts = all[ti];
			for (var pi = 0; pi < pts.length; pi++) {
				var q = msPt(V, pts[pi][0], pts[pi][1]);
				if (started && Math.abs(q[0] - lx) < 1.5 && Math.abs(q[1] - ly) < 1.5) continue;
				if (!started) ctx.moveTo(q[0], q[1]);
				else ctx.lineTo(q[0], q[1]);
				started = true;
				lx = q[0];
				ly = q[1];
			}
		}
		var lw = Math.max(2, em * 0.17);
		ctx.lineJoin = "round";
		ctx.lineCap = "round";
		ctx.lineWidth = lw + 2.5;
		ctx.strokeStyle = MS_CASE_SOFT;
		ctx.stroke();
		ctx.lineWidth = lw;
		ctx.strokeStyle = this.msState === 5 ? "#f0b64a" : MS_TRACK;
		ctx.stroke();
	}

	/** Yakındaki havalimanları (havacılık haritası gibi): büyük ve orta meydanlar mavi halka ve en uzun pistin yönünde
	 *  çubuk, küçükler gri halka; ICAO kodu koyu haleli (üst üste binen yazılar atlanır). */
	msDrawAirports(ctx, V, em, marks, foot) {
		var list = this.msApt.list;
		if (!list || !list.length) return;
		var w = V.w;
		var h = V.h;
		// Yazı konmayacak yerler: kuzey imi, rüzgâr, yakınlaştırma düğmeleri, katman seçimi ve atıf, kalkış ve varış.
		var zoomL = w - em * 2.9;
		var zoomB = em * 7;
		var windT = h - em * 2.2 - foot.lift;
		var boxes = [[0, 0, em * 2, em * 2.4], [0, windT, em * 7.5, h], [zoomL, 0, w, zoomB]];
		if (foot.w) boxes.push([w - foot.w - em * 0.2, h - foot.h - em * 0.2, w, h]);
		var skip = {};
		for (var i = 0; i < marks.length; i++) {
			var mk = marks[i];
			skip[mk.ap.icao] = true;
			boxes.push(mk.box);
			boxes.push([mk.p[0] - mk.rr - em * 0.2, mk.p[1] - mk.rr - em * 0.2, mk.p[0] + mk.rr + em * 0.2, mk.p[1] + mk.rr + em * 0.2]);
		}
		var r = this.msView ? this.msView.r : 50;
		var showAll = r <= 30;
		var rwyAll = r <= 15;
		// Önce simgeler (yazılar hiçbir simgenin üstüne binmesin), sonra büyükten küçüğe yazılar.
		var shown = [];
		for (var j = 0; j < list.length && j < 400; j++) {
			var ap = list[j];
			if (!ap || skip[ap.icao] || !msNum(ap.lat) || !msNum(ap.lon)) continue;
			var p = msPt(V, ap.lat, ap.lon);
			if (p[0] < -em || p[1] < -em || p[0] > w + em || p[1] > h + em) continue;
			if (p[0] > zoomL - em * 0.3 && p[1] < zoomB) continue;
			if (p[0] < em * 1.9 && p[1] < em * 2.4) continue;
			if (p[0] < em * 7.5 && p[1] > windT) continue;
			if (foot.w && p[0] > w - foot.w - em * 0.3 && p[1] > h - foot.h - em * 0.3) continue;
			var big = ap.size === "large";
			var mid = ap.size === "medium";
			var cls = big ? 2 : mid ? 1 : 0;
			var hdg = null;
			if (big || (mid && rwyAll)) {
				var rws = msRunwayHeadings(ap.runway);
				if (rws.length) hdg = rws[0].hdg;
			}
			var rad = msAptMark(ctx, p[0], p[1], em, cls, hdg);
			var ext = hdg !== null && cls === 2 ? em * 0.55 : rad;
			boxes.push([p[0] - ext, p[1] - ext, p[0] + ext, p[1] + ext]);
			if ((showAll || big) && p[0] >= 0 && p[1] >= 0 && p[0] <= w && p[1] <= h) shown.push({ ap: ap, p: p, rad: rad, cls: cls, own: boxes.length - 1 });
		}
		shown.sort(function (x, y) { return y.cls - x.cls; });
		var labels = 0;
		for (var s = 0; s < shown.length && labels < 28; s++) {
			var it = shown[s];
			var text = String(it.ap.icao);
			msFont(ctx, em, it.cls === 2 ? 0.66 : 0.6, true);
			var lw = ctx.measureText ? ctx.measureText(text).width : text.length * em * 0.42;
			var bx = [it.p[0] + it.rad + em * 0.25, it.p[1] - em * 0.4, it.p[0] + it.rad + em * 0.25 + lw, it.p[1] + em * 0.4];
			if (bx[2] > w - em * 0.3) continue;
			var hit = false;
			for (var b = 0; b < boxes.length && !hit; b++) {
				if (b === it.own) continue;
				var o = boxes[b];
				hit = bx[0] < o[2] && bx[2] > o[0] && bx[1] < o[3] && bx[3] > o[1];
			}
			if (hit) continue;
			boxes.push(bx);
			labels += 1;
			msLabel(ctx, text, bx[0], it.p[1], it.cls === 2 ? "#d6e9ff" : it.cls === 1 ? "#bfd0e6" : "#b4bac5", "left");
		}
	}

	/** Görünüm, son alınan kutunun dışına çıkınca ya da ayrıntı düzeyi değişince havalimanlarını yeniden ister. */
	msMaybeAirports(V, now) {
		var n = this.msNet;
		var ap = this.msApt;
		var v = this.msView;
		if (!n.base || !v || ap.busy || now - ap.failAt < 30000) return;
		var latN = msMercLat(V.my - V.cy / V.S);
		var latS = msMercLat(V.my + (V.h - V.cy) / V.S);
		var lonW = (V.mx - V.cx / V.S) * 360 - 180;
		var lonE = (V.mx + (V.w - V.cx) / V.S) * 360 - 180;
		var hr = (latN - latS) / 2;
		var hw = (lonE - lonW) / 2;
		var clat = (latN + latS) / 2;
		var clon = (lonW + lonE) / 2;
		var det = v.r <= 12 ? 2 : v.r <= 45 ? 1 : 0;
		var want = { s: latS, n: latN, w: lonW, e: lonE };
		var b = ap.box;
		if (b && ap.det === det && b.s <= want.s && b.n >= want.n && b.w <= want.w && b.e >= want.e) return;
		if (now - ap.at < 1200) return;
		// İstenen kutu görünümün iki katı, çeyrek dereceye yuvarlanır (önbellek anahtarı).
		var q = {
			south: Math.max(-90, Math.floor((clat - hr * 2) * 4) / 4),
			west: Math.floor((clon - hw * 2) * 4) / 4,
			north: Math.min(90, Math.ceil((clat + hr * 2) * 4) / 4),
			east: Math.ceil((clon + hw * 2) * 4) / 4,
			detail: det,
		};
		var key = [q.south, q.west, q.north, q.east, det].join("|");
		var box = { s: q.south, n: q.north, w: q.west, e: q.east };
		var self = this;
		if (this.msAptCache[key]) {
			ap.box = box;
			ap.det = det;
			if (ap.list !== this.msAptCache[key]) this.msBase.dirty = true;
			ap.list = this.msAptCache[key];
			return;
		}
		ap.busy = true;
		ap.at = now;
		this.msCall("msfs_career_map_airports", q, null, 6000, function (err, data) {
			ap.busy = false;
			if (err || !data || typeof data.length !== "number") {
				ap.failAt = Date.now();
				return;
			}
			self.msAptCache[key] = data;
			self.msAptKeys.push(key);
			if (self.msAptKeys.length > 10) delete self.msAptCache[self.msAptKeys.shift()];
			ap.box = box;
			ap.det = det;
			ap.list = data;
			self.msBase.dirty = true;
		});
	}

	// --- Karolar --------------------------------------------------------------------------------------------------
	// Yerel sunucunun raster karoları (tiles.rs): relief (gömülü Natural Earth II kabartma, çevrimdışı) ve sat (Sentinel-2
	// uydu, çevrimiçi; bağlantı yoksa 503). Uydu seçiliyken kabartma altta yer tutucudur. Yalnızca görünen karolar
	// istenir; yüklenmemiş karonun yerine bir üst düzeydeki karonun parçası büyütülür. Sunucuya ulaşılamıyorsa istek
	// yapılmaz; karo yoksa harita eski vektör görünümüyle (koyu zemin, ızgara) kalır.

	/** Katman bilgisi (msfs_career_tiles_info): eski sunucuda yoksa (404) harita karosuz kalır. */
	msPollTiles(now) {
		var n = this.msNet;
		var T = this.msTiles;
		if (T.for !== n.base) {
			T.for = n.base;
			T.info = null;
			T.none = false;
			T.at = 0;
			T.failAt = 0;
			T.cache = {};
			T.count = 0;
			T.loading = 0;
			T.gen += 1;
			T.errs = {};
			T.down = {};
			this.msBase.dirty = true;
		}
		if (!n.base || T.busy) return;
		var every = T.info ? 300000 : T.none ? 600000 : T.failAt ? 20000 : 0;
		if (now - T.at < every) return;
		T.busy = true;
		T.at = now;
		var self = this;
		var base = n.base;
		this.msCall("msfs_career_tiles_info", null, null, 4000, function (err, data) {
			T.busy = false;
			if (T.for !== base) return;
			if (err) {
				if (err.status >= 400 && err.status < 500) T.none = true;
				else T.failAt = Date.now();
				return;
			}
			var info = msTilesInfo(data);
			if (!info) {
				T.none = true;
				return;
			}
			T.none = false;
			T.failAt = 0;
			T.info = info;
			self.msBase.dirty = true;
		});
	}

	/** Görünen karoları çizer (cihaz pikselinde): kabartma, uydu seçiliyse üstünde uydu. En üstte çizilen katman döner. */
	msDrawTiles(ctx, V, dpr, now) {
		var T = this.msTiles;
		var info = T.info;
		if (!info) return null;
		T.frame += 1;
		T.need = 0;
		var down = function (id) {
			return T.down[id] && now - T.down[id] < 60000;
		};
		var list = [];
		if (info.relief && !down("relief")) list.push(info.relief);
		if (this.msLayer === "sat" && info.sat && !down("sat")) list.push(info.sat);
		var top = null;
		var alpha = 0;
		for (var i = 0; i < list.length; i++) {
			// Kabartma tek başınayken yakınlaştıkça (en yüksek düzeyinin ötesinde) sönükleşir: bulanık büyütme yerine renk izi.
			var al = this.msDrawLayer(ctx, V, dpr, list[i], list.length === 1, now);
			if (al > 0) {
				top = list[i];
				alpha = al;
			}
		}
		T.max = Math.max(MS_TILE_CACHE, T.need * 2 + 8);
		return top ? { id: top.id, attr: top.attr, alpha: alpha } : null;
	}

	/** Bir katmanın görünen karoları; çizildiyse saydamlığı, çizilecek karo yoksa 0 döner. */
	msDrawLayer(ctx, V, dpr, L, fade, now) {
		var S = V.S;
		var zi = Math.log(S * dpr / 256) / Math.LN2;
		var z = Math.max(L.lo, Math.min(L.hi, Math.round(zi)));
		var n = Math.pow(2, z);
		var x0 = Math.floor((V.mx - V.cx / S) * n);
		var x1 = Math.floor((V.mx + (V.w - V.cx) / S) * n);
		var y0 = Math.max(0, Math.floor((V.my - V.cy / S) * n));
		var y1 = Math.min(n - 1, Math.floor((V.my + (V.h - V.cy) / S) * n));
		if (x1 < x0 || y1 < y0 || (x1 - x0 + 1) * (y1 - y0 + 1) > 150) return 0;
		this.msTiles.need += (x1 - x0 + 1) * (y1 - y0 + 1);
		var over = zi - L.hi;
		var alpha = fade && over > 1 ? Math.max(0.4, 1 - (over - 1) * 0.2) : 1;
		ctx.globalAlpha = alpha;
		var drew = false;
		var miss = [];
		for (var ty = y0; ty <= y1; ty++) {
			for (var tx = x0; tx <= x1; tx++) {
				var x = ((tx % n) + n) % n;
				// Kenarlar tam piksele yuvarlanır: komşu karolar arasında ince boşluk kalmaz.
				var X0 = Math.round((V.cx + (tx / n - V.mx) * S) * dpr);
				var X1 = Math.round((V.cx + ((tx + 1) / n - V.mx) * S) * dpr);
				var Y0 = Math.round((V.cy + (ty / n - V.my) * S) * dpr);
				var Y1 = Math.round((V.cy + ((ty + 1) / n - V.my) * S) * dpr);
				var e = this.msTileGet(L.id, z, x, ty, now);
				if (e && e.ok) {
					ctx.drawImage(e.img, X0, Y0, X1 - X0, Y1 - Y0);
					drew = true;
					continue;
				}
				if (!e) miss.push([Math.abs(tx + 0.5 - V.mx * n) + Math.abs(ty + 0.5 - V.my * n), z, x, ty]);
				for (var k = 1; k <= 8 && z - k >= L.lo; k++) {
					var p = this.msTileGet(L.id, z - k, x >> k, ty >> k, now);
					if (p && p.ok) {
						var s = (p.img.naturalWidth || p.img.width || 256) / (1 << k);
						var mk = (1 << k) - 1;
						ctx.drawImage(p.img, (x & mk) * s, (ty & mk) * s, s, s, X0, Y0, X1 - X0, Y1 - Y0);
						drew = true;
						break;
					}
				}
			}
		}
		ctx.globalAlpha = 1;
		if (miss.length && this.msNet.base) {
			miss.sort(function (p1, p2) { return p1[0] - p2[0]; });
			for (var j = 0; j < miss.length && this.msTiles.loading < MS_TILE_LOADS; j++) this.msTileLoad(L.id, miss[j][1], miss[j][2], miss[j][3]);
		}
		return drew ? alpha : 0;
	}

	/** Önbellekteki karo (kullanıldı diye işaretlenir); başarısız olanı 20 sn sonra yeniden istenmek üzere bırakır. */
	msTileGet(id, z, x, y, now) {
		var T = this.msTiles;
		var key = id + "/" + z + "/" + x + "/" + y;
		var e = T.cache[key];
		if (!e) return null;
		if (e.fail && now - e.fail > 20000) {
			delete T.cache[key];
			T.count -= 1;
			return null;
		}
		e.used = T.frame;
		return e;
	}

	msTileLoad(id, z, x, y) {
		var T = this.msTiles;
		var key = id + "/" + z + "/" + x + "/" + y;
		var self = this;
		var img = new Image();
		var e = { key: key, img: img, ok: false, fail: 0, used: T.frame, gen: T.gen, done: false };
		T.cache[key] = e;
		T.count += 1;
		T.loading += 1;
		var timer = null;
		var finish = function (ok) {
			if (e.done) return;
			e.done = true;
			if (timer) clearTimeout(timer);
			img.onload = null;
			img.onerror = null;
			if (e.gen !== T.gen) return;
			T.loading = Math.max(0, T.loading - 1);
			if (T.cache[key] !== e) return;
			var at = Date.now();
			if (ok) {
				e.ok = true;
				T.okEver = true;
				T.errs[id] = 0;
			} else {
				e.fail = at;
				T.errs[id] = (T.errs[id] || 0) + 1;
				if (id === "relief" && T.cors && !T.okEver && T.errs[id] >= 3) {
					// Gömülü kabartmadan hiç karo gelmediyse CORS istemeden yeniden dene (tuval yalnızca çizilir, okunmaz;
					// uydunun 503'ü buna sayılmaz).
					T.cors = false;
					T.errs = {};
					for (var k in T.cache) {
						if (T.cache[k].fail) {
							delete T.cache[k];
							T.count -= 1;
						}
					}
				} else if (T.errs[id] >= 4) {
					// Katman şu an verilemiyor (ör. uydu çevrimdışı: 503): bir dakika onsuz.
					T.down[id] = at;
					T.errs[id] = 0;
					T.retryAt = at + 61000;
				}
				if (!T.retryAt || T.retryAt > at + 21000) T.retryAt = at + 21000;
			}
			self.msBase.dirty = true;
		};
		img.onload = function () { finish(!!(img.width || img.naturalWidth)); };
		img.onerror = function () { finish(false); };
		timer = setTimeout(function () { finish(false); }, 25000);
		if (T.cors) img.crossOrigin = "anonymous";
		img.src = this.msNet.base + "/api/tiles/" + id + "/" + z + "/" + x + "/" + y;
		if (T.count > T.max) this.msTileEvict();
	}

	/** En uzun süredir kullanılmayan karoları çıkarır (bu karede çizilenler ve yüklenmekte olanlar kalır). */
	msTileEvict() {
		var T = this.msTiles;
		while (T.count > T.max) {
			var worst = null;
			for (var k in T.cache) {
				var e = T.cache[k];
				if (e.used >= T.frame || (!e.ok && !e.fail)) continue;
				if (!worst || e.used < worst.used) worst = e;
			}
			if (!worst) return;
			delete T.cache[worst.key];
			T.count -= 1;
		}
	}
}

window.customElements.define("ingamepanel-modstead", ModsteadCareerPanel);
checkAutoload();
