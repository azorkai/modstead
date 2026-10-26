# MSFS Kariyer kipi

[English](CAREER.md) · **Türkçe** · Ekran görüntüleri: [`docs/screenshots/`](../../docs/screenshots/)

Sıfırdan başlayan bir pilotun iş alıp büyüdüğü, uçuşlarının simde hazırlanıp takip edildiği ve seyir defterine
işlendiği kariyer sistemi. MSFS 2024 için tasarlandı; MSFS 2020'de de çalışır (aşağıdaki sınırla).

**Modstead'e gömülüdür.** Kariyerin verisi, kuralları ve sim bağlantısı Modstead'in içindedir; kariyerin kendisi için
simin içine paket kurulmaz. Modstead kapalıyken kariyer yoktur. İsteğe bağlı sim içi panel (bölüm 3a) ve ana menü
kutusu (bölüm 3b) yalnızca Modstead'in verdiğini gösterir; Modstead kapalıyken panel "bağlı değil" der, kutu görünmez.

## 1. Araştırma: başkaları nasıl yapıyor?

| Ürün | Güçlü yanı | Sim entegrasyonu | Kullanıcıların şikâyeti |
|---|---|---|---|
| **OnAir Company** | En derin ekonomi; açık formüller (el kitabı); serbest → şirket aşaması | Kullanıcı serbest uçuşu kendisi açar. Uygulama 6 kontrolü yeşile çevirir (saat, yakıt, yük, doğru uçak, slew/sınırsız yakıt kapalı, kalkışa ≤4 nm). Yakıt/yük/tarihi SimConnect'le yazar; PMDG/Fenix/iniBuilds için "EFB'den girin". "Konumlandır" ile park yerine ya da piste taşır | Abonelik, sürekli çevrim içi zorunluluğu, sunucu kesintileri |
| **NeoFly 4** | 18 görev türü, son tarih yok, yolcu+kargo birlikte | Kullanıcı uçağı kalkışta yükler; uçuş kendiliğinden kaydedilir; yakıt eşitlenir | Yüksek masraflar, acımasız yeterlik uçuşları |
| **A Pilot's Life 2** | Gerçek havayolu tarifeleri, tip yetkisi aileleri, pilot puanı formülü | FSUIPC; kullanıcı konumlanır, takip "motorlar kapalı, yerde, durağan" olunca kendiliğinden başlar | Lisans bürokrasisi, kargo/bakım yok |
| **Air Hauler 2** | Müşteri başına itibar, sigorta, A/B/C bakımları | Kullanıcı kurar, "Tamam"la bağlanır | Kilitlenen takip penceresi |
| **FSEconomy** | Ortak, kalıcı dünya; 30/48 kuralı (48 saatte en çok 30 sim saati) | Yakıt ve yükü sime yazar; uçak başlığını doğrular; slew uçuşu iptal eder | Eski arayüz |
| **Volanta / smartCARS** | "Bin ve uç": takip kendiliğinden başlar; iniş hızı, teker noktası | SimConnect | — |
| **MSFS 2024 kariyeri** | Lisanslar, uzmanlıklar, çalışan → şirket | Kendi içinde | Gizli ve hatalı cezalar, kısa oturumu cezalandıran öğütme, şeffaf olmayan formüller |

**MSFS 2024'te uçuşu dışarıdan otomatik başlatmak:** Hiçbir araç bunu tam olarak yapmıyor. `SimConnect_FlightLoad`
belgede var ama yerden özel başlangıçlarda güvenilir değil (geliştirici forumunda Kasım 2024 ve Mart 2026
bildirimleri); `SimConnect_FlightPlanLoad` uçağı havada bırakabiliyor; komut satırında uçuş/uçak/havalimanı seçeneği
yok; EFB uygulamaları FLT yükleyemiyor. Çalışan tek güvenilir yol OnAir'inki: kullanıcı herhangi bir uçuşu açar,
uygulama denetler, uçağı taşır, yakıt ve yükü yazar.

### Neyi aldık

1. **Kontrol kapısı** (OnAir): zorunlu kontroller yeşile dönünce takip kendiliğinden kurulur (APL'nin "otomatik
   başlama"sı); yakıt ve yük önerileri uyarıdır, engel değildir.
2. **Açık formüller** (OnAir el kitabı, APL kılavuzu): her kuralın kodu, kesintisi ve üst sınırı arayüzde ve bu
   belgede yazar. MSFS 2024 kariyerinin en çok eleştirilen yanı gizli cezalardı.
3. **Puan parayı değil, XP ve itibarı belirler** (OnAir): hatalı bir ceza cebi yakmaz. Para yalnızca gerçek
   olaylardan etkilenir: gecikme, hasar, yakıt, kira.
4. **Korunan ilk aşama** (OnAir serbest kipi, MSFS 2024 çalışan kipi): "operatör adına" işlerde masraf yoktur;
   CPL'den sonra "kendi hesabına" işler açılır.
5. **Kısa uçuş eki**: yarım saatlik oturumlar da kazandırır (OnAir'in mesafe eğrisi).
6. **Pilot puanı** (APL): son 10 uçuşun ortalaması ile tüm uçuşların ortalamasının ortası.
7. **Sınav uçuşuyla lisans** (APL, Air Hauler 2, MSFS 2024).
8. **Sim hızı adil** (FSEconomy/OnAir ruhu): lisans saati blok süresidir ama gerçek sürenin 1,5 katını geçemez.
9. **Akış olaylarıyla hile tespiti** (2024): ışınlanma, faz atlama, kaza.
10. **Dış EFB'li uçaklar** (PMDG, Fenix, iniBuilds, FBW): yük yazılmaz, kullanıcıya plan değerleri gösterilir.

### Neyden kaçındık

Abonelik ve sürekli çevrim içi zorunluluğu (her şey yerel); gerçek zamanlı sıkı son tarihler (acil işler dışında
teslim süresi blok süresinin 3 katı + 24 saat); gizli cezalar; tek kayıt yuvası korkusu (veri JSON, atomik yazılır);
sim çökünce uçuşun kaybı (aktif uçuş 20 sn'de bir diske yazılır, sim aynı yerde açılınca sürer).

## 2. Uçuş nasıl başlar?

"Uçuşu başlat"a basınca (`engine.rs`):

1. Sim kapalıysa Modstead açar (Steam/Store) ve SimConnect bağlantısını bekler.
2. Kalkış havalimanının park yerleri **simin kendi verisinden** alınır (`RequestFacilityData`: TAXI_PARKING tür,
   ad, numara, yarıçap, referans noktasına göre kayma). İşe ve uçağın boyutuna uygun yer seçilir: hafif uçak GA
   apronuna, yolcu jeti kapıya, kargo jeti kargo apronuna. Önbelleğe yazılır (30 gün).
3. `.FLT` (uçak başlığı, boya, park yeri ya da pist ucu, konum, saat, hava, plan) ve `.PLN` (doğrudan rota) yazılır.
   Saat ve hava işin koşullarından gelir: canlı işte gerçek saat ve canlı hava, senaryo işinde senaryonun saati ve
   simin hava ön ayarı (bölüm 4a, "Hava ve zaman senaryoları").
4. Kullanıcı zaten doğru uçakla bir uçuştaysa ve iş canlıysa uçak doğrudan park yerine ya da pist başına taşınır
   (`Initial Position`); değilse `SimConnect_FlightLoad` gönderilir. Sim ana menüde de olsa başka bir uçuşta da olsa
   yükleme doğrudan yapılır.
5. Uçuş açılınca konum denetlenir; hedeften 150 m'den uzaksa taşınır. Yük istasyonlara yazılır (1. istasyon pilot
   sayılır, yük kalanlara dağıtılır).
6. 150 saniyede uçuş açılmazsa **elle kip**: kullanıcı serbest uçuşu kalkış havalimanında açar, "Park yerine taşı"ya
   basar. Kontrol kapısı yeşile dönünce takip kurulur; motorlar çalışınca ya da uçak hareket edince uçuş başlar.

Modstead'in kendi ışınlaması 30 saniyelik bir pencereyle hile sayılmaz. Uçuş yüklenirken ve sim bir uçuşu yükleyip
uçağı yerleştirirken (`FLT_LOAD`, `TELEPORT_*`, `SimStart` sonrası 5 sn) takip güncellenmez: yüklemede görülen anlık
hızlar (8 kt) uçuşu "başladı" saymasın.

### MSFS 2024'te gerçek simde öğrenilenler (25.10.2026, sim 1.9.21.0)

- **Uçuş dosyası biçimi.** 2024, `FlightLoad` ile yalnızca kendi serbest uçuş dosyasının yapısını açar; eksik yapıdaki
  dosyayı hata vermeden yok sayar (2020 biçimimiz ana menüde hiçbir şey yapmadı). `flt::write_flt_2024`, simin
  `MISSIONS\Custom\CustomFlight\CustomFlight.FLT` dosyasından uçağa özel bölümler (yakıt, motor, ışık, kokpit
  değişkenleri) atılarak çıkarılan şablondur: `[ObjectFile]`/`[WolfProgram]` serbest uçuş mantığı, kabin hizmetleri,
  ATC, pencere. `[Departure]`/`[Arrival]` yazılmaz (2024 uçağı başka yere koyabiliyor). Plan `[GPS_Engine]` ile verilir:
  yerden başlarken uçağın yeri değişmiyor, simin GPS'ine aktif plan olarak giriyor (sıradaki nokta varış).
- **Uçulamayan modeller.** `EnumerateSimObjectsAndLiveries` listesindeki 520 başlığın 351'i yapay zekâ trafiği için
  "Passive" modeller; listeden çıkarılır ve seçilemez (`aircraft::is_passive`).
- **Menü de veri gönderir.** 2024 ana menüdeyken kullanıcı uçağının verisini son uçuşun konumuyla göndermeyi sürdürür
  (ilk açılışta yer tutucu 0°, 90°). Uçuşta mı sorusunu kamera cevaplar (`CAMERA STATE`, saniyede bir, değişince):
  32 ana menü, 12 dünya haritası, 35 geçiş, 31 kullanıcı uçağın dışında / "Uçuşa hazır", 16 oyun içi sinema, 29 ESC
  menüsü, 2 kokpit, 3 dış kamera. Menü kameralarında gelen veri uçuş sayılmaz; sim duraklatılınca veri durur ama kamera
  uçuşu gösterir.
- **Pist başı.** Simin `FLIGHT_RUNWAY` durumu yalnızca ana menüden yüklenince sağlıklı açılır ("Uçuşa hazır" → kısa kalkış
  sineması → kokpit, motorlar çalışır). Açık bir uçuşun üstüne yüklenince "Uçuşa hazır" gelmez ve sinemada (kamera 16)
  takılı kalır; kamera değişkeni de yazılamaz. Bu yüzden uçuş açıkken pist başı `PREFLIGHT_TAXI` ile yüklenir: pilot
  koltukta, motorlar çalışır, sinema yok. Ardından kamera 31'de kalıyorsa Modstead kamerayı kokpite (2) alır.
  ("Görüşü sıfırla", `CAMERA REQUEST ACTION` 1, kamerayı dışarı attığı için kullanılmaz.)
- **Aktif duraklatmada kalan uçuş (26.10.2026).** Sim yüklenen uçuşu açılış sineması bitene kadar aktif duraklatmada ve
  kamera 31'de tutar; `RTC_END` ikisini birden bırakır (park yeri: RTC_START → 2,6 sn → RTC_END, sorunsuz). Sinema hiç
  oynamazsa (`PREFLIGHT_TAXI` ile pist başı, açık uçuşun üstüne yükleme) ya da takılırsa bırakma gelmez: Modstead kamerayı
  kokpite alsa da uçak motor çalışır, park freni bırakılmışken kıpırdamaz (`IS IN ACTIVE PAUSE` = 1, `G FORCE` ≈ 0,
  `SIMULATION TIME` 0). Pause tuşu ya da ESC → Devam düzeltir. `Pause_EX1` aktif duraklatmayı hiç bildirmez;
  SimConnect `ACTIVE_PAUSE_TOGGLE` adını tanımaz (istisna 7). Simin kendi FLT'lerinde (`MainMenu.FLT`, şablonlar,
  `CustomFlight.FLT`, uçuş durumu kütüphanesi) bunu önleyen bir anahtar yok. `pause_guard` başlatmadan sonraki iki
  dakikada takılmayı `IS IN ACTIVE PAUSE` ile (okunamazsa sim saati ve G ile) yakalar ve sırayla SimConnect
  `PAUSE_OFF`, sim içi kod (ana arayüzde simin araç çubuğunun çağrısı `TOOLBAR_SET_ACTIVE_PAUSE`, false;
  `/api/sim-assist`) ve `PAUSE_ON` → `PAUSE_OFF` dener; olmazsa kullanıcıya Pause tuşunu söyler. Sim bir kez akarken
  görülünce bekçi kapanır: pilotun sonradan açtığı aktif duraklatmaya dokunulmaz. Hepsi günlükte `[duraklatma]` satırlarıdır.
- **Park yeri.** 2024 park yerinden başlarken kullanıcıyı bilerek uçağın yanında başlatır (dış kontrol); Shift+C ile
  binilir. Kamerayı kokpite çevirmek pilotu koltuğa oturtmuyor, dışarıdaki pilotun gözüne geçiyor: dokunulmaz.
- **Motorlar dışarıdan açılmıyor.** `ENGINE_AUTO_START` olayı ve `GENERAL ENG COMBUSTION` değişkeni 2024 uçaklarında etki
  etmiyor; motorlar ancak simin taksi/pist durumuyla çalışır gelir.
- **Avionik.** `FlightPlanLoad` yalnızca simin ATC planını doldurur; aviyoniklere plan göndermek için simin içindeki
  JavaScript'e açık "Planned Route API" gerekir (Working Title, DevSupport, 2025). `[GPS_Engine]` simin GPS'ine yükler.

Bütün bunlar kariyer günlüğünde izlenebilir (aşağıda).

### Kariyer günlüğü

`career::journal`: simle konuşmanın ve takibin ayrıntılı, sürekli kaydı (`<önbellek>/career/logs/career.log`, 4 MB'de
döner, iki eski kopya). Bağlantı, her başlatma adımı, FlightLoad'un yolu ve hedefi, simin akış ve sistem olayları,
kamera değişimleri, menü/uçuş geçişleri, ışınlamalar, SimConnect istisnaları, takip evreleri ve cezalar, kullanıcının
komutları, paket kurulumları ve simin içinden gelen işlemler yazılır. Kariyer → Panel'deki "Günlük" kartı son satırları
gösterir.

## 3. Mimari

```
games/msfs/src/career/
  simconnect.rs   SimConnect ağ protokolü (DLL'siz): paket üretimi/çözümü, çerçeveleme
  link.rs         bağlantı iş parçacığı: sim açılınca bağlan, kopunca yeniden dene; SimConnect.xml'den port
  engine.rs       bağlantının kariyer tarafı: veri tanımları, telemetri, kontrol kapısı, otomatik başlatma, takip
  tracker.rs      uçuşun evreleri, iniş yakalama, kurallar, hile tespiti, puan
  economy.rs      plan, ücret, piyasa fiyatı, masraflar, hasar, kredi
  progression.rs  lisanslar, seviye/XP, itibar, pilot puanı, unvan
  paths.rs        kariyer yolları: yol tanımları, deneyimli başlangıç paketleri, rütbe basamakları, pano ağırlığı, primler
  jobs.rs         ilan panosu (tohumlu, 4 saatlik pencereler), sınav uçuşu, seyahat
  aircraft.rs     uçak sınıfları; ICAO tip kodu, simden okunan değerler ya da addan sınıflandırma; kendi EFB'si
  addons.rs       mod uçakları: kütüphane ve Community paketlerinin cfg dosyaları (salt okunur), sim listesiyle birleşme
  airports.rs     gömülü havalimanı veritabanı (airports.tsv) ve coğrafi hesaplar
  hud.rs          sim içi panel: L: değişkenleri, paketin kurulumu
  hud_server.rs   simin içindeki sayfalar için 127.0.0.1'de yerel sunucu: kod, kariyer verisi, kariyer işlemleri
  menu.rs         MSFS 2024 ana menü kutusu: simin kendi bileşeninden paket üretimi, güncelleme koruması
  families.rs     uçak aileleri: simdeki başlık için gerçek uçak tipi ve fotoğrafı
  journal.rs      kariyer günlüğü: sim bağlantısının, uçuş başlatmanın ve takibin ayrıntılı kaydı
  env.rs          ortam: güneşin yüksekliği (gece), rüzgâr bileşenleri, VMC/IMC, uçuş kategorisi, yoğunluk irtifası
  dispatch.rs     uçuş kâğıdı: yakıt planı, ağırlıklar, yedek meydan, pist uzunluğu
  weather.rs      gerçek hava: METAR (aviationweather.gov), çözümleme, önbellek
  conditions.rs   hava ve zaman senaryoları: kalkış saati (güneşin yüksekliği), simin hava ön ayarları, üretim, ek
  records.rs      pilot sicili: yeterlilik, sağlık sertifikası, görev süresi
  maintenance.rs  filonun bakım programı ve sigortası
  missions.rs     hava işleri: tur, atlayış, fotoğraf, arama-kurtarma hedefleri
  achievements.rs başarımlar
  flt.rs          park yeri seçimi, .FLT/.PLN yazımı (2020 ve 2024 biçimi), SimBrief bağlantısı
  model.rs        kalıcı veri; mod.rs: Career (işlemler, uçuş sonu hesap); commands.rs: msfs_career_* komutları
games/msfs/ui/career/   Kariyer sayfası (Panel, İş ilanları, Seyir defteri, Lisanslar, Hangar ve finans); aircraft/ fotoğraflar ve aileler
games/msfs/tools/       airports.py (OurAirports → airports.tsv), map.py (Natural Earth → ui/career/map/),
                        relief_tiles.py (Natural Earth II raster → data/relief.tiles)
games/msfs/hud/         araç çubuğu paneli paketi (package/) ve tanımının kaynağı (source/); ana menü paketi
                        (menu-package/) ve ana menü arayüzü (menu/, hud_server.rs verir)
```

**Sim bağlantısı.** MSFS 2024 her kurulumda `SimConnect.xml`'e yerel bir IPv4 girişi (öntanımlı 500) yazar;
Modstead oraya TCP ile bağlanır ve SimConnect.dll'nin konuştuğu ikili protokolü kendisi üretir (paket düzeni açık
kaynak `node-simconnect` ile resmî `SIMCONNECT_RECV_*` yapılarından). Böylece dağıtım lisanslı DLL taşınmaz ve
yeni bağımlılık gerekmez. Okuma kısa zaman aşımıyla yapılır; aynı iş parçacığı giden istekleri de yazar.

