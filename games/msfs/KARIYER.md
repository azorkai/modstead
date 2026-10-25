# MSFS Kariyer kipi

[English](CAREER.md) · **Türkçe** · Ekran görüntüleri: [`docs/screenshots/`](../../docs/screenshots/)

Sıfırdan başlayan bir pilotun iş alıp büyüdüğü, uçuşlarının simde hazırlanıp takip edildiği ve seyir defterine
işlendiği kariyer sistemi. MSFS 2024 için tasarlandı; MSFS 2020'de de çalışır (aşağıdaki sınırla).

**Modstead'e gömülüdür.** Kariyerin verisi, kuralları ve sim bağlantısı Modstead'in içindedir; kariyer için simin içine
paket kurulmaz. Modstead kapalıyken kariyer yoktur. İsteğe bağlı sim içi panel (bölüm 3a) yalnızca Modstead'in
yazdığını gösterir; Modstead kapalıyken "bağlı değil" der.

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
3. `.FLT` (uçak başlığı, boya, park yeri, konum, saat, canlı hava) ve `.PLN` (doğrudan rota) yazılır.
4. Kullanıcı zaten doğru uçakla bir uçuştaysa uçak doğrudan park yerine taşınır (`Initial Position`); değilse
   `SimConnect_FlightLoad` denenir.
5. Uçuş açılınca konum denetlenir; park yerinden 150 m'den uzaksa taşınır. Yük istasyonlara yazılır (1. istasyon
   pilot sayılır, yük kalanlara dağıtılır).
6. 150 saniyede uçuş açılmazsa **elle kip**: kullanıcı serbest uçuşu kalkış havalimanında açar, "Park yerine taşı"ya
   basar. Kontrol kapısı yeşile dönünce takip kurulur; motorlar çalışınca ya da uçak hareket edince uçuş başlar.

Modstead'in kendi ışınlaması 30 saniyelik bir pencereyle hile sayılmaz.

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
  flt.rs          park yeri seçimi, .FLT/.PLN yazımı, SimBrief bağlantısı
  model.rs        kalıcı veri; mod.rs: Career (işlemler, uçuş sonu hesap); commands.rs: msfs_career_* komutları
games/msfs/ui/career/   Kariyer sayfası (Panel, İş ilanları, Seyir defteri, Lisanslar, Hangar ve finans)
games/msfs/tools/       airports.py (OurAirports → airports.tsv), map.py (Natural Earth → ui/career/map/)
games/msfs/hud/         sim içi panel paketi (package/) ve panel tanımının kaynağı (source/); hud.rs kurar ve besler
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
önbellek `…/career/{aircraft.json, sim-airports.json, airports/<ICAO>.json, flights/<iş>/}`.

## 3a. Sim içi panel (HUD)

MSFS araç çubuğuna eklenen bir Modstead paneli: rota, evre, ilerleme, kalan mesafe, tahmini varış, puan, son teslim,
son iniş, ücret; hazırlıkta kontrol kapısı. Tam ekranda ve VR'da da görünür (masaüstü üstü pencere bunu yapamaz).

**Neden bu yol** (araştırma özeti):
- `SimConnect_Text` 2020'de kullanılamaz, 2024 başvurusunda hiç yok.
- EFB uygulaması yalnızca tablette görünür ve SDK'daki `efb_api` paketini ister.
- Panel ile yerel HTTP sunucusu yeni bir dinleyen soket açar.
- Araç çubuğu paneli ile `L:` değişkenleri yeni port, bağımlılık ya da enjeksiyon istemez; 2020 SU12+ ve 2024'te
  aynı paketle çalışır.

**Veri yolu:**
- Modstead, açık SimConnect bağlantısından saniyede bir `L:MODSTEAD_HUD_*` değişkenlerini yazar
  (`AddToDataDefinition` + `SetDataOnSimObject`).
- Alanlar `hud.rs` → `FIELDS`. ICAO kodları taban-37 sayıya çevrilir.
- Panel (`ModsteadCareer.js`) yalnızca okur ve gösterir. `SEQ` 4 saniye artmazsa "Modstead bağlı değil" der.
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
- Tanım değişirse `.spb` MSFS geliştirici kipinde ya da SDK paket aracıyla yeniden derlenmeli ve `HUD_VERSION`
  artırılmalı.

**Henüz gerçek simde denenmedi.** Panelin araç çubuğunda göründüğü ve `L:` değişkenlerinin okunduğu ilk gerçek
uçuşta doğrulanacak. 2024'te zengin metin için CommBus (`SimConnect_CallCommBusEvent`) sonraki adım.

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
- **FlightLoad** 2024'te her zaman uçuşu açmayabilir; elle kip bunun için var. Gerçek simde denenip ayarlanacak.
- **Yakıt** otomatik yazılmıyor (2024'ün modüler yakıt sistemi uçağa özel); plan değeri gösteriliyor.
- **Sim içi panel** gerçek simde henüz denenmedi (bölüm 3a).
- **Sırada:** sim içi panele 2024 CommBus ile zengin metin, kesilen uçuşu son konuma ışınlayarak sürdürme, müşteri ve bölge başına itibar, A/B/C bakımları ve
  arıza riski, çok bacaklı işler ve havayolu sözleşmeleri, işe alınan pilotlar ve şirket, SimBrief OFP'sinden
  yakıt/yük, hava durumuna göre iş (IR gerektiren).
