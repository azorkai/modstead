// Modstead Kariyer: ana menü yükleyicisi. MSFS 2024 simin kendi HTML dosyalarını Community'den değiştirmeye izin
// vermez; menünün kök bileşeni (MasterPage, cookedcomps) ise değiştirilebilir. Modstead kurulumda o bileşenin
// kullanıcının simindeki kopyasına görünmez bir resim ekler; resmin onload'u bu dosyayı yalnızca ana menüde bir kez
// yükler (bkz. games/msfs/src/career/menu.rs). Modstead açıksa menü arayüzünün kodunu ve görünümünü bilgisayardaki yerel sunucudan
// (yalnızca 127.0.0.1) alır ve ekler; Modstead güncellenince sayfayı yenilemeden eskisini kaldırıp yenisini yükler.
// Modstead kapalıysa hiçbir şey eklemez. Simin menüsüne dokunmaz: her şey try/catch içinde, yalnızca kendi
// <link>/<script> öğeleri ve uygulamanın kendi kapsayıcısı (#msm-root). Simin arayüz motoru eski: ES5.

(function () {
	try {
		var PORTS = [47213, 47214, 47215];
		var APP = "modstead-career-hud";
		var CSS_ID = "msm-loader-css";
		var JS_ID = "msm-loader-js";
		// Yüklü olan: { base, v } ya da null.
		var current = null;
		var probing = false;

		var get = function (url, timeoutMs, done) {
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
		};

		// Portları sırayla dener; Modstead'in sunucusu kendini ve sürümünü söyler.
		var probe = function (i, done) {
			if (i >= PORTS.length) return done(null);
			var base = "http://127.0.0.1:" + PORTS[i];
			get(base + "/hud/v", 700, function (text) {
				var info = null;
				try { info = text ? JSON.parse(text) : null; } catch (e) { info = null; }
				if (info && info.app === APP && info.v) done({ base: base, v: String(info.v) });
				else probe(i + 1, done);
			});
		};

		var removeNode = function (id) {
			var n = document.getElementById(id);
			if (n && n.parentNode) n.parentNode.removeChild(n);
		};

		// Eski sürümü kaldırır: önce uygulamanın kendi temizliği (zamanlayıcılar, dinleyiciler, #msm-root), sonra
		// yükleyicinin eklediği dosyalar.
		var unload = function () {
			try {
				if (window.ModsteadMenu && typeof window.ModsteadMenu.destroy === "function") window.ModsteadMenu.destroy();
			} catch (e) {}
			try { window.ModsteadMenu = undefined; } catch (e) {}
			try {
				removeNode(JS_ID);
				removeNode(CSS_ID);
				removeNode("msm-root");
			} catch (e) {}
			current = null;
		};

		var load = function (info) {
			var head = document.head || document.getElementsByTagName("head")[0];
			if (!head || !document.body) return;
			current = info;
			// Uygulama sunucunun adresini buradan öğrenir.
			window.__modsteadMenu = { base: info.base, v: info.v };
			var l = document.createElement("link");
			l.id = CSS_ID;
			l.rel = "stylesheet";
			l.href = info.base + "/menu/app.css?v=" + encodeURIComponent(info.v);
			head.appendChild(l);
			var s = document.createElement("script");
			s.id = JS_ID;
			s.type = "text/javascript";
			s.src = info.base + "/menu/app.js?v=" + encodeURIComponent(info.v);
			head.appendChild(s);
		};

		var tick = function () {
			if (probing) return;
			probing = true;
			probe(0, function (info) {
				probing = false;
				try {
					// Modstead kapalı: yüklü bir sürüm varsa kendi "bağlı değil" durumunu gösterir, yoksa hiçbir şey yok.
					if (!info) return;
					if (!current) load(info);
					else if (info.v !== current.v || info.base !== current.base) {
						unload();
						load(info);
					}
				} catch (e) {}
			});
		};

		// Ana menü kendi bileşenlerini kurarken araya girmemek için kısa bir bekleme; sonra 5 saniyede bir yoklama.
		setTimeout(tick, 1500);
		setInterval(tick, 5000);
	} catch (e) {}
})();
