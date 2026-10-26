// Modstead Kariyer paneli (MSFS araç çubuğu). Yalnızca gösterir: bütün hesap Modstead'dedir.
// Veri: Modstead, SimConnect üzerinden saniyede bir L:MODSTEAD_HUD_* değişkenlerini yazar (games/msfs/src/career/hud.rs).
// SEQ her yazımda artar; birkaç saniye artmazsa Modstead kapalıdır ve panel "bağlı değil" der.
// Simin JS motoru eskidir: ES2015 ile sınırlı kalınır (async, ?. ve ?? yok). Tek bir sözdizimi hatası bütün paneli
// boş bırakır (ilk gerçek denemede dizgedeki bir satır sonu yüzünden böyle oldu); hud.rs testi dizgeleri denetler.
// Türkçe metinler büyük harfle yazılır: simin motoru text-transform ile "i"yi "I" yapar, "İ" yapmaz.

var MS_PREFIX = "L:MODSTEAD_HUD_";
var MS_STALE_MS = 4000;
var MS_CONNECT_MS = 2500;
var MS_LANG_KEY = "MODSTEAD_HUD_LANG";
// Tasarımın çizildiği içerik boyutu (px) ve yazı boyutu. Panel büyüyüp küçüldükçe her şey bununla orantılı ölçeklenir
// (bütün ölçüler em cinsinden).
var MS_DESIGN = { w: 330, h: 310, font: 15, min: 10, max: 30 };
// Geniş ve alçak panelde iki sütunlu yerleşimin ölçüsü; hangisi daha büyük yazı veriyorsa o seçilir.
var MS_DESIGN_WIDE = { w: 600, h: 175 };
// Kontrol kapısı sırası: hud.rs → CHECK_IDS ile aynı. Her kontrol taban-4 bir basamak: 0 yok, 1 tamam, 2 eksik, 3 öneri.
var MS_CHECK_IDS = ["connected", "in_flight", "at_departure", "aircraft", "slew", "fuel", "payload"];
// tracker.rs → Phase sırası (0–9) → evre çizelgesindeki adım (-1: henüz başlamadı, 8: hepsi bitti).
var MS_PHASE_STEP = [-1, 0, 1, 2, 3, 4, 5, 6, 7, 8];

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
	return (v < 0 ? "-" : "") + out;
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
	}
	return html;
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
	}

	connectedCallback() {
		super.connectedCallback();
		var self = this;
		// Öğe <head>'deki betikle tanımlandığı için çocuklar henüz ayrıştırılmamış olabilir: bağlama ilk güncellemede.
		this.msTimer = setInterval(function () { self.msUpdate(); }, 500);
		this.msUpdate();
	}

	disconnectedCallback() {
		if (this.msTimer) clearInterval(this.msTimer);
		this.msTimer = null;
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
			"track-fill", "track-dot", "l-a", "a", "l-b", "b", "row-flight", "l-score", "score", "l-land", "land", "l-pay", "pay",
			"l-due", "due", "phases", "steps", "step-now", "step-next", "gate", "gate-title", "gate-count", "checks", "note"];
		for (var i = 0; i < ids.length; i++) this.msEl[ids[i]] = this.querySelector("#ms-" + ids[i]);
		var stored = typeof GetStoredData === "function" ? GetStoredData(MS_LANG_KEY) : null;
		if (stored === "tr" || stored === "en") this.msLang = stored;
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

	/** Yazı boyutunu panelin iç boyutuna göre ayarlar; bütün yerleşim em ile ölçeklenir. */
	msFit() {
		var root = this.msEl.root;
		var w = root.clientWidth;
		var h = root.clientHeight;
		if (!w || !h) return;
		var s = Math.min(w / MS_DESIGN.w, h / MS_DESIGN.h);
		var sWide = Math.min(w / MS_DESIGN_WIDE.w, h / MS_DESIGN_WIDE.h);
		var wide = sWide > s * 1.1;
		var f = Math.max(MS_DESIGN.min, Math.min(MS_DESIGN.max, MS_DESIGN.font * (wide ? sWide : s)));
		if (Math.abs(f - this.msFont) > 0.05) {
			this.msFont = f;
			root.style.fontSize = f.toFixed(2) + "px";
		}
		// Dar panelde kontrol listesi tek sütuna iner.
		this.msSizeCls = (wide ? " is-wide" : "") + (w / f < 17 ? " is-narrow" : "");
	}

	msV(name) {
		var x = SimVar.GetSimVarValue(MS_PREFIX + name, "number");
		return typeof x === "number" && isFinite(x) ? x : 0;
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

		this.msFit();
		this.msBrandHeader(t, mode);
		var cls = "ms-root ms-" + mode + this.msSizeCls;
		if (this.msEl.root.className !== cls) this.msEl.root.className = cls;

		if (state < 2) {
			this.msShow("job", false);
			this.msShow("empty", true);
			this.msRenderEmpty(mode, t);
		} else {
			this.msShow("empty", false);
			this.msShow("job", true);
			this.msRenderJob(state, t);
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
		var html = "";
		if (path) {
			for (var i = 0; i < path.length; i++) {
				if (i > 0) html += "<span class=\"ms-path-sep\"></span>";
				html += "<span class=\"ms-path-item\">" + msEscape(path[i]) + "</span>";
			}
		}
		this.msSetHtml("empty-path", html);
		this.msShow("empty-path", html !== "");
	}

	msRenderJob(state, t) {
		var flying = state === 4;
		var interrupted = state === 5;
		var prep = state === 2 || state === 3;

		this.msSet("kind", t.kinds[Math.round(this.msV("KIND"))] || t.kinds[1]);
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
		if (prep) {
			this.msSet("l-a", t.distance);
			this.msSetHtml("a", msNumHtml([[msGroup(total, t.thousands), t.nm]]));
			this.msSet("l-b", t.block);
			this.msSetHtml("b", eta >= 0 ? msNumHtml(msDurationParts(eta, t)) : msNumHtml([["—", ""]]));
		} else {
			this.msSet("l-a", t.remaining);
			var d = dist < 10 ? (Math.round(dist * 10) / 10).toFixed(1).replace(".", t.dec) : msGroup(dist, t.thousands);
			this.msSetHtml("a", msNumHtml([[d, t.nm]]));
			if (interrupted) {
				// Kesik uçuşta varış süresi anlamsız: toplam mesafe.
				this.msSet("l-b", t.total);
				this.msSetHtml("b", msNumHtml([[msGroup(total, t.thousands), t.nm]]));
			} else {
				this.msSet("l-b", t.eta);
				this.msSetHtml("b", eta >= 0 ? msNumHtml(msDurationParts(eta, t)) : msNumHtml([["—", ""]]));
			}
		}

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
		this.msSetHtml("pay", msNumHtml([["$" + msGroup(this.msV("PAY"), t.thousands), ""]]));
		this.msSet("l-due", t.due);
		var due = this.msV("DUE_MIN");
		if (due >= 0) this.msSetHtml("due", msNumHtml(msDurationParts(due, t)));
		else this.msSetHtml("due", msNumHtml(msDurationParts(-due, t)) + "<span class=\"ms-late\">" + msEscape(t.late) + "</span>");
		this.msSetClass("due", "ms-value" + (due < 0 ? " ms-warn" : ""));

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
}

window.customElements.define("ingamepanel-modstead", ModsteadCareerPanel);
checkAutoload();