**Simden öğrenilenler (2024):** yüklü uçaklar ve boyaları (`EnumerateSimObjectsAndLiveries`), simdeki tüm
havalimanları (`RequestAllFacilities`; iş üretimi simde olmayan havalimanını atlar), havalimanı park yerleri, bir
uçağa binildiğinde motor türü/sayısı, azami ağırlık, kategori (kesin sınıf).

**Telemetri** (≈10 Hz, `SIM_FRAME` × 6): konum, irtifa, AGL, yer/gösterge hızı, dikey hız, yön, yunuslama, yatış,
yerde mi, G, yakıt ve toplam ağırlık, 4 motorun yanması, park freni, iniş takımı, flap, aşırı hız, stall, flap hız
sınırı, sim hızı, slew, pistte mi, **son temasın dikey hızı/yatışı/yunuslaması** (simin kendi ölçümü), mutlak sim
saati, kaza bayrağı. Bir değişkeni tanımayan sürümde sim hata döner; Modstead o alanı atlayıp çözmeye devam eder.

**Olaylar:** `msfs://career-live` (≈1 Hz: bağlantı, telemetri, kontrol kapısı, başlatma adımı, uçuş özeti),
`msfs://career` (veri değişti). Uçuş bitince Modstead bildirimi.

**Veri:** `games/msfs/career/{career.json, logbook.json, tracks/<uçuş>.json}` (kalıcı);
önbellek `…/career/{aircraft.json, sim-airports.json, airports/<ICAO>.json, flights/<iş>/, logs/career.log}`.

## 3a. Sim içi panel (HUD)

MSFS araç çubuğuna eklenen bir Modstead paneli: rota, evre, ilerleme, kalan mesafe, tahmini varış, puan, son teslim,
son iniş, ücret; hazırlıkta kontrol kapısı. Tam ekranda ve VR'da da görünür (masaüstü üstü pencere bunu yapamaz).

**Ekranlar** (başlık çubuğunda durum noktası: yeşil bağlı, gri bağlanıyor, kırmızı bağlı değil):

| Durum | Gösterilen |
|---|---|
| Bağlanıyor | Panel açılınca `SEQ` bir kez artana kadar (en çok 2,5 sn). |
| Modstead bağlı değil | Neden ve ne yapılacağı. Dil hiç öğrenilmediyse İngilizcesi de altta. |
| Kariyer yok / aktif iş yok | Ne yapılacağı ve Modstead'deki yol (Modstead › MSFS › Kariyer, Kariyer › İş ilanları). |
| Hazırlanıyor / kalkışa hazır | Rota, mesafe, planlanan süre, ücret, son teslim, kontrol kapısı (adlarıyla). Hazırken yalnızca kalan öneriler ve takibin ne zaman başladığı. |
| Uçuşta | Rota çizgisi ilerlemeyle dolar; kalan nm ve varış süresi büyük; puan ve not, kesinti sayısı, son inişin fpm ve G'si, ücret, teslim süresi (gecikince sarı); evre çizelgesi (taksi → park) ve sıradaki evre. |
| Kesildi | Kalan ve toplam mesafe, puan, ücret, teslim; aynı yerden sürdürme notu. |

Panel boyutu değişince bütün yerleşim orantılı ölçeklenir (yazı boyutu panelin iç boyutundan hesaplanır, ölçüler em).
Geniş ve alçak panelde iki sütuna geçer; dar panelde kontrol listesi tek sütun olur.

**Neden bu yol** (araştırma özeti):
- `SimConnect_Text` 2020'de kullanılamaz, 2024 başvurusunda hiç yok.
- EFB uygulaması yalnızca tablette görünür ve SDK'daki `efb_api` paketini ister.
- Panel ile yerel HTTP sunucusu yeni bir dinleyen soket açar.
- Araç çubuğu paneli ile `L:` değişkenleri yeni port, bağımlılık ya da enjeksiyon istemez; 2020 SU12+ ve 2024'te
  aynı paketle çalışır.

**Veri yolu:**
- Modstead, açık SimConnect bağlantısından saniyede bir `L:MODSTEAD_HUD_*` değişkenlerini yazar
  (`AddToDataDefinition` + `SetDataOnSimObject`).
- Alanlar `hud.rs` → `FIELDS`. ICAO kodları taban-37 sayıya çevrilir. Kontrol kapısı `CHECK_LIST`'te tek sayıdır:
  `CHECK_IDS` sırasıyla kontrol başına taban-4 basamak (0 yok, 1 tamam, 2 eksik, 3 eksik öneri).
- Panel (`ModsteadCareer.js`) yalnızca okur ve gösterir. `SEQ` 4 saniye artmazsa "Modstead bağlı değil" der. Panel
  açıldığındaki ilk `SEQ` yalnızca başlangıçtır: `L:` değişkeni Modstead kapandıktan sonra da son değerinde kalır.
- Dil `LANG`'dan gelir; panel son bilinen dili simin veri deposunda (`MODSTEAD_HUD_LANG`) tutar.
- Sim `L:` tanımlarını reddederse (eski 2020) o oturumda yazım durur.

**Paket** (`games/msfs/hud/package`):
- Uygulamaya gömülüdür. Kariyer → Panel → "Sim içi panel" kartından kurulur, güncellenir ve kaldırılır.
- Kurulum kütüphaneye yazar, `layout.json` ile `manifest.json`'u o an üretir ve paketi simlerin Community klasörüne
  bağlar. Diğer modlarla aynı yoldan geçer; simler kapalı olmalıdır.
