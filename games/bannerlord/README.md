# games/bannerlord

Modstead'in Mount & Blade II: Bannerlord paketi. Kaynak uygulama **Otağ**.

- `src/` → Rust paketi `game-bannerlord`:
  - `detect`: kurulum ve klasörler
  - `modules/`: SubModule.xml, sürüm kuralları, yükleme sırası, doğrulama ve düzeltmeler
  - `launcher/`: LauncherData.xml ve `_MODULES_` ile doğrudan başlatma
  - `install/`: intake sonrası plan, onaylı kurulum, yedekler
  - `profiles`, `steam` (Workshop), `images` (logo adresleri), `migrate` (Otağ verisi), `commands` (hepsi `bannerlord_` önekli)
- `ui/` → arayüz modülü (`index.tsx` → `GameModule`):
  - Sayfalar: Kütüphane (pano), Keşfet (Nexus/GitHub/Workshop), Güncellemeler, Profiller, Yedekler, Ayarlar
  - `ReviewPlan` + `confirmJob`; örnek veriler `mocks.ts`; sözlükler `i18n/`

Durum: **taşındı.** Otağ'ın özelliklerinin tamamı çalışıyor. Bilerek farklı olanlar:

- Logolar diske indirilip `otagimg` protokolüyle verilmiyor. Arka uç yalnızca görsel adresini önbelleğe yazıyor; görseli WebView, CSP'nin izin verdiği Nexus/Steam görsel sunucularından kendisi yüklüyor. Bu yüzden kabukta yeni protokol yok.
- Genel ayarlar (dil, tema, güvenlik, Nexus anahtarı, nxm) kabukta.
- Yeni karantina ve yedekler `<oyun>\.modstead\` altına yazılıyor. Otağ'ın `.otag\backups` klasörü de okunuyor.

Veri aktarımı ilk açılışta bir kez yapılır (`%APPDATA%\app.otag.bannerlord` → `games\bannerlord`). Aktarılanlar oyun ayarları, profiller, kurulum kayıtları ve Nexus anahtarı. Eski dosyalara dokunulmaz.

Gerçek kurulumla salt okunur deneme:

```
cargo test -p game-bannerlord real_ -- --ignored --nocapture
```
