// Modstead Kariyer paneli yükleyicisi. Modstead açıksa panelin güncel kodunu, görünümünü ve işaretlemesini
// bilgisayardaki yerel sunucudan (yalnızca 127.0.0.1) alır: Modstead güncellenince panel simi kapatmadan yenilenir.
// Modstead kapalıysa paketteki kopyayı (ModsteadCareer.js/.css) kullanır. Simin arayüz motoru eski: ES5.

(function () {
	var PORTS = [47213, 47214, 47215];
	var APP = "modstead-career-hud";
	// Yüklenen kaynak: { base, v } (yerel sunucu) ya da "bundled" (paketteki kopya).
	var loaded = null;

	function get(url, timeoutMs, done) {
		var x = new XMLHttpRequest();
		var over = false;
		var timer = setTimeout(function () {
			if (over) return;
			over = true;
			try { x.abort(); } catch (e) {}
			done(null);
		}, timeoutMs);
		x.onreadystatechange = function () {
			if (x.readyState !== 4 || over) return;
			over = true;
			clearTimeout(timer);
			done(x.status === 200 ? x.responseText : null);
		};
		try {
			x.open("GET", url, true);
			x.send();
		} catch (e) {
			over = true;
			clearTimeout(timer);
			done(null);
		}
	}

	// Sırayla portları dener; Modstead'in sunucusu sürümünü söyler.
	function probe(i, done) {
		if (i >= PORTS.length) return done(null);
		var base = "http://127.0.0.1:" + PORTS[i];
		get(base + "/hud/v", 700, function (text) {
			var info = null;
			try { info = text ? JSON.parse(text) : null; } catch (e) { info = null; }
			if (info && info.app === APP && info.v) done({ base: base, v: info.v });
			else probe(i + 1, done);
		});
	}

	// Görünüm gelene kadar içerik gizli kalır (biçimsiz bir an görünmesin).
	function hide() {
		var root = document.getElementById("ms-root");
		if (root) root.style.opacity = "0";
	}
	function show() {
		var root = document.getElementById("ms-root");
		if (root) root.style.opacity = "";
	}

	function addCss(href) {
		var l = document.createElement("link");
		l.rel = "stylesheet";
		l.href = href;
		l.onload = show;
		l.onerror = show;
		document.head.appendChild(l);
		setTimeout(show, 1500);
	}
	function addJs(src) {
		var s = document.createElement("script");
		s.type = "text/javascript";
		s.src = src;
		document.head.appendChild(s);
	}

	function bundled() {
		loaded = "bundled";
		hide();
		addCss("ModsteadCareer.css");
		addJs("ModsteadCareer.js");
	}

	function live(info) {
		loaded = info;
		// Panel ayrıntıları (canlı uçuş, harita, hava) aynı sunucudan ister; adres yoksa kendisi arar.
		window.MS_HUD_BASE = info.base;
		get(info.base + "/hud/body.html?v=" + info.v, 1500, function (body) {
			var root = document.getElementById("ms-root");
			if (body && root) root.outerHTML = body;
			hide();
			addCss(info.base + "/hud/app.css?v=" + info.v);
			addJs(info.base + "/hud/app.js?v=" + info.v);
		});
	}

	// Modstead güncellenince, açılınca ya da kapanınca panel kendini yeniler.
	function watch() {
		setInterval(function () {
			probe(0, function (info) {
				var now = info ? info.v : "bundled";
				var was = loaded === "bundled" ? "bundled" : loaded && loaded.v;
				if (was && now !== was) location.reload();
			});
		}, 5000);
	}

	probe(0, function (info) {
		if (info) live(info);
		else bundled();
		watch();
	});
})();
