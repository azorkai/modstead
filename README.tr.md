# Modstead — MSFS, Bannerlord, Stardew Valley ve Cities: Skylines II için güvenli mod yöneticisi

[English](README.md) · **Türkçe**

**Modstead**, **Microsoft Flight Simulator 2020 & 2024**, **Mount & Blade II: Bannerlord**, **Stardew Valley (SMAPI)**
ve **Cities: Skylines II** modlarını tek masaüstü uygulamasında yöneten, ücretsiz ve açık kaynaklı bir Windows mod
yöneticisidir. Her indirme ve arşiv bir güvenlik hattından geçer (izinli kaynaklar, özet doğrulaması, güvenli açma,
içerik denetimi ve Microsoft Defender taraması); siz inceleyip onaylamadan hiçbir şey kurulmaz.

[Tauri 2](https://tauri.app) (Rust) ve React 19 ile yazıldı. Lisans: GPL-3.0.

> **Durum:** erken geliştirme (v0.1.0). Yalnızca Windows 10/11. Henüz hazır sürüm yok; kaynaktan derleyin
> (bkz. [Kaynaktan derleme](#kaynaktan-derleme)).

## Desteklenen oyunlar

| Oyun | Modstead ne yapar |
|---|---|
| **Microsoft Flight Simulator 2020 & 2024** | İki simin paylaştığı tek mod kütüphanesi; modlar Community klasörüne junction ile, sim başına açılır (yönetici izni gerekmez). Profiller, dosya ve ICAO çakışmaları, `exe.xml` yardımcı programları, çalışmaya hazırlık denetimleri (Content.xml, yol uzunluğu), GitHub kataloğu (FlyByWire, Headwind…) ve uygulama içi mod tarayıcısı. |
| **Mount & Blade II: Bannerlord** | Modül yükleme sırası, `SubModule.xml` doğrulaması ve düzeltmeler, sürüm kuralları, `_MODULES_` ile doğrudan başlatma, `LauncherData.xml`, Steam Workshop modülleri, Nexus Mods ve GitHub'da mod bulma, güncellemeler, profiller ve yedekler. |
| **Stardew Valley (SMAPI)** | Doğrulanmış GitHub sürümünden SMAPI kurulumu (SHA-256; kurucu asla çalıştırılmaz), SMAPI kurallarıyla mod taraması, sağlık denetimi (eksik ya da eski bağımlılık, yinelenen kimlik, uyumluluk), smapi.io güncelleme denetimi, Nexus Mods araması, `config.json` düzenleyici, profiller, kayıt yedekleri ve SMAPI günlüğü özeti. |
| **Cities: Skylines II** | Paradox Mods kataloğu (arama, etiketler, gereksinimler, sürüm notları), yerel modlar, oyundaki önizlemesiyle kayıtlar, tek tık çözümlü sağlık puanı, çökme ve günlük çözümlemesi, bilinen kötü amaçlı mod sürümlerinin tespiti. |

Oyunlar **Steam, GOG, Epic Games ve Xbox / Microsoft Store** kurulumlarında kendiliğinden bulunur.

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

Önizleme adres parametreleri: `?view=home|settings|game:<oyun>[:<sayfa>]`, `&theme=dark|light`, `&lang=en`.

## Yapı

```
crates/core/        ortak çekirdek (Tauri'den bağımsız): güvenlik hattı, indirme, arşiv, görevler, Nexus/GitHub, oyun sözleşmesi
games/<oyun>/src    oyunun Rust paketi (game-<oyun>): Game trait'i + <oyun>_ komutları
games/<oyun>/ui     oyunun arayüz modülü: sayfalar, simge, görsel, önizleme verisi
src-tauri/          Tauri kabuğu: eklentiler, oyun kaydı, kabuk komutları, komut yönlendirme
src/                arayüz kabuğu, bileşen kiti, sözlükler, stiller
docs/               MIMARI.md (mimari) · TASARIM.md (tasarım dili)
```

Oyun kimlikleri: `msfs`, `bannerlord`, `stardew`, `cities2`. Ayarlar ve oyun verileri `%APPDATA%\app.modstead`;
önbellek, günlük ve karantina `%LOCALAPPDATA%\app.modstead` altında.

## Lisans

[GPL-3.0](LICENSE). Modstead bağımsız bir projedir; Microsoft, Asobo Studio, TaleWorlds Entertainment, ConcernedApe,
Paradox Interactive, Colossal Order ya da Nexus Mods ile bağlantılı değildir ve onlar tarafından onaylanmamıştır.
Oyun adları ve ticari markalar sahiplerine aittir.
