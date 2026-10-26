// Modstead Kariyer: MSFS 2024 ana menüsündeki "Modstead Kariyer" kutusu ve tam ekran kariyer penceresi.
// Ana menü sayfasına (coui://html_UI/Global/mainUI.html) Community paketindeki yükleyici ekler
// (menu-package/html_UI/Modstead/ModsteadMenuLoader.js). Bu dosya ve görünümü Modstead'in yerel sunucusundan gelir
// (/menu/app.js, /menu/app.css); veri ve işlemler aynı sunucunun /api uçlarından (bkz. API.md).
// Simin arayüz motoru (Coherent GT) eski: yalnızca ES5 (let/const, ok fonksiyonu, şablon dizgesi, fetch, async yok;
// istekler eşzamansız XHR). Bu dosyada ters bölü karakteri kullanılmaz (kaçış dizileri araçlarda bozulabiliyor).
// Simin öğelerine yalnızca okumak için dokunulur; bizim her şeyimiz #msm-root içindedir.
// Görsel dil simin kendi bileşenlerinden alındı (home_tilecareer, iconbutton_squared, shortcutblock, title_h1,
// blurpage, scroll): köşeli yüzeyler, Roboto, odakta beyaz üçgen ve beyaz zemin üzerine koyu yazı, seçili halde
// mavi (#3B84EB) ve sağ alt köşede beyaz işaret, simin ses olayları. Modstead turuncusu yalnızca küçük vurgulardadır.

