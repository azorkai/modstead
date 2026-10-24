# games/stardew

Modstead'in Stardew Valley (SMAPI) paketi. Kaynak uygulama **Vadi**.

Durum: **taşındı** (24.10.2026). `porting` listesi kaldırıldı; genel bakış oyunun gerçek panosu.

## Arka uç (`src/`, paket `game-stardew`)

| Modül | Görev |
|---|---|
| `lib.rs` | `INFO`, `Stardew` (ayarlar, yollar, işlem kilidi, oturum), `Game` uygulaması, `init`, `handler` |
| `detect.rs` | kurulum tespiti (Steam/GOG/Xbox/elle), SMAPI sürümü, hızlı mod sayımı |
| `manifest.rs` | hoşgörülü manifest okuyucu (yorum, sondaki virgül, BOM; bağımlılıksız) |
| `scan.rs` | SMAPI kuralıyla tarama (grup, "." kapalı, başıboş arşiv), arşivde mod kökü bulma |
| `analyze.rs` | sağlık: eksik/kapalı/eski bağımlılık, yinelenen kimlik, SMAPI/oyun sürümü, uyumluluk, çalıştırılabilir dosya, disk |
| `install.rs` | kurulum görevi: `intake` → plan → `job.review` → `stardew_confirm_job` (config.json korunur, eskisi çöpe) |
| `smapi.rs` | SMAPI: GitHub sürümü `intake`'ten (SHA-256), install.dat ayrıca açılıp taranır, resmî kurucunun adımları uygulanır (kurucu çalıştırılmaz) |
| `ops.rs` | işlem günlüğü, geri al, çöp kutusu, aç/kapat, kaldır, config.json okuma/yazma, SHA-256 |
| `profiles.rs` | profiller (UniqueID ile), fark önizlemesi, içe/dışa aktarma |
| `saves.rs` | kayıt listesi, zip yedek, güvenli geri yükleme (önce mevcut hal yedeklenir) |
| `logs.rs` | SMAPI günlüğü çözümleme (bağımlılıksız) |
| `updates.rs` | smapi.io güncelleme/uyumluluk, eksik bağımlılık arama (UniqueID → ad + Nexus numarası) |
| `discover.rs` | Mod bulma: Nexus arama + kategoriler + mod sayfası (açık GraphQL), Premium'da doğrudan kurulum, ana dosya seçimi; SMAPI'nin Nexus sayfası (2400) doğrulanmış GitHub kurulumuna yönlenir |
| `launch.rs` | SMAPI'li/modsuz başlatma, oyun öncesi yedek, `stardew://game-exited` |
| `migrate.rs` | Vadi verisini bir kez aktarır (ayarlar, profiller, günlük salt geçmiş olarak, kayıt yedekleri kopyalanır) |
| `smoke.rs` | `#[ignore]` gerçek sistem denemeleri (salt okunur; SMAPI sahte oyun klasörüne kurulur) |

Komutlar `stardew_` önekli (`lib.rs` → `handler()`); olay `stardew://game-exited`.
Kalıcı veri `%APPDATA%\app.modstead\games\stardew\{settings,journal,profiles,update-cache}.json`; çöp kutusu,
kayıt yedekleri, config yedekleri ve karantina `%LOCALAPPDATA%\app.modstead\games\stardew\` ya da ayarlardaki klasörde.

## Arayüz (`ui/`)

Sayfalar: Genel bakış (`Dashboard`), Modlar (+ `ModDrawer`, `ConfigEditor`), Mod bul (`Discover` + `NexusSheet`), Sağlık,
Güncellemeler, Profiller, Kayıtlar, Etkinlik (geçmiş, çöp, SMAPI günlüğü), Oyun ayarları. Kurulum incelemesi `ReviewPlan`
(mod ve SMAPI planları). Metinler `i18n.ts` (TR + EN), önizleme verisi `mock.ts` (`?sdv=empty|nogame|nosmapi|premium|free`).

### Mod bulma ve kurma akışı (`nexus.ts`)

Keşfet, mod çekmecesi, Güncellemeler, Sağlık ve inceleme penceresindeki eksik gereksinimler aynı yoldan geçer: `getFromNexus(modId)`.

- **Premium:** ana dosya (tek ana dosya ya da yazarın birincili) uygulama içinden indirilir (`stardew_install_nexus`). Belirsizse mod sayfası açılır.
- **Ücretsiz:** Nexus kuralı gereği dosya sayfası tarayıcıda açılır (`nmm=1`); gelen nxm bağlantısı bizim istediğimiz moda aitse
  kabuğun onay penceresi atlanır (20 dk içinde, mod numarasıyla eşleşen). nxm bağlı değilse tek tıkla bağlanır (`nxm_register`).
- **Anahtar yok:** arama çalışır; indirmede Ayarlar'a yönlendirilir.
- Uygulama içinden başlatılan görevlerin inceleme penceresi hazır olunca **sırayla kendiliğinden açılır** (her görev bir kez);
  kurulum yine yalnızca kullanıcı onayıyla yapılır.
- Kurulu modlar Nexus numarasıyla eşlenir (manifest `UpdateKeys`, yoksa smapi.io): kartta "Kurulu" / "Güncelleme var",
  mod sayfasında gereksinimlerin kurulu olup olmadığı görünür.

## Bilerek bırakılanlar

- **Mevsim vurguları** (Vadi'deki ilkbahar/yaz/sonbahar/kış rengi): oyunun kimlik rengini kabuk verir; ayar verisi korunur, arayüzde yok.
- **Klasör bırakarak kurulum**: ortak güvenlik hattı arşivlerle çalışır; yalnızca zip/7z/rar kurulur.
- **Vadi'nin kendi Nexus anahtarı, nxm kaydı, tema ve ilk kurulum sihirbazı**: kabuğun genel ayarlarına ve ilk kurulumuna taşındı.
- **Aktarılan Vadi günlüğünün geri alınması**: eski klasörlere dokunmamak için geçmiş olarak gösterilir.

## Doğrulama

```bash
cargo test -p game-stardew
cargo test -p game-stardew smoke -- --ignored --nocapture   # smoke_live_nexus_discover: açık Nexus sorguları
node scripts/dev.mjs stardew --preview   # http://127.0.0.1:1423/?view=game:stardew:mods&theme=dark
```