- Panel tanımı `InGamePanels/modstead-career-hud.spb`'dir (kaynağı `hud/source/modstead-career-hud.xml`).
- Bu `.spb` belgelenmiş SPB biçimine göre ([spb2xml24](https://github.com/vectorial287/spb2xml24) `docs/FORMAT.md`)
  bir kez üretildi. Doğrulama:
  - Aynı kodlayıcı kurulu bir panelin `.spb`'sini bayt bayt aynı üretti.
  - Bizim dosya geri çözülünce bütün alanlar doğru okundu.
- Tanım değişirse `.spb` MSFS geliştirici kipinde, SDK paket aracıyla ya da aynı kodlayıcıyla yeniden üretilmeli ve
  `HUD_VERSION` artırılmalı. 0.2.0'da varsayılan boyut 24×30'dan 35×37'ye (en az 26×26) çıktı; birim ekran
  yüksekliğinin yüzdesidir (simin Görev adımları paneli 36×22, METAR 45×15, ATC 48×55). Sim kullanıcının verdiği
  boyutu hatırlar; yeni varsayılan panel ilk açılışta ya da yerleşim sıfırlanınca görünür.

**Simin panel kabuğu** (MSFS 2024, `fs-base-ui/html_ui/Templates/ingameUi`): `ingame-ui` > başlık
(`ingame-ui-header`: başlık, küçült, büyüt, sabitle, kapat) + `.ingameUiContent` > `.ingameUiWrapper` > panelin
kendi öğeleri. `ingame-ui`'nin zemini `--backgroundColorContrastedPanel` (yarı saydam açık gri), başlığın
`--backgroundColorPanel`'dir; başlık metni `.spb`'deki `Name`'den gelir ve büyük harfe çevrilir. Panel tanımı
`headerVisible` ve `noBackground` özelliklerini de destekler (başlık gizlenirse kapat düğmesi de gider; kullanılmadı).

**İlk gerçek deneme (2024, 0.1.0) ve düzeltmeler (0.2.0):**
- *Metinler boştu:* kurulu `ModsteadCareer.js`'de bir dizgenin içinde gerçek satır sonu vardı (`"\n"` yerine). Bu
  sözdizimi hatası betiğin tamamını durdurdu: özel öğe hiç tanımlanmadı, `SimVar` okunmadı. Görünen nokta, ok ve boş
  hap yalnızca CSS'ti (nokta CSS'te yeşildi, bağlantıyı göstermiyordu). `hud.rs` testi artık dizgeleri ve parantezleri
  denetliyor. Ayrıca alan ve yöntem adları `ms` önekli: `HTMLElement.lang` gibi yerleşik özelliklerle çakışma
  (`this.lang = null` özniteliği "null" yapar) ve simin `UIElement` taban sınıfıyla ad çakışması olmasın.
- *Koyu zemin yarıda kalıyordu:* `content-fit="false"` ile iki ara katman yükseklik almıyor, kök yalnızca içerik
  kadar uzuyordu; altı `ingame-ui`'nin gri zemini. Artık `content-fit="true"` (simin `fittedContent` sınıfı) ve ara
  katmanlar esniyor; zemin `ingame-ui`'nin kendisinde, kenar boşluğu yok.
- *Gri başlık çubuğu "MODSTEAD CAREER":* simin düğmeleri kaldı; şerit aynı koyu yüzeye alındı, başlık metninin
  yerine durum noktası + MODSTEAD + Kariyer/Career yazılıyor. Türkçe metinler büyük harfle yazılı: simin motoru
  `text-transform` ile "i"yi "I" yapar, "İ" yapmaz.
- Yazı tipi simin kendi Roboto'su (`font-family: "Roboto-Regular"`, kalınlıklar 300/400/600/700); eski CSS'teki
  "Roboto Mono" simde yoktu.

0.2.0 simin kendi `common.css`, `ingameUi` şablon CSS'i ve Roboto yazı tipleriyle kurulan bir deneme sayfasında her
durum ve dört boyutta denendi. Gerçek simde (Coherent GT) DOM ve hesaplanmış stil denetimi henüz yapılmadı; hata
ayıklayıcı `http://127.0.0.1:19999`, sayfa `pagelist.json`'da `ModsteadCareer.html` adresiyle bulunur (kimlik her
açılışta değişir).

**Simi kapatmadan güncelleme (0.3.0):** sim panelleri ve paket listesini yalnızca açılışta okur; oyun açıkken mod
klasörüne de yazılmaz. Bu yüzden panelin kendisi artık küçük bir yükleyicidir (`ModsteadLoader.js`): Modstead açıksa
kodu (`/hud/app.js`), görünümü (`/hud/app.css`) ve işaretlemeyi (`/hud/body.html`) Modstead'in yerel sunucusundan alır,
kapalıysa paketteki kopyayı kullanır; 5 saniyede bir sürümü (`/hud/v`) yoklar ve değişince kendini yeniler. Paket
güncellemesi yine sim kapalıyken yapılır; kartta "Sim kapanınca güncelle" seçeneği vardır.

### Yerel sunucu

`career::hud_server` (kullanıcının onayıyla eklendi): `127.0.0.1`'de, `47213`–`47215` portlarından ilk boş olanda
dinler; tablet erişimi açılırsa aynı portta yerel ağ adresinde de (kurallar 3c'de). Uçlar ve kurallar
`hud/menu/API.md`'de. Özet:
- Simin sayfalarına kod, görünüm ve kariyer verisi verir: durum, canlı veri, iş panosu, uçaklar ve fotoğrafları.
- Simin içinden kariyer işlemlerini alır: iş kabulü, uçak seçimi, başlatma, iptal.
- `Host` yalnızca `127.0.0.1`/`localhost` olabilir; bu, DNS yeniden bağlamaya karşı koruma.
- CORS izni ve `POST` yalnızca simin `coui://` sayfalarına açık.
- Dosya ya da kabuk erişimi yok; diskten dosya okumaz.

Uçak fotoğrafları derlemede gömülür (`build.rs`); aile eşleştirmesi arayüzle ortak `ui/career/aircraft/families.json`
dosyasındadır.

**Panel 0.4.0:**
- Canlı harita (kuzey yukarıda, internet istemez): uçak simgesi SimVar'lardan saniyede ~30 kez çizilir; planlanan rota,
  uçulan iz, kalkış/varış (yakında pistleriyle), yakındaki havalimanları, menzil halkası, rüzgâr oku; yakınlaştırma ve
  "OTO" (uçak + varış görünsün).
- Uçuş verisi şeridi (yer hızı, irtifa, dikey hız, pruva), rotaya göre karşı/yan rüzgâr, yakıt (uçakta, planda, varışta
  tahmini; son yedeğin altında sarı, sıfırın altında kırmızı), varış havası (kategori, rüzgâr, en uygun pist ucunun
  rüzgâr bileşenleri, pist uzunluğu ve gereken), son kesintiler.
- "PENCEREDE AÇ" (uçuş ekranını Modstead'in ayrı penceresinde açar) ve "TABLETTE AÇ" (bağlantı ve QR).
- Yerleşim panel boyutuna göre seçilir: küçükte Özet / Harita / Ayrıntı sekmeleri, büyükte harita ile ayrıntılar yan
  yana. Sığmayan bloklar önem sırasıyla gizlenir.
- Simin kendi "pencereye ayır" düğmesi de çalışır: panel tanımında kapatan bir ayar yok, karar simindir.
- Ayrıntılı veri yerel sunucudan gelir (`/api/call/…`); sunucu yoksa panel `L:` değişkenleriyle eskisi gibi çalışır.
- Harita Web Mercator'dadır; altında yerel sunucunun karoları (`/api/tiles/relief|sat/…`) çizilir: varsayılan internetsiz yükselti gölgeli arazi, "HARİTA / UYDU" düğmesiyle uydu. Rota macenta, uçulan iz turuncu; havalimanları harita sembolleriyle. Karo sunucusu yoksa harita eski vektör görünümünde kalır.

## 3c. Uçuş ekranı (ayrı pencere, tarayıcı, tablet)

Kariyer → "Uçuş ekranı" kartından ya da sim içi panelden açılan, ikinci ekran için tam sayfa bir uçuş arkadaşı.
Aynı sayfa üç yerde çalışır: Modstead'in ayrı penceresinde, bilgisayardaki tarayıcıda ve aynı Wi-Fi'daki tablet ya da
telefonda. Simde hiçbir şeyi değiştirmez; yalnızca okur.

| Bölüm | İçerik |
|---|---|
| Harita | Uçağı izler; kuzey ya da iz yukarıda; rota, uçulan iz, yedek meydan, yakındaki havalimanları, menzil halkaları; dokunmatik kaydırma ve iki parmakla yakınlaştırma. İnternet istemez (Natural Earth). |
| Uçuş verisi | Yer hızı, IAS, irtifa, yerden yükseklik, dikey hız, pruva, rüzgâr ve bileşenleri, OAT, QNH. |
| İlerleme | Evre çizelgesi, uçulan/kalan mesafe, tahmini varış (UTC ve yerel), son teslime kalan, alçalma noktası (3°). |
| Yakıt | Uçakta, harcanan, saatlik tüketim, dayanım, varışta tahmini, yedek durumu; uçuş kâğıdıyla karşılaştırma. |
| Varış | Çözülmüş METAR, pist rüzgâr bileşenleri, pist uzunluğu ve gereken, yoğunluk irtifası, yedek meydan. |
| Puan ve iş | Canlı puan, kesintiler, iniş raporu; iş türü, müşteri, yük/yolcu, ücret, son teslim, hava işi hedefleri. |

- **Ayrı pencere:** "Pencerede aç" Modstead'in `msfs-deck` penceresini açar; sayfa yerel sunucudan
  (`http://127.0.0.1:<port>/deck`) gelir, komut izni yoktur (hiçbir yetenek dosyasında değil), veriyi HTTP ile yoklar.
- **Tablet:** "Tablet ya da telefon" anahtarı açılınca Modstead bilgisayarın yerel ağ adresinde de dinler (yalnızca
  özel adresler: 10/8, 172.16/12, 192.168/16). Bağlantı ve QR kartta görünür; adreste 128 bitlik bir anahtar vardır.
  Anahtar yalnızca Windows Kimlik Bilgisi Yöneticisi'nde durur (`Modstead/MSFS/DeckKey`); "Bağlantıyı yenile" yenisini
  üretir ve eski bağlantılar çalışmaz. Varsayılan kapalıdır; açık/kapalı seçimi `career/deck.json`'dadır.
- **Yerel ağın kuralları:** `Host` tam olarak `<ağ adresi>:<port>` olmalı; her `/api/*` isteği anahtar ister; yalnızca
  `GET`, yalnızca salt okunur komutlar (durum, canlı veri, harita havalimanları, hava, uçulan iz, uçuş ekranı bilgisi);
  `/hud` ve `/menu` yok; en çok 32 bağlantı. Anahtar sayfa açılınca adres çubuğundan silinir; yanıtlar
  `Referrer-Policy: no-referrer` taşır. Sürüm derlemesinde sayfa kendi CSP'siyle gelir (yalnızca aynı kaynak).
- İlk açılışta Windows güvenlik duvarı izin ister ("Özel ağlar" seçilmeli). Reddedilirse Modstead bunu fark edemez:
  tablet bağlanamaz.
- Ekranın açık kalması (Wake Lock) yalnızca HTTPS'te ya da aynı bilgisayarda çalışır; tablette sayfa bunu not eder.
- Sayfa `deck.html`'dir (Vite'ın ikinci girişi, kod `ui/deck/`). Geliştirmede yerel sunucu bu yolları Vite'a aktarır.

## 3b. Ana menü kutusu

<p align="center">
  <img src="../../docs/screenshots/msfs-2024-main-menu-career-tile.png" alt="MSFS 2024 ana menüsünde simin kendi kutularının yanında Modstead Kariyer kutusu: aktif iş LTBA–LTBU, uçuşu başlatmaya hazır" width="488">
</p>

MSFS 2024'ün ana menüsüne "Modstead Kariyer" kutusu ve tam ekran kariyer penceresi (`career::menu`,
`hud/menu-package`, arayüz `hud/menu`). 26.10.2026'da gerçek simde (1.9.21.0, fs-base-ui 0.1.10) denendi. Bu bölümdeki
görüntüler simde, örnek bir kariyerle alındı.

**Nasıl giriyor.** MSFS 2024, simin kendi HTML dosyalarının (`mainUI.html` dahil) Community'den değiştirilmesine izin
vermez. Ana menünün kök bileşeni ise değiştirilebilir: `fs-base-ui/cookedcomps` altındaki MasterPage
(`{7DA60FBA-EF32-48F2-974D-F8BEA35337A4}`, tek satırlık `.html` ve `.json`). Modstead kurulumda bu bileşenin
**kullanıcının simindeki kopyasını** okur, son `</ui-resource-element>`'ten önce görünmez bir resim ekler ve pakete
yazar. Resmin `onload`'u yükleyiciyi (`/Modstead/ModsteadMenuLoader.js`) yalnızca ana menüde ve bir kez çalıştırır.
- Kutunun ve pencerenin kodu yerel sunucudan gelir (`/menu/app.js`, `/menu/app.css`). Yükleyici sürümü 5 saniyede bir
  sorar; Modstead güncellenince eskisini kaldırıp yenisini yükler, sim yeniden başlatılmaz.
