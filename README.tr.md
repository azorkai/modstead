# Modstead — MSFS, Bannerlord, Stardew Valley ve Cities: Skylines II için güvenli mod yöneticisi

[English](README.md) · **Türkçe**

<p align="center">
  <a href="https://buymeacoffee.com/azorkai">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="docs/assets/support-tr-dark.svg">
      <img src="docs/assets/support-tr-light.svg" width="760" alt="Pilota bir kahve ısmarla: Modstead ücretsiz ve açık kaynak; buymeacoffee.com/azorkai üzerinden destek olabilirsin">
    </picture>
  </a>
</p>

**Modstead**, **Microsoft Flight Simulator 2020 & 2024**, **Mount & Blade II: Bannerlord**, **Stardew Valley (SMAPI)**
ve **Cities: Skylines II** modlarını tek masaüstü uygulamasında yöneten, ücretsiz ve açık kaynaklı bir Windows mod
yöneticisidir. Her indirme ve arşiv bir güvenlik hattından geçer (izinli kaynaklar, özet doğrulaması, güvenli açma,
içerik denetimi ve Microsoft Defender taraması); siz inceleyip onaylamadan hiçbir şey kurulmaz.

Microsoft Flight Simulator için ücretsiz bir **[MSFS 2024 kariyer kipi](#msfs-2024-kariyer-kipi)** de içerir: iş ilanları,
lisanslar ve sınav uçuşları, otomatik uçuş hazırlığı, SimConnect ile uçuş takibi, seyir defteri, kendi uçakların, sim
içi araç çubuğu paneli ve MSFS 2024 ana menüsünde kariyer sayfası.

[Tauri 2](https://tauri.app) (Rust) ve React 19 ile yazıldı. Lisans: GPL-3.0.

> **Durum:** erken geliştirme (v0.1.0). Yalnızca Windows 10/11.

## İndir

**[Modstead'i Windows için indir](https://github.com/azorkai/modstead/releases/latest/download/Modstead-setup-x64.exe)**
(Windows 10/11, x64) · [Tüm sürümler](https://github.com/azorkai/modstead/releases) ·
[Web sitesi](https://azorkai.github.io/modstead/) · [☕ Bir kahve ısmarla](https://buymeacoffee.com/azorkai)

Kurucu, Modstead'i geçerli kullanıcıya kurar ve yönetici izni istemez. Henüz kod imzalı olmadığı için Windows
SmartScreen uyarı gösterebilir; **Ek bilgi**'ye, ardından **Yine de çalıştır**'a tıklayın. Her sürümde kurucunun
SHA-256 özeti `SHA256SUMS.txt` dosyasındadır; PowerShell'de
`(Get-FileHash .\Modstead-setup-x64.exe -Algorithm SHA256).Hash` çıktısıyla karşılaştırabilirsiniz
([diğer yollar](docs/RELEASING.md#verify-a-download), İngilizce). Kendiniz derlemek için:
[Kaynaktan derleme](#kaynaktan-derleme).

## Desteklenen oyunlar

| Oyun | Modstead ne yapar |
|---|---|
| **Microsoft Flight Simulator 2020 & 2024** | İki simin paylaştığı tek mod kütüphanesi; modlar Community klasörüne junction ile, sim başına açılır (yönetici izni gerekmez). Profiller, dosya ve ICAO çakışmaları, `exe.xml` yardımcı programları, çalışmaya hazırlık denetimleri (Content.xml, yol uzunluğu), GitHub kataloğu (FlyByWire, Headwind…), uygulama içi mod tarayıcısı ve gömülü [kariyer kipi](#msfs-2024-kariyer-kipi). |
| **Mount & Blade II: Bannerlord** | Modül yükleme sırası, `SubModule.xml` doğrulaması ve düzeltmeler, sürüm kuralları, `_MODULES_` ile doğrudan başlatma, `LauncherData.xml`, Steam Workshop modülleri, Nexus Mods ve GitHub'da mod bulma, güncellemeler, profiller ve yedekler. |
| **Stardew Valley (SMAPI)** | Doğrulanmış GitHub sürümünden SMAPI kurulumu (SHA-256; kurucu asla çalıştırılmaz), SMAPI kurallarıyla mod taraması, sağlık denetimi (eksik ya da eski bağımlılık, yinelenen kimlik, uyumluluk), smapi.io güncelleme denetimi, Nexus Mods araması, `config.json` düzenleyici, profiller, kayıt yedekleri ve SMAPI günlüğü özeti. |
| **Cities: Skylines II** | Paradox Mods kataloğu (arama, etiketler, gereksinimler, sürüm notları), yerel modlar, oyundaki önizlemesiyle kayıtlar, tek tık çözümlü sağlık puanı, çökme ve günlük çözümlemesi, bilinen kötü amaçlı mod sürümlerinin tespiti. |

Oyunlar **Steam, GOG, Epic Games ve Xbox / Microsoft Store** kurulumlarında kendiliğinden bulunur. İlk açılışta
Modstead yalnızca bilgisayarda bulduğu oyunları sorar; başka klasördeki bir oyun klasörü seçilerek eklenir.

## MSFS 2024 kariyer kipi

<p align="center">
  <img src="docs/screenshots/msfs-2024-career-mode-dashboard.png" alt="Modstead MSFS 2024 kariyer kipi paneli: kargo uçuşu sırasında canlı rota haritası, uçuş evresi, irtifa, yer hızı ve anlık puan" width="900">
</p>

Modstead, **Microsoft Flight Simulator 2024** için ücretsiz ve açık kaynaklı bir kariyer kipi içerir (MSFS 2020'de de
çalışır). Öğrenci pilot olarak başlarsın; iş ilanlarından iş alır, sınav uçuşlarıyla lisans kazanır, kendi uçağını
alırsın. Her uçuş simde hazırlanır, SimConnect ile takip edilir ve seyir defterine işlenir; her kuralın, ücretin ve
kesintinin formülü belgelidir.

- **İş ilanları:** kargo, yolcu, charter, uçak teslimi, arazi, ambulans ve havayolu işleri; lisansa ve itibara göre,
  harita üzerinde. CPL'den sonra "kendi hesabına" işler.
- **Otomatik hazırlık:** gerekirse sim açılır, simin kendi verisinden uygun park yeri seçilir (ya da motorlar çalışır
  hâlde pist başından başlanır), `.FLT`/`.PLN` yazılır ve rota simin GPS'ine girer, uçak taşınır ve yük yüklenir.
  Gerçek MSFS 2024'te denendi.
- **Takip ve puan:** uçuş evreleri, iniş hızı ve G'si, sekme, aşırı hız, stall, hile tespiti. Puan XP ve itibarı
  belirler; para yalnızca gerçek olaylardan (gecikme, yakıt, kira, hasar) etkilenir.
- **Lisanslar**, **seyir defteri**, **hangar ve finans** (uçak alımı, bakım, kredi) ve MSFS 2020/2024 için **sim içi
  araç çubuğu paneli**.
- **MSFS 2024 ana menüsünde kariyer sayfası:** simin kendi kutularının yanındaki *Modstead Kariyer* kutusu tam ekran bir
  sayfa açar; simden çıkmadan iş alır, uçağını (gerçek fotoğraflarıyla) seçer ve uçuşu başlatırsın. Fare, klavye ve oyun
  kolu simin kendi sayfalarındaki gibi çalışır.
- **Öğütmesiz gerçekçilik:** kararlı yaklaşma kapısı, teker koyma noktası ve eksen sapması, kuyruk sürtmesi ve
  ağırlık sınırları, uçuş kâğıdı (EASA yakıt politikası, ağırlıklar, yedek meydan, pist ve yoğunluk irtifası), gerçek
  METAR, yolcu konforu ve hassas yük, pilot yeterliliği, sağlık sertifikası ve görev süresi, sigortalı bakım programı,
  bölgesel yakıt fiyatları ve seyrüsefer ücreti, hava işleri (tur, paraşüt, hava fotoğrafı, arama-kurtarma),
  başarımlar ve itiraz. Puan yalnızca güvenlik için düşer; prosedürler yalnızca XP bonusu verir.
- **Ücretsiz ve yerel:** abonelik, hesap ve çevrim içi sunucu yok; çevrim dışı çalışır.

> **Modstead'in içinde çalışır.** Kariyer ayrı bir eklenti değildir; verisi, kuralları ve sim bağlantısı Modstead'dedir
> ve kariyerin kendisi için simin içine bir şey kurulmaz. Araç çubuğu paneli ve ana menü kutusu, Modstead'in
> `127.0.0.1`'de verdiğini gösteren isteğe bağlı paketlerdir. Modstead kapalıyken uçuşlar takip edilmez, panel "Modstead
> bağlı değil" der ve kutu görünmez.

<p align="center">
  <img src="docs/screenshots/msfs-2024-main-menu-career-tile.png" alt="MSFS 2024 ana menüsünde simin kendi kutularının yanında Modstead Kariyer kutusu: aktif iş LTBA–LTBU, uçuşu başlatmaya hazır" width="488">
</p>

<table>
  <tr>
    <td width="50%"><img src="docs/screenshots/msfs-career-job-board-map.png" alt="MSFS kariyer iş ilanları ve seçilen rotanın haritası"><br><sub><b>İş ilanları</b></sub></td>
    <td width="50%"><img src="docs/screenshots/msfs-career-licences.png" alt="Kariyer kipinde pilot lisansları ve yetkiler"><br><sub><b>Lisanslar</b></sub></td>
  </tr>
  <tr>
    <td width="50%"><img src="docs/screenshots/msfs-career-logbook.png" alt="MSFS seyir defteri: rota, uçak, blok süresi, iniş hızı, not ve net kazanç"><br><sub><b>Seyir defteri</b></sub></td>
    <td width="50%"><img src="docs/screenshots/msfs-in-sim-toolbar-panel.png" alt="Modstead'in MSFS araç çubuğu paneli: seyirde, inişten sonra ve kalkışa hazır"><br><sub><b>Sim içi panel</b> (tarayıcı önizlemesi)</sub></td>
  </tr>
  <tr>
    <td width="50%"><img src="docs/screenshots/msfs-2024-main-menu-career-jobs.png" alt="MSFS 2024 ana menüsündeki Modstead kariyer sayfasında iş ilanları"><br><sub><b>Ana menüde iş ilanları</b> (simden)</sub></td>
    <td width="50%"><img src="docs/screenshots/msfs-2024-main-menu-career-pilot.png" alt="MSFS 2024 ana menüsündeki Modstead kariyer sayfasında Pilot sekmesi: seviye, itibar, lisanslar ve son uçuşlar"><br><sub><b>Ana menüde Pilot sekmesi</b> (simden)</sub></td>
  </tr>
</table>

Uygulamanın ekran görüntüleri önizleme kipinden, örnek verilerle alındı. Sim içi panelin görüntüsü, panelin kendi
kodunun simin panel çerçevesi içinde benzetilmiş değerlerle tarayıcı önizlemesidir; panelin önceki sürümü gerçek simde
denenip düzeltildi, güncel sürümü (0.3.0) uçuşta henüz denenmedi. Ana menü görüntüleri simde, örnek bir kariyerle
alındı; kutu ve sayfa MSFS 2024 1.9.21.0'da denendi. Kurallar, formüller, araştırma ve mimari:
**[KARIYER.md](games/msfs/KARIYER.md)** ([English](games/msfs/CAREER.md)). Kariyer kipi de erken geliştirme
aşamasındadır.

## Özellikler

- **Her oyun için tek uygulama:** her oyun aynı kabukta kendi sayfalarını, vurgu rengini ve yazı tipini korur.
  Ana sayfada tüm oyunların durumu, son etkinlik ve güvenlik olayları görünür.
- **Her kurulum için güvenlik hattı:** indirmeler yalnızca izin listesindeki HTTPS sunucularından gelir ve kaynağın
  özetiyle doğrulanır (GitHub SHA-256, Nexus Mods MD5). Arşivler karantinaya zip-slip, alternatif veri akışı, aygıt adı,
  sembolik bağ ve arşiv bombasına karşı korumalı açılır, oyunun içerik kuralıyla denetlenir, Microsoft Defender ile
  taranır ve isteğe bağlı olarak VirusTotal'da özetle sorgulanır. Kurulumdan önce karar ve risk puanı gösterilir.
- **Kurucular asla çalıştırılmaz:** `.exe` ve `.msi` dosyaları raporlanır, çalıştırılmaz.
- **Nexus Mods "Mod Manager Download":** tek `nxm://` işleyicisi her bağlantıyı doğru oyuna yönlendirir; önceki
  işleyici saklanır.
- **Tek hesap deposu:** Nexus Mods, VirusTotal ve GitHub anahtarları bir kez, Windows Kimlik Bilgisi Yöneticisi'nde
  saklanır; düz dosyaya yazılmaz.
- **Oyunu gözeten güvenlik:** oyun açıkken oyunun mod klasörüne yazılmaz.
- Türkçe ve İngilizce arayüz, koyu ve açık tema, komut paleti (`Ctrl+K`), pencereye arşiv bırakarak kurulum.

## Güvenlik hattı nasıl çalışır

```
çöz → indir (izin listesi, boyut sınırı) → özeti doğrula → karantinaya aç
    → içerik denetimi (oyunun kuralı) → Microsoft Defender → isteğe bağlı VirusTotal → inceleme penceresi → kurulum
```

Arayüzün dosya sistemi, kabuk ya da ağ izni yoktur ve sıkı bir İçerik Güvenliği Politikası (CSP) altında çalışır.
Her iş doğrulayan bir Rust komutundan geçer; arayüzden gelen yollar beklenen kök klasöre kilitlenir. Güvenlik açığı
bildirmek için: [SECURITY.md](SECURITY.md).

## Sık sorulan sorular

### Modstead nedir?
Modstead, tek oyunluk üç aracı (MSFS için Hangar, Bannerlord için Otağ, Stardew Valley için Vadi) birleştirip
Cities: Skylines II'yi ekleyen, ortak bir güvenlik hattına sahip Windows mod yöneticisidir.

### Modstead ücretsiz mi?
Evet. Modstead, GNU Genel Kamu Lisansı v3.0 ile ücretsiz ve açık kaynaktır.

### Modstead'de MSFS 2024 için kariyer kipi var mı?
Evet. İş ilanları, lisanslar ve sınav uçuşları, otomatik uçuş hazırlığı, SimConnect ile takip, seyir defteri, uçak
sahipliği, sim içi araç çubuğu paneli ve MSFS 2024 ana menüsünde kariyer sayfası olan ücretsiz bir kariyer kipi içerir. MSFS 2020'de `SimConnect.xml`'e yerel bir
IPv4 girişi eklenince çalışır. Ayrıntı: [KARIYER.md](games/msfs/KARIYER.md).

### Modstead ile mod kurmak güvenli mi?
Her arşiv, inceleme penceresine gelmeden önce özetle doğrulanır, karantinaya güvenle açılır, denetlenir ve Microsoft
Defender ile taranır. Onayınız olmadan hiçbir şey kurulmaz, kurucular asla çalıştırılmaz. Hiçbir tarayıcı bir modun
zararsız olduğunu kesin söyleyemez; bu yüzden Modstead körü körüne "güvenli" demek yerine risk puanı gösterir.

### Modstead Nexus Mods ile çalışır mı?
Evet. Desteklenen tüm oyunlar için Nexus Mods "Mod Manager Download" (`nxm://`) işleyicisi olur. Premium hesaplar
uygulama içinden doğrudan indirir; ücretsiz hesaplar, Nexus'un kuralı gereği Nexus Mods sitesi üzerinden indirir.

### Vortex ya da Mod Organizer 2'ye alternatif mi?
Desteklenen dört oyun için evet. Modstead her oyunu desteklemek yerine oyuna özel özelliklere (MSFS sim bağlantıları,
Bannerlord yükleme sırası, SMAPI sağlık denetimi, Cities: Skylines II kayıt önizlemeleri) ve daha sıkı bir kurulum
incelemesine odaklanır.

### Yönetici izni gerekir mi?
Hayır. Modstead kullanıcı başına kurulur, MSFS modları yükseltme gerektirmeyen junction'larla açılır ve `nxm://`
işleyicisi geçerli kullanıcıya kaydedilir.

### Hangi platformlar destekleniyor?
Microsoft Edge WebView2 yüklü Windows 10 ve 11 (x64).

## Kaynaktan derleme

Gereksinimler: Node.js 22+, Rust 1.85+ (MSVC), Microsoft Edge WebView2.

```bash
npm install                     # sabit sürümler, kurulum betikleri kapalı (.npmrc)
npm run dev                     # yalnızca arayüz, tarayıcıda örnek verilerle: http://127.0.0.1:1420
npm run app:dev                 # masaüstü uygulaması (geliştirme)
npm run app:build               # NSIS kurucusu
npm run typecheck && npm run build
cargo test --workspace          # Rust testleri
```

Yayımlanan kurucular geliştirici makinesinde derlenmez; GitHub Actions onları bir sürüm etiketinden derler
(bkz. [docs/RELEASING.md](docs/RELEASING.md), İngilizce).

Önizleme adres parametreleri: `?view=home|settings|game:<oyun>[:<sayfa>]`, `&theme=dark|light`, `&lang=en`,
`&onboarding=1` (ilk kurulum), `&installed=<oyun>,<oyun>` ya da `&installed=none` (örnek veride yalnızca bu oyunlar kurulu).
MSFS kariyer sayfası: `?view=game:msfs:career`, `&career=new|idle|ready` (ilk kayıt, aktif iş yok, kontrol kapısı;
öntanımlı uçuşta) ve `&hud=installed`.

## Yapı

```
crates/core/        ortak çekirdek (Tauri'den bağımsız): güvenlik hattı, indirme, arşiv, görevler, Nexus/GitHub, oyun sözleşmesi
games/<oyun>/src    oyunun Rust paketi (game-<oyun>): Game trait'i + <oyun>_ komutları
games/<oyun>/ui     oyunun arayüz modülü: sayfalar, simge, görsel, önizleme verisi
src-tauri/          Tauri kabuğu: eklentiler, oyun kaydı, kabuk komutları, komut yönlendirme
src/                arayüz kabuğu, bileşen kiti, sözlükler, stiller
docs/               MIMARI.md (mimari) · TASARIM.md (tasarım dili)
docs/screenshots/   README ekran görüntüleri (önizleme kipi, örnek veri)
```

Oyun kimlikleri: `msfs`, `bannerlord`, `stardew`, `cities2`. Ayarlar ve oyun verileri `%APPDATA%\app.modstead`;
önbellek, günlük ve karantina `%LOCALAPPDATA%\app.modstead` altında.

## Destek

Modstead ücretsiz ve açık kaynaklıdır. İşinize yarıyorsa geliştirilmesine
[Buy Me a Coffee](https://buymeacoffee.com/azorkai) üzerinden destek olabilirsiniz.

<a href="https://buymeacoffee.com/azorkai"><img src="https://img.shields.io/badge/Bir%20kahve%20%C4%B1smarla-FFDD00?style=for-the-badge&logo=buymeacoffee&logoColor=000000" alt="Bir kahve ısmarla"></a>

## Lisans

[GPL-3.0](LICENSE). Modstead bağımsız bir projedir; Microsoft, Asobo Studio, TaleWorlds Entertainment, ConcernedApe,
Paradox Interactive, Colossal Order ya da Nexus Mods ile bağlantılı değildir ve onlar tarafından onaylanmamıştır.
Oyun adları ve ticari markalar sahiplerine aittir.
