// Modstead Kariyer paneli (MSFS araç çubuğu). Yalnızca gösterir: bütün hesap Modstead'dedir.
// Veri: Modstead, SimConnect üzerinden saniyede bir L:MODSTEAD_HUD_* değişkenlerini yazar (games/msfs/src/career/hud.rs).
// SEQ her yazımda artar; birkaç saniye artmazsa Modstead kapalıdır ve panel "bağlı değil" der.
// Simin JS motoru eskidir: ES2015 ile sınırlı kalınır (async, ?. ve ?? yok).

var MS_PREFIX = "L:MODSTEAD_HUD_";
var MS_STALE_MS = 4000;

var MS_TEXT = {
	tr: {
		connected: "Modstead bağlı",
		offline: "Modstead bağlı değil",
		offlineBody: "Kariyer uçuşları Modstead açıkken takip edilir. Modstead'i aç; panel kendiliğinden bağlanır.",
		noCareer: "Kariyer başlatılmadı",
		noCareerBody: "Modstead → MSFS → Kariyer'den pilotunu oluştur.",
		idle: "Aktif iş yok",
		idleBody: "Modstead → Kariyer → İş ilanları'ndan bir iş seç.",
		states: ["", "", "Hazırlanıyor", "Kalkışa hazır", "Uçuşta", "Kesildi"],
		phases: ["Uçuş öncesi", "Taksi", "Kalkış", "Tırmanış", "Seyir", "Alçalma", "Yaklaşma", "İniş koşusu", "Taksi", "Park"],
		kinds: ["Eğitim", "Kargo", "Yolcu", "Charter", "Teslimat", "Arazi", "Ambulans", "Havayolu", "Sınav"],
		dist: "Kalan",
		eta: "Varış",
		score: "Puan",
		due: "Son teslim",
		land: "Son iniş",
		pay: "Ücret",
		late: "gecikti",
		checks: function (ok, total) { return "Kontrol kapısı: " + ok + "/" + total; },
		penalties: function (n) { return n + " kesinti"; },
		interrupted: "Uçuş kesildi; aynı yerden sürdürürsen takip devam eder.",
		min: "dk",
		h: "sa",
	},
	en: {
		connected: "Modstead connected",
		offline: "Modstead not connected",
		offlineBody: "Career flights are tracked while Modstead is open. Open Modstead; the panel connects by itself.",
		noCareer: "No career started",
		noCareerBody: "Create your pilot in Modstead → MSFS → Career.",
		idle: "No active job",
		idleBody: "Pick a job in Modstead → Career → Job board.",
		states: ["", "", "Preparing", "Ready for departure", "In flight", "Interrupted"],
		phases: ["Preflight", "Taxi", "Takeoff", "Climb", "Cruise", "Descent", "Approach", "Rollout", "Taxi", "Parked"],
		kinds: ["Training", "Cargo", "Passenger", "Charter", "Ferry", "Bush", "Medical", "Airline", "Checkride"],
		dist: "Remaining",
		eta: "ETA",
		score: "Score",
		due: "Due in",
		land: "Last landing",
		pay: "Pay",
		late: "late",
		checks: function (ok, total) { return "Pre-flight gate: " + ok + "/" + total; },
		penalties: function (n) { return n + (n === 1 ? " deduction" : " deductions"); },
		interrupted: "Flight interrupted; continue from the same place and tracking resumes.",
		min: "min",
		h: "h",
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

function msDuration(min, t) {
	var m = Math.max(0, Math.round(min));
	if (m < 60) return m + " " + t.min;
	return Math.floor(m / 60) + " " + t.h + " " + (m % 60) + " " + t.min;
}

function msMoney(v, sep) {
	var s = String(Math.round(Math.abs(v)));
	var out = "";
	for (var i = 0; i < s.length; i++) {
		if (i > 0 && (s.length - i) % 3 === 0) out += sep;
		out += s.charAt(i);
	}
	return (v < 0 ? "-$" : "$") + out;
}

class ModsteadCareerPanel extends TemplateElement {
	constructor() {
		super(...arguments);
		this.seq = 0;
		this.seenAt = 0;
		this.timer = null;
		this.el = {};
	}

	connectedCallback() {
		super.connectedCallback();
		var self = this;
		// Öğe <head>'deki betikle tanımlandığı için çocuklar henüz ayrıştırılmamış olabilir: bağlama ilk güncellemede.
		this.timer = setInterval(function () { self.update(); }, 500);
		this.update();
	}

	bind() {
		if (this.el.root) return true;
		var root = this.querySelector("#ms-root");
		if (!root) return false;
		var ui = this.querySelector("ingame-ui");
		// MSFS 2024 SU2 sonrası panel bazen gizli sınıfla açılıyor.
		if (ui && ui.classList) ui.classList.remove("hide");
		var ids = ["root", "dot", "status", "kind", "off", "off-title", "off-body", "job", "from", "to", "phase", "progress",
			"l-dist", "dist", "l-eta", "eta", "l-score", "score", "l-due", "due", "l-land", "land", "l-pay", "pay", "note"];
		for (var i = 0; i < ids.length; i++) this.el[ids[i]] = this.querySelector("#ms-" + ids[i]);
		return true;
	}

	disconnectedCallback() {
		if (this.timer) clearInterval(this.timer);
		this.timer = null;
		super.disconnectedCallback();
	}

	v(name) {
		var x = SimVar.GetSimVarValue(MS_PREFIX + name, "number");
		return typeof x === "number" && isFinite(x) ? x : 0;
	}

	set(id, text) {
		var e = this.el[id];
		if (e && e.textContent !== text) e.textContent = text;
	}

	show(id, on) {
		var e = this.el[id];
		if (e) e.style.display = on ? "" : "none";
	}

	update() {
		if (!this.bind()) return;
		var now = Date.now();
		var seq = this.v("SEQ");
		if (seq > 0 && seq !== this.seq) {
			this.seq = seq;
			this.seenAt = now;
		}
		var live = now - this.seenAt < MS_STALE_MS;
		var t = live && this.v("LANG") === 1 ? MS_TEXT.en : MS_TEXT.tr;
		var state = live ? this.v("STATE") : -1;

		this.el.root.className = "ms-root" + (live ? "" : " is-offline") + (state === 4 ? " is-flying" : "");
		this.set("status", live ? t.connected : t.offline);

		if (state < 2) {
			this.show("job", false);
			this.show("off", true);
			this.set("kind", "");
			if (!live) {
				// Bağlı değilken dil bilinmez: iki dilde.
				this.set("off-title", MS_TEXT.tr.offline + " · " + MS_TEXT.en.offline);
				this.set("off-body", MS_TEXT.tr.offlineBody);
			} else if (state === 0) {
				this.set("off-title", t.noCareer);
				this.set("off-body", t.noCareerBody);
			} else {
				this.set("off-title", t.idle);
				this.set("off-body", t.idleBody);
			}
			return;
		}

		this.show("off", false);
		this.show("job", true);
		this.set("kind", t.kinds[this.v("KIND")] || "");
		this.set("from", msDecodeIcao(this.v("FROM")));
		this.set("to", msDecodeIcao(this.v("TO")));
		var phase = this.v("PHASE");
		this.set("phase", state === 4 && phase >= 0 ? t.phases[phase] || "" : t.states[state] || "");

		var dist = this.v("DIST_NM");
		var total = this.v("TOTAL_NM");
		var done = total > 0 ? Math.min(1, Math.max(0, (total - dist) / total)) : 0;
		this.el.progress.style.width = Math.round(done * 100) + "%";

		this.set("l-dist", t.dist);
		this.set("dist", Math.round(dist) + " nm");
		this.set("l-eta", t.eta);
		var eta = this.v("ETA_MIN");
		this.set("eta", eta >= 0 ? msDuration(eta, t) : "—");
		this.set("l-score", t.score);
		var score = this.v("SCORE");
		this.set("score", score >= 0 ? String(Math.round(score)) : "—");
		this.set("l-due", t.due);
		var due = this.v("DUE_MIN");
		this.set("due", due >= 0 ? msDuration(due, t) : t.late);
		this.el.due.className = "ms-value" + (due < 0 ? " ms-warn" : "");
		this.set("l-land", t.land);
		var fpm = this.v("LAND_FPM");
		this.set("land", fpm > 0 ? Math.round(fpm) + " fpm · " + this.v("LAND_G").toFixed(2) + " G" : "—");
		this.set("l-pay", t.pay);
		this.set("pay", msMoney(this.v("PAY"), t === MS_TEXT.en ? "," : "."));

		var note = "";
		if (state === 5) note = t.interrupted;
		else if (state === 2 || state === 3) note = t.checks(this.v("CHECKS_OK"), this.v("CHECKS_TOTAL"));
		else if (this.v("EVENTS") > 0) note = t.penalties(this.v("EVENTS"));
		this.set("note", note);
	}
}

window.customElements.define("ingamepanel-modstead", ModsteadCareerPanel);
checkAutoload();