- Modstead kapalıyken menüye bir şey eklenmez. Paket yalnızca MSFS 2024'e bağlanır.
- Başka bir paket aynı bileşeni değiştiriyorsa kurulum yapılmaz ve kart nedenini söyler.

**Koruma** (kullanıcının onayıyla): bir sim güncellemesi bileşeni değiştirirse eski kopya menüyü bozabilir.
- Pakete simin sürümü, fs-base-ui sürümü ve bileşenin özeti yazılır (`modstead-menu.json`). Store'da sim sürümü kayıt
  defterindeki paket anahtarından (`stores::appx_versions`), Steam'de `appmanifest`'teki `buildid`'den okunur.
- Modstead açıkken 30 saniyede bir, sim kapalıysa denetler. Bileşen değişmişse yeniden üretir; üretemezse paketi
  kaldırır ve haber verir.
- Bilinen açık: sim Modstead kapalıyken güncellenir ve Modstead'siz açılırsa koruma o açılışta çalışamaz.

**Fare.** Simin menüsünde fare olayları (mousedown, click) yalnızca `data-input-group` taşıyan öğelere ulaşır; diğerleri
yalnızca üzerine gelmeyi alır, tıklama simin kendisine gider. Kutu `generic-button`, pencere `inputLocker` taşır.

**Klavye ve oyun kolu.** Pencere açıkken tuşları simin ana menüsü de işler: ESC "Masaüstüne çık" sorusunu açar, Space ve
Q/E arkadaki kutulara ve sekmelere gider. Simin kendi sayfaları gibi davranırız:
- Simin ana menü modülü (`coui://html_UI/Global/lib.js`, `import()` ile aynı canlı örnek) giriş yığınını
  (`UIInputStackListener`), `setInputBar`/`clearInputBar` ve `InputBarParams`/`InputBarButtonParams`'ı dışa aktarır.
  Kısaltılmış dışa aktarım adları her güncellemede değişebildiği için sınıf ve fonksiyon adlarıyla bulunur.
- Pencere açılınca `KEY_MENU_SR_*` eylemleri (geri, seç, yön, sonraki/önceki sekme) giriş yığınına eklenir ve simin alt
  çubuğuna (input bar) kendi düğmelerimiz konur: "ESC Kapat/Geri · Seç · Q E Sekme değiştir". Kapanınca ikisi de
  kaldırılır; simin çubuğu ("ESC Masaüstüne Çık · R Sürüm notları") geri gelir.
- Bağlam `MAX`'tır (simin geçişleri ve `lockInput` de bunu kullanır). `DEFAULT`'ta ana menü odak değişince kendi
  eylemlerini sonradan yeniden kaydedip tuşları geri alıyordu (Space arkadaki Market kutusunu açtı). Simin kendi açılır
  penceresi (çıkış sorusu, bildirim) gelince bağlam bırakılır, pencere kalkınca geri alınır.
- Klavyede "seç" Space'tir (simin alt çubuğundaki ⎵); Enter menüde sayfaya ulaşmaz.
- Modül bulunamazsa (eski sim) kendi alt çubuğumuz ve sayfanın klavye olayları kullanılır.

**Pencere.** Sekmeler: Aktif iş (görsel, kalkış–varış şeridi: pist, uzunluk, rakım; yük, yakıt, irtifa, müşteri, son
teslim, XP; sağda uçak, başlangıç ve hazırlık denetimleri), İş ilanları, Uçak seçimi ve Pilot (seviye/XP, itibar, pilot
puanı, kariyer özeti, lisanslar, son uçuşlar). Zemin tam opaktır; yarı saydamken arkadaki sim kutuları sızıyordu.
Simin yazı tipinde "→" yok (kutu çıkar): metinde "–" kullanılır, rota oku SVG'dir.

<table>
  <tr>
    <td width="50%"><img src="../../docs/screenshots/msfs-2024-main-menu-career-jobs.png" alt="MSFS 2024 ana menüsündeki Modstead kariyer penceresinde iş ilanları ve seçilen kargo işinin ayrıntıları"><br><sub><b>İş ilanları</b> simin içinde</sub></td>
    <td width="50%"><img src="../../docs/screenshots/msfs-2024-main-menu-career-pilot.png" alt="MSFS 2024 ana menüsündeki Modstead kariyer penceresinde Pilot sekmesi: lisanslar ve son uçuşlar"><br><sub><b>Pilot</b> sekmesi simin içinde</sub></td>
  </tr>
</table>

**Deneme.** Sim dışında: başsız Edge ve sahte veriyle simin ana menüsünü taklit eden sayfa. Simde: Coherent hata
ayıklayıcısı (`127.0.0.1:19999`, yalnızca okuma ve canlı yükleme); gerçek tıklama ve tuşlar yalnızca sim öndeyken.

2024'te zengin metin için CommBus (`SimConnect_CallCommBusEvent`) sonraki adım.

## 4. Kurallar ve formüller

### Lisanslar (Normal zorlukta; Kolay ×0,5 saat ×0,6 ücret, Gerçekçi ×2 saat ×1,4 ücret)

| Lisans | Önce | Saat | Seviye | Ücret | Sınav uçağı | Açtığı |
|---|---|---|---|---|---|---|
| SPL Öğrenci | — | — | 1 | — | — | eğitim uçuşları |
| PPL Özel | SPL | 3 | 2 | 800 $ | hafif pistonlu | kargo, uçak teslimi, arazi |
| CPL Ticari | PPL | 15 | 5 | 2.500 $ | hafif pistonlu | yolcu, charter, ambulans, tek turboprop, kendi hesabına iş, uçak sahipliği, kredi |
| ME Çok motor | PPL | 8 | 3 | 1.500 $ | çift pistonlu | çift motorlular |
| IR Aletli | PPL | 10 | 4 | 2.000 $ | hafif pistonlu | jetlerin şartı |
| H Helikopter | PPL | 5 | 3 | 3.500 $ | helikopter | helikopter |
| JET | CPL, IR | 30 | 8 | 6.000 $ | iş jeti | iş jetleri |
| ATPL | CPL, ME, IR | 60 | 12 | 8.000 $ | bölgesel turboprop | tarifeli seferler |
| TR-N Dar gövde | ATPL, JET | 100 | 16 | 15.000 $ | dar gövde | A320, 737 |
| TR-W Geniş gövde | TR-N | 200 | 22 | 30.000 $ | geniş gövde | 787, 777, A350 |

Sınavı geçmek: varış, puan ≥ 75 (Kolay 65, Gerçekçi 85) ve iniş en fazla "sert". Ücret geçilemese de ödenir.

### Ücret

- **Operatör adına:** `ücret = saatlik ücret × (0,5 + blok saat) × (1 + kısa uçuş eki) × tür × itibar / √zorluk`
- **Kendi hesabına:** `gelir = tipik masraf × 1,1 + operatör ücreti × 2 × (0,4 + 0,6 × doluluk) × tür × itibar / √zorluk`;
  tipik masraf = kira + yakıt + iniş harcı. Gerçek masraf uçuşta ölçülür: kira (blok süresi × saatlik kira) ya da
  kendi uçağında bakım, harcanan yakıt × fiyat, varış havalimanının iniş harcı, hasar.
- Kısa uçuş eki: 150 nm altında `0,6 × (1 − nm/150)`. Tür: ambulans ×1,4, acil ×1,35, arazi ×1,3, charter ×1,25,
  teslim ×0,8. İtibar: 0 → ×0,85, 50 → ×1, 100 → ×1,2.
- İniş harcı: 7 $ × azami ağırlık/1000 lb × (büyük 1,5 · orta 1 · küçük 0,3). Yakıt: avgas 2,5 $/kg, jet 0,95 $/kg.
- Gecikme: her saat için %10, en çok %50.

### Puan (100'den başlar; kural başına üst sınır)

| Kural | Kesinti | Üst sınır |
|---|---|---|
| Aşırı hız | 5 | 15 |
| Stall uyarısı (150 ft AGL üstü) | 5 | 15 |
| Flap hız sınırı | 3 | 9 |
| Yatış > 45° (jet 35°) | 3 | 9 |
| Yunuslama > 25° / < −15° | 3 | 9 |
| G > 2,5 ya da < −1 | 5 | 10 |
| 10.000 ft altında > 265 kt (türbinli) | 5 | 10 |
| Yere yakın (1000 ft altı) yatış > 30° | 3 | 6 |
| Pist dışında 3 sn'den uzun > 30 kt taksi | 2 | 6 |
| Sekme | 4 | 12 |
| Son yedekten az yakıtla iniş (pistonlu 45, türbin 30, helikopter 20 dk) | 5 | 5 |
| Kararsız yaklaşmayla iniş (aşağıda) | 5 | 5 |
| Kuyruk sürtmesi (jet yolcu uçakları: bölgesel 10,5°, dar gövde 11°, geniş gövde 10°) | 10 | 10 |
| Eşikten önce teker koyma | 8 | 8 |
| Uzun iniş (teker koyma bölgesi + 150 m ötesi) | 3 | 3 |
| Eksenden sapma (pist yarı genişliği − 4 m) | 2 | 2 |
| Azami kalkış / iniş ağırlığı aşıldı | 5 + 5 | 5 + 5 |
| Aletli yetki ya da yeterlilik olmadan 30 sn'den uzun bulut/düşük görüş | 10 | 10 |
| Basınçsız kabinde 12.500 ft üstü 30 dk'dan uzun ya da 15.000 ft üstü (FAA 91.211) | 5 | 10 |
| İniş sertliği (sınıfa göre ölçekli; hafif uçak: < 200 fpm 0 · 200–300: 3 · 300–400: 8 · 400–500: 15 · ≥ 500: 25) | | |
| İniş G'si > 1,5: 5 · > 2,0: 10; yatış > 6°: 5 · > 10°: 10 | | |

Not: A+ ≥ 95, A ≥ 88, B ≥ 78, C ≥ 65, D ≥ 50, F. **Geçersiz kılanlar:** havada slew, ışınlanma/faz atlama, havada
yakıt eklenmesi, havada başlayan uçuş, kaza (puan 0, ücret yok, kaza itibarı −15).

### XP, seviye, itibar

- `XP = (100 + 60 × blok saat) × puan/100 × mesafe çarpanı × sınıf çarpanı` (+400 geçilen sınav). Mesafe:
  < 50 nm 0,7 · < 150 0,85 · < 600 1 · < 2500 1,1 · üstü 1,2. Sınıf: hafif 1 … geniş gövde 1,5.
- Seviye L için toplam XP: `250 × L × (L − 1) / 2`.
- İtibar (0–100, başlangıç 50): `(puan − 70) / 10`, −5..+3; geç −3, başarısız −6, kaza −15.

### Uçak, hasar, kredi

- Kiralama havalimanının büyüklüğüne bağlı (küçükte yalnız hafif/çift pistonlu, tek turboprop, helikopter).
- Kendi uçağı: kira yok, bakım var; 100 saatte %12 yıpranma; sert iniş −2, yapısal hasar −8 puan durum; 40'ın
  altında uçamaz. Satış: fiyatın %70'i × durum.
- Hasar sınıfı: iniş > sınıfın "sert" eşiği × 1,5 ya da G > 2 → muayene; × 2 ya da G > 2,6 → yapısal. Kiralıkta
  muafiyet: muayene 0,5 saatlik kira, yapısal 3, kaza 20.
- Kredi (CPL ile): sınır `20.000 × seviye² × (0,5 + itibar/100) + filo değerinin yarısı`; açılış masrafı %10
  (Kolay 5, Gerçekçi 15) borca eklenir; zamana bağlı faiz yok; her kazançlı uçuşun %25'i borca gider.

### Mod uçakları

Topluluk ve üçüncü parti uçaklar (Fenix, PMDG, iniBuilds, FlyByWire, Just Flight, Black Square, ücretsiz modlar)
kariyerde simin kendi uçakları gibi kullanılır (`career/addons.rs`). Simin listesi (`EnumerateSimObjectsAndLiveries`)
yalnızca 2024'te ve sim açıkken gelir; uçağın değerleri de ancak uçağa binilince öğrenilir. Bu yüzden Modstead,
kütüphanesindeki ve simlerin Community klasörlerindeki paketlerin dosyalarını **salt okunur** okur:

