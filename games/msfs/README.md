# games/msfs

Modstead'in Microsoft Flight Simulator 2020 & 2024 paketi (Hangar'dan taşındı).

## Model

Modların gerçek dosyaları tek bir **kütüphane klasöründe** durur. Bir modu bir simde açmak, o simin Community klasörüne
kütüphanedeki pakete işaret eden bir **junction** koymaktır (yönetici izni gerekmez). İki sim aynı dosyaları paylaşır.
Yalnızca hedefi kütüphanede olan bağlantılar kaldırılır; başka araçların bağlantılarına (FSDT Addon Manager…) dokunulmaz.
İki sim aynı paket klasörünü paylaşıyorsa 2024 yapımı paketler `Community2024`e bağlanır.

## Arka uç (`src/`, paket `game-msfs`)

| Modül | Görev |
|---|---|
| `lib.rs` | `INFO`, `Msfs` (ayarlar, mod kayıtları, profiller, son tarama), `Game` uygulaması, komut tablosu |
| `sims.rs` | 2020/2024 tespiti (Steam/Store, UserCfg.opt, elle seçilen yol), Content.xml yeri, başlatma adresi |
| `package.rs` | manifest.json/layout.json okuma, sınıflandırma, ICAO, küçük resim |
| `scanner.rs` | kütüphane + Community taraması, durumlar, sorunlar, önbellek |
| `linker.rs` | aç/kapat (junction), içe aktar, kaldır, kırık bağlantı, iç içe paket |
| `conflicts.rs` | aynı simde ortak dosya ve aynı ICAO çakışmaları |
| `exexml.rs`, `readiness.rs`, `requirements.json` | çalışmaya hazırlık: Content.xml, exe.xml yardımcı programları (Fenix, GSX…), yol uzunluğu, derin doğrulama, yedekli düzeltmeler |
| `catalog.rs`, `catalog.json` | GitHub kataloğu (FBW, Headwind…) |
| `install.rs` | kurulum: intake → MSFS bulguları ve plan → `msfs_confirm_job` → kütüphane + bağlantı; klasör ve mod tarayıcısı indirmeleri |
| `browser.rs` | uygulama içi mod tarayıcısı (yeteneksiz pencere, indirme yakalama) |
| `migrate.rs` | Hangar verisinin ilk açılışta aktarımı (anahtarlar Kimlik Bilgisi Yöneticisi'ne) |
| `commands.rs` | `msfs_` önekli komutlar |
| `career/` | **Kariyer kipi**: SimConnect (DLL'siz, TCP), ilan panosu, otomatik uçuş başlatma, uçuş takibi, seyir defteri, lisanslar, filo ve kredi. Ayrıntı: [`KARIYER.md`](KARIYER.md) (İngilizcesi [`CAREER.md`](CAREER.md)) |

Karantina: `<kütüphane>\.modstead\staging\<görev>` (kütüphaneyle aynı birim; son adım yeniden adlandırma).
Veri: `games/msfs/{settings,mods,profiles}.json`.

## Arayüz (`ui/`)

Sayfalar (`pages/`): Genel bakış (vitrin, sim başlatma), Kariyer (`career/`: Panel, İş ilanları, Seyir defteri,
Lisanslar, Hangar ve finans), Kütüphane (galeri/liste, filtreler, toplu işlem), Keşfet (katalog,
güncellemeler, bağlantı, dosya, mod siteleri), Sağlık (sorunlar, tek tık düzeltmeler, çakışmalar), Profiller, Güvenlik
(exe.xml, tarama raporları), Ayarlar. Ortak parçalar: `ModDrawer`, `ReadinessPanel`, `ReviewPlan` (inceleme penceresindeki
MSFS planı), `Thumb`/`Poster` (küçük resimler `msfs_thumbnail` → blob adresi), sözlük `i18n.ts`, önizleme verisi `mocks.ts`.

## Test

```bash
cargo test -p game-msfs
# bu makinede salt okunur: real_scan, real_readiness, real_simconnect (MSFS 2024 açıkken)
cargo test -p game-msfs real_ -- --ignored --nocapture
node scripts/dev.mjs msfs --preview   # http://127.0.0.1:1421/?view=game:msfs:library  (&review=msfs-review)
#                                       kariyer: ?view=game:msfs:career  (&career=new|idle|ready)
```

## Bilinen eksikler

- Nexus oyun kimliği (3407) doğrulanmadı; MSFS 2024'ün ayrı Nexus alanı nxm yönlendirmesine eklenmedi.
- Kurucular (.exe/.msi) ve çok parçalı 7z desteklenmez (ortak hat yalnızca .zip/.7z/.rar açar).
- Paket klasörünü kısa bir yola taşıma rehberle anlatılır; Modstead bunu kendisi yapmaz.
