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
3. `.FLT` (uçak başlığı, boya, park yeri ya da pist ucu, konum, saat, canlı hava, plan) ve `.PLN` (doğrudan rota)
   yazılır.
4. Kullanıcı zaten doğru uçakla bir uçuştaysa uçak doğrudan park yerine ya da pist başına taşınır
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
  jobs.rs         ilan panosu (tohumlu, 4 saatlik pencereler), sınav uçuşu, seyahat
  aircraft.rs     uçak sınıfları; simden okunan değerlerle ya da addan sınıflandırma
  airports.rs     gömülü havalimanı veritabanı (airports.tsv) ve coğrafi hesaplar
  hud.rs          sim içi panel: L: değişkenleri, paketin kurulumu
  hud_server.rs   simin içindeki sayfalar için 127.0.0.1'de yerel sunucu: kod, kariyer verisi, kariyer işlemleri
  menu.rs         MSFS 2024 ana menü kutusu: simin kendi bileşeninden paket üretimi, güncelleme koruması
  families.rs     uçak aileleri: simdeki başlık için gerçek uçak tipi ve fotoğrafı
  journal.rs      kariyer günlüğü: sim bağlantısının, uçuş başlatmanın ve takibin ayrıntılı kaydı
  flt.rs          park yeri seçimi, .FLT/.PLN yazımı (2020 ve 2024 biçimi), SimBrief bağlantısı
  model.rs        kalıcı veri; mod.rs: Career (işlemler, uçuş sonu hesap); commands.rs: msfs_career_* komutları
games/msfs/ui/career/   Kariyer sayfası (Panel, İş ilanları, Seyir defteri, Lisanslar, Hangar ve finans); aircraft/ fotoğraflar ve aileler
games/msfs/tools/       airports.py (OurAirports → airports.tsv), map.py (Natural Earth → ui/career/map/)
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

`career::hud_server` (kullanıcının onayıyla eklendi): yalnızca `127.0.0.1`'de, `47213`–`47215` portlarından ilk boş
olanda dinler. Uçlar ve kurallar `hud/menu/API.md`'de. Özet:
- Simin sayfalarına kod, görünüm ve kariyer verisi verir: durum, canlı veri, iş panosu, uçaklar ve fotoğrafları.
- Simin içinden kariyer işlemlerini alır: iş kabulü, uçak seçimi, başlatma, iptal.
- `Host` yalnızca `127.0.0.1`/`localhost` olabilir; bu, DNS yeniden bağlamaya karşı koruma.
- CORS izni ve `POST` yalnızca simin `coui://` sayfalarına açık.
- Dosya ya da kabuk erişimi yok; diskten dosya okumaz.

Uçak fotoğrafları derlemede gömülür (`build.rs`); aile eşleştirmesi arayüzle ortak `ui/career/aircraft/families.json`
dosyasındadır.

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
| Pist dışında > 30 kt taksi | 2 | 6 |
| Sekme | 4 | 12 |
| Az yakıtla iniş (< 30 dk) | 5 | 5 |
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
- **Sırada:** sim içi panele 2024 CommBus ile zengin metin, kesilen uçuşu son konuma ışınlayarak sürdürme, müşteri ve bölge başına itibar, A/B/C bakımları ve
  arıza riski, çok bacaklı işler ve havayolu sözleşmeleri, işe alınan pilotlar ve şirket, SimBrief OFP'sinden
  yakıt/yük, hava durumuna göre iş (IR gerektiren).