| Biçim | Okunanlar |
|---|---|
| 2020 (2024'teki eski biçim dahil) | `SimObjects/Airplanes\|Rotorcraft/<klasör>/aircraft.cfg`: her `[FLTSIM.n]` simde ayrı başlık (`isUserSelectable = 0` olan yapay zekâ sürümü atlanır), `[GENERAL]` ICAO alanları; yanındaki `flight_model.cfg` ve `engines.cfg` (çok eski uçaklarda hepsi `aircraft.cfg`'de). Boya paketi `[VARIATION] base_container` ile tabanının değerlerini alır. Küçük resim `texture.<boya>/thumbnail.jpg`. |
| 2024 modüler | Başlık `presets/<geliştirici>/<ön ayar>/config/aircraft.cfg`'de. Değerler ön ayar > ekler (`attached_objects.cfg` → `attachment_root`, kalıtım `attachment.cfg` → `[Inherit] base`) > `common/config` sırasıyla birleştirilir. Boyalar `liveries/<geliştirici>/<boya>/livery.cfg` (`[GENERAL] name`); `[SELECTION] required_tags` ön ayarın eklerindeki `[Tags]` ile eşleşmeli ("Disabled" hiçbir ön ayarda yok). Başka paketlerin aynı uçak klasörüne eklediği boyalar da sayılır. Küçük resim boyanın `thumbnail/thumbnail.png`'i. |

- **Ayrıştırıcı:** bölüm ve anahtar adları büyük/küçük harf duyarsız; `;`, `//`, `#` yorumları ve tırnak dışındaki satır
  sonu yorumları atılır; tırnaklar soyulur; aynı bölüm iki kez yazılmışsa birleşir, aynı anahtarda sonuncusu
  geçerlidir. UTF-8, UTF-16 ve Latin-1 okunur; 4 MB'tan büyük cfg okunmaz.
- **Güvenlik:** hiçbir dosya çalıştırılmaz, hiçbir yere yazılmaz. Paketin içindeki bağlantılar (junction, symlink)
  izlenmez; ek yolları `fsx::resolve_under` ile paket klasörüne kilitlenir ve kanonik yolla yeniden denetlenir. Küçük
  resim yalnızca dizindeki, kendi paketinin içindeki jpg/png'dir (en çok 8 MB); arayüze ham bayt gider, `blob:` adresi
  olur (CSP değişmedi).
- **Hangi uçaklar:** yalnızca en az bir simde etkin paketler (bağlı, Community'de fiziksel ya da başka aracın
  bağlantısı). Liste simin listesi + uçulan uçaklar + mod paketleri olarak birleşir; aynı başlık (büyük/küçük harf
  duyarsız) tek kayıttır, simin yazımı kalır, boyalar birleşir. Paketteki başlık "Mod" rozeti, paketin adı ve etkin
  olduğu simlerle (2020/2024) gösterilir. Bağlı sim pakette yoksa kart uyarır ("2024'te etkin değil").
- **Sınıf** (`addons::class_for`): elle > ICAO tip kodu > simin değerleri (uçağa binildi) > paketin dosyaları (motor
  türü ve sayısı, azami ağırlık; helikopter klasörü) > ad. Tip kodu ağırlıktan önce gelir: ağırlığa göre 737-700 ve
  A318 bölgesel jet, Global 7500 bölgesel jet görünür. Güven: tip kodu, helikopter klasörü ve simin değerleri "kesin",
  paketin değerleri "büyük olasılıkla", ad "tahmin". Elle verilen sınıf (`msfs_career_set_class`) kalır; arayüz
  "otomatik · ICAO tip kodundan" ya da "elle" yazar.
- **Tip yetkisi:** ayrı bir tablo yok; tip kodu sınıfı verir, sınıfın lisansları yetkiyi (`aircraft::ICAO_TYPES`):
  A318–A321, A19N/A20N/A21N, B731–B739, B37M/B38M/B39M/B3XM, B752/B753, MD-80 → dar gövde (TR-N); B788/B789/B78X,
  A332–A339, A359/A35K, A388, B744/B748, B772–B77W, MD11 → geniş gövde (TR-W); CRJ, ERJ/E-Jet, A220, BAe 146 → bölgesel
  jet; ATR, Dash 8, Saab 340 → bölgesel turboprop; iş jetleri, turbopropler, pistonlular ve helikopterler de.
- **Uçuş kâğıdı:** uçak simde yüklenmeden önce paketin değerleri (MTOW, `max_landing_weight` varsa MLW, boş ağırlık,
  yakıt kapasitesi: eski `[FUEL]` tankları ya da `[FUEL_SYSTEM]` `Capacity:`, seyir hızı, motorlar); uçağa binilince
  simin değerleri kazanır.
- **Kendi EFB'si:** yükü ve yakıtı kendi tabletinden yöneten geliştiriciler (Fenix, PMDG, iniBuilds, FlyByWire,
  Headwind, Leonardo, FSLabs, Aerosoft CRJ, Just Flight, Black Square, TFDi, FlightSim Studio, Hot Start, Salty,
  HorizonSim, A2A) başlıktan, paket klasöründen, paket adından ya da yapımcıdan tanınır. Böyle uçağa Modstead yük yazmaz;
  aktif işte "EFB'ye gir" notu yolcu, kargo ve blok yakıtı gösterir. Hangar'daki listeden uçak başına elle seçilir
  (`msfs_career_set_loading`, `games/msfs/career/aircraft-prefs.json`; kariyer silinse de kalır). Bağlantı iş
  parçacığı aynı bilgiyi `aircraft::manages_own_loading` ile okur.
- **Görsel:** önce paketin kendi küçük resmi (seçilen boyanınki), yoksa ailenin gömülü fotoğrafı, o da yoksa sınıf
  çizimi. Gerçek tip adı ICAO kodundan ("A320" → Airbus A320), yoksa aileden; satın alma penceresi ve kartlar bunu yazar.