(function () {
	"use strict";

	var CFG = window.__modsteadMenu || {};
	var BASE = typeof CFG.base === "string" ? CFG.base : "";

	// Yükleyici sürüm değişince yenisini ekler; aynı sayfada iki örnek çalışmasın.
	try {
		if (window.ModsteadMenu && typeof window.ModsteadMenu.destroy === "function") window.ModsteadMenu.destroy();
	} catch (e) {}
	(function () {
		var old = document.getElementById("msm-root");
		if (old && old.parentNode) old.parentNode.removeChild(old);
	})();

	// --- Metinler -------------------------------------------------------------------------------------------------
	// Kendi sabit metinlerimiz simin dilinde (Türkçe ya da İngilizce); Modstead'den gelen iletiler Modstead'in dilindedir.
	// Simin motoru text-transform ile "i"yi "I" yapar, "İ" yapmaz: büyük harf gerekiyorsa metin öyle yazılır.

	var TEXT = {
		tr: {
			tileTitle: "Modstead Kariyer",
			category: "Modstead",
			title: "Kariyer",
			connecting: "Modstead'e bağlanıyor",
			connectingSub: "Birkaç saniye sürebilir",
			offline: "Modstead bağlı değil",
			offlineSub: "Modstead'i aç; kutu kendiliğinden bağlanır",
			offlineBody: "Kariyer verisi bilgisayarındaki Modstead uygulamasından gelir. Modstead'i açınca bu pencere kendiliğinden bağlanır.",
			retry: "Yeniden dene",
			noCareer: "Kariyer başlatılmadı",
			noCareerSub: "Pilotunu Modstead'de oluştur",
			noCareerBody: "Modstead'de MSFS bölümündeki Kariyer sekmesinden pilotunu oluştur. İş ilanların ve uçuşların burada görünür.",
			eyebrowActive: "Aktif iş",
			eyebrowIdle: "İş ilanları",
			eyebrowFlying: "Uçuşta",
			idleMain: "İş seç",
			idleSub: function (icao, city) { return icao ? icao + (city ? " · " + city : "") + " ilan panosu" : "İlan panosu seni bekliyor"; },
			tileNeedAircraft: "Uçağını seç",
			tileReady: "Uçuşu başlatmaya hazır",
			tileFlying: "Modstead takip ediyor",
			tileOffMain: "Modstead'i aç",
			tileOffSub: "Kutu kendiliğinden bağlanır",
			tileConnMain: "Bağlanıyor…",
			tabs: { active: "Aktif iş", board: "İş ilanları", pick: "Uçak seçimi", pilot: "Pilot" },
			keys: { close: "Kapat", back: "Geri", select: "Seç", tabs: "Sekme değiştir" },
			level: function (n) { return "Seviye " + n; },
			link: { connected: "Sim bağlı", connecting: "Simle bağlanıyor", waiting: "Sim bekleniyor" },
			balance: "Bakiye",
			pay: "Ücret",
			revenue: "Gelir",
			distance: "Mesafe",
			block: "Blok süresi",
			payload: "Yük",
			fuel: "Önerilen yakıt",
			cruise: "Seyir irtifası",
			client: "Müşteri",
			deadline: "Son teslim",
			cls: "Uçak sınıfı",
			left: function (s) { return s + " kaldı"; },
			overdue: "Süre doldu",
			pax: function (n) { return n + " yolcu"; },
			kg: function (s) { return s + " kg"; },
			within: function (h) { return h >= 24 ? Math.round(h / 24) + " gün içinde" : h + " saat içinde"; },
			xp: function (n) { return "~" + n + " XP"; },
			stepAircraft: "Uçak",
			stepStart: "Başlangıç",
			stepStatus: "Durum",
			choose: "Uçak seç",
			change: "Değiştir",
			noAircraft: "Henüz uçak seçilmedi",
			noAircraftBody: "Lisansın olan ve yükü taşıyabilen her uçakla uçabilirsin.",
			defaultLivery: "Varsayılan boya",
			atParking: "Park yerinde",
			atParkingHint: "Soğuk; motorları sen çalıştırırsın",
			atRunway: "Pist başında",
			atRunwayHint: "Motorlar çalışır, kalkışa hazır",
			runwayEnd: "Pist",
			autoEnd: "Otomatik",
			start: "Uçuşu başlat",
			restart: "Yeniden dene",
			prepareAgain: "Yeniden hazırla",
			preparing: "Hazırlanıyor…",
			working: "Gönderiliyor…",
			startHint: "Uçuş simin kendi akışıyla yüklenir: uçak, park yeri ya da pist, yük ve yakıt hazır gelir.",
			needAircraftHint: "Uçuşu başlatmak için önce uçağını seç.",
			simNotLinked: "Modstead simle henüz bağlantı kurmadı; birkaç saniye bekle.",
			cancel: "İşi bırak",
			cancelConfirm: "İşi bırakmak istiyor musun?",
			cancelBody: "Henüz uçulmadığı için para cezası yok; itibarın 1 puan düşer (eğitim ve sınav uçuşları hariç).",
			keep: "Vazgeç",
			stage: {
				accepted: "Uçağını seç ve uçuşu başlat",
				launching: "Modstead uçuşu hazırlıyor",
				ready: "Hazır: motorları çalıştır",
				flying: "Uçuşta",
				interrupted: "Bağlantı koptu: sim aynı yerde açılınca sürer"
			},
			flyingBody: "Uçuş sürüyor ve Modstead takip ediyor. Uçuşu simdeki Modstead panelinden ya da Modstead'den izleyebilirsin.",
			launch: {
				waiting_sim: "Sim açılıyor",
				fetching_airport: "Park yerleri",
				loading: "Uçuş yükleniyor",
				positioning: "Konum ve yük",
				done: "Hazır",
				manual: "Elle başlat"
			},
			manual: "Elle başlatma gerekiyor",
			kinds: {
				training: "Eğitim uçuşu",
				cargo: "Kargo",
				passenger: "Yolcu",
				charter: "Charter",
				ferry: "Uçak teslimi",
				bush: "Arazi uçuşu",
				medical: "Ambulans",
				airline: "Tarifeli sefer",
				checkride: "Sınav uçuşu"
			},
			cargo: {
				spare_parts: "Yedek parça", mail: "Posta", medical_supplies: "Tıbbi malzeme", electronics: "Elektronik",
				food: "Gıda", machinery: "Makine parçası", documents: "Evrak", flowers: "Çiçek", luggage: "Bagaj",
				tools: "Alet edevat", camp_supplies: "Kamp malzemesi", fuel_drums: "Yakıt varilleri", survey_team: "Ölçüm ekibi",
				fishing_party: "Balıkçı grubu", business_team: "İş ekibi", family: "Aile", film_crew: "Çekim ekibi",
				sports_team: "Spor takımı", vip: "VIP yolcu", tourists: "Turist grubu", commuters: "İş yolcuları",
				students: "Öğrenci grubu", workers: "Saha ekibi", patient_transfer: "Hasta nakli", organ: "Organ nakli",
				medical_team: "Sağlık ekibi", aircraft_delivery: "Uçağı teslim et", training_flight: "Eğitmenle uçuş",
				examiner: "Denetçiyle sınav"
			},
			mode: { employee: "Operatör adına", contract: "Kendi hesabına" },
			modeHint: {
				employee: "Uçak, yakıt ve harçlar operatörün; sen saatlik ücret alırsın.",
				contract: "İşi doğrudan sen alırsın: kira (ya da bakım), yakıt ve iniş harcı senden. Verimli uçarsan daha çok kazanırsın."
			},
			board: {
				subtitle: function (icao, city) { return (icao ? icao + (city ? " · " + city : "") + " · " : "") + "ilanlar 4 saatte bir yenilenir"; },
				refresh: "Yenile",
				loading: "İlanlar yükleniyor…",
				empty: "Şu an ilan yok",
				emptyBody: "Daha büyük bir havalimanına geç ya da yeni lisanslar al: ilan çeşidi artar.",
				urgent: "Acil",
				accept: "İşi al",
				busy: "Önce aktif işini bitir",
				profit: "Tahmini kâr",
				rent: "Kira",
				fuelCost: "Yakıt",
				fees: "İniş harcı"
			},
			pick: {
				subtitle: function (cls) { return "İş: " + cls + ". Lisansın olan ve yükü taşıyabilen her uçakla uçabilirsin."; },
				loading: "Simdeki uçaklar yükleniyor…",
				none: "Uçak listesi boş. Modstead simdeki uçakları SimConnect'ten öğrenir; liste birkaç saniye içinde dolar.",
				fits: "Bu işin sınıfında",
				others: "Diğer uçaklar",
				variants: function (n) { return n + " sürüm"; },
				liveries: function (n) { return n + " boya"; },
				notFlyable: "Lisansın yok",
				variant: "Sürüm",
				livery: "Boya",
				use: "Bu uçakla uç",
				unknownClass: "Sınıfı bilinmiyor",
				current: "Seçili uçak",
				chooseHint: "Soldan bir uçak seç."
			},
			toastTitle: "Modstead uçuşu hazırlıyor",
			toastSent: "Uçuş isteği gönderildi.",
			failed: "İşlem yapılamadı: Modstead yanıt vermedi.",
			xpOf: function (cur, next) { return cur + " / " + next + " XP"; },
			strip: {
				dep: "Kalkış",
				arr: "Varış",
				runway: function (r, ft) { return "Pist " + r + " · " + ft + " ft"; },
				elev: function (ft) { return "Rakım " + ft + " ft"; },
				surface: { paved: "Asfalt", unpaved: "Toprak", water: "Su" },
				lighted: "Işıklı",
				air: function (s) { return "havada " + s; }
			},
			xpLabel: "Deneyim",
			xpNext: function (n) { return "Sonraki seviyeye " + n + " XP"; },
			prep: {
				title: "Hazırlık",
				aircraft: "Uçak",
				start: "Başlangıç",
				link: "Sim bağlantısı",
				load: "Yük ve yakıt",
				plan: "Uçuş planı",
				noAircraft: "Seçilmedi",
				parking: "Park yerinde, motorlar kapalı",
				runway: function (end) { return end ? "Pist " + end + ", motorlar çalışır" : "Pist başında, motorlar çalışır"; },
				loadAuto: function (s) { return s + " · Modstead yükler"; },
				planAuto: function (a, b) { return a + " – " + b + " · simin GPS'ine"; },
				linkOk: "Sim bağlı",
				linkWait: "Bekleniyor"
			},
			checks: {
				connected: "Sim bağlı", in_flight: "Simde uçuş açık", at_departure: "Kalkış havalimanında", aircraft: "Uçak uygun",
				slew: "Slew kapalı", fuel: "Yakıt yeterli", payload: "Yük yüklendi"
			},
			flight: {
				title: "Uçuş",
				flown: "Uçulan",
				remaining: "Kalan",
				score: "Anlık puan",
				elapsed: "Geçen süre",
				lastKnown: "Son bilinen durum"
			},
			phases: {
				preflight: "Hazırlık", taxi_out: "Taksi", takeoff: "Kalkış", climb: "Tırmanış", cruise: "Seyir",
				descent: "Alçalma", approach: "Yaklaşma", rollout: "İniş koşusu", taxi_in: "Parka taksi", parked: "Park"
			},
			pilotTab: {
				summary: "Kariyer özeti",
				flights: "Uçuş",
				hours: "Uçuş saati",
				distance: "Mesafe",
				landings: "İniş",
				butter: function (n) { return n + " pamuk iniş"; },
				best: "En iyi iniş",
				earned: "Kazanılan",
				spent: function (s) { return "Harcanan " + s; },
				jobs: "Tamamlanan iş",
				failed: function (n) { return n + " başarısız"; },
				reputation: "İtibar",
				rating: "Pilot puanı",
				noRating: "Henüz yok",
				difficulty: { easy: "Kolay", normal: "Normal", realistic: "Gerçekçi" },
				loan: function (s) { return "Borç " + s; },
				noLoan: "Borç yok",
				since: function (s) { return s + " tarihinden beri"; },
				licences: "Lisanslar",
				held: "Sende",
				ready: "Sınava hazır",
				needs: function (lv, h) { return "Seviye " + lv + " · " + h + " sa"; },
				recent: "Son uçuşlar",
				points: function (n) { return n + " puan"; },
				arrivedAt: function (icao) { return icao + " meydanına inildi"; },
				noFlights: "Henüz uçuş yok. İlk uçuşun seyir defterinin ilk sayfası olacak.",
				results: {
					completed: "Tamamlandı", late: "Geç teslim", diverted: "Başka yere inildi", failed: "Başarısız",
					crashed: "Kaza", invalid: "Geçersiz", abandoned: "Yarıda bırakıldı"
				},
				landing: { butter: "Pamuk gibi", smooth: "Yumuşak", good: "İyi", firm: "Sert", hard: "Çok sert", very_hard: "Hasarlı" }
			},
			months: ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"],
			min: "dk",
			h: "sa",
			d: "g",
			dec: ",",
			thousands: ".",
			days: ["Paz", "Pzt", "Sal", "Çar", "Per", "Cum", "Cmt"]
		},
		en: {
			tileTitle: "Modstead Career",
			category: "Modstead",
			title: "Career",
			connecting: "Connecting to Modstead",
			connectingSub: "This can take a few seconds",
			offline: "Modstead not connected",
			offlineSub: "Open Modstead; the tile connects by itself",
			offlineBody: "Career data comes from the Modstead app on this PC. Open Modstead and this window connects by itself.",
			retry: "Try again",
			noCareer: "No career yet",
			noCareerSub: "Create your pilot in Modstead",
			noCareerBody: "Create your pilot in Modstead under MSFS, Career. Your job board and flights show up here.",
			eyebrowActive: "Active job",
			eyebrowIdle: "Job board",
			eyebrowFlying: "In flight",
			idleMain: "Pick a job",
			idleSub: function (icao, city) { return icao ? icao + (city ? " · " + city : "") + " job board" : "Your job board is waiting"; },
			tileNeedAircraft: "Choose your aircraft",
			tileReady: "Ready to start the flight",
			tileFlying: "Tracked by Modstead",
			tileOffMain: "Open Modstead",
			tileOffSub: "The tile connects by itself",
			tileConnMain: "Connecting…",
			tabs: { active: "Active job", board: "Job board", pick: "Aircraft", pilot: "Pilot" },
			keys: { close: "Close", back: "Back", select: "Select", tabs: "Switch tab" },
			level: function (n) { return "Level " + n; },
			link: { connected: "Sim connected", connecting: "Connecting to the sim", waiting: "Waiting for the sim" },
			balance: "Balance",
			pay: "Pay",
			revenue: "Revenue",
			distance: "Distance",
			block: "Block time",
			payload: "Payload",
			fuel: "Suggested fuel",
			cruise: "Cruise altitude",
			client: "Client",
			deadline: "Due",
			cls: "Aircraft class",
			left: function (s) { return s + " left"; },
			overdue: "Overdue",
			pax: function (n) { return n + " pax"; },
			kg: function (s) { return s + " kg"; },
			within: function (h) { return h >= 24 ? "within " + Math.round(h / 24) + " d" : "within " + h + " h"; },
			xp: function (n) { return "~" + n + " XP"; },
			stepAircraft: "Aircraft",
			stepStart: "Start",
			stepStatus: "Status",
			choose: "Choose aircraft",
			change: "Change",
			noAircraft: "No aircraft chosen yet",
			noAircraftBody: "Any aircraft you are licensed for that can carry the load will do.",
			defaultLivery: "Default livery",
			atParking: "At the parking spot",
			atParkingHint: "Cold; you start the engines",
			atRunway: "On the runway",
			atRunwayHint: "Engines running, ready for takeoff",
			runwayEnd: "Runway",
			autoEnd: "Automatic",
			start: "Start flight",
			restart: "Try again",
			prepareAgain: "Prepare again",
			preparing: "Preparing…",
			working: "Sending…",
			startHint: "The flight loads through the sim's own flow: aircraft, parking spot or runway, payload and fuel come ready.",
			needAircraftHint: "Choose your aircraft before starting the flight.",
			simNotLinked: "Modstead is not linked to the sim yet; give it a few seconds.",
			cancel: "Drop job",
			cancelConfirm: "Drop this job?",
			cancelBody: "No fine since you have not flown yet; reputation drops by 1 (not for training and checkrides).",
			keep: "Keep it",
			stage: {
				accepted: "Choose your aircraft and start the flight",
				launching: "Modstead is preparing the flight",
				ready: "Ready: start your engines",
				flying: "In flight",
				interrupted: "Connection lost: resumes when the sim reopens at the same place"
			},
			flyingBody: "The flight is under way and Modstead is tracking it. Follow it on the Modstead panel in the sim or in Modstead.",
			launch: {
				waiting_sim: "Starting the sim",
				fetching_airport: "Parking spots",
				loading: "Loading flight",
				positioning: "Position & payload",
				done: "Ready",
				manual: "Start manually"
			},
			manual: "Manual start needed",
			kinds: {
				training: "Training flight",
				cargo: "Cargo",
				passenger: "Passengers",
				charter: "Charter",
				ferry: "Aircraft ferry",
				bush: "Bush flight",
				medical: "Air ambulance",
				airline: "Scheduled flight",
				checkride: "Checkride"
			},
			cargo: {
				spare_parts: "Spare parts", mail: "Mail", medical_supplies: "Medical supplies", electronics: "Electronics",
				food: "Food", machinery: "Machinery parts", documents: "Documents", flowers: "Flowers", luggage: "Luggage",
				tools: "Tools", camp_supplies: "Camp supplies", fuel_drums: "Fuel drums", survey_team: "Survey team",
				fishing_party: "Fishing party", business_team: "Business team", family: "Family", film_crew: "Film crew",
				sports_team: "Sports team", vip: "VIP passengers", tourists: "Tour group", commuters: "Commuters",
				students: "Student group", workers: "Field crew", patient_transfer: "Patient transfer", organ: "Organ transport",
				medical_team: "Medical team", aircraft_delivery: "Deliver the aircraft", training_flight: "Flight with instructor",
				examiner: "Exam with examiner"
			},
			mode: { employee: "For an operator", contract: "On your own account" },
			modeHint: {
				employee: "The aircraft, fuel and fees are the operator's; you earn an hourly wage.",
				contract: "You take the job directly: rent (or maintenance), fuel and landing fees are yours. Fly efficiently to earn more."
			},
			board: {
				subtitle: function (icao, city) { return (icao ? icao + (city ? " · " + city : "") + " · " : "") + "listings refresh every 4 hours"; },
				refresh: "Refresh",
				loading: "Loading the board…",
				empty: "No listings right now",
				emptyBody: "Move to a bigger airport or earn new licences: the variety grows.",
				urgent: "Urgent",
				accept: "Take the job",
				busy: "Finish your active job first",
				profit: "Est. profit",
				rent: "Rent",
				fuelCost: "Fuel",
				fees: "Landing fee"
			},
			pick: {
				subtitle: function (cls) { return "Job: " + cls + ". Any aircraft you are licensed for that can carry the load will do."; },
				loading: "Loading the sim's aircraft…",
				none: "The aircraft list is empty. Modstead learns the sim's aircraft through SimConnect; the list fills in a few seconds.",
				fits: "In this job's class",
				others: "Other aircraft",
				variants: function (n) { return n + (n === 1 ? " variant" : " variants"); },
				liveries: function (n) { return n + (n === 1 ? " livery" : " liveries"); },
				notFlyable: "Not licensed",
				variant: "Variant",
				livery: "Livery",
				use: "Fly this aircraft",
				unknownClass: "Class unknown",
				current: "Current aircraft",
				chooseHint: "Pick an aircraft on the left."
			},
			toastTitle: "Modstead is preparing the flight",
			toastSent: "Flight request sent.",
			failed: "That did not work: Modstead did not answer.",
			xpOf: function (cur, next) { return cur + " / " + next + " XP"; },
			strip: {
				dep: "Departure",
				arr: "Arrival",
				runway: function (r, ft) { return "Runway " + r + " · " + ft + " ft"; },
				elev: function (ft) { return "Elevation " + ft + " ft"; },
				surface: { paved: "Paved", unpaved: "Unpaved", water: "Water" },
				lighted: "Lighted",
				air: function (s) { return s + " airborne"; }
			},
			xpLabel: "Experience",
			xpNext: function (n) { return n + " XP to next level"; },
			prep: {
				title: "Preparation",
				aircraft: "Aircraft",
				start: "Start",
				link: "Sim link",
				load: "Payload & fuel",
				plan: "Flight plan",
				noAircraft: "Not chosen",
				parking: "At the parking spot, engines off",
				runway: function (end) { return end ? "Runway " + end + ", engines running" : "On the runway, engines running"; },
				loadAuto: function (s) { return s + " · loaded by Modstead"; },
				planAuto: function (a, b) { return a + " – " + b + " · into the sim's GPS"; },
				linkOk: "Sim connected",
				linkWait: "Waiting"
			},
			checks: {
				connected: "Sim connected", in_flight: "Flight open in the sim", at_departure: "At the departure airport", aircraft: "Aircraft suitable",
				slew: "Slew off", fuel: "Enough fuel", payload: "Payload loaded"
			},
			flight: {
				title: "Flight",
				flown: "Flown",
				remaining: "Remaining",
				score: "Current score",
				elapsed: "Elapsed",
				lastKnown: "Last known state"
			},
			phases: {
				preflight: "Preflight", taxi_out: "Taxi", takeoff: "Takeoff", climb: "Climb", cruise: "Cruise",
				descent: "Descent", approach: "Approach", rollout: "Rollout", taxi_in: "Taxi in", parked: "Parked"
			},
			pilotTab: {
				summary: "Career summary",
				flights: "Flights",
				hours: "Flight hours",
				distance: "Distance",
				landings: "Landings",
				butter: function (n) { return n + " butter"; },
				best: "Best landing",
				earned: "Earned",
				spent: function (s) { return "Spent " + s; },
				jobs: "Jobs done",
				failed: function (n) { return n + " failed"; },
				reputation: "Reputation",
				rating: "Pilot rating",
				noRating: "None yet",
				difficulty: { easy: "Easy", normal: "Normal", realistic: "Realistic" },
				loan: function (s) { return "Loan " + s; },
				noLoan: "No loan",
				since: function (s) { return "Since " + s; },
				licences: "Licences",
				held: "Held",
				ready: "Ready for checkride",
				needs: function (lv, h) { return "Level " + lv + " · " + h + " h"; },
				recent: "Recent flights",
				points: function (n) { return n + " pts"; },
				arrivedAt: function (icao) { return "landed at " + icao; },
				noFlights: "No flights yet. Your first flight will be the first page of your logbook.",
				results: {
					completed: "Completed", late: "Late", diverted: "Diverted", failed: "Failed",
					crashed: "Crashed", invalid: "Invalid", abandoned: "Abandoned"
				},
				landing: { butter: "Butter", smooth: "Smooth", good: "Good", firm: "Firm", hard: "Hard", very_hard: "Damaging" }
			},
			months: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
			min: "min",
			h: "h",
			d: "d",
			dec: ".",
			thousands: ",",
			days: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
		}
	};

	// --- Simgeler (24×24, dolgu) ----------------------------------------------------------------------------------

	var ICONS = {
		close: "M5.6 4.2L12 10.6l6.4-6.4 1.4 1.4-6.4 6.4 6.4 6.4-1.4 1.4-6.4-6.4-6.4 6.4-1.4-1.4 6.4-6.4-6.4-6.4z",
		arrow: "M3 11h13.2l-4.6-4.6L13 5l7 7-7 7-1.4-1.4 4.6-4.6H3z",
		title: "M4 3l17 9-17 9 4.5-9z",
		pin: "M12 2a7 7 0 0 0-7 7c0 5.2 7 13 7 13s7-7.8 7-13a7 7 0 0 0-7-7zm0 4.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5z",
		plane: "M12 1.5c.9 0 1.4.9 1.4 2V9l8.1 4.2v2.1l-8.1-2.3v5.2l2.3 1.7v1.7L12 20.6l-3.7 1v-1.7l2.3-1.7V13l-8.1 2.3v-2.1L10.6 9V3.5c0-1.1.5-2 1.4-2z",
		parking: "M3 3h18v18H3zM5 5v14h14V5zM9 7h4.2a3.4 3.4 0 0 1 0 6.8H11V17H9zm2 2v2.8h2.2a1.4 1.4 0 0 0 0-2.8z",
		runway: "M3 19h18v2H3zM3 15.5l1.6-.5 2.2 1.3 12.6-4.6c1-.4 1.6-1.2 1.3-2s-1.4-1-2.4-.6l-4 1.5-6.4-4.3-1.8.7 3.9 5.2-3.8 1.4-2.3-1.2-1.3.5z",
		play: "M7 4l13 8-13 8z",
		check: "M9.5 16.2l-4.7-4.7-1.4 1.4 6.1 6.1L21 7.5l-1.4-1.4z",
		back: "M15.4 5.4L14 4l-8 8 8 8 1.4-1.4L8.8 12z",
		refresh: "M12 4a8 8 0 1 0 7.7 10h-2.1A6 6 0 1 1 12 6c1.7 0 3.1.7 4.2 1.8L13 11h7V4l-2.4 2.4A8 8 0 0 0 12 4z",
		clock: "M12 2a10 10 0 1 1 0 20 10 10 0 0 1 0-20zm0 2a8 8 0 1 0 0 16 8 8 0 0 0 0-16zm-1 3h2v5.4l3.8 2.3-1 1.7L11 13.6z",
		box: "M12 2.8l9 4v10.4l-9 4-9-4V6.8zM5 8.4v7.5l6 2.7v-7.5zm8 2.7v7.5l6-2.7V8.4zm-1-6.1L6.3 7.5 12 10l5.7-2.5z",
		users: "M9 4a3.5 3.5 0 1 1 0 7 3.5 3.5 0 0 1 0-7zM2 20c0-3.9 3.1-6.5 7-6.5s7 2.6 7 6.5zM15.6 4.3a3.4 3.4 0 0 1 0 6.4 5.2 5.2 0 0 0 0-6.4zM17.4 13.8c2.7.6 4.6 2.9 4.6 6.2h-4.4c0-2.5-.5-4.5-2-6z",
		cross: "M9 3h6v6h6v6h-6v6H9v-6H3V9h6z",
		mountain: "M2 20l7.2-11.5 4.3 6.6 2.7-3.9L22 20z",
		star: "M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6-4.9-4.6 6.6-.8z",
		cap: "M12 4L1 9.5l11 5.5 9-4.5V16h2V9.5zM5 13.2V17c0 1.7 3.1 3 7 3s7-1.3 7-3v-3.8l-7 3.5z",
		badge: "M12 2l8 3v6c0 5-3.4 9.3-8 11-4.6-1.7-8-6-8-11V5zm-1.2 13.6l5.7-5.7-1.4-1.4-4.3 4.3-2.1-2.1-1.4 1.4z",
		warn: "M12 3L1.5 21h21zm-1 6h2v6h-2zm0 8h2v2h-2z",
		ok: "M12 2a10 10 0 1 1 0 20 10 10 0 0 1 0-20zm-1.6 13.6l6.2-6.2-1.4-1.4-4.8 4.8-2.2-2.2-1.4 1.4z",
		todo: "M12 2a10 10 0 1 1 0 20 10 10 0 0 1 0-20zm0 2a8 8 0 1 0 0 16 8 8 0 0 0 0-16z",
		takeoff: "M2.5 19h19v2h-19zM22.1 9.6c-.2-.8-1.1-1.3-1.9-1.1L14.9 10 8 3.6l-1.9.5 4.1 7.2-5 1.3-2-1.5-1.5.4 1.8 3.2.8 1.3 1.6-.4 5.3-1.4 4.3-1.2 5.3-1.4c.8-.3 1.3-1.1 1.1-1.9z",
		landing: "M2.5 19h19v2h-19zM9.8 13.4l4.4 1.2 5.3 1.4c.8.2 1.6-.3 1.8-1.1.2-.8-.3-1.6-1.1-1.8l-5.3-1.4L12.1 2.9l-1.9-.5v8.3L5.2 9.4l-.9-2.3-1.5-.4v5.2l1.6.4z",
		user: "M12 3a4.5 4.5 0 1 1 0 9 4.5 4.5 0 0 1 0-9zM3 21c0-4.4 4-7.5 9-7.5s9 3.1 9 7.5z",
		card: "M2 5h20v14H2zm2 2v10h16V7zm2 2h5v5H6zm7 0h5v1.6h-5zm0 3.2h5v1.6h-5z"
	};

	var KIND_ICON = {
		training: "cap", cargo: "box", passenger: "users", charter: "star", ferry: "plane",
		bush: "mountain", medical: "cross", airline: "plane", checkride: "badge"
	};

	var LAUNCH_STEPS = ["waiting_sim", "fetching_airport", "loading", "positioning", "done"];

	// --- Durum ----------------------------------------------------------------------------------------------------

	var S = {
		dead: false,
		lang: "tr",
		k: 0,
		designW: 1920,
		state: null,
		okAt: 0,
		failAt: 0,
		startedAt: Date.now(),
		live: null,
		board: null,
		boardJobs: [],
		aircraft: null,
		groups: [],
		open: false,
		tab: "active",
		jobSel: null,
		pick: null,
		pickJob: null,
		start: null,
		startJob: null,
		busy: null,
		error: "",
		errorAt: 0,
		confirm: null,
		toastUntil: 0,
		toastNote: "",
		homeVisible: false,
		hiddenSince: 0,
		hover: null,
		hoverKey: "",
		hoverByKey: false,
		scroll: {},
		html: {},
		req: { state: 0, live: 0, board: 0, aircraft: 0 },
		inflight: { state: false, live: false, board: false, aircraft: false },
		drag: null,
		revealSel: false,
		raw: {},
		ver: {},
		sig: ""
	};

	var timers = [];
	var listeners = [];
	var xhrs = [];
	var el = {};

	function T() { return TEXT[S.lang] || TEXT.tr; }

	// --- Yardımcılar ----------------------------------------------------------------------------------------------

	function esc(s) {
		return String(s === null || s === undefined ? "" : s).split("&").join("&amp;").split("<").join("&lt;").split(">").join("&gt;").split('"').join("&quot;");
	}

	function has(list, v) {
		if (!list) return false;
		for (var i = 0; i < list.length; i++) if (list[i] === v) return true;
		return false;
	}

	function icon(name, cls) {
		return '<svg class="msm-ico' + (cls ? " " + cls : "") + '" viewBox="0 0 24 24" preserveAspectRatio="xMidYMid meet"><path fill-rule="evenodd" d="' + (ICONS[name] || ICONS.plane) + '"></path></svg>';
	}

	function group(n, sep) {
		var s = String(Math.round(Math.abs(n)));
		var out = "";
		for (var i = 0; i < s.length; i++) {
			if (i > 0 && (s.length - i) % 3 === 0) out += sep;
			out += s.charAt(i);
		}
		return out;
	}

	function num(n, digits) {
		if (typeof n !== "number" || !isFinite(n)) return "—";
		if (digits && Math.abs(n) < 10 && Math.round(n) !== n) return (Math.round(n * 10) / 10).toFixed(1).split(".").join(T().dec);
		return (n < 0 ? "−" : "") + group(n, T().thousands);
	}

	function money(n) {
		if (typeof n !== "number" || !isFinite(n)) return "—";
		return (n < 0 ? "−" : "") + "$" + group(n, T().thousands);
	}

	function signedMoney(n) {
		if (typeof n !== "number" || !isFinite(n)) return "—";
		return (n > 0 ? "+" : "") + money(n);
	}

	function duration(min) {
		var t = T();
		var m = Math.max(0, Math.round(min));
		if (m >= 2880) return Math.floor(m / 1440) + " " + t.d + " " + Math.floor((m % 1440) / 60) + " " + t.h;
		var h = Math.floor(m / 60);
		var r = m % 60;
		if (h === 0) return r + " " + t.min;
		return h + " " + t.h + " " + (r < 10 ? "0" : "") + r + " " + t.min;
	}

	function clockOf(ts) {
		var d = new Date(ts * 1000);
		var hh = d.getHours();
		var mm = d.getMinutes();
		return T().days[d.getDay()] + " " + (hh < 10 ? "0" : "") + hh + ":" + (mm < 10 ? "0" : "") + mm;
	}

	function clsName(id) {
		if (!id) return "—";
		var list = (S.state && S.state.classes) || [];
		for (var i = 0; i < list.length; i++) {
			if (list[i].id === id) return S.lang === "en" ? list[i].nameEn : list[i].nameTr;
		}
		return String(id);
	}

	function payloadText(job) {
		var t = T();
		if (job.pax) return t.pax(job.pax) + (job.cargoKg ? " · " + t.kg(num(job.cargoKg)) : "");
		if (job.cargoKg) return t.kg(num(job.cargoKg));
		return "—";
	}

	function cargoText(job) {
		return T().cargo[job.cargo] || job.cargo || "";
	}

	function abs(url) {
		if (!url) return "";
		if (url.indexOf("http:") === 0 || url.indexOf("https:") === 0 || url.indexOf("coui:") === 0) return url;
		return BASE + url;
	}

	function bgStyle(url) {
		return url ? ' style="background-image: url(' + "'" + esc(url) + "'" + ');"' : "";
	}

	function routeHtml(from, to, cls) {
		return '<div class="msm-route' + (cls ? " " + cls : "") + '"><span class="msm-route-a">' + esc(from) + "</span>" + icon("arrow", "msm-route-arrow") + '<span class="msm-route-b">' + esc(to) + "</span></div>";
	}

	function closest(node, stop, test) {
		for (var n = node; n && n !== stop && n.nodeType === 1; n = n.parentNode) {
			if (test(n)) return n;
		}
		return null;
	}

	function hasClass(n, c) {
		return !!(n && n.classList && n.classList.contains(c));
	}

	function on(target, type, fn, capture) {
		target.addEventListener(type, fn, !!capture);
		listeners.push([target, type, fn, !!capture]);
	}

	function every(ms, fn) {
		timers.push(setInterval(function () {
			if (S.dead) return;
			try { fn(); } catch (e) {}
		}, ms));
	}

	function later(ms, fn) {
		timers.push(setTimeout(function () {
			if (S.dead) return;
			try { fn(); } catch (e) {}
		}, ms));
	}

	// Simin ses olayları (simin SoundManager'ı ile aynı adlar: UI_<küme>_SELECT / _VALID / _INVALID).
	function sound(set, what) {
		try {
			if (window.engine && typeof window.engine.call === "function") {
				var p = window.engine.call("PLAY_SOUND", "UI_" + set + "_" + what);
				if (p && typeof p.then === "function") p.then(null, function () {});
			}
		} catch (e) {}
	}

	// --- Dil ------------------------------------------------------------------------------------------------------

	// Simin dili: simin kendi çeviri tablosundan bilinen bir sözcüğe bakılır (navigator.language simde hep en-us).
	function detectLang() {
		if (CFG.lang === "tr" || CFG.lang === "en") return CFG.lang;
		try {
			var L = window.top && window.top.g_localization;
			if (L && typeof L.Translate === "function") {
				var w = String(L.Translate("TT:GENERIC.CLOSE") || "");
				if (w === "Kapat") return "tr";
				if (w && w.indexOf("GENERIC.") < 0) return "en";
			}
		} catch (e) {}
		var n = String(navigator.language || "").toLowerCase();
		return n.indexOf("tr") === 0 ? "tr" : "en";
	}

	// --- Ağ -------------------------------------------------------------------------------------------------------

	function request(method, path, body, timeoutMs, done) {
		var x = new XMLHttpRequest();
		var over = false;
		var timer = null;
		var finish = function (err, data, text) {
			if (over) return;
			over = true;
			if (timer) clearTimeout(timer);
			for (var i = 0; i < xhrs.length; i++) if (xhrs[i] === x) { xhrs.splice(i, 1); break; }
			if (S.dead) return;
			try { done(err, data, text || ""); } catch (e) {}
		};
		timer = setTimeout(function () {
			try { x.abort(); } catch (e) {}
			finish({ status: 0, message: "" }, null);
		}, timeoutMs);
		x.onreadystatechange = function () {
			if (x.readyState !== 4) return;
			var data = null;
			try { data = x.responseText ? JSON.parse(x.responseText) : null; } catch (e) { data = null; }
			if (x.status >= 200 && x.status < 300) finish(null, data, x.responseText);
			else finish({ status: x.status, message: data && data.error ? String(data.error) : "" }, null);
		};
		try {
			x.open(method, BASE + path, true);
			if (body !== null) x.setRequestHeader("Content-Type", "application/json");
			xhrs.push(x);
			x.send(body !== null ? JSON.stringify(body) : null);
		} catch (e) {
			finish({ status: 0, message: "" }, null);
		}
	}

	// Yanıt öncekiyle aynıysa false; değiştiyse sürümü artırır.
	function changedRaw(name, text) {
		if (S.raw[name] === text && text) return false;
		S.raw[name] = text;
		S.ver[name] = (S.ver[name] || 0) + 1;
		return true;
	}

	function fetchState() {
		if (S.inflight.state) return;
		S.inflight.state = true;
		S.req.state = Date.now();
		request("GET", "/api/state", null, 4000, function (err, data, text) {
			S.inflight.state = false;
			if (err || !data) {
				S.failAt = Date.now();
			} else {
				S.okAt = Date.now();
				if (!changedRaw("state", text)) {
					renderAll();
					return;
				}
				S.state = data;
				syncSelections();
				if (S.aircraft === null && !S.inflight.aircraft && Date.now() - S.req.aircraft > 30000) fetchAircraft();
			}
			renderAll();
		});
	}

	function fetchLive() {
		if (S.inflight.live) return;
		S.inflight.live = true;
		S.req.live = Date.now();
		request("GET", "/api/live", null, 3000, function (err, data, text) {
			S.inflight.live = false;
			if (!err && data && changedRaw("live", text)) S.live = data;
			renderAll();
		});
	}

	function fetchBoard() {
		if (S.inflight.board) return;
		S.inflight.board = true;
		S.req.board = Date.now();
		request("GET", "/api/board", null, 6000, function (err, data, text) {
			S.inflight.board = false;
			if (!err && data && changedRaw("board", text)) {
				S.board = data;
				S.boardJobs = data && data.length !== undefined ? data : (data.jobs || []);
			}
			renderAll();
		});
	}

	function fetchAircraft() {
		if (S.inflight.aircraft) return;
		S.inflight.aircraft = true;
		S.req.aircraft = Date.now();
		request("GET", "/api/aircraft", null, 8000, function (err, data, text) {
			S.inflight.aircraft = false;
			if (!err && data && data.length !== undefined && changedRaw("aircraft", text)) S.aircraft = data;
			renderAll();
		});
	}

	function post(name, path, body, ok) {
		if (S.busy) return;
		S.busy = name;
		S.error = "";
		renderAll();
		request("POST", path, body, 15000, function (err) {
			S.busy = null;
			if (err) {
				S.error = err.message || T().failed;
				S.errorAt = Date.now();
				sound("genericbutton", "INVALID");
			} else if (ok) {
				ok();
			}
			fetchState();
			renderAll();
		});
	}

	// Durum değişince seçimleri işe göre tazeler (başka iş gelince eski seçimler kalmasın).
	function syncSelections() {
		var a = S.state && S.state.active;
		var id = a && a.job ? a.job.id : null;
		if (S.startJob !== id) {
			S.startJob = id;
			S.start = a && a.start ? { runway: !!a.start.runway, end: a.start.end || null } : { runway: false, end: null };
		}
		if (S.pickJob !== id) {
			S.pickJob = id;
			S.pick = a && a.aircraft ? { title: a.aircraft.title, livery: a.aircraft.livery || "" } : null;
		}
		if (!a && (S.tab === "active" || S.tab === "pick") && !S.busy) S.tab = "board";
		if (a && S.tab === "pick" && (a.stage === "flying" || a.stage === "interrupted")) S.tab = "active";
	}

	// --- Bağlantı durumu ------------------------------------------------------------------------------------------

	// "online": son yanıt yeni; "offline": son istekler başarısız; "connecting": ilk yanıt bekleniyor.
	function linkMode() {
		var now = Date.now();
		if (S.okAt && S.okAt >= S.failAt) return "online";
		if (S.okAt && now - S.okAt < 9000) return "online";
		if (!S.okAt && now - S.startedAt < 6000) return "connecting";
		return "offline";
	}

	function photoFor(title) {
		if (!title || !S.aircraft) return "";
		for (var i = 0; i < S.aircraft.length; i++) {
			var a = S.aircraft[i];
			if (a && a.title === title && a.photo) return abs(a.photo);
		}
		return "";
	}

	function defaultPhoto() {
		var p = S.state && S.state.pilot;
		var lic = (p && p.licenses) || [];
		var id = has(lic, "wide") ? "b787" : has(lic, "narrow") ? "a320" : has(lic, "jet") ? "cj4" : has(lic, "cpl") ? "c208" : "c172";
		return BASE + "/api/photo/" + id + ".jpg";
	}

	function tilePhoto() {
		var st = S.state;
		if (!st) return defaultPhoto();
		if (st.active && st.active.aircraft) {
			var p = photoFor(st.active.aircraft.title);
			if (p) return p;
		}
		if (st.recent && st.recent.length && st.recent[0].aircraft) {
			var r = photoFor(st.recent[0].aircraft.title);
			if (r) return r;
		}
		return defaultPhoto();
	}

	// --- Kök ve kutu ----------------------------------------------------------------------------------------------

	function build() {
		var root = document.createElement("div");
		root.id = "msm-root";
		root.className = "msm-root";
		root.innerHTML =
			// Simin menüsünde mousedown/mouseup/click yalnızca data-input-group'u olan öğelere (ve içindekilere)
			// ulaşır; yoksa yalnızca üstüne gelme gelir ve tıklama simin motoruna gider. Kutu simin düğmeleri gibi
			// generic-button, pencere simin panelleri gibi inputLocker (tıklama ve tekerlek alttaki menüye gitmesin).
			'<div id="msm-tile" class="msm-tile" data-tile="1" data-input-group="generic-button">' +
				'<div class="msm-tile-mask">' +
					'<div class="msm-tile-bg" id="msm-tile-bg"></div>' +
					'<div class="msm-tile-grad"></div>' +
					'<div class="msm-wedge-top"><svg class="msm-wedge-svg" viewBox="0 0 100 100" preserveAspectRatio="none"><path d="M0 0H100L0 100Z"></path></svg></div>' +
					'<div class="msm-wedge-bottom-wrap"><div class="msm-wedge-bottom"><svg class="msm-wedge-svg" viewBox="0 0 100 100" preserveAspectRatio="none"><path d="M100 0V100H0Z"></path></svg></div></div>' +
					'<div class="msm-fx"></div>' +
				"</div>" +
				'<div class="msm-tile-title" id="msm-tile-title"></div>' +
				'<div class="msm-tile-banner">' +
					'<div class="msm-tile-eyebrow"><div class="msm-sq" id="msm-tile-dot"></div><span id="msm-tile-eyebrow"></span></div>' +
					'<div class="msm-tile-main" id="msm-tile-main"></div>' +
					'<div class="msm-tile-sub" id="msm-tile-sub"></div>' +
				"</div>" +
			"</div>" +
			'<div id="msm-toast" class="msm-toast"></div>' +
			'<div id="msm-page" class="msm-page" data-input-group="inputLocker">' +
				'<div class="msm-page-bg"></div>' +
				'<div class="msm-page-grad"></div>' +
				'<div class="msm-head" id="msm-head"></div>' +
				'<div class="msm-tabs" id="msm-tabs"></div>' +
				'<div class="msm-body" id="msm-body"></div>' +
				'<div class="msm-foot" id="msm-foot"></div>' +
				'<div class="msm-modal" id="msm-modal"></div>' +
			"</div>";
		document.body.appendChild(root);
		el.root = root;
		var ids = ["tile", "tile-bg", "tile-title", "tile-dot", "tile-eyebrow", "tile-main", "tile-sub", "toast", "page", "head", "tabs", "body", "foot", "modal"];
		for (var i = 0; i < ids.length; i++) el[ids[i]] = document.getElementById("msm-" + ids[i]);
	}

	var simCache = {};
	function simElement(name) {
		var c = simCache[name];
		if (c && document.documentElement.contains(c)) return c;
		simCache[name] = null;
		var list = document.getElementsByTagName("ui-resource-element");
		for (var i = 0; i < list.length; i++) {
			if (list[i].getAttribute("name") === name) {
				simCache[name] = list[i];
				return list[i];
			}
		}
		return null;
	}

	// Simin öğesinin ekrandaki gerçek görünürlüğü: kendisi ve üstleri boyunca opaklık çarpımı.
	function chainOpacity(node) {
		var o = 1;
		for (var n = node; n && n.nodeType === 1 && n !== document.documentElement; n = n.parentNode) {
			var cs = window.getComputedStyle(n);
			if (!cs) continue;
			if (cs.display === "none" || cs.visibility === "hidden") return 0;
			var v = parseFloat(cs.opacity);
			if (!isNaN(v)) o *= v;
			if (o < 0.02) return 0;
		}
		return o;
	}

	function shown(node) {
		if (!node) return false;
		var r = node.getBoundingClientRect();
		return r.width > 4 && r.height > 4 && chainOpacity(node) > 0.05;
	}

	// Simin bir açılır penceresi ya da alt sayfası ana menünün üstündeyse kutu gizlenir.
	function simCovered() {
		var b = document.body;
		if (b && b.classList && (b.classList.contains("greyed-popup") || b.classList.contains("greyed-notif"))) return true;
		return shown(simElement("BlurPage")) || shown(simElement("TitlePage"));
	}

	function readScale() {
		var h = 0;
		try {
			h = parseFloat(document.documentElement.style.getPropertyValue("--unscaledScreenHeight"));
			if (!(h > 100)) h = parseFloat(window.getComputedStyle(document.documentElement).getPropertyValue("--unscaledScreenHeight"));
		} catch (e) { h = 0; }
		if (!(h > 100)) h = window.innerHeight || 1080;
		return Math.round((h / 1080) * 10000) / 10000;
	}

	var tileBox = { l: -1, t: -1, w: -1, h: -1, o: -1 };
	var layoutTick = -1;

	function overlaps(a, b) {
		return a.l < b.right && a.l + a.w > b.left && a.t < b.bottom && a.t + a.h > b.top;
	}

	// Kutuyu simin "Kariyer" kutusunun sağına, aynı boyda ve aynı aralıkla yerleştirir. Ana menü yeniden çizilse,
	// çözünürlük değişse ya da sayfa geçişi olsa da her adımda yeniden ölçülür.
	function layout() {
		// Ana menü görünmezken (uçuş, başka sayfa) denetim saniyede bire iner.
		layoutTick++;
		if (!S.open && !S.homeVisible && layoutTick % 5 !== 0) return;
		var k = readScale();
		if (k !== S.k) {
			S.k = k;
			el.root.style.setProperty("--k", String(k));
		}
		S.designW = (window.innerWidth || 1920) / (k || 1);

		var career = simElement("Home_TileCareer");
		var vis = 0;
		var r = null;
		if (career) {
			r = career.getBoundingClientRect();
			if (r.width > 4 && r.height > 4) vis = chainOpacity(career);
		}
		if (vis > 0 && simCovered()) vis = 0;
		S.homeVisible = vis > 0.05;

		var tile = el.tile;
		if (vis > 0 && r) {
			var gap = 12 * k;
			var act = simElement("Home_TileRegular_Activities");
			if (act) {
				var ar = act.getBoundingClientRect();
				var g = r.left - ar.right;
				if (ar.width > 4 && g > 0 && g < 40 * k) gap = g;
			}
			var box = { l: Math.round((r.right + gap) * 2) / 2, t: Math.round(r.top * 2) / 2, w: Math.round(r.width * 2) / 2, h: Math.round(r.height * 2) / 2, o: Math.round(vis * 100) / 100 };
			// Ekrana sığmıyorsa ya da simin sağdaki etkinlik kutusuyla çakışıyorsa gösterilmez.
			var ev = simElement("Home_TileEvent");
			if (box.l + box.w > (window.innerWidth || 1920) || (ev && shown(ev) && overlaps(box, ev.getBoundingClientRect()))) box.o = 0;
			if (box.l !== tileBox.l) tile.style.left = box.l + "px";
			if (box.t !== tileBox.t) tile.style.top = box.t + "px";
			if (box.w !== tileBox.w) tile.style.width = box.w + "px";
			if (box.h !== tileBox.h) tile.style.height = box.h + "px";
			if (box.o !== tileBox.o) tile.style.opacity = String(box.o);
			if (box.o > 0 && tileBox.o <= 0) tile.style.display = "block";
			if (box.o <= 0 && tileBox.o > 0) {
				tile.style.display = "none";
				setTileHover(false);
			}
			tileBox = box;
		} else if (tileBox.o !== 0) {
			tile.style.display = "none";
			tileBox.o = 0;
			setTileHover(false);
		}

		// Sim ana menüden çıktıysa (uçuş yükleniyor, başka sayfa) pencere de kapanır.
		if (S.open) {
			var covered = document.body.classList && (document.body.classList.contains("greyed-popup") || document.body.classList.contains("greyed-notif"));
			el.page.style.visibility = covered ? "hidden" : "";
			if (covered && SIM.actions.length) simDetach();
			else if (!covered && !SIM.actions.length && SIM.state === "ok") simAttach();
			if (!career || !r || r.width <= 4) {
				if (!S.hiddenSince) S.hiddenSince = Date.now();
				else if (Date.now() - S.hiddenSince > 800) closePage(true);
			} else {
				S.hiddenSince = 0;
			}
			updateScrollbars();
		}
	}

	var tileHover = false;
	function setTileHover(onOff) {
		if (tileHover === onOff) return;
		tileHover = onOff;
		if (onOff) el.tile.classList.add("is-hover");
		else el.tile.classList.remove("is-hover");
		if (onOff) sound("widgetbutton", "SELECT");
	}

	function renderTile() {
		var t = T();
		var mode = linkMode();
		var st = S.state;
		var eyebrow = "";
		var main = "";
		var mainHtml = "";
		var sub = "";
		var dot = "msm-sq";
		if (mode === "connecting") {
			eyebrow = t.connecting;
			main = t.tileConnMain;
			sub = t.connectingSub;
			dot += " is-wait";
		} else if (mode === "offline") {
			eyebrow = t.offline;
			main = t.tileOffMain;
			sub = t.tileOffSub;
			dot += " is-off";
		} else if (!st || !st.pilot) {
			eyebrow = t.noCareer;
			main = t.idleMain;
			sub = t.noCareerSub;
		} else if (st.active && st.active.job) {
			var a = st.active;
			var flying = a.stage === "flying" || a.stage === "interrupted";
			eyebrow = flying ? t.eyebrowFlying : t.eyebrowActive;
			mainHtml = routeHtml(a.job.from, a.job.to, "msm-route-tile");
			if (!a.aircraft && !flying) sub = t.tileNeedAircraft;
			else if (a.stage === "accepted") sub = t.tileReady;
			else if (a.stage === "flying") sub = t.tileFlying;
			else sub = t.stage[a.stage] || "";
			dot += flying ? " is-fly" : "";
		} else {
			var loc = st.location;
			eyebrow = t.eyebrowIdle;
			main = t.idleMain;
			sub = t.idleSub(loc ? loc.icao : st.pilot.location, loc ? loc.city : "");
		}
		setHtml("tile-title", esc(t.tileTitle));
		setHtml("tile-eyebrow", esc(eyebrow));
		setHtml("tile-main", mainHtml || esc(main));
		setHtml("tile-sub", esc(sub));
		if (el["tile-dot"].className !== dot) el["tile-dot"].className = dot;
		var photo = mode === "online" ? tilePhoto() : "";
		if (S.html.tilePhoto !== photo) {
			S.html.tilePhoto = photo;
			el["tile-bg"].style.backgroundImage = photo ? "url('" + photo + "')" : "none";
		}
	}

	function setHtml(id, html) {
		if (S.html[id] === html) return false;
		S.html[id] = html;
		el[id].innerHTML = html;
		return true;
	}

	// --- Simin giriş sistemi --------------------------------------------------------------------------------------
	// Pencere açıkken tuşları simin ana menüsü de işler: ESC "Masaüstüne çık" sorusunu açar, ENTER ve yön tuşları
	// pencerenin arkasındaki kutulara gider. Simin kendi sayfaları gibi giriş yığınına eylem ekleriz (eylem "işlendi"
	// dönünce sim onu kendi akışına iletmez) ve simin alt çubuğuna (input bar) kendi düğmelerimizi koyarız; pencere
	// kapanınca ikisi de kaldırılır, simin çubuğu geri gelir. Bunlar simin ana menü modülünden (lib.js) alınır;
	// kısaltılmış dışa aktarım adları her güncellemede değişebildiği için sınıf ve fonksiyon adlarıyla aranır.
	// Bulunamazsa kendi alt çubuğumuz ve sayfanın klavye olayları kullanılır.

	var SIM = { api: null, state: "", wait: [], actions: [], bar: "", ctx: "", at: 0, last: "" };
	var SIM_BAR = "ModsteadCareer";
	// Simin giriş bağlamları: üstteki bağlamda alt çubuğu olan sayfa tuşları alır, alttakiler (ana menünün kendisi)
	// almaz; simin açılır pencereleri ve geçişleri de böyle çalışır (lockInput "MAX"). Pencere açıkken MAX'a geçeriz;
	// yoksa (eski sim) sırayla POPUP ya da DEFAULT. Simin kendi açılır penceresi gelince bağlam bırakılır (bkz. layout).
	var SIM_CONTEXTS = ["MAX", "POPUP", "DEFAULT"];
	// Simin menü eylemleri (lib.js, KEY_MENU_SR_*): yön tuşları basılınca, diğerleri bırakılınca tetiklenir.
	var SIM_KEYS = [
		["KEY_MENU_SR_BACK", "released", "back"],
		["KEY_MENU_SR_VALID", "released", "enter"],
		["KEY_MENU_SR_UP", "pressed", "up"],
		["KEY_MENU_SR_DOWN", "pressed", "down"],
		["KEY_MENU_SR_LEFT", "pressed", "left"],
		["KEY_MENU_SR_RIGHT", "pressed", "right"],
		["KEY_MENU_SR_NEXT", "released", "next"],
		["KEY_MENU_SR_PREV", "released", "prev"]
	];

	// Ana menünün kendi modülü mainUi.bundle.js'in yanındaki lib.js'tir; aynı adres aynı (canlı) modülü verir.
	function simModuleUrl() {
		var list = document.querySelectorAll('script[type="module"]');
		for (var i = 0; i < list.length; i++) {
			var src = list[i].src || "";
			var at = src.toLowerCase().indexOf("mainui.bundle.js");
			if (at >= 0) return src.substring(0, at) + "lib.js";
		}
		return "coui://html_UI/Global/lib.js";
	}

	function simApi(done) {
		if (SIM.api || SIM.state === "fail") return done(SIM.api);
		SIM.wait.push(done);
		if (SIM.state === "loading") return;
		SIM.state = "loading";
		var finish = function (api) {
			SIM.api = api;
			SIM.state = api ? "ok" : "fail";
			var w = SIM.wait;
			SIM.wait = [];
			for (var i = 0; i < w.length; i++) {
				try { w[i](api); } catch (e) {}
			}
		};
		try {
			// import() ES5'te yok; ayrı bir fonksiyonda kurulur ki desteklenmezse yalnızca bu özellik düşsün.
			var load = new Function("u", "return import(u)");
			load(simModuleUrl()).then(function (m) {
				var api = { stack: null, Params: null, Button: null, setBar: null, clearBar: null };
				for (var k in m) {
					var v = m[k];
					if (!v) continue;
					if (typeof v === "function") {
						if (v.name === "InputBarParams") api.Params = v;
						else if (v.name === "InputBarButtonParams") api.Button = v;
						else if (v.name === "setInputBar") api.setBar = v;
						else if (v.name === "clearInputBar") api.clearBar = v;
					} else if (typeof v === "object" && v.constructor && v.constructor.name === "UIInputStackListener") {
						api.stack = v;
					}
				}
				var ok = api.stack && typeof api.stack.addInputAction === "function" && typeof api.stack.removeInputAction === "function";
				finish(ok ? api : null);
			}, function () { finish(null); });
		} catch (e) {
			finish(null);
		}
	}

	function simContext(api) {
		for (var i = 0; i < SIM_CONTEXTS.length; i++) {
			try {
				if (api.stack.isContextValid(SIM_CONTEXTS[i])) return SIM_CONTEXTS[i];
			} catch (e) {}
		}
		return "DEFAULT";
	}

	function simAttach() {
		simApi(function (api) {
			if (!api || !S.open || S.dead || SIM.actions.length) return;
			SIM.ctx = simContext(api);
			for (var i = 0; i < SIM_KEYS.length; i++) {
				(function (key) {
					var guid = api.stack.addInputAction(key[0], function () { return simKey(key[2]); }, { strDebug: "Modstead " + key[2], mode: key[1], contextName: SIM.ctx });
					if (guid && guid.indexOf("{00000000") !== 0) SIM.actions.push([key[0], guid]);
				})(SIM_KEYS[i]);
			}
			simBar();
		});
	}

	function simDetach() {
		var api = SIM.api;
		if (api) {
			for (var i = 0; i < SIM.actions.length; i++) {
				try { api.stack.removeInputAction(SIM.actions[i][0], SIM.actions[i][1]); } catch (e) {}
			}
			if (SIM.bar && api.clearBar) {
				try { api.clearBar(SIM_BAR); } catch (e) {}
			}
		}
		SIM.actions = [];
		SIM.bar = "";
		if (el.root) el.root.classList.remove("has-simbar");
	}

	// Simin alt çubuğundaki düğmelerimiz (tuş simgesini sim kendi tuş atamasından çizer; düğmeler tıklanabilir).
	function simBar() {
		var api = SIM.api;
		if (!api || !api.setBar || !api.clearBar || !api.Params || !api.Button || !S.open || !SIM.actions.length) return;
		var t = T();
		var back = S.confirm || S.tab === "pick" ? t.keys.back : t.keys.close;
		var tabs = tabList().length > 1;
		var sig = back + "|" + t.keys.select + "|" + (tabs ? t.keys.tabs : "");
		if (SIM.bar === sig) return;
		try {
			var p = new api.Params();
			p.context = SIM.ctx || "DEFAULT";
			p.buttons.push(api.Button.createParamsWithCallback({ id: "MODSTEAD_BACK", text: back, inputActionName: "KEY_MENU_SR_BACK", callback: function () { simKey("back"); } }));
			p.buttons.push(api.Button.createParamsWithCallback({ id: "MODSTEAD_SELECT", text: t.keys.select, inputActionName: "KEY_MENU_SR_VALID", callback: function () { simKey("enter"); } }));
			if (tabs) {
				p.buttons.push(api.Button.createParamsWithCallback({ id: "MODSTEAD_PREV", text: "", inputActionName: "KEY_MENU_SR_PREV", callback: function () { simKey("prev"); } }));
				p.buttons.push(api.Button.createParamsWithCallback({ id: "MODSTEAD_NEXT", text: t.keys.tabs, inputActionName: "KEY_MENU_SR_NEXT", callback: function () { simKey("next"); } }));
			}
			if (SIM.bar) api.clearBar(SIM_BAR);
			api.setBar(SIM_BAR, p);
			SIM.bar = sig;
		} catch (e) {
			SIM.bar = "";
		}
		el.root.classList.toggle("has-simbar", !!SIM.bar);
	}

	// Simden gelen menü eylemi. Aynı basış hem eylemden hem alt çubuk düğmesinden gelebilir: ikincisi atlanır.
	function simKey(k) {
		if (!S.open || S.dead) return false;
		var now = Date.now();
		var once = k !== "up" && k !== "down" && k !== "left" && k !== "right";
		if (once && k === SIM.last && now - SIM.at < 250) return true;
		SIM.last = k;
		SIM.at = now;
		if (k === "back") goBack();
		else if (k === "enter") {
			if (S.hover && navScope().contains(S.hover)) activate(S.hover);
			else focusFirst();
		} else if (k === "next" || k === "prev") cycleTab(k === "next" ? 1 : -1);
		else move(k);
		return true;
	}

	// --- Pencere --------------------------------------------------------------------------------------------------

	function openPage() {
		if (S.open) return;
		var lang = detectLang();
		if (lang !== S.lang) {
			S.lang = lang;
			S.html = {};
		}
		S.open = true;
		S.error = "";
		S.confirm = null;
		S.hiddenSince = 0;
		var st = S.state;
		if (st && st.active && st.active.job) S.tab = "active";
		else S.tab = "board";
		if (S.tab === "board") fetchBoard();
		fetchState();
		fetchLive();
		if (!S.aircraft) fetchAircraft();
		el.page.style.display = "block";
		el.page.style.visibility = "";
		later(20, function () { el.page.classList.add("is-open"); });
		S.html.head = S.html.tabs = S.html.body = S.html.foot = S.html.modal = null;
		S.sig = "";
		renderAll();
		setTileHover(false);
		simAttach();
	}

	function closePage(silent) {
		if (!S.open) return;
		S.open = false;
		S.confirm = null;
		simDetach();
		el.page.classList.remove("is-open");
		setHover(null, false);
		later(140, function () {
			if (!S.open) el.page.style.display = "none";
		});
		if (!silent) sound("genericbutton", "VALID");
	}

	function setTab(tab) {
		if (S.tab === tab) return;
		S.tab = tab;
		S.error = "";
		if (tab === "board" && (!S.board || Date.now() - S.req.board > 20000)) fetchBoard();
		if (tab === "pick") {
			fetchAircraft();
			S.revealSel = true;
		}
		renderAll();
	}

	function renderAll() {
		if (S.dead) return;
		renderTile();
		renderToast();
		if (!S.open) return;
		if (S.error && Date.now() - S.errorAt > 12000) S.error = "";
		var now = Date.now();
		var sig = [S.lang, S.tab, S.ver.state, S.ver.live, S.ver.board, S.ver.aircraft, linkMode(), S.jobSel, S.pick ? S.pick.title + "|" + S.pick.livery : "",
			S.start ? S.start.runway + "|" + S.start.end : "", S.busy, S.error, S.confirm, Math.round(S.designW), S.tab === "active" ? Math.floor(now / 30000) : 0].join("~");
		if (sig === S.sig) return;
		S.sig = sig;
		saveScrolls();
		var changed = false;
		changed = setHtml("head", headHtml()) || changed;
		changed = setHtml("tabs", tabsHtml()) || changed;
		changed = setHtml("body", bodyHtml()) || changed;
		changed = setHtml("foot", footHtml()) || changed;
		changed = setHtml("modal", modalHtml()) || changed;
		el.modal.style.display = S.confirm ? "block" : "none";
		simBar();
		if (changed) {
			restoreScrolls();
			restoreHover();
			// Uçak seçiminde seçili sürüm görünür olsun.
			if (S.revealSel) {
				S.revealSel = false;
				var li = el.body.querySelector(".msm-sel .msm-li.is-sel");
				if (li) reveal(li);
			}
		}
	}

	function headHtml() {
		var t = T();
		var st = S.state;
		var loc = st && st.location;
		var locText = loc ? loc.icao + " · " + loc.name + (loc.city ? ", " + loc.city : "") : st && st.pilot ? st.pilot.location : "";
		var html = '<div class="msm-title">' + icon("title", "msm-title-arrow") +
			'<div class="msm-title-text">' +
				'<div class="msm-title-cat"><div class="msm-sq"></div><span>' + esc(t.category) + "</span></div>" +
				'<div class="msm-title-main">' + esc(t.title) + "</div>" +
				(locText ? '<div class="msm-title-loc">' + icon("pin", "msm-title-pin") + "<span>" + esc(locText) + "</span></div>" : "") +
			"</div></div>";
		html += '<div class="msm-pilot">';
		if (st && st.pilot) {
			var p = st.pilot;
			var link = st.link && st.link.state ? st.link.state : "waiting";
			html += '<div class="msm-pilot-text">' +
					'<div class="msm-pilot-name"><span>' + esc(p.name) + "</span>" + (p.callsign ? '<span class="msm-pilot-call">' + esc(p.callsign) + "</span>" : "") + "</div>" +
					'<div class="msm-pilot-sub"><div class="msm-sq' + (link === "connected" ? " is-ok" : " is-wait") + '"></div><span>' + esc(t.link[link] || "") + (p.title ? " · " + esc(p.title) : "") + "</span></div>" +
					'<div class="msm-pilot-xp"><span class="msm-pilot-lv">' + esc(t.level(p.level)) + "</span>" + xpBar(p, "") + '<span class="msm-pilot-xpt">' + esc(t.xpOf(num(p.xp), num(p.nextLevelXp))) + "</span></div>" +
				"</div>" +
				'<div class="msm-pilot-money"><div class="msm-label">' + esc(t.balance) + '</div><div class="msm-pilot-money-v">' + esc(money(p.money)) + "</div></div>";
		}
		html += '<div class="msm-iconbtn" data-act="close" data-nav="1"><div class="msm-fx"></div>' + icon("close") + "</div>";
		html += "</div>";
		return html;
	}

	function tabList() {
		var st = S.state;
		if (!st || !st.pilot || linkMode() === "offline") return [];
		var hasActive = !!(st.active && st.active.job);
		var tabs = [];
		if (hasActive) tabs.push("active");
		tabs.push("board");
		if (hasActive && !(st.active.stage === "flying" || st.active.stage === "interrupted")) tabs.push("pick");
		tabs.push("pilot");
		return tabs;
	}

	function cycleTab(dir) {
		var tabs = tabList();
		if (tabs.length < 2) return;
		var i = tabs.indexOf(S.tab);
		var next = tabs[(i + dir + tabs.length) % tabs.length];
		sound("genericbutton", "SELECT");
		setTab(next);
	}

	function tabsHtml() {
		var t = T();
		var tabs = tabList();
		if (!tabs.length) return "";
		var html = "";
		for (var i = 0; i < tabs.length; i++) {
			var sel = S.tab === tabs[i];
			html += '<div class="msm-tab' + (sel ? " is-sel" : "") + '" data-act="tab:' + tabs[i] + '" data-nav="1"><div class="msm-fx"></div><span>' + esc(t.tabs[tabs[i]]) + '</span><div class="msm-corner"></div></div>';
		}
		return html;
	}

	function footHtml() {
		var t = T();
		var back = S.confirm || S.tab === "pick";
		return '<div class="msm-sc" data-act="back" data-nav="1" data-snd="inputbarbutton"><div class="msm-sc-bg"></div><div class="msm-fx"></div><div class="msm-sc-key">ESC</div><div class="msm-sc-label">' + esc(back ? t.keys.back : t.keys.close) + "</div></div>" +
			'<div class="msm-sc is-static"><div class="msm-sc-key">ENTER</div><div class="msm-sc-label">' + esc(t.keys.select) + "</div></div>";
	}

	function modalHtml() {
		if (S.confirm !== "cancel") return "";
		var t = T();
		return '<div class="msm-modal-bg"></div><div class="msm-modal-box">' +
			'<div class="msm-modal-title">' + esc(t.cancelConfirm) + "</div>" +
			'<div class="msm-modal-text">' + esc(t.cancelBody) + "</div>" +
			'<div class="msm-modal-actions">' +
				'<div class="msm-btn msm-btn-ghost" data-act="dismiss" data-nav="1"><div class="msm-fx"></div><span>' + esc(t.keep) + "</span></div>" +
				'<div class="msm-btn msm-btn-danger' + (S.busy ? " is-disabled" : "") + '" data-act="confirm-cancel" data-nav="1"><div class="msm-fx"></div><span>' + esc(S.busy === "cancel" ? t.working : t.cancel) + "</span></div>" +
			"</div></div>";
	}

	function errorHtml() {
		if (!S.error) return "";
		return '<div class="msm-error">' + icon("warn", "msm-error-ico") + "<span>" + esc(S.error) + "</span></div>";
	}

	function bodyHtml() {
		var t = T();
		var mode = linkMode();
		var st = S.state;
		if (!st) {
			if (mode === "connecting") return emptyHtml(t.connecting, t.connectingSub, "");
			return emptyHtml(t.offline, t.offlineBody, '<div class="msm-btn msm-btn-primary msm-btn-auto" data-act="retry" data-nav="1"><div class="msm-fx"></div>' + icon("refresh") + "<span>" + esc(t.retry) + "</span></div>");
		}
		if (mode === "offline") {
			return emptyHtml(t.offline, t.offlineBody, '<div class="msm-btn msm-btn-primary msm-btn-auto" data-act="retry" data-nav="1"><div class="msm-fx"></div>' + icon("refresh") + "<span>" + esc(t.retry) + "</span></div>");
		}
		if (!st.pilot) return emptyHtml(t.noCareer, t.noCareerBody, "");
		var a = st.active && st.active.job ? st.active : null;
		var tab = S.tab;
		if (!a && (tab === "active" || tab === "pick")) tab = "board";
		if (a && tab === "pick" && (a.stage === "flying" || a.stage === "interrupted")) tab = "active";
		if (tab === "pilot") return viewPilot();
		if (tab === "active") return viewActive(a);
		if (tab === "pick") return viewPick(a);
		return viewBoard();
	}

	function emptyHtml(title, body, action) {
		return '<div class="msm-empty"><div class="msm-empty-glyph"><div class="msm-sq"></div><div class="msm-empty-line"></div><div class="msm-sq is-hollow"></div></div>' +
			'<div class="msm-empty-title">' + esc(title) + "</div>" +
			'<div class="msm-empty-body">' + esc(body) + "</div>" +
			(action ? '<div class="msm-empty-action">' + action + "</div>" : "") + "</div>";
	}

	function scrollHtml(key, inner, cls) {
		return '<div class="msm-scroll' + (cls ? " " + cls : "") + '" data-scroll="' + esc(key) + '"><div class="msm-scroll-view"><div class="msm-scroll-body">' + inner +
			'</div></div><div class="msm-scrollbar"><div class="msm-scrollbar-thumb"></div></div></div>';
	}

	function tag(text, cls) {
		return '<span class="msm-tag' + (cls ? " " + cls : "") + '">' + esc(text) + "</span>";
	}

	function fact(label, value, hint) {
		return '<div class="msm-fact"><div class="msm-label">' + esc(label) + '</div><div class="msm-fact-v">' + esc(value) + "</div>" +
			(hint ? '<div class="msm-fact-h">' + esc(hint) + "</div>" : "") + "</div>";
	}

	// --- Aktif iş -------------------------------------------------------------------------------------------------

	function viewActive(a) {
		var t = T();
		var job = a.job;
		var flying = a.stage === "flying" || a.stage === "interrupted";
		var live = S.live;
		var launch = live && live.launch ? live.launch : null;
		var preparing = !!launch && launch.step !== "done" && launch.step !== "manual" && a.stage === "launching";
		var start = S.start || { runway: false, end: null };
		var now = Date.now() / 1000;
		var overdue = now > a.deadlineAt;
		var photo = a.aircraft ? photoFor(a.aircraft.title) : "";
		var plan = job.plan || {};
		var pilot = st().pilot;

		var hero = '<div class="msm-hero">' +
			'<div class="msm-hero-photo"' + bgStyle(photo || defaultPhoto()) + "></div>" +
			'<div class="msm-hero-shade"></div>' +
			'<div class="msm-hero-top">' + tag(t.mode[job.mode] || job.mode, "msm-tag-dark") + (job.urgent ? tag(t.board.urgent, "msm-tag-red") : "") + "</div>" +
			'<div class="msm-hero-bottom">' +
				'<div class="msm-hero-left">' +
					'<div class="msm-hero-kicker">' + icon(KIND_ICON[job.kind] || "plane", "msm-hero-kicker-ico") + "<span>" + esc(t.kinds[job.kind] || job.kind) + "</span></div>" +
					routeHtml(job.from, job.to, "msm-route-hero") + "</div>" +
				'<div class="msm-hero-pay"><div class="msm-label">' + esc(t.pay) + '</div><div class="msm-hero-pay-v">' + esc(job.kind === "checkride" ? "—" : money(job.pay)) + "</div>" +
					'<div class="msm-hero-pay-s">' + esc(t.xp(job.xpEstimate)) + "</div></div>" +
			"</div></div>";

		var deadlineText = overdue ? t.overdue : t.left(duration((a.deadlineAt - now) / 60));
		var toNext = pilot && pilot.nextLevelXp > pilot.xp ? pilot.nextLevelXp - pilot.xp : 0;
		var facts = '<div class="msm-facts msm-facts-3">' +
			fact(t.payload, payloadText(job), cargoText(job)) +
			fact(t.fuel, unit(plan.fuelKg, "kg"), unit(plan.fuelKg ? plan.fuelKg * 2.20462 : null, "lb")) +
			fact(t.cruise, unit(plan.cruiseAltFt, "ft"), clsName(job["class"])) +
			"</div>" +
			'<div class="msm-facts msm-facts-3 msm-facts-low">' +
			fact(t.client, job.client || "—", t.mode[job.mode] || "") +
			fact(t.deadline, clockOf(a.deadlineAt), deadlineText) +
			fact(t.xpLabel, t.xp(job.xpEstimate), toNext ? t.xpNext(num(toNext)) : "") +
			"</div>";
		if (overdue) facts = facts.split('<div class="msm-fact-h">' + esc(deadlineText)).join('<div class="msm-fact-h is-warn">' + esc(deadlineText));

		var side = "";
		// 1. Uçak
		side += '<div class="msm-step"><div class="msm-step-head"><span class="msm-step-n">1</span><span class="msm-step-t">' + esc(t.stepAircraft) + "</span></div>";
		if (a.aircraft) {
			var fam = familyName(a.aircraft.title);
			side += '<div class="msm-ac">' +
				'<div class="msm-ac-photo"' + bgStyle(photo) + ">" + (photo ? "" : icon("plane", "msm-ac-ph")) + "</div>" +
				'<div class="msm-ac-text"><div class="msm-ac-name">' + esc(fam || a.aircraft.title) + "</div>" +
					'<div class="msm-ac-sub">' + esc(fam ? a.aircraft.title : clsName(a.aircraft["class"])) + "</div>" +
					'<div class="msm-ac-sub">' + esc(a.aircraft.livery || t.defaultLivery) + "</div></div>" +
				(flying ? "" : '<div class="msm-btn msm-btn-quiet msm-btn-auto" data-act="tab:pick" data-nav="1"><div class="msm-fx"></div><span>' + esc(t.change) + "</span></div>") +
				"</div>";
		} else {
			side += '<div class="msm-ac is-empty">' +
				'<div class="msm-ac-photo">' + icon("plane", "msm-ac-ph") + "</div>" +
				'<div class="msm-ac-text"><div class="msm-ac-name">' + esc(t.noAircraft) + '</div><div class="msm-ac-sub msm-wrap">' + esc(t.noAircraftBody) + "</div></div>" +
				'<div class="msm-btn msm-btn-primary msm-btn-auto" data-act="tab:pick" data-nav="1"><div class="msm-fx"></div><span>' + esc(t.choose) + "</span></div>" +
				"</div>";
		}
		side += "</div>";

		// 2. Başlangıç
		if (!flying) {
			var lock = preparing ? " is-disabled" : "";
			side += '<div class="msm-step"><div class="msm-step-head"><span class="msm-step-n">2</span><span class="msm-step-t">' + esc(t.stepStart) + "</span></div>" +
				'<div class="msm-options">' +
					option("start:parking", !start.runway, "parking", t.atParking, t.atParkingHint, lock) +
					option("start:runway", !!start.runway, "runway", t.atRunway, t.atRunwayHint, lock) +
				"</div>";
			if (start.runway && a.runwayEnds && a.runwayEnds.length) {
				side += '<div class="msm-chips"><span class="msm-chips-label">' + esc(t.runwayEnd) + "</span>";
				side += chip("end:", !start.end, t.autoEnd, lock);
				for (var i = 0; i < a.runwayEnds.length; i++) side += chip("end:" + a.runwayEnds[i], start.end === a.runwayEnds[i], a.runwayEnds[i], lock);
				side += "</div>";
			}
			side += "</div>";
		}

		// 3. Hazırlık (uçuşta: uçuşun durumu)
		var linked = st().link && st().link.state === "connected";
		var stageText = a.stage === "accepted" && a.aircraft ? t.tileReady : t.stage[a.stage] || "";
		var sq = a.stage === "ready" ? " is-ok" : flying ? (a.stage === "interrupted" ? " is-off" : " is-fly") : " is-wait";
		side += '<div class="msm-step"><div class="msm-step-head"><span class="msm-step-n">' + (flying ? "2" : "3") + '</span><span class="msm-step-t">' + esc(flying ? t.flight.title : t.prep.title) + "</span></div>" +
			'<div class="msm-status"><div class="msm-sq' + sq + '"></div><span>' + esc(stageText) + "</span></div>";
		if (flying) {
			side += flightHtml(live && live.flight ? live.flight : null, job);
			side += '<div class="msm-note">' + esc(t.flyingBody) + "</div>";
		} else if (launch && launch.step === "done" && live && live.checks && live.checks.length) {
			side += liveChecksHtml(live.checks);
		} else if (launch) {
			side += launchHtml(launch);
		} else {
			if (a.launchNote) side += '<div class="msm-note">' + esc(a.launchNote) + "</div>";
			var load = payloadText(job);
			side += '<div class="msm-checks">' +
				checkItem(linked ? "ok" : "warn", t.prep.link, linked ? t.prep.linkOk : t.prep.linkWait) +
				checkItem("ok", t.prep.load, t.prep.loadAuto((load === "—" ? "" : load + " · ") + unit(plan.fuelKg, "kg"))) +
				checkItem("ok", t.prep.plan, t.prep.planAuto(job.from, job.to)) +
				"</div>";
			if (!a.aircraft) side += '<div class="msm-note">' + esc(t.needAircraftHint) + "</div>";
			else if (!linked) side += '<div class="msm-note is-warn">' + esc(t.simNotLinked) + "</div>";
		}
		side += "</div>";

		var foot = "";
		if (!flying) {
			var label = preparing ? t.preparing : S.busy === "launch" ? t.working : a.stage === "ready" ? t.prepareAgain : launch && launch.step === "manual" ? t.restart : t.start;
			var dis = !a.aircraft || !!S.busy || preparing;
			foot += '<div class="msm-btn msm-btn-primary msm-btn-cta' + (dis ? " is-disabled" : "") + '" data-act="launch" data-nav="1"><div class="msm-fx"></div>' + icon("play") + "<span>" + esc(label) + '</span><div class="msm-corner"></div></div>';
			foot += '<div class="msm-side-links"><div class="msm-btn msm-btn-text' + (S.busy ? " is-disabled" : "") + '" data-act="cancel" data-nav="1"><div class="msm-fx"></div><span>' + esc(t.cancel) + "</span></div></div>";
		}

		return errorHtml() + '<div class="msm-split">' +
			'<div class="msm-split-main">' + hero + stripHtml(job, a.from, a.to) + facts + "</div>" +
			'<div class="msm-split-side' + (foot ? "" : " is-nofoot") + '">' + scrollHtml("active-side", side, "msm-side-scroll") +
				(foot ? '<div class="msm-side-foot">' + foot + "</div>" : "") + "</div>" +
			"</div>";
	}

	// Kalkış ve varış havalimanları arasında uçuş şeridi: pist, uzunluk, rakım; ortada mesafe ve süre.
	function stripHtml(job, from, to) {
		var t = T();
		var plan = job.plan || {};
		var time = plan.blockMin ? duration(plan.blockMin) + (plan.airMin ? " · " + t.strip.air(duration(plan.airMin)) : "") : "";
		return '<div class="msm-strip">' + stripApt(t.strip.dep, job.from, from, false) +
			'<div class="msm-strip-mid">' +
				'<div class="msm-strip-dist">' + esc(num(job.distanceNm, 1) + " nm") + "</div>" +
				'<div class="msm-strip-line"><div class="msm-strip-end"></div><div class="msm-strip-rule"></div>' + icon("plane", "msm-strip-plane") +
					'<div class="msm-strip-rule"></div><div class="msm-strip-end is-arr"></div></div>' +
				'<div class="msm-strip-time">' + esc(time) + "</div>" +
			"</div>" + stripApt(t.strip.arr, job.to, to, true) + "</div>";
	}

	function stripApt(role, icao, ap, arr) {
		var t = T();
		var name = ap ? ap.name + (ap.city && ap.name.indexOf(ap.city) < 0 ? ", " + ap.city : "") : "";
		var bits = [];
		if (ap) {
			if (typeof ap.elevationFt === "number") bits.push(t.strip.elev(num(ap.elevationFt)));
			if (t.strip.surface[ap.surface]) bits.push(t.strip.surface[ap.surface]);
			if (ap.lighted) bits.push(t.strip.lighted);
		}
		return '<div class="msm-strip-apt' + (arr ? " is-arr" : "") + '">' +
			'<div class="msm-strip-role">' + icon(arr ? "landing" : "takeoff", "msm-strip-role-ico") + "<span>" + esc(role) + "</span></div>" +
			'<div class="msm-strip-icao">' + esc(icao) + "</div>" +
			'<div class="msm-strip-name">' + esc(name || "—") + "</div>" +
			(ap && ap.runway ? '<div class="msm-strip-meta">' + esc(t.strip.runway(ap.runway, num(ap.runwayFt))) + "</div>" : "") +
			(bits.length ? '<div class="msm-strip-meta">' + esc(bits.join(" · ")) + "</div>" : "") +
			"</div>";
	}

	function unit(v, u) {
		return typeof v === "number" && isFinite(v) && v > 0 ? num(v) + " " + u : "—";
	}

	// Denetim satırı: durum simgesi, ad, değer (ok: tamam, warn: dikkat, todo: bekliyor).
	function checkItem(state, label, value) {
		return '<div class="msm-check is-' + state + '">' + icon(state === "ok" ? "ok" : state === "warn" ? "warn" : "todo", "msm-check-ico") +
			'<div class="msm-check-l">' + esc(label) + '</div><div class="msm-check-v">' + esc(value) + "</div></div>";
	}

	// Uçuş hazırlandıktan sonra Modstead'in simden okuduğu denetimler (yakıt, yük, konum…).
	function liveChecksHtml(checks) {
		var t = T();
		var html = '<div class="msm-checks">';
		for (var i = 0; i < checks.length; i++) {
			var c = checks[i];
			// Bağlantı başlıkta, açık uçuş zaten bu adımın konusu: listede yer kaplamasın.
			if (c.id === "in_flight" || c.id === "connected") continue;
			html += checkItem(c.ok ? "ok" : c.required ? "warn" : "todo", t.checks[c.id] || c.id, c.detail || "");
		}
		return html + "</div>";
	}

	// Uçuşun son bilinen durumu: evre, ilerleme, uçulan ve kalan mesafe, anlık puan.
	function flightHtml(f, job) {
		var t = T();
		if (!f) return "";
		var total = f.flownNm + f.remainingNm;
		var pct = total > 0 ? Math.max(0, Math.min(100, Math.round((f.flownNm / total) * 100))) : 0;
		return '<div class="msm-flight">' +
			'<div class="msm-flight-top"><span class="msm-flight-phase">' + esc(t.phases[f.phase] || f.phase) + '</span><span class="msm-flight-time">' + esc(t.flight.elapsed + " " + duration(f.elapsedS / 60)) + "</span></div>" +
			'<div class="msm-flight-route"><span>' + esc(job.from) + '</span><div class="msm-flight-bar"><div class="msm-flight-fill" style="width: ' + pct + '%;"></div></div><span>' + esc(job.to) + "</span></div>" +
			'<div class="msm-facts msm-facts-3 msm-facts-flat">' +
				fact(t.flight.flown, num(f.flownNm, 1) + " nm", "") +
				fact(t.flight.remaining, num(f.remainingNm, 1) + " nm", "") +
				fact(t.flight.score, String(Math.round(f.scoreNow)), "") +
			"</div></div>";
	}

	function st() { return S.state || {}; }

	function option(act, sel, ico, title, hint, extra) {
		return '<div class="msm-option' + (sel ? " is-sel" : "") + (extra || "") + '" data-act="' + act + '" data-nav="1"><div class="msm-fx"></div>' +
			'<div class="msm-option-ico">' + icon(ico) + "</div>" +
			'<div class="msm-option-text"><div class="msm-option-title">' + esc(title) + '</div><div class="msm-option-hint">' + esc(hint) + "</div></div>" +
			'<div class="msm-corner"></div></div>';
	}

	function chip(act, sel, text, extra) {
		return '<div class="msm-chip' + (sel ? " is-sel" : "") + (extra || "") + '" data-act="' + esc(act) + '" data-nav="1"><div class="msm-fx"></div><span>' + esc(text) + '</span><div class="msm-corner"></div></div>';
	}

	function launchHtml(launch) {
		var t = T();
		var html = "";
		if (launch.step === "manual") {
			html += '<div class="msm-note is-warn"><span class="msm-note-t">' + esc(t.manual) + "</span> " + esc(launch.note || "") + "</div>";
			return html;
		}
		var idx = -1;
		for (var i = 0; i < LAUNCH_STEPS.length; i++) if (LAUNCH_STEPS[i] === launch.step) idx = i;
		html += '<div class="msm-steps">';
		for (var j = 0; j < LAUNCH_STEPS.length; j++) {
			var c = j < idx || launch.step === "done" ? " is-done" : j === idx ? " is-now" : "";
			html += '<div class="msm-steps-i' + c + '"><div class="msm-steps-bar"></div><div class="msm-steps-t">' + esc(t.launch[LAUNCH_STEPS[j]]) + "</div></div>";
		}
		html += "</div>";
		if (launch.note) html += '<div class="msm-note">' + esc(launch.note) + "</div>";
		return html;
	}

	function familyName(title) {
		if (!S.aircraft) return "";
		for (var i = 0; i < S.aircraft.length; i++) if (S.aircraft[i].title === title) return S.aircraft[i].family || "";
		return "";
	}

	// --- Pilot --------------------------------------------------------------------------------------------------------

	function xpProgress(p) {
		if (!p || !(p.nextLevelXp > p.levelXp)) return 1;
		return Math.max(0, Math.min(1, (p.xp - p.levelXp) / (p.nextLevelXp - p.levelXp)));
	}

	function xpBar(p, cls) {
		return '<div class="msm-xp-bar' + (cls ? " " + cls : "") + '"><div class="msm-xp-fill" style="width: ' + Math.round(xpProgress(p) * 100) + '%;"></div></div>';
	}

	function initials(name) {
		var parts = String(name || "").split(" ");
		var out = "";
		for (var i = 0; i < parts.length && out.length < 2; i++) if (parts[i]) out += parts[i].charAt(0);
		return out || "?";
	}

	function dateOf(ts) {
		var t = T();
		var d = new Date(ts * 1000);
		var hh = d.getHours();
		var mm = d.getMinutes();
		return d.getDate() + " " + t.months[d.getMonth()] + " · " + (hh < 10 ? "0" : "") + hh + ":" + (mm < 10 ? "0" : "") + mm;
	}

	function meter(label, value, frac, cls) {
		return '<div class="msm-meter"><div class="msm-meter-top"><span class="msm-meter-l">' + esc(label) + '</span><span class="msm-meter-v">' + esc(value) + "</span></div>" +
			'<div class="msm-meter-bar"><div class="msm-meter-fill' + (cls ? " " + cls : "") + '" style="width: ' + Math.round(Math.max(0, Math.min(1, frac)) * 100) + '%;"></div></div></div>';
	}

	function viewPilot() {
		var t = T();
		var pt = t.pilotTab;
		var st0 = st();
		var p = st0.pilot;
		var s = p.stats || {};
		var since = "";
		if (p.createdAt) {
			var cd = new Date(p.createdAt);
			if (!isNaN(cd.getTime())) since = pt.since(cd.getDate() + " " + t.months[cd.getMonth()] + " " + cd.getFullYear());
		}

		var card = '<div class="msm-pcard">' +
			'<div class="msm-pcard-mono"><span>' + esc(initials(p.name)) + "</span></div>" +
			'<div class="msm-pcard-text">' +
				'<div class="msm-pcard-name"><span>' + esc(p.name) + "</span>" + (p.callsign ? '<span class="msm-pcard-call">' + esc(p.callsign) + "</span>" : "") + "</div>" +
				'<div class="msm-pcard-sub">' + esc([p.title, pt.difficulty[p.difficulty] || p.difficulty, since].filter(function (x) { return !!x; }).join("  ·  ")) + "</div>" +
				'<div class="msm-pcard-xp"><span class="msm-pcard-lv">' + esc(t.level(p.level)) + "</span>" + xpBar(p, "is-big") +
					'<span class="msm-pcard-xpt">' + esc(t.xpOf(num(p.xp), num(p.nextLevelXp))) + "</span></div>" +
			"</div>" +
			'<div class="msm-pcard-side">' +
				meter(pt.reputation, String(Math.round(p.reputation || 0)) + " / 100", (p.reputation || 0) / 100, "") +
				meter(pt.rating, typeof p.rating === "number" ? (Math.round(p.rating * 10) / 10).toFixed(1).split(".").join(t.dec) : pt.noRating, typeof p.rating === "number" ? p.rating / 100 : 0, "is-orange") +
			"</div>" +
		"</div>";

		var best = typeof s.bestLandingFpm === "number" ? num(-Math.abs(s.bestLandingFpm)) + " fpm" : "—";
		var stats = '<div class="msm-section-t msm-section-gap">' + esc(pt.summary) + "</div>" +
			'<div class="msm-facts msm-facts-4">' +
				fact(pt.flights, num(s.flights || 0), "") +
				fact(pt.hours, (Math.round((s.hours || 0) * 10) / 10).toFixed(1).split(".").join(t.dec) + " " + t.h, "") +
				fact(pt.distance, num(s.distanceNm || 0) + " nm", "") +
				fact(pt.landings, num(s.landings || 0), s.butterLandings ? pt.butter(s.butterLandings) : "") +
			"</div>" +
			'<div class="msm-facts msm-facts-4 msm-facts-low">' +
				fact(pt.best, best, "") +
				fact(pt.earned, money(s.earned || 0), s.spent ? pt.spent(money(s.spent)) : "") +
				fact(pt.jobs, num(s.jobsDone || 0), s.jobsFailed ? pt.failed(s.jobsFailed) : "") +
				fact(t.balance, money(p.money), p.loan ? pt.loan(money(p.loan)) : pt.noLoan) +
			"</div>";

		var lic = st0.licenses || [];
		var licHtml = "";
		if (lic.length) {
			licHtml += '<div class="msm-section-t msm-section-gap">' + esc(pt.licences) + '</div><div class="msm-lics">';
			for (var i = 0; i < lic.length; i++) {
				var l = lic[i];
				var state = l.held ? "is-held" : l.ready ? "is-ready" : "is-locked";
				var line = l.held ? pt.held : l.ready ? pt.ready : pt.needs(l.levelNeeded || l.level, num(l.hoursNeeded || l.hours));
				licHtml += '<div class="msm-lic ' + state + '">' +
					'<div class="msm-lic-top"><span class="msm-lic-code">' + esc(l.short) + "</span>" + icon(l.held ? "ok" : l.ready ? "badge" : "todo", "msm-lic-ico") + "</div>" +
					'<div class="msm-lic-name">' + esc(S.lang === "en" ? l.nameEn : l.nameTr) + "</div>" +
					'<div class="msm-lic-state">' + esc(line) + "</div></div>";
			}
			licHtml += "</div>";
		}

		var recent = st0.recent || [];
		var rows = "";
		for (var j = 0; j < recent.length; j++) rows += logRow(recent[j]);
		var side = '<div class="msm-section-t">' + esc(pt.recent) + "</div>" +
			(rows ? '<div class="msm-logs">' + rows + "</div>" : '<div class="msm-note">' + esc(pt.noFlights) + "</div>");

		return errorHtml() + '<div class="msm-split">' +
			'<div class="msm-split-main">' + scrollHtml("pilot-main", card + stats + licHtml, "msm-fill-scroll") + "</div>" +
			'<div class="msm-split-side is-nofoot">' + scrollHtml("pilot-side", side, "msm-side-scroll") + "</div>" +
			"</div>";
	}

	function logSub(score, xp) {
		var parts = [];
		if (typeof score === "number" && score > 0) parts.push(T().pilotTab.points(Math.round(score)));
		if (xp > 0) parts.push("+" + xp + " XP");
		return parts.join(" · ");
	}

	// Seyir defteri satırı: tarih, rota, sonuç, uçak, iniş, puan, net kazanç ve XP.
	function logRow(e) {
		var t = T();
		var pt = t.pilotTab;
		var job = e.job || {};
		var sum = e.summary || {};
		var good = e.result === "completed";
		var warn = e.result === "late" || e.result === "diverted";
		var net = e.settlement ? e.settlement.net : 0;
		var meta = [familyName(e.aircraft && e.aircraft.title) || (e.aircraft ? e.aircraft.title : "")];
		if (sum.flownNm) meta.push(num(sum.flownNm, 1) + " nm");
		if (e.landing) meta.push(num(-Math.abs(e.landing.fpm)) + " fpm · " + (pt.landing[e.landing.label] || e.landing.label));
		// Rota planlanan iştir; başka meydana inildiyse inilen yer ayrıca yazılır.
		if (e.result === "diverted" && e.arrived && e.arrived !== job.to) meta.push(pt.arrivedAt(e.arrived));
		return '<div class="msm-log">' +
			'<div class="msm-log-ico">' + icon(KIND_ICON[job.kind] || "plane") + "</div>" +
			'<div class="msm-log-main">' +
				'<div class="msm-log-top"><span class="msm-log-date">' + esc(dateOf(e.endedAt || e.startedAt)) + "</span>" +
					tag(pt.results[e.result] || e.result, good ? "msm-tag-ok" : warn ? "msm-tag-warn" : "msm-tag-red") + "</div>" +
				routeHtml(job.from || "", job.to || "", "msm-route-log") +
				'<div class="msm-log-meta">' + esc(meta.join("  ·  ")) + "</div>" +
			"</div>" +
			'<div class="msm-log-side">' +
				'<div class="msm-log-net' + (net > 0 ? " is-ok" : net < 0 ? " is-bad" : "") + '">' + esc(net ? signedMoney(net) : "—") + "</div>" +
				'<div class="msm-log-sub">' + esc(logSub(sum.score, e.xp)) + "</div>" +
			"</div></div>";
	}

	// --- İş ilanları ----------------------------------------------------------------------------------------------

	function viewBoard() {
		var t = T();
		var st0 = st();
		var loc = st0.location;
		var jobs = S.boardJobs || [];
		var head = '<div class="msm-subhead"><div class="msm-subhead-t">' + esc(t.board.subtitle(loc ? loc.icao : "", loc ? loc.city : "")) + "</div>" +
			'<div class="msm-btn msm-btn-quiet msm-btn-auto msm-btn-small" data-act="refresh-board" data-nav="1"><div class="msm-fx"></div>' + icon("refresh") + "<span>" + esc(t.board.refresh) + "</span></div></div>";
		if (!S.board) return errorHtml() + head + '<div class="msm-under-sub">' + emptyHtml(t.board.loading, "", "") + "</div>";
		if (!jobs.length) return errorHtml() + head + '<div class="msm-under-sub">' + emptyHtml(t.board.empty, t.board.emptyBody, "") + "</div>";
		var sel = null;
		for (var i = 0; i < jobs.length; i++) if (jobs[i].id === S.jobSel) sel = jobs[i];
		if (!sel) {
			sel = jobs[0];
			S.jobSel = sel.id;
		}
		var rows = "";
		for (var j = 0; j < jobs.length; j++) rows += jobRow(jobs[j], jobs[j].id === sel.id);
		return errorHtml() + '<div class="msm-split">' +
			'<div class="msm-split-main">' + head + scrollHtml("board", rows, "msm-under-sub") + "</div>" +
			'<div class="msm-split-side is-short">' + jobDetail(sel) + "</div>" +
			"</div>";
	}

	function jobRow(job, sel) {
		var t = T();
		var meta = [num(job.distanceNm, 1) + " nm", clsName(job["class"])];
		if (job.pax || job.cargoKg) meta.push(payloadText(job));
		meta.push(t.within(job.deadlineH));
		var sub = job.quote ? t.board.profit + " " + signedMoney(job.quote.estProfit) : t.xp(job.xpEstimate);
		return '<div class="msm-row' + (sel ? " is-sel" : "") + '" data-act="job:' + esc(job.id) + '" data-nav="1"><div class="msm-fx"></div>' +
			'<div class="msm-row-ico">' + icon(KIND_ICON[job.kind] || "plane") + "</div>" +
			'<div class="msm-row-main">' +
				'<div class="msm-row-top"><span class="msm-row-kind">' + esc(t.kinds[job.kind] || job.kind) + "</span>" +
					(job.urgent ? tag(t.board.urgent, "msm-tag-red") : "") + (job.mode === "contract" ? tag(t.mode.contract, "msm-tag-blue") : "") + "</div>" +
				routeHtml(job.from, job.to, "msm-route-row") +
				'<div class="msm-row-meta">' + esc(meta.join("  ·  ")) + "</div>" +
			"</div>" +
			'<div class="msm-row-pay"><div class="msm-row-pay-v">' + esc(job.kind === "checkride" ? "—" : money(job.pay)) + "</div>" +
				'<div class="msm-row-pay-s' + (job.quote ? (job.quote.estProfit > 0 ? " is-ok" : " is-bad") : "") + '">' + esc(sub) + "</div></div>" +
			'<div class="msm-corner"></div></div>';
	}

	function jobDetail(job) {
		var t = T();
		var q = job.quote;
		var busy = !!(st().active && st().active.job);
		var lines = '<div class="msm-money-line is-strong"><span>' + esc(q ? t.revenue : t.pay) + "</span><span>" + esc(money(job.pay)) + "</span></div>";
		if (q) {
			lines += '<div class="msm-money-line"><span>' + esc(t.board.rent) + "</span><span>" + esc(money(-q.estRent)) + "</span></div>" +
				'<div class="msm-money-line"><span>' + esc(t.board.fuelCost) + "</span><span>" + esc(money(-q.estFuel)) + "</span></div>" +
				'<div class="msm-money-line"><span>' + esc(t.board.fees) + "</span><span>" + esc(money(-q.estFees)) + "</span></div>" +
				'<div class="msm-money-line is-strong is-total' + (q.estProfit > 0 ? " is-ok" : " is-bad") + '"><span>' + esc(t.board.profit) + "</span><span>" + esc(signedMoney(q.estProfit)) + "</span></div>";
		}
		var detail = '<div class="msm-detail-head"><div class="msm-detail-kind">' + icon(KIND_ICON[job.kind] || "plane") + "<span>" + esc(t.kinds[job.kind] || job.kind) + "</span>" +
				(job.urgent ? tag(t.board.urgent, "msm-tag-red") : "") + "</div>" +
				routeHtml(job.from, job.to, "msm-route-detail") +
				'<div class="msm-detail-client">' + esc(job.client || "") + "</div></div>" +
			'<div class="msm-facts msm-facts-2">' +
				fact(t.distance, num(job.distanceNm, 1) + " nm", duration(job.plan ? job.plan.blockMin : 0)) +
				fact(t.cls, clsName(job["class"]), job.plan && job.plan.fuelKg ? t.fuel + " " + unit(job.plan.fuelKg, "kg") : "") +
				fact(t.payload, payloadText(job), cargoText(job)) +
				fact(t.deadline, t.within(job.deadlineH), t.xp(job.xpEstimate)) +
			"</div>" +
			'<div class="msm-money"><div class="msm-money-mode">' + tag(t.mode[job.mode] || job.mode, job.mode === "contract" ? "msm-tag-blue" : "") + "</div>" +
				'<div class="msm-money-hint">' + esc(t.modeHint[job.mode] || "") + "</div>" + lines + "</div>";
		var cta = '<div class="msm-btn msm-btn-primary msm-btn-cta' + (busy || S.busy ? " is-disabled" : "") + '" data-act="accept:' + esc(job.id) + '" data-nav="1"><div class="msm-fx"></div>' + icon("check") +
			"<span>" + esc(busy ? t.board.busy : S.busy === "accept" ? t.working : t.board.accept) + '</span><div class="msm-corner"></div></div>';
		return scrollHtml("job-detail", '<div class="msm-detail">' + detail + "</div>", "msm-side-scroll") + '<div class="msm-side-foot">' + cta + "</div>";
	}

	// --- Uçak seçimi ----------------------------------------------------------------------------------------------

	// Aynı gerçek tipin sürümleri (C172 yolcu, kargo, şamandıralı…) tek kartta toplanır.
	function buildGroups(list, jobClass) {
		var map = {};
		var out = [];
		for (var i = 0; i < list.length; i++) {
			var o = list[i];
			if (!o || !o.title) continue;
			var key = o.family || o.title;
			var g = map[key];
			if (!g) {
				g = { key: key, name: o.family || o.title, items: [], cls: null, flyable: false, fits: false, photo: "" };
				map[key] = g;
				out.push(g);
			}
			g.items.push(o);
			if (o.flyable) g.flyable = true;
			if (jobClass && o["class"] === jobClass) g.fits = true;
			if (!g.photo && o.photo) g.photo = abs(o.photo);
		}
		var lower = function (s) { return String(s || "").toLowerCase(); };
		for (var j = 0; j < out.length; j++) {
			out[j].items.sort(function (a, b) {
				var fa = jobClass && a["class"] === jobClass ? 0 : 1;
				var fb = jobClass && b["class"] === jobClass ? 0 : 1;
				if (fa !== fb) return fa - fb;
				if (!!a.flyable !== !!b.flyable) return a.flyable ? -1 : 1;
				return lower(a.title) < lower(b.title) ? -1 : lower(a.title) > lower(b.title) ? 1 : 0;
			});
			for (var m = 0; m < out[j].items.length; m++) {
				if (out[j].items[m]["class"]) {
					out[j].cls = out[j].items[m]["class"];
					break;
				}
			}
		}
		out.sort(function (a, b) {
			if (a.fits !== b.fits) return a.fits ? -1 : 1;
			if (a.flyable !== b.flyable) return a.flyable ? -1 : 1;
			return lower(a.name) < lower(b.name) ? -1 : lower(a.name) > lower(b.name) ? 1 : 0;
		});
		return out;
	}

	function itemByTitle(title) {
		for (var i = 0; i < S.groups.length; i++) {
			var g = S.groups[i];
			for (var j = 0; j < g.items.length; j++) if (g.items[j].title === title) return { g: i, i: j };
		}
		return null;
	}

	function cols(width, min) {
		var n = Math.floor(width / min);
		return n < 2 ? 2 : n > 5 ? 5 : n;
	}

	function viewPick(a) {
		var t = T();
		var job = a.job;
		var head = '<div class="msm-subhead"><div class="msm-subhead-t">' + esc(t.pick.subtitle(clsName(job["class"]))) + "</div></div>";
		if (!S.aircraft) return errorHtml() + head + '<div class="msm-under-sub">' + emptyHtml(t.pick.loading, "", "") + "</div>";
		S.groups = buildGroups(S.aircraft, job["class"]);
		if (!S.groups.length) return errorHtml() + head + '<div class="msm-under-sub">' + emptyHtml(t.pick.none, "", "") + "</div>";

		var at = S.pick ? itemByTitle(S.pick.title) : null;
		if (!at) {
			S.pick = { title: S.groups[0].items[0].title, livery: "" };
			at = { g: 0, i: 0 };
		}
		var mainW = (S.designW - 168) * 0.64 - 12;
		var n = cols(mainW, 330);
		var fits = "";
		var others = "";
		for (var i = 0; i < S.groups.length; i++) {
			var card = famCard(S.groups[i], i, i === at.g, n);
			if (S.groups[i].fits) fits += card;
			else others += card;
		}
		var grid = "";
		if (fits) grid += '<div class="msm-section-t">' + esc(t.pick.fits) + '</div><div class="msm-grid">' + fits + "</div>";
		if (others) grid += (fits ? '<div class="msm-section-t">' + esc(t.pick.others) + "</div>" : "") + '<div class="msm-grid">' + others + "</div>";

		var g = S.groups[at.g];
		var item = g.items[at.i];
		var side = '<div class="msm-sel-photo"' + bgStyle(g.photo) + ">" + (g.photo ? "" : icon("plane", "msm-ac-ph")) + "</div>" +
			'<div class="msm-sel-name">' + esc(g.name) + "</div>" +
			'<div class="msm-sel-tags">' + tag(item["class"] ? clsName(item["class"]) : t.pick.unknownClass, item["class"] ? "" : "msm-tag-warn") +
				(!item.flyable && item["class"] ? tag(t.pick.notFlyable, "msm-tag-warn") : "") +
				(a.aircraft && a.aircraft.title === item.title ? tag(t.pick.current, "msm-tag-blue") : "") + "</div>";
		if (g.items.length > 1) {
			side += '<div class="msm-section-t">' + esc(t.pick.variant) + '</div><div class="msm-list">';
			for (var v = 0; v < g.items.length; v++) {
				var it = g.items[v];
				side += '<div class="msm-li' + (v === at.i ? " is-sel" : "") + (it.flyable ? "" : " is-dim") + '" data-act="variant:' + v + '" data-nav="1"><div class="msm-fx"></div><span>' + esc(it.title) + '</span><div class="msm-corner"></div></div>';
			}
			side += "</div>";
		} else {
			side += '<div class="msm-sel-title">' + esc(item.title) + "</div>";
		}
		var liv = item.liveries || [];
		if (liv.length) {
			side += '<div class="msm-section-t">' + esc(t.pick.livery) + " · " + esc(t.pick.liveries(liv.length)) + '</div><div class="msm-list">';
			side += '<div class="msm-li' + (!S.pick.livery ? " is-sel" : "") + '" data-act="livery:-1" data-nav="1"><div class="msm-fx"></div><span>' + esc(t.defaultLivery) + '</span><div class="msm-corner"></div></div>';
			for (var l = 0; l < liv.length; l++) {
				side += '<div class="msm-li' + (S.pick.livery === liv[l] ? " is-sel" : "") + '" data-act="livery:' + l + '" data-nav="1"><div class="msm-fx"></div><span>' + esc(liv[l]) + '</span><div class="msm-corner"></div></div>';
			}
			side += "</div>";
		}
		if (item.credit) side += '<div class="msm-credit">' + esc(typeof item.credit === "string" ? item.credit : (item.credit.author || "") + " · " + (item.credit.license || "")) + "</div>";
		var dis = !!S.busy;
		var foot = '<div class="msm-btn msm-btn-primary msm-btn-cta' + (dis ? " is-disabled" : "") + '" data-act="use" data-nav="1"><div class="msm-fx"></div>' + icon("check") + "<span>" + esc(S.busy === "pick" ? t.working : t.pick.use) + '</span><div class="msm-corner"></div></div>';

		return errorHtml() + '<div class="msm-split msm-split-pick">' +
			'<div class="msm-split-main">' + head + scrollHtml("pick-grid", grid, "msm-under-sub msm-cols-" + n) + "</div>" +
			'<div class="msm-split-side is-short">' + scrollHtml("pick-side:" + g.key, '<div class="msm-sel">' + side + "</div>", "msm-side-scroll") + '<div class="msm-side-foot">' + foot + "</div></div>" +
			"</div>";
	}

	function famCard(g, idx, sel, n) {
		var t = T();
		var tags = tag(g.cls ? clsName(g.cls) : t.pick.unknownClass, g.cls ? "msm-tag-dark" : "msm-tag-warn");
		if (g.items.length > 1) tags += tag(t.pick.variants(g.items.length), "msm-tag-dark");
		if (!g.flyable && g.cls) tags += tag(t.pick.notFlyable, "msm-tag-warn");
		return '<div class="msm-card-cell"><div class="msm-card' + (sel ? " is-sel" : "") + (g.flyable ? "" : " is-dim") + '" data-act="fam:' + idx + '" data-nav="1">' +
			'<div class="msm-card-photo">' +
				'<div class="msm-card-bg"' + (g.photo ? ' data-bg="' + esc(g.photo) + '"' : "") + ">" + (g.photo ? "" : icon("plane", "msm-ac-ph")) + "</div>" +
				'<div class="msm-tile-grad"></div>' +
				'<div class="msm-wedge-top"><svg class="msm-wedge-svg" viewBox="0 0 100 100" preserveAspectRatio="none"><path d="M0 0H100L0 100Z"></path></svg></div>' +
				'<div class="msm-fx"></div>' +
				'<div class="msm-card-tags">' + tags + "</div>" +
			"</div>" +
			'<div class="msm-card-name"><span>' + esc(g.name) + "</span></div>" +
			'<div class="msm-corner"></div></div></div>';
	}

	// --- Bildirim (uçuş başlatılınca) -----------------------------------------------------------------------------

	function renderToast() {
		var now = Date.now();
		var show = now < S.toastUntil && !S.open;
		var t = T();
		if (!show) {
			if (el.toast.style.display !== "none") el.toast.style.display = "none";
			return;
		}
		var launch = S.live && S.live.launch;
		var note = launch && launch.note ? launch.note : S.toastNote || t.toastSent;
		var step = launch && launch.step ? t.launch[launch.step] || "" : "";
		var html = '<div class="msm-toast-bar"></div><div class="msm-toast-text"><div class="msm-toast-t">' + esc(t.toastTitle) + (step ? '<span class="msm-toast-step">' + esc(step) + "</span>" : "") + "</div>" +
			'<div class="msm-toast-n">' + esc(note) + "</div></div>";
		setHtml("toast", html);
		if (el.toast.style.display !== "block") el.toast.style.display = "block";
		if (launch && (launch.step === "done" || launch.step === "manual") && S.toastUntil - now > 8000) S.toastUntil = now + 8000;
	}

	// --- Kaydırma -------------------------------------------------------------------------------------------------

	function saveScrolls() {
		if (!el.body) return;
		var list = el.page.querySelectorAll(".msm-scroll");
		for (var i = 0; i < list.length; i++) {
			var view = list[i].firstChild;
			S.scroll[list[i].getAttribute("data-scroll")] = view ? view.scrollTop : 0;
		}
	}

	function restoreScrolls() {
		var list = el.page.querySelectorAll(".msm-scroll");
		for (var i = 0; i < list.length; i++) {
			var view = list[i].firstChild;
			var v = S.scroll[list[i].getAttribute("data-scroll")];
			if (view && v) view.scrollTop = v;
			updateBar(list[i]);
		}
		lazyLoad();
	}

	function updateScrollbars() {
		var list = el.page.querySelectorAll(".msm-scroll");
		for (var i = 0; i < list.length; i++) updateBar(list[i]);
		lazyLoad();
	}

	function updateBar(box) {
		var view = box.firstChild;
		var bar = box.lastChild;
		if (!view || !bar) return;
		var thumb = bar.firstChild;
		var vh = view.clientHeight;
		var sh = view.scrollHeight;
		var need = sh > vh + 2;
		if (need !== hasClass(box, "has-bar")) {
			if (need) box.classList.add("has-bar");
			else box.classList.remove("has-bar");
		}
		if (!need) return;
		var bh = bar.clientHeight;
		var th = Math.max(Math.round((bh * vh) / sh), Math.round(40 * (S.k || 1)));
		var top = Math.round(((bh - th) * view.scrollTop) / Math.max(1, sh - vh));
		var hs = th + "px";
		var ts = top + "px";
		if (thumb.style.height !== hs) thumb.style.height = hs;
		if (thumb.style.top !== ts) thumb.style.top = ts;
	}

	// Görünür alana (ve bir ekran ötesine) gelen kartların fotoğrafını yükler.
	function lazyLoad() {
		var list = el.page.querySelectorAll("[data-bg]");
		if (!list.length) return;
		var h = window.innerHeight || 1080;
		for (var i = 0; i < list.length; i++) {
			var r = list[i].getBoundingClientRect();
			if (r.bottom > -h && r.top < h * 2 && r.width > 0) {
				list[i].style.backgroundImage = "url('" + list[i].getAttribute("data-bg") + "')";
				list[i].removeAttribute("data-bg");
			}
		}
	}

	function scrollBox(box, dy) {
		var view = box.firstChild;
		var max = Math.max(0, view.scrollHeight - view.clientHeight);
		var v = Math.max(0, Math.min(max, view.scrollTop + dy));
		view.scrollTop = v;
		S.scroll[box.getAttribute("data-scroll")] = v;
		updateBar(box);
	}

	// Klavyeyle odaklanan öğe kaydırma alanının dışındaysa görünür yapılır.
	function reveal(node) {
		var box = closest(node, el.page, function (n) { return hasClass(n, "msm-scroll"); });
		if (!box) return;
		var view = box.firstChild;
		var vr = view.getBoundingClientRect();
		var r = node.getBoundingClientRect();
		var pad = 12 * (S.k || 1);
		if (r.top < vr.top) scrollBox(box, r.top - vr.top - pad);
		else if (r.bottom > vr.bottom) scrollBox(box, r.bottom - vr.bottom + pad);
	}

	// --- Odak, fare ve klavye -------------------------------------------------------------------------------------

	function navScope() {
		return S.confirm ? el.modal : el.page;
	}

	function isNav(n) {
		return n.getAttribute && n.getAttribute("data-nav") === "1";
	}

	function setHover(node, byKey) {
		if (S.hover === node) {
			S.hoverByKey = byKey;
			return;
		}
		if (S.hover && S.hover.classList) S.hover.classList.remove("is-hover");
		S.hover = node;
		S.hoverByKey = byKey;
		S.hoverKey = node ? node.getAttribute("data-act") || "" : "";
		if (node) {
			node.classList.add("is-hover");
			if (!hasClass(node, "is-disabled")) sound(node.getAttribute("data-snd") || "genericbutton", "SELECT");
		}
	}

	function restoreHover() {
		var stale = el.page.querySelectorAll(".is-hover");
		for (var s = 0; s < stale.length; s++) stale[s].classList.remove("is-hover");
		if (!S.hoverKey) {
			S.hover = null;
			return;
		}
		var list = navScope().querySelectorAll('[data-nav="1"]');
		for (var i = 0; i < list.length; i++) {
			if (list[i].getAttribute("data-act") === S.hoverKey) {
				S.hover = list[i];
				list[i].classList.add("is-hover");
				return;
			}
		}
		S.hover = null;
		S.hoverKey = "";
	}

	function onOver(e) {
		var target = e.target;
		if (!S.dead && el.tile && (target === el.tile || el.tile.contains(target))) {
			setTileHover(true);
			return;
		}
		if (!S.open) return;
		var node = closest(target, el.page, isNav);
		if (node && !navScope().contains(node)) node = null;
		if (node !== S.hover && (node || !S.hoverByKey)) setHover(node, false);
	}

	function onOut(e) {
		if (el.tile && (e.target === el.tile || el.tile.contains(e.target))) {
			var to = e.relatedTarget;
			if (!to || !(to === el.tile || el.tile.contains(to))) setTileHover(false);
		}
	}

	function onClick(e) {
		var target = e.target;
		if (el.tile && (target === el.tile || el.tile.contains(target))) {
			sound("widgetbutton", "VALID");
			openPage();
			stop(e);
			return;
		}
		if (!S.open || !el.page.contains(target)) return;
		var node = closest(target, el.page, isNav);
		stop(e);
		if (!node || !navScope().contains(node)) return;
		activate(node);
	}

	function stop(e) {
		try {
			e.stopPropagation();
			e.preventDefault();
		} catch (x) {}
	}

	function activate(node) {
		var snd = node.getAttribute("data-snd") || "genericbutton";
		if (hasClass(node, "is-disabled")) {
			sound(snd, "INVALID");
			return;
		}
		sound(snd, "VALID");
		run(node.getAttribute("data-act") || "");
	}

	function run(act) {
		var t = T();
		var a = st().active;
		var colon = act.indexOf(":");
		var name = colon >= 0 ? act.substring(0, colon) : act;
		var arg = colon >= 0 ? act.substring(colon + 1) : "";
		switch (name) {
			case "close":
				closePage(true);
				break;
			case "back":
				goBack();
				break;
			case "tab":
				setTab(arg);
				break;
			case "retry":
				S.startedAt = Date.now();
				fetchState();
				fetchLive();
				renderAll();
				break;
			case "start":
				S.start = { runway: arg === "runway", end: arg === "runway" && S.start ? S.start.end : null };
				renderAll();
				break;
			case "end":
				S.start = { runway: true, end: arg || null };
				renderAll();
				break;
			case "launch":
				if (!a || !a.aircraft) return;
				post("launch", "/api/launch", { start: { runway: !!(S.start && S.start.runway), end: S.start && S.start.runway ? S.start.end : null } }, function () {
					S.toastUntil = Date.now() + 60000;
					S.toastNote = t.toastSent;
					S.live = null;
					fetchLive();
					closePage(true);
				});
				break;
			case "cancel":
				S.confirm = "cancel";
				renderAll();
				focusFirst();
				break;
			case "dismiss":
				S.confirm = null;
				renderAll();
				break;
			case "confirm-cancel":
				post("cancel", "/api/cancel", {}, function () {
					S.confirm = null;
					S.tab = "board";
					fetchBoard();
				});
				break;
			case "job":
				S.jobSel = arg;
				renderAll();
				break;
			case "accept":
				post("accept", "/api/accept", { id: arg }, function () {
					S.pickJob = null;
					S.tab = "pick";
					fetchAircraft();
				});
				break;
			case "refresh-board":
				fetchBoard();
				break;
			case "fam":
				var g = S.groups[parseInt(arg, 10)];
				if (g) {
					var cur = S.pick ? itemByTitle(S.pick.title) : null;
					if (!cur || S.groups[cur.g] !== g) S.pick = { title: g.items[0].title, livery: "" };
					S.revealSel = true;
				}
				renderAll();
				break;
			case "variant":
				var at = S.pick ? itemByTitle(S.pick.title) : null;
				if (at) {
					var it = S.groups[at.g].items[parseInt(arg, 10)];
					if (it) S.pick = { title: it.title, livery: "" };
				}
				renderAll();
				break;
			case "livery":
				var at2 = S.pick ? itemByTitle(S.pick.title) : null;
				if (at2) {
					var item = S.groups[at2.g].items[at2.i];
					var li = parseInt(arg, 10);
					S.pick = { title: item.title, livery: li >= 0 && item.liveries ? item.liveries[li] || "" : "" };
				}
				renderAll();
				break;
			case "use":
				if (!S.pick) return;
				post("pick", "/api/pick", { title: S.pick.title, livery: S.pick.livery || "" }, function () {
					S.pickJob = null;
					S.tab = "active";
				});
				break;
		}
	}

	function goBack() {
		if (S.confirm) {
			S.confirm = null;
			renderAll();
			return;
		}
		if (S.tab === "pick") {
			setTab("active");
			return;
		}
		closePage(true);
	}

	function navItems() {
		var out = [];
		var list = navScope().querySelectorAll('[data-nav="1"]');
		for (var i = 0; i < list.length; i++) {
			var r = list[i].getBoundingClientRect();
			if (r.width > 2 && r.height > 2) out.push(list[i]);
		}
		return out;
	}

	function focusFirst() {
		var items = navItems();
		var pick = null;
		for (var i = 0; i < items.length; i++) {
			if (hasClass(items[i], "msm-btn-cta") || hasClass(items[i], "msm-btn-danger")) pick = pick || items[i];
		}
		if (S.confirm) {
			for (var j = 0; j < items.length; j++) if (items[j].getAttribute("data-act") === "dismiss") pick = items[j];
		}
		if (pick || items.length) setHover(pick || items[0], true);
	}

	// Yön tuşlarıyla en yakın öğeye geçiş (simin kendi odak düzenine benzer).
	function move(dir) {
		var items = navItems();
		if (!items.length) return;
		var cur = S.hover && navScope().contains(S.hover) ? S.hover : null;
		if (!cur) {
			focusFirst();
			return;
		}
		var a = cur.getBoundingClientRect();
		var ax = a.left + a.width / 2;
		var ay = a.top + a.height / 2;
		var best = null;
		var bestScore = Infinity;
		for (var i = 0; i < items.length; i++) {
			var b = items[i];
			if (b === cur) continue;
			var r = b.getBoundingClientRect();
			var bx = r.left + r.width / 2;
			var by = r.top + r.height / 2;
			var main;
			var side;
			if (dir === "left" || dir === "right") {
				main = dir === "left" ? a.left - r.right : r.left - a.right;
				if ((dir === "left" ? bx >= ax - 2 : bx <= ax + 2)) continue;
				side = r.bottom < a.top ? a.top - r.bottom : r.top > a.bottom ? r.top - a.bottom : 0;
			} else {
				main = dir === "up" ? a.top - r.bottom : r.top - a.bottom;
				if ((dir === "up" ? by >= ay - 2 : by <= ay + 2)) continue;
				side = r.right < a.left ? a.left - r.right : r.left > a.right ? r.left - a.right : 0;
			}
			var score = Math.max(0, main) + side * 3;
			if (score < bestScore) {
				bestScore = score;
				best = b;
			}
		}
		if (best) {
			setHover(best, true);
			reveal(best);
		}
	}

	var KEYS = { 27: "esc", 8: "back", 13: "enter", 32: "enter", 37: "left", 38: "up", 39: "right", 40: "down", 9: "tab" };

	function onKey(e) {
		if (!S.open) return;
		var k = KEYS[e.keyCode];
		if (!k) return;
		stop(e);
		if (e.type !== "keydown") return;
		// Simin giriş yığınına bağlıyken bu tuşlar oradan gelir; aynı basış iki kez işlenmesin.
		if (SIM.actions.length && k !== "tab") return;
		if (k === "esc" || k === "back") goBack();
		else if (k === "enter") {
			if (S.hover && navScope().contains(S.hover)) activate(S.hover);
		} else if (k === "tab") move(e.shiftKey ? "left" : "right");
		else move(k);
	}

	// Coherent hangi tekerlek olayını gönderiyorsa o işlenir; ikisi birden gelirse ikincisi atlanır.
	var lastWheel = { t: 0, type: "" };
	function onWheel(e) {
		if (!S.open || !el.page.contains(e.target)) return;
		var now = Date.now();
		if (lastWheel.type && lastWheel.type !== e.type && now - lastWheel.t < 40) {
			stop(e);
			return;
		}
		lastWheel = { t: now, type: e.type };
		var box = closest(e.target, el.page, function (n) { return hasClass(n, "msm-scroll"); });
		var dy = 0;
		if (typeof e.deltaY === "number") dy = e.deltaY * (e.deltaMode === 1 ? 40 : e.deltaMode === 2 ? 400 : 1);
		else if (typeof e.wheelDelta === "number") dy = -e.wheelDelta;
		stop(e);
		if (!box || !dy) return;
		var stepPx = 110 * (S.k || 1);
		scrollBox(box, dy > 0 ? Math.max(stepPx, Math.min(dy, stepPx * 3)) : Math.min(-stepPx, Math.max(dy, -stepPx * 3)));
	}

	// Kaydırma çubuğu: tutup sürükleme ve boş yere tıklayınca sayfa kaydırma.
	function onDown(e) {
		if (!S.open || !el.page.contains(e.target)) return;
		var bar = closest(e.target, el.page, function (n) { return hasClass(n, "msm-scrollbar"); });
		if (!bar) return;
		var box = bar.parentNode;
		var view = box.firstChild;
		stop(e);
		if (hasClass(e.target, "msm-scrollbar-thumb")) {
			S.drag = { box: box, y: e.clientY, top: view.scrollTop };
		} else {
			var tr = bar.firstChild.getBoundingClientRect();
			scrollBox(box, (e.clientY < tr.top ? -1 : 1) * view.clientHeight * 0.9);
		}
	}

	function onMove(e) {
		if (!S.drag) return;
		var d = S.drag;
		var view = d.box.firstChild;
		var bar = d.box.lastChild;
		var thumb = bar.firstChild;
		var range = Math.max(1, bar.clientHeight - thumb.offsetHeight);
		var max = Math.max(0, view.scrollHeight - view.clientHeight);
		view.scrollTop = Math.max(0, Math.min(max, d.top + ((e.clientY - d.y) * max) / range));
		S.scroll[d.box.getAttribute("data-scroll")] = view.scrollTop;
		updateBar(d.box);
	}

	function onUp() {
		S.drag = null;
	}

	// --- Yaşam döngüsü --------------------------------------------------------------------------------------------

	function poll() {
		var now = Date.now();
		var stateEvery = S.open ? 2500 : S.homeVisible ? 5000 : 15000;
		if (now - S.req.state >= stateEvery) fetchState();
		if ((S.open || now < S.toastUntil) && now - S.req.live >= 1000) fetchLive();
		if (S.open && S.tab === "board" && now - S.req.board >= 60000) fetchBoard();
		if (S.open && S.tab === "pick" && (!S.aircraft || !S.aircraft.length) && now - S.req.aircraft >= 6000) fetchAircraft();
		if (!S.open && now >= S.toastUntil && S.html.toast) renderToast();
		// Bağlantı durumu zamanla değişir (yanıt gelmese de "bağlı değil"e düşmeli).
		renderTile();
		if (S.open) renderAll();
	}

	function destroy() {
		try { simDetach(); } catch (e) {}
		S.dead = true;
		for (var i = 0; i < timers.length; i++) {
			clearInterval(timers[i]);
			clearTimeout(timers[i]);
		}
		timers = [];
		for (var j = 0; j < listeners.length; j++) {
			try { listeners[j][0].removeEventListener(listeners[j][1], listeners[j][2], listeners[j][3]); } catch (e) {}
		}
		listeners = [];
		for (var x = 0; x < xhrs.length; x++) {
			try { xhrs[x].abort(); } catch (e) {}
		}
		xhrs = [];
		if (el.root && el.root.parentNode) el.root.parentNode.removeChild(el.root);
		el = {};
	}

	function init() {
		if (S.dead) return;
		if (!document.body) {
			later(250, init);
			return;
		}
		S.lang = detectLang();
		build();
		on(document, "mouseover", onOver, true);
		on(document, "mouseout", onOut, true);
		on(document, "click", onClick, true);
		on(document, "mousedown", onDown, true);
		on(document, "mousemove", onMove, true);
		on(document, "mouseup", onUp, true);
		on(window, "keydown", onKey, true);
		on(window, "keyup", onKey, true);
		on(window, "keypress", onKey, true);
		on(document, "wheel", onWheel, true);
		on(document, "mousewheel", onWheel, true);
		layout();
		renderAll();
		fetchState();
		every(200, layout);
		every(1000, poll);
	}

	window.ModsteadMenu = {
		destroy: destroy,
		open: function () { openPage(); },
		close: function () { closePage(true); },
		// Hata ayıklayıcıdan durum okumak için (salt okunur özet).
		debug: function () {
			return { homeVisible: S.homeVisible, open: S.open, tab: S.tab, tile: tileBox, k: S.k, link: linkMode(), lang: S.lang, tick: layoutTick, timers: timers.length,
				sim: { state: SIM.state, ctx: SIM.ctx, actions: SIM.actions.length, bar: SIM.bar, last: SIM.last, at: SIM.at } };
		},
		version: CFG.v || ""
	};

	try {
		init();
	} catch (e) {
		try { destroy(); } catch (x) {}
	}
})();