- **Ne zaman okunur:** uygulama açıldıktan birkaç saniye sonra arka planda, sonra uçak listesi her istendiğinde
  kütüphane taraması değiştiyse. Paket başına sonuç `manifest.json`, `layout.json` ve `SimObjects` değişene kadar
  önbellekte durur. "Listeyi yenile" diski yeniden tarar (Community'ye elle eklenen paketler için).
- **Arayüz:** Uçak seç penceresinde Hepsi / Sim / Mod süzgeci, sınıf, arama (başlık, tip, ICAO, paket, yapımcı); mod
  paketinin sürümleri tek kartta. Hangar → "Simdeki uçaklar" listesinde her uçağın sınıfı ve yük yöntemi otomatik ya da
  elle seçilir.
- **Deneme:** `cargo test -p game-msfs career::addons` (cfg ayrıştırma, 2020 ve 2024 modüler örnekler, boya paketi,
  helikopter, bağlantı izlememe, birleştirme); gerçek kütüphaneyi salt okunur tarayan
  `cargo test -p game-msfs real_addon_aircraft -- --ignored --nocapture`.

### Kariyer yolları (`paths.rs`)

Kayıtta önce bir yol seçilir (havayolu, kargo, arazi, ambulans ve kurtarma, charter ve iş jeti, hava işleri ya da
serbest pilot), sonra başlangıç: **Sıfırdan** (öğrenci pilot, uçuş okulu) ya da **Deneyimli başla** (yolun lisans
paketi). Yol hiçbir işi kapatmaz; panoyu, rütbeyi, primleri ve hedefleri şekillendirir. Eski kayıtlar serbest pilot
olarak açılır (alan yoksa `general`).

| Yol | Yoldaki işler | Yolun uçakları | Lisans sırası | Önerilen üsler |
|---|---|---|---|---|
| Havayolu | tarifeli sefer, yolcu | bölgesel turboprop ve jet, dar ve geniş gövde | PPL → CPL → ME → IR → ATPL → JET → TR-N → TR-W | LTFM, EGLL, EDDF, LFPG, KJFK, OMDB |
| Kargo | kargo | tek ve çift turboprop, bölgesel turboprop, dar ve geniş gövde | PPL → CPL → ME → IR → ATPL → JET → TR-N → TR-W | EDDP, EBLG, KMEM, KSDF, PANC, VHHH |
| Arazi (bush) | arazi uçuşu | hafif pistonlu, tek turboprop | PPL → CPL → IR → ME | PATK, PAMR, CYXY, NZQN, AYMH, HKNW |
| Ambulans ve kurtarma | ambulans, arama-kurtarma | helikopter, tek ve çift turboprop | PPL → CPL → H → IR → ME | LOWI, LSZH, ENTC, YBAS, LTAC, PAFA |
| Charter ve iş jeti | charter | çift pistonlu, çift turboprop, iş jeti | PPL → CPL → ME → IR → JET | KTEB, LFMN, LSGG, EGLF, LTBA, KVNY |
| Hava işleri | tur, atlayış, hava fotoğrafı | hafif pistonlu, tek turboprop | PPL → CPL → ME → IR | KGCN, PHOG, NZQN, BIRK, LTFE, LSZS |
| Serbest pilot | hepsi eşit | — | — | LTBA, LTFJ, EGKB, KPAO, LFPN, EDNY |

Önerilen üsler kayıtta tek tıkla seçilir; arama kutusuyla her havalimanı yine seçilebilir. Şamandıralı uçak sınıfı
yoktur: deniz uçağı limanlarından yalnızca helikopter kalkar, bu yüzden arazi yolunun üsleri karadadır.

**Deneyimli başla** (Normal zorlukta; saat × zorluğun saat çarpanı, para × 1,5 / 1 / 0,7):

| Yol | Lisanslar | Saat | Sınıf dağılımı | Para | İlk rütbe |
|---|---|---|---|---|---|
| Havayolu | PPL, CPL, ME, IR, JET, ATPL, TR-N | 130 | hafif %30, çift pistonlu %15, çift turboprop %10, iş jeti %15, dar gövde %30 | 10.000 $ | İkinci pilot |
| Kargo | PPL, CPL, ME, IR | 30 | hafif %55, çift pistonlu %20, tek turboprop %25 | 6.000 $ | Besleme pilotu |
| Arazi | PPL | 14 | hafif %100 | 3.500 $ | Arazi pilotu |
| Ambulans ve kurtarma | PPL, CPL, H, IR | 32 | hafif %50, helikopter %35, tek turboprop %15 | 6.000 $ | Ambulans pilotu |
| Charter ve iş jeti | PPL, CPL, ME, IR | 32 | hafif %50, çift pistonlu %30, çift turboprop %20 | 6.000 $ | Charter pilotu |
| Hava işleri | PPL, CPL | 22 | hafif %80, tek turboprop %20 | 5.000 $ | Hava işi pilotu |
| Serbest pilot | PPL, CPL, ME, IR | 22 | hafif %75, çift pistonlu %25 | 6.000 $ | — |

Sıfırdan başlangıç her yolda aynıdır: SPL, 0 saat, 3.000 $. Deneyimli başlangıcın geçmişi tutarlıdır:
- Toplam saat her lisansın saat şartından fazladır (en yüksek şartın en az 1,3 katı); seviye en yüksek lisansın seviyesi.
- Sınıf saatleri yukarıdaki paylarla; çok motor saati çift motorlu sınıflardan; gece ve aletli saat yolun payıyla
  (havayolu %12 / %18, kargo %15 / %12…); yol uçuşu saatin %55'i.
- İnişler sınıfa göre saatte 1,2 (hafif), 1,5 (helikopter), 0,8 (çift pistonlu, tek turboprop), 0,7 (çift ve bölgesel
  turboprop), 0,5 (jet); en az 3 gece inişi; aletli yetkiyle en az 6 aletli yaklaşma.
- Sicil hemen engel olmaz: son günlerde 3 gündüz ve 3 gece inişi, 6 aletli yaklaşma, helikopter yetkisiyle 3 helikopter
  inişi; lisansa uygun sağlık sertifikası (CPL/ATPL 1. sınıf, PPL 2. sınıf).
- Para azdır (en çok 10.000 $): sınavlar ve lisans ücretleri atlanır ama birikim yoktur. Yolda uçulmuş saat sıfırdır;
  pilot yolun ilk basamağında başlar.

Eski başlangıçlar da kabul edilir: "commercial" serbest pilotun deneyimli paketi, "airline" havayolunun deneyimli paketi.

**Rütbe basamakları.** Saat şartı *yolda uçulan saattir*: yolun iş türlerindeki uçuş saatlerinin toplamı (iş türü başına
saat `stats.kindHours`'ta tutulur, eski kariyerde seyir defterinden hesaplanır; yolu seçmeden önce uçulanlar da sayılır).
Saat şartı zorlukla ölçeklenir (Kolay ×0,5, Gerçekçi ×2). Basamaklar sırayla açılır; ulaşılan basamak kalıcıdır
(`pathRanks`): itibar sonradan düşse de rütbe geri alınmaz.

| Yol | 1. basamak | 2. basamak | 3. basamak |
|---|---|---|---|
| Havayolu | İkinci pilot: ATPL | Kaptan: ATPL + JET, 60 sa, itibar 60 | Kıdemli kaptan: ATPL + TR-W, 150 sa, itibar 70 |
| Kargo | Besleme pilotu: CPL | Kargo ikinci pilotu: ATPL, 30 sa, itibar 50 | Kargo kaptanı: ATPL + TR-N, 100 sa, itibar 65 |
| Arazi | Arazi pilotu: PPL | Kıdemli arazi pilotu: CPL, 25 sa, itibar 55 | Baş arazi pilotu: CPL, 80 sa, itibar 70 |
| Ambulans ve kurtarma | Ambulans pilotu: CPL | Kıdemli ambulans pilotu: CPL + IR, 25 sa, itibar 55 | Kurtarma kaptanı: CPL + IR + H, 70 sa, itibar 70 |
| Charter ve iş jeti | Charter pilotu: CPL | Charter kaptanı: CPL + ME + IR, 30 sa, itibar 55 | İş jeti kaptanı: CPL + IR + JET, 80 sa, itibar 70 |
| Hava işleri | Hava işi pilotu: CPL | Kıdemli hava işi pilotu: CPL, 25 sa, itibar 55 | Usta pilot: CPL + ME, 70 sa, itibar 70 |

Unvan: yolda bir basamaktaysa rütbe (simin ana menüsündeki Pilot sekmesi de bunu gösterir), değilse en yüksek lisans.
Bir uçuş, sınav ya da itirazla yeni basamağa çıkılırsa uçuş kaydına `promotion` yazılır.

**Pano ve primler:**
- Yolun türleri panonun yaklaşık %60'ına çıkarılır: `yolun ağırlıkları × max(1, 0,6 / 0,4 × diğer ağırlıklar / yolun
  ağırlıkları)`; zaten fazlaysa dokunulmaz. Yoldaki işlerde yolun uçak sınıflarının seçilme ağırlığı ×2,5. Yolun
  türleri lisansla henüz açık değilse (ATPL'siz havayolu pilotu, PPL'li ambulans pilotu) pano değişmez ve hiçbir iş "yol
  dışı" sayılmaz: o işler saat biriktirmektir. Eğitim ve sınav uçuşları her zaman nötrdür.
- Yolun dışındaki işler "Yol dışı" etiketiyle işaretlenir ve alınabilir; primleri yoktur, saatleri rütbeye sayılmaz.
- **Ücret primi** (yalnızca yoldaki işte), rütbeye göre: basamakta değil %0, 1. %4, 2. %7, 3. %10. Operatör ücretine
  eklenir; kendi hesabına işte tahmini kâr kısmına (`gelir += tahmini kâr × prim`), masraflar aynı kalır.
- **XP primi**: yoldaki işte +%10, uçuş sonunda prosedür ve senaryo ekleriyle çarpılarak (itirazda da aynı formül).
- Serbest pilotta prim ve "yol dışı" yoktur; pano bugünkü ağırlıklarla her türden işi sunar.
- İlanı veren işletme işin türüne uyar (havayolu seferini havayolu, ambulansı ambulans işletmesi verir; hepsi kurgusal).

**Yol değiştirme** (Lisanslar → "Yolu değiştir"; elde iş yokken): ücretsizdir. Lisanslar, saatler, para, itibar ve filo
kalır. Rütbe yeni yolun kendi saatlerinden hesaplanır, bu yüzden çoğu zaman ilk basamaktan başlanır; eski yolda ulaşılan
basamak saklanır, geri dönünce kaldığı yerden sürer. İtibar sıfırlanmaz: itibar pilotundur ve her işte ücreti etkiler.

**Arayüz:** kayıt üç adımdır (yol kartları, başlangıç kartları, pilot kaydı ve seçimin özeti). Panel'de pilot şeridinde
yolun rozeti ve rütbe, "Sıradaki uçuş" önerilerinde yoldaki işler önde (kazanç hızı ×1,6), yolun sıradaki basamağı ve
yapılacaklar kartı, sıradaki lisans yolun lisans sırasından. İş ilanlarında yol etiketi, "Yol" süzgeci ve ayrıntıda
primin açıklaması; Lisanslar'da yolun görseli, yolda uçulan saat, üç basamak ve şartları, yolun lisans sırası.

## 4a. Gerçekçilik

Araştırmanın en net dersi: kullanıcılar gizli ve sıfır toleranslı cezalardan, öğütmeden, gerçek zamanlı kilitlerden ve
anlamsız işlerden nefret ediyor (MSFS 2024 kariyerine yöneltilen eleştiriler; OnAir, NeoFly, A Pilot's Life
forumları). Bu yüzden: **puan yalnızca güvenlik için düşer, prosedürler yalnızca bonus verir, kurallar kısa
toleranslarla uygulanır, simin okuyamadığı şey sayılmaz, her kesintiye 7 gün içinde itiraz edilebilir.**

### Simden okunanlar

Telemetrinin yanında saniyede bir ayrı bir veri tanımı (`env.rs`): `LIGHT BEACON/LANDING/NAV/STROBE/TAXI ON`,
`AMBIENT WIND VELOCITY/DIRECTION`, `AMBIENT VISIBILITY`, `AMBIENT IN CLOUD`, `AMBIENT PRECIP STATE`,
`AMBIENT TEMPERATURE`, `SEA LEVEL PRESSURE`, `STRUCTURAL ICE PCT`, `ZULU TIME/DAY OF YEAR/YEAR`,
`IS GEAR RETRACTABLE`, `CABIN SEATBELTS ALERT SWITCH`, `PRESSURIZATION CABIN ALTITUDE`, `AUTOPILOT MASTER`,
`TRANSPONDER STATE:1`; uçak bilgisinde 2024'ün `MAX TAKEOFF WEIGHT` ve `MAX LANDING WEIGHT` değerleri. Simin tanımadığı
değişken (2020'de transponder ve azami ağırlıklar) atlanır. Varış havalimanının pistleri (konum, yön, uzunluk,
**genişlik**) takip kurulunca simden istenir.

### Kararlı yaklaşma kapısı (Flight Safety Foundation)

Varışın 1000 ft (aletli koşulda) ya da 500 ft (görerek) üstünde, varışa 12 nm'den yakınken:
- dikey hız 1100 fpm'den hızlı olmamalı (1000 + %10 tolerans),
- yatış 20°'yi aşmamalı,
- iniş takımı inik olmalı (katlanır takımlıysa),
- hız sınıfın yaklaşma bandında olmalı (tipik Vref −15 / +35 kt; helikopterde yok).

Kapıdan 100 ft'e kadar da izlenir: 1300 fpm üstü alçalma, 25° üstü yatış ya da 300 ft altında kapalı takım yaklaşmayı
kararsız yapar. Kararsız yaklaşmayla inilirse **5 puan**; kapının 300 ft üstüne tırmanıp pas geçilirse kesinti yok,
"doğru karar" bonusu (+%3 XP). Kararlı yaklaşma +%5 XP.

### Teker koyma noktası

Varış pistleri simden alındıysa iniş noktası pist eşiğine göre ölçülür: eşikten uzaklık, eksenden sapma, teker koyma
bölgesi (pistin ilk 900 m'si ya da üçte biri). Rüzgâr piste göre karşı/arka ve yan bileşenlere ayrılır.

### Prosedürler ve XP bonusları (yalnızca bonus)

| Madde | Ne zaman bakılır |
|---|---|
| İşaret ışığı | Motor çalışıp hareket başlarken |
| Seyrüsefer ışıkları | Gece, hareket başlarken |
| Çakarlar ve iniş ışıkları | Kalkış koşusunda (40 kt üstü) |
| İniş ışıkları ve kemer işareti | Yaklaşma kapısında |
| Transponder açık (3 ya da 4) | Havada, yerden 1500 ft üstünde |

Uçak bir ışığı hiç yakmadıysa ışık maddeleri, kemer işaretini hiç açmadıysa kemer maddesi, transponder değeri hiç
gelmediyse transponder maddesi sayılmaz (uçak bunları simin standart değişkenleriyle sunmuyor olabilir). Her geçen
madde +%1; kararlı yaklaşma +%5; kararsızdan pas geçme +%3; gece inişi +%3; aletli koşulda iniş +%5; 15 kt üstü yan
rüzgârla iniş +%3; yolcu konforu 90+ ise +%3. Toplam en çok **+%20 XP**.

### Yolcu konforu ve hassas yük

Yolcu taşınan işlerde konfor 100'den başlar: 30° üstü yatış (5 sn'de bir −2, en çok −20), 0,6 G altı ya da 1,5 G üstü
(−3; kemer işareti kapalıysa −6; en çok −30), basınçsız uçakta sert alçalma (jet 3000, diğerleri 1500 fpm üstü; −3),
basınçlı kabinde 10.000 ft üstü kabin irtifası (−5), hızlı taksi (−2), sekme (−5), sert iniş (sert −5, çok sert −15,
hasarlı −25). **Puanı değil, bahşişi belirler:** 90+ ücretin %8'i, 75+ %3'ü; 50'nin altı şikâyet (−1 itibar).

Yük türleri (`economy::care`): kırılacak ve elektronik (fragile), canlı hayvan, tıbbi malzeme ve organ (medical),
çiçek, gıda ve deniz ürünü (bozulabilir), tehlikeli madde. Kırılacak, canlı ve tıbbi yükte 1,8 G üstü ya da 0,4 G
altı %10, sert iniş %10–45 hasar verir; **tazminat = ücret × hasar × 0,6**, %30 üstü hasarda −1 itibar. Bozulabilir
yükün teslim süresi dardır (blok × 2 + 4 saat) ve gecikme kesintisi iki katıdır. Tehlikeli madde ticari lisans ister.
Ücret primi: tehlikeli %30, canlı hayvan %20, tıbbi %15, kırılacak ve bozulabilir %10.

### Uçuş kâğıdı (`dispatch.rs`)

Aktif işte seçilen uçağın değerleriyle (simde tanındıysa boş ağırlık, MTOW, MLW, yakıt kapasitesi simden; değilse
sınıfın tipik değerleri, "tahmini" olarak işaretli):
- **Yakıt** (EASA CAT.OP.MPA.181, FAA 91.151/91.167): taksi + yol + ihtiyat (IFR'de yolun %5'i, en az 5 dakika) +
  yedek meydan + son yedek (IFR türbin 30, pistonlu 45 dk; VFR gündüz 30, gece 45 dk; helikopter VFR 20 dk). Yedek
  meydan IFR'de varışa 15–150 nm uzaktaki en yakın uygun (önce orta/büyük) havalimanıdır; yoksa 15 dakika bekleme
  yakıtı eklenir. Varışta yakıt satılmıyorsa (kaplamasız pist, deniz uçağı limanı; küçük havalimanında yalnızca
  avgas) dönüş yakıtı önerilir.
- **Ağırlıklar:** boş + yük = sıfır yakıt; + blok yakıt − taksi = kalkış; − yol = iniş. MTOW ve MLW aşımı, kapasiteyi
  aşan yakıt uyarılır; uçak simde tanındıysa engel sayılır.
- **Pistler:** gereken pist yoğunluk irtifasıyla uzar (pistonlu ve turboprop 1000 ft başına %7, jet %5; inişte %4);
  ıslak pistte iniş %15 uzar. Gece varışı ışıksız piste olacaksa engel.
- Tipik değerler: hafif pistonlu 770 kg boş, 1160 kg MTOW, 145 kg yakıt … geniş gövde 150 t boş, 330 t MTOW, 140 t
  yakıt (`dispatch::typical`). İş panosu sınıfın tipik değerleriyle uçulamayan işi (menzil ya da ağırlık) üretmez.

### Gerçek hava (`weather.rs`)

METAR, aviationweather.gov Data API'sinden (HTTPS, ücretsiz, anahtar yok; `GameInfo.hosts`'a eklendi). Kariyer
sayfası açıkken panodaki varışlar ve aktif işin kalkış, varış ve yedek meydanı için en çok 30 dakikada bir istenir; bir
istekte en çok 40 havalimanı. Ağ yoksa hava bilinmiyor sayılır. Uçuş kategorisi FAA tanımıyla (VFR, MVFR: tavan
≤ 3000 ft ya da görüş ≤ 5 mil, IFR: < 1000 ft ya da < 3 mil, LIFR: < 500 ft ya da < 1 mil).
- Varışı IFR/LIFR olan iş geçerli aletli yetki ve yeterlilik ister; yetkili pilota kötü hava primi (IFR %15, LIFR %25).
- Uçuş kâğıdında sıcaklık ve QNH yoğunluk irtifasına, yağış ıslak piste girer.
- Canlı işte kariyer `.FLT`'de simin canlı havasını açar; sim de gerçek gözlemlerden beslendiği için iki hava birbirine
  yakındır. Senaryo havalı işte METAR kullanılmaz (aşağıda).

### Hava ve zaman senaryoları (`conditions.rs`)

Her iş ya **canlıdır** (gerçek saat, simin canlı havası, gerçek METAR; alanı olmayan eski kayıtlar da böyle okunur) ya
da bir **senaryo** taşır: kalkış saati (gündüz, şafak, alacakaranlık, gece) ve/veya simin yerleşik hava ön ayarlarından
biri. Koşullar iş panosunda (rozetler ve saat/hava süzgeci), iş ayrıntısında, aktif işte, uçuş kâğıdında, seyir
defterinde ve simin ana menüsündeki kariyer sayfasında görünür.

**Saat.** İşin tarihinde (ilan penceresinin günü) kalkış havalimanında güneşin yüksekliği hedefe uyan bir UTC anı
5 dakikalık adımlarla aranır; gündüz işi yerel 08–17, gece işi 19–02 arasından seçilir.

| Saat | Güneş (kalkışta) | Gevşetilmiş hedef | Hiçbiri yoksa |
|---|---|---|---|
| Gündüz | > 25° | > 8° (kışın alçak güneş) | en aydınlık an (kutup gecesi) |
| Şafak | −4°…+6°, yükseliyor | — | en yakın an |
| Alacakaranlık | +6°…−4°, alçalıyor | — | en yakın an |
| Gece | < −12° | < −6° (beyaz geceler) | en karanlık an (kutup gündüzü) |

Son sütundaki durumda arayüz bunu açıkça söyler. Yerel saat boylamdan hesaplanır (15° = 1 saat; yaz saati ve siyasi
saat dilimleri yok), bu yüzden "yaklaşık yerel" yazılır; uçuş dosyasına UTC yazılır (`UseZuluTime=True`).

**Hava ön ayarları.** Değerler MSFS 2024'ün `fs-base-spb/WeatherPresets/*.WPR` dosyalarından türetildi (`PRESETS`;
dosyalar dağıtılmaz, `presets_match_the_sim_files` testi kullanıcının simindeki kopyayı salt okuyup tabloyu denetler).
Bulut tabanları yerden (AGL), rüzgâr hepsinde 270°.

| Ön ayar | Dosya | Bulutlar | Tavan | Görüş | Rüzgâr | Yağış, sıcaklık | Kategori | Ücret eki |
|---|---|---|---|---|---|---|---|---|
| Açık | ClearSky | — | yok | 10 mil+ | 2 kt | —, 15 °C | VFR | 0 |
| Az bulutlu | FewClouds | FEW016 FEW164 | yok | 10 mil+ | 4 kt | — | VFR | 0 |
| Dağınık bulutlu | ScatteredClouds | SCT015 BKN130 BKN300 | 13.000 ft | 10 mil+ | 5 kt | — | VFR | 0 |
| Parçalı bulutlu | BrokenClouds | FEW015 BKN030 | 3000 ft | 8 mil | 12 kt | — | MVFR | 0 |
| Kapalı | Overcast | FEW015 OVC040 BKN100 | 4000 ft | 5 mil | 8 kt | — | MVFR | 0 |
| Yağmur | Rain | SCT015 BKN030 SCT100 | 3000 ft | 3 mil | 10 kt | yağmur | MVFR | %5 |
| Kar | Snow | OVC018 SCT047 | 1800 ft | 1 mil | 5 kt | kar, −5 °C, yerde 50 cm | IFR | %25 |
| Fırtına | Storm | OVC015 OVC030CB BKN200 | 1500 ft | 1,5 mil | 30 kt | yağmur, oraj | IFR | %35 |

Türetme kuralları: kapalılık katmanın yoğunluğu (d) ve dağınıklığından (s): d ≥ 0,9 ve s ≤ 0,1 → OVC; d ≥ 0,5 ve
s ≤ 0,5 → BKN; d ≥ 0,5 ve s ≤ 0,9 → SCT; diğerleri FEW; yoğunluğu 0,05'in altındaki ya da kalınlığı olmayan katman yok
sayılır. Görüş, pustan (`AerosolDensity` ≤ 1,5 → 10 mil, ≤ 2 → 8, ≤ 2,5 → 5, ≤ 3 → 4, üstü 3) ve yağıştan (yağmur
≤ 10 mm/sa → 3 mil, daha şiddetli → 1,5 mil, kar → 1 mil) gelen değerlerin küçüğüdür. Kategori FAA tanımıyla.

**Üretim** (`conditions::generate`; ilan kimliğiyle tohumlanır, aynı pencerede aynı sonuç; panonun geri kalanını
değiştirmez). Önce hava, sonra saat seçilir (ağırlıklar):
- **Öğrenci ve eğitim uçuşu:** canlı 45, açık 25, az bulutlu 20, dağınık 10; saat yalnızca gerçek saat ya da gündüz.
- **PPL:** canlı 45, açık 18, az bulutlu 16, dağınık 12, parçalı 7; arazi uçuşu dışında kapalı 5, yağmur 5. MVFR ön
  ayarında görerek uçan uçuşun (hafif pistonlu, helikopter) seyir irtifası tavanın 500 ft altına indirilir.
- **Kar ve fırtına (IFR):** yalnızca geçerli aletli yetkiyle (yetki + son 6 ayda 6 yaklaşma; Kolay'da yeterlilik
  aranmaz), helikopter ve arazi uçuşu dışında. Kar `8 × mevsim × enlem × yükseklik` (en çok 20; hafif pistonluda
  yarısı, buzlanma koruması yok): mevsim kışta 1, kasım/mart 0,6, ekim/nisan 0,25, yazın 0,05 (güney yarımkürede altı
  ay kaydırılır); enlem ≥ 55° 2,5, ≥ 45° 1,5, ≥ 35° 1, ≥ 25° 0,3, tropikte 0 (8000 ft üstünde 0,4); yükseklik
  ≥ 8000 ft 2,5, ≥ 5000 ft 2, ≥ 2500 ft 1,3. Fırtına 3, yalnızca türbinlilerde.
- **Hava işleri:** atlayış ve fotoğraf canlı, açık ya da az bulutlu; tur dağınık buluta kadar; arama-kurtarma parçalı
  bulut ve yağmura kadar (aletli koşul yok).
- **Saat:** canlı havada gerçek saat 75; ön ayarlı havada her zaman bir senaryo saati (gündüz 70). PPL ile şafak 7,
  alacakaranlık 9, gece 12; bunlar kalkış ve varış pisti ışıklıysa (helikopter hariç). Arazi uçuşunda yalnızca şafak;
  turda alacakaranlık 10, gece 8; arama-kurtarmada alacakaranlık 8, gece yalnızca helikopterle; atlayış ve fotoğrafta
  yalnızca gündüz.
- **Kar** senaryosu kış tarihine konur (tarih kış değilse kuzeyde 15 Ocak, güneyde 15 Temmuz) ve mevsim `Winter`
  yazılır; yerdeki karı ön ayarın kar örtüsü verir.

**Ücret ve XP eki** (`conditions::bonus`):
- hava = uçuş kategorisi (IFR 15, LIFR 25: canlı havadaki kötü hava primiyle aynı) + yağmur 5 + kar 10 + oraj 10 +
  20 kt ve üstü rüzgâr 5;
- saat = kalkışta güneş −6°'nin altındaysa 10 (gece; beyaz gecede aydınlık kalan "gece" işi almaz), şafak ve
  alacakaranlık 5;
- `ücret eki = min(hava + saat, %40)`: ilanın ücretine (kendi hesabına işte gelire) eklenir;
- `XP eki = ücret eki / 2` (yukarı yuvarlanır, en çok %20): uçuş sonunda prosedür bonuslarıyla çarpılarak uygulanır.
- Örnekler: gündüz yağmur %5; gündüz kar %25; gece kar %35 (XP %18); gece fırtına %40 (XP %20). Canlı havalı gece işinde
  gece eki ile METAR'ın kötü hava primi çarpılır.
- Ek, uçuşun simde bu koşullarda yapıldığını denetlemez (canlı havadaki kötü hava primi gibi). Puan yalnızca var olan
  güvenlik kurallarıyla düşer; senaryo için yeni kesinti yoktur.

**Uçuşta:**
- **Uçuş dosyası (2024):** `[Weather]` Asobo'nun kendi kariyer dosyalarındaki biçimle (`fs-career-asobo/…/Certification/
  Turboprop.FLT`) yazılır: `UseWeatherFile=True`, `UseLiveWeather=False`, `WeatherPresetFile=.\WeatherPresets\Snow.WPR`,
  `WeatherCanBeLive=False`. `[DateTimeSeason]`'a senaryonun UTC saati ve kar senaryosunda `Season=Winter`. Canlı iş
  bugünkü gibidir.
- **MSFS 2020:** saat ve mevsim yazılır, hava canlı kalır (ön ayar anahtarları 2020'de doğrulanmadı); arayüz bunu söyler.
- Senaryo işinde uçuş dosyası her zaman yüklenir: aynı uçakla uçuştayken uçağı taşımak saati ve havayı değiştirmez.
  Elle kipte başlatma notu simde seçilecek ön ayarı ve UTC saatini söyler.
- **Uçuş kâğıdı** senaryo havalı işte METAR yerine ön ayarı kullanır ("Senaryo havası"): kategori (IFR yakıt kuralları,
  yedek meydan), ıslak pist, yoğunluk irtifası (ön ayarın sıcaklığı, 1013 hPa). Varışın gece olup olmadığı senaryonun
  saatinden hesaplanır: VFR gece son yedeği (45 dk), ışıksız pist engeli ve gece yolcu yeterliliği aynı kurallarla
  işler; gece, şafak ve alacakaranlık işleri zaten yalnızca ışıklı pistler arasında üretilir.
- Gece ve aletli koşul süreleri, gece inişi ve aletli yaklaşma simin saatinden ve ortamından ölçüldüğü için senaryoda da
  kendiliğinden sayılır.

### Pilot sicili (`records.rs`)

- **Yolcu yeterliliği** (FAA 61.57, EASA FCL.060): son 90 günde aynı kategoride 3 iniş (pist turları sayılır); gece
  biten yolculu iş için 3 gece inişi. Gece: güneş −6°'nin altında (sivil alacakaranlık), simin UTC saatinden.
- **Aletli yeterlilik:** son 6 ayda 6 aletli yaklaşma (aletli koşulda ya da IFR planlı uçuşta hedefe iniş). Düşerse
  aletli yetki yok sayılır: bulutta uçmak kesinti alır, IFR havalı varış işleri kapanır.
- **Sağlık sertifikası** (FAA 61.23, EASA MED.A.045): CPL/ATPL ile 1. sınıf (12 ay; 60 yaş üstü 6 ay), diğerlerinde
  2. sınıf (40 yaş altı 60 ay, 40–49 24 ay, 50+ 12 ay). Doğum yılı kayıtta sorulur (boşsa 30 yaş). Muayene 1. sınıf
  250 $, 2. sınıf 120 $; anında yenilenir.
- **Görev süresi** (EASA ORO.FTL'den sadeleştirilmiş): görev ilk bloktan 1 saat önce başlar, son bloktan 30 dakika
  sonra biter; en uzun görev 13 saat, ikinciden sonraki her sektör 30 dakika kısaltır (en az 9). 10 saat ara verilince
  görev biter; "Dinlen" hemen bitirir (ana üs dışında otel: büyük havalimanı 180 $, orta 120, küçük 70). Son 28 günde
  100, son 12 ayda 1000 uçuş saati. Gerçek zamanlı bekleme yok: dinlenmek bir düğmedir.
- **Zorluk:** Kolay'da sicil yalnızca bilgi; Normal'de sağlık ve yeterlilik uygulanır, görev süresi uyarıdır;
  Gerçekçi'de görev ve uçuş saati sınırları da uygulanır. Ticari ve havayolu başlangıcında yeterlilik tamdır; eski
  kariyerler de tam sayılarak taşınır.
- **Uçuş defteri sütunları:** gece, aletli koşul, çok motor, yol uçuşu (≥ 50 nm) saatleri; gece inişleri, aletli
  yaklaşmalar, kararlı yaklaşmalar.

### Bakım ve sigorta (`maintenance.rs`)

| Sınıf | Muayene | Ağır bakım |
|---|---|---|
| Hafif pistonlu, helikopter | 100 saat ya da 12 ay (1.200 / 2.500 $) | motor revizyonu 2000 / 3000 saat |
| Çift pistonlu | 100 saat ya da 12 ay (2.500 $) | motor revizyonu 1800 saat (45.000 $) |
| Tek / çift turboprop | faz muayenesi 200 saat ya da 12 ay | motor revizyonu 3600 saat |
| İş jeti | 300 saat ya da 12 ay | ağır bakım 3500 saat ya da 48 ay |
| Bölgesel turboprop, jetler | A bakımı 500–800 saat ya da 4 ay | C bakımı 5000–8000 saat ya da 24 ay |

Muayenesi geçen uçak uçamaz; saat sınırı %10 aşılabilir (FAA 91.409'daki pay: uçağı bakıma götürmek için). Ağır
bakım yalnızca orta ve büyük havalimanlarında. Kolay'da yalnızca uyarı; bakımı geçmiş uçak iki kat yıpranır. Muayene
durumu en az 80'e, ağır bakım 100'e çıkarır. **Gövde sigortası** isteğe bağlıdır: prim uçuş saati başına uçak
değerinin %0,0025'i (her kaza %25 artırır); hasarı sigorta onarır, pilot muafiyeti (değerin %5'i) öder.

### Ekonomi

- **Bölgesel yakıt fiyatı** (`economy::region`, konumdan): Kuzey Amerika 1; Avrupa avgas ×1,45, jet ×1,12; Orta Doğu
  avgas ×1,3, jet ×0,92; Afrika, Asya, Güney Amerika, Okyanusya arada. Haftadan haftaya ±%6 (aynı hafta aynı fiyat).
  Kendi hesabına uçuşta kalkıştaki fiyat kullanılır.
- **Seyrüsefer ücreti** (Eurocontrol formülü): birim ücret × km/100 × √(MTOW t / 50); 2 tonun altı muaf, Kuzey
  Amerika içinde yok, Avrupa 80 $, diğer bölgeler 45 $.
- **Yer hizmeti:** büyük havalimanında yolcu başına 8 $ ve kargoda kg başına 6 sent; ortada yarısı.
- Bu masraflar kendi hesabına işlerin teklifine (tipik masraf + %10) girer; operatör adına işlerde operatörün.

### Hava işleri (`missions.rs`, ticari lisansla)

| Tür | Hedef | Koşul |
|---|---|---|
| Panoramik tur | Çevredeki (10–35 nm) 1–2 şehrin üstü, kalkışa dönüş | 1,5 nm içinde, yerden 3000 ft altında |
| Paraşüt atlayışı | Kalkış meydanının üstü | 3 nm içinde, yerden 10.000 ft üstünde, ≤ 95 kt, kesintisiz 20 sn |
| Hava fotoğrafı | 12–30 nm ötede 5 nm aralıklı 3 nokta | 1 nm içinde, hedef irtifa ± 300 ft, ≤ 140 kt (çift turboprop 170) |
| Arama-kurtarma | 15–50 nm ötede son bilinen konum; sonra en yakın orta/büyük havalimanı | 3 nm içinde, yerden 2000 ft altında, kesintisiz 3 dk |

Hedefler uçuş planına kullanıcı noktası olarak girer (GPS sırayla gösterir). Ücret yapılan hedeflerle orantılıdır:
hepsi yapılırsa tam, bir kısmı yapılırsa kısmi ("kısmen tamamlandı"), hiçbiri yapılmazsa başarısız. Ücret çarpanı:
arama-kurtarma 1,5 (acil), hava fotoğrafı 1,3, tur 1,2, atlayış 1,15.

### Başarımlar ve itiraz

24 başarım kariyer verisinden hesaplanır (saklanmaz): ilk uçuş, 100/500 iniş, 10/100/1000 saat, 10.000 nm, 3000 nm'lik
iş, 10 pamuk iniş, 100 puanlık uçuş, 50 kararlı yaklaşma, 25 gece inişi, 50 saat aletli koşul, 20 kt yan rüzgârla
iniş, lisanslar, 5 uçaklık filo, 1.000.000 $ kazanç, 5 tur, 5 atlayış, 3 arama-kurtarma, 10 ülke.

**İtiraz:** uçuş ayrıntısında bir kural kesintisi 7 gün içinde kaldırılabilir (sim ya da eklenti hatası). Para
değişmez (puan parayı etkilemez); puan, not, XP ve itibar yeniden hesaplanır; sınav uçuşu geçme puanına ulaşırsa lisans
verilir; uçuş "itiraz edildi" olarak işaretlenir. Geçersiz sayılan uçuşa (kaza, ışınlanma, slew) itiraz edilemez.

## 5. Veri kaynakları

- **Havalimanları:** [OurAirports](https://ourairports.com/data/) (kamu malı). `tools/airports.py` kapalı, helikopter
  ve balon alanlarını, pist bilgisi olmayan kara havalimanlarını ayıklar (≈30.400 havalimanı, 2,5 MB).
- **Harita:** [Natural Earth](https://www.naturalearthdata.com/) (kamu malı). Dünya görünümünde 1:50m kara, göl ve
  sınırlar. Yakında 1:10m, 10°'lik karolara kırpılmış. Şehirler Türkçe ve İngilizce adlarıyla (Populated Places).
  - `tools/map.py` sadeleştirir, kırpar ve "encoded polyline" biçiminde `ui/career/map/` altına yazar.
  - Kıyı çizgisi kara halkalarından türetilir; kırpmanın karo kenarına eklediği kenarlar atlanır.
  - Her katman ilk gerektiğinde ayrı parça olarak yüklenir.
  - Görünen alandaki havalimanları gömülü veritabanından gelir (`msfs_career_map_airports`).
  - Harita sürükleyerek kaydırılır. Tıklandıktan sonra ya da Ctrl basılıyken tekerlek yakınlaştırır, böylece
    sayfa kaydırması haritaya takılmaz.
- **Harita katmanları (raster karolar):** yerel sunucu `GET /api/tiles/<katman>/<z>/<x>/<y>` verir (Web Mercator,
  256 px JPEG; ayrıntı `hud/menu/API.md`, kod `src/career/tiles.rs`).
  - `relief` (varsayılan, internet istemez): [Natural Earth II](https://www.naturalearthdata.com/downloads/50m-raster-data/50m-natural-earth-2/)
    gölgeli kabartma ve su, 1:50m (`NE2_50M_SR_W`, kamu malı). `tools/relief_tiles.py` Web Mercator'a izdüşürür ve
    z0–5 piramidini tek dosyaya yazar (`data/relief.tiles`, 1365 karo, 7,2 MB; ikiliye gömülür).
  - `sat` (isteğe bağlı, internet ister): EOX [Sentinel-2 cloudless](https://cloudless.eox.at/) 2016 katmanı,
    z0–13, `tiles.maps.eox.at`. Lisans [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) (2018 ve sonraki
    yıllar ticari olmayan CC BY-NC-SA 4.0 olduğundan bilerek 2016 seçildi). Gösterilirken atıf görünmelidir:
    "EOxCloudless https://cloudless.eox.at by EOX IT Services GmbH (Contains modified Copernicus Sentinel data 2016)".
    Karolar diskte saklanır (512 MB sınırı), aynı anda en çok 4 indirme yapılır; çevrimdışıyken 503 döner ve harita
    `relief`'e düşer.
- **Uçak fotoğrafları:** [Wikimedia Commons](https://commons.wikimedia.org/), her fotoğraf kendi lisansıyla (CC BY,
  CC BY-SA ya da kamu malı). Her fotoğrafın sahibi, lisansı ve kaynağı
  [`ui/career/aircraft/CREDITS.md`](ui/career/aircraft/CREDITS.md) dosyasında; projenin GPL-3.0 lisansına girmezler.
- **Protokol:** SimConnect paket düzeni [node-simconnect](https://github.com/EvenAR/node-simconnect) ve MSFS SDK
  belgeleri referans alınarak Rust'ta yeniden yazıldı (kod kopyalanmadı).

## 6. Deneme

```bash
cargo test -p game-msfs career                                 # kurallar, protokol, uçtan uca akışlar
cargo test -p game-msfs real_simconnect -- --ignored --nocapture  # MSFS 2024 açıkken: salt okunur bağlantı
node scripts/dev.mjs msfs --preview   # http://127.0.0.1:1421/?view=game:msfs:career  (&career=new|idle|ready)
```

## 7. Bilinen sınırlar ve yol haritası

- **MSFS 2020** öntanımlı olarak yalnızca adlandırılmış boru açar. `SimConnect.xml`'de IPv4 girişi yoksa bağlantı
  kurulmaz (durum bunu söyler). Boru desteği `tokio`'nun `net` özelliğiyle eklenebilir (bağımlılık kararı).
- **FlightLoad** 2024'te gerçek simde denendi (bölüm 2). Ana menüden ve uçuş açıkken park yeri ve pist başı açılıyor.
  Ana menüden pist başı (`FLIGHT_RUNWAY`) kullanıcı denemesi bekliyor. Elle kip yedek olarak duruyor.
- **Motorlar** dışarıdan çalıştırılamıyor (2024 uçakları olayı yok sayıyor); park yerinden başlarken kullanıcı çalıştırır.
- **Yakıt** otomatik yazılmıyor (2024'ün modüler yakıt sistemi uçağa özel); plan değeri gösteriliyor.
- **Aviyonik:** plan simin GPS'ine giriyor; G1000/FMS'de görünüp görünmediği doğrulanmadı. Görünmüyorsa sim içi sayfa
  Planned Route API ile gönderecek.
- **Sim içi panel 0.3.0** uçuşta gerçek simde henüz denenmedi (bölüm 3a). Ana menü kutusu ve penceresi denendi (3b).
- **Gerçekçilik katmanı (4a)** sahte SimConnect sunucusuyla ve birim testleriyle doğrulandı; yeni ortam değişkenleri
  (ışıklar, transponder, kemer işareti, kabin irtifası, azami ağırlıklar) gerçek simde, farklı uçaklarda henüz
  denenmedi. Okunamayan değişken atlanır ve ilgili madde sayılmaz.
- **Arızalar** simde tetiklenmiyor: 2024'te `TOGGLE_*_FAILURE` olaylarının yeni nesil uçaklarda işe yarayıp
  yaramadığı ve `ExecuteAction("FailureAction")` dışarıdan çalışıyor mu doğrulanmadı. 2024'ün aşınma değişkenleri
  (`WEAR AND TEAR *`) okunabiliyor; bakım ekonomisine bağlamak sıradaki adım.
- **Hava ve zaman senaryoları (4a)** birim testleriyle ve önizlemede doğrulandı; ön ayar tablosu simin `.WPR`
  dosyalarıyla karşılaştırıldı. Gerçek simde denenecekler: `WeatherPresetFile=.\WeatherPresets\…` yolunun simin sanal
  dosya sisteminin dışındaki (Modstead'in önbelleğindeki) bir `.FLT`'den de çözülmesi, `[DateTimeSeason]` saatinin
  ana menüden ve açık uçuşun üstüne yüklemede uygulanması, kar ön ayarında yerin beyaz olması ve `Season=Winter`'ın
  etkisi, canlı hava ile senaryo saatinin (gece + canlı hava) birlikte çalışması. 2020'de ön ayar yazılmıyor.
- **Sırada:** sim içi panele 2024 CommBus ile zengin metin, kesilen uçuşu son konuma ışınlayarak sürdürme, müşteri ve bölge başına itibar, A/B/C bakımları ve
  arıza riski, çok bacaklı işler ve havayolu sözleşmeleri, işe alınan pilotlar ve şirket, SimBrief OFP'sinden
  yakıt/yük, yolda değişen senaryo havası (varışta farklı ön ayar).
