# Modstead mimarisi

## Katmanlar

```
┌──────────────────────────── Arayüz (React 19 · src/) ─────────────────────────────┐
│ Kabuk (src/shell)      oyun rayı · ana sayfa · ayarlar · indirmeler · inceleme ·  │
│                        komut paleti · ilk kurulum · dosya bırakma · nxm onayı      │
│ Bileşen kiti (src/ui)  Button, Dialog, Section/Row, SecurityPanel…                │
│ Oyun modülleri         games/<oyun>/ui  →  GameModule (sayfalar, simge, görsel)    │
└──────────────────────────────── invoke / olaylar ──────────────────────────────────┘
┌──────────────────────────── Kabuk (Tauri · src-tauri/) ───────────────────────────┐
│ eklentiler · oyun kaydı (GAMES) · kabuk komutları · öneke göre komut yönlendirme   │
└───────────────────────────────────────────────────────────────────────────────────┘
┌───────────── Oyun paketleri (games/<oyun>/src) ─────────────┐ ┌── Çekirdek ──────────┐
│ Game trait'i + oyuna özel komutlar (<oyun>_…)               │→│ crates/core           │
│ tespit, tarama, sağlık, kurulum planı, uygulama, başlatma   │ │ (Tauri'ye bağlı değil)│
└─────────────────────────────────────────────────────────────┘ └──────────────────────┘
```

Her oyun **tek klasördür**: `games/<oyun>/src` (Rust paketi `game-<oyun>`) ve `games/<oyun>/ui` (arayüz modülü).
Bir oyunun değişiklikleri kendi klasöründe kalır; ortak koda yalnızca eklemeli ve geriye uyumlu değişiklik girer.

**Arayüz–arka uç bağı** (`src/lib/ipc.ts`, `invoke`/`listen`): üç taşıma vardır.
- Uygulamada Tauri komutları ve olayları.
- Tarayıcıda (önizleme kipi) `src/lib/mock.ts` ve oyunların örnek verileri.
- Uzak taşıma (`setRemoteTransport`): sayfa bir oyunun yerel sunucusundan açıldıysa komutlar
  `GET {kök}/api/call/<komut>?a=<JSON>` ile gider, yerel ağda `X-Modstead-Key` başlığıyla. Olay yoktur; sayfa yoklar.
  Hangi komutların açık olduğuna sunucu karar verir. İlk kullanan: MSFS uçuş ekranı (`deck.html`, ikinci Vite girişi;
  `games/msfs/hud/menu/API.md`).

**MSFS haritası** (`games/msfs/ui/career/RouteMap.tsx`, `map/`): Web Mercator. Altta yerel sunucunun karoları (`/api/tiles/relief|sat/z/x/y`: gömülü Natural Earth II yükselti gölgesi z0–5, EOxCloudless 2016 uydu z0–13, önbellekli), üstte vektör katmanlar (kara/göl/kıyı/sınır, nehir, şehir alanı, yol, OurAirports pistleri; ilk gerektiğinde yüklenen parçalar, `games/msfs/tools/map.py`). Uçak ve iz her karede, harita yalnızca görünüm değişince çizilir. Sim içi panel aynı karoları kendi tuvalinde kullanır.

## Çekirdek (`crates/core`, paket `modstead-core`)

Oyundan bağımsız her şey. Bilerek Tauri'ye bağlı değildir; testler pencere olmadan koşar.

| Modül | Görev | Kaynak |
|---|---|---|
| `i18n` | `tr!("…", "…")`, dil çözümü (Windows dili/bölge/konum Türkiye ise Türkçe) | Otağ |
| `error` | `AppError` → arayüze `{ code, message }`; `ResultExt::app_err()` dış hatalar için | Otağ |
| `fsx` | atomik yazma, bozuk JSON'u yedekleyen okuma, `safe_relative_path`, `resolve_under`, bağ izlemeyen kopyala/taşı/sil | Otağ + Vadi |
| `platform` | konsolsuz komut, süreç listesi, PE dosya sürümü, boş disk, `open_launch_uri` (steam://, shell:AppsFolder) | Vadi + Hangar |
| `credentials` | Windows Kimlik Bilgisi Yöneticisi: Nexus, VirusTotal, GitHub anahtarları (tüm oyunlar paylaşır) | Otağ |
| `http` | `Http { client, media, user }`; izin listesi = çekirdek + oyunların `GameInfo.hosts` | Otağ |
| `download` | akışlı indirme (boyut sınırı, iptal, SHA-256+MD5), yerel dosyayı karantinaya kopyalama | Otağ |
| `archive` | güvenli ZIP/7z/RAR (zip-slip, ADS, aygıt adı, sembolik bağ, bomba, gerçekten yazılan bayt sınırı) | Otağ |
| `security` | `SecurityReport` (karar, puan, açık onay, engel), `content` (oyunun kuralıyla), `defender`, `motw`, `virustotal` | Hangar + Otağ |
| `intake` | kabul hattı: çöz → indir → doğrula → aç → tara → rapor | Otağ + Hangar |
| `jobs` | görev kuyruğu; `modstead://job` olayı; inceleme planı oyuna özel JSON | Otağ |
| `nexus` / `nxm` | Nexus v2 GraphQL + v1 (oyun parametreli): arama (`search_with`: kategori süzgeci), kategori sayıları (`category_counts`), mod/dosya bilgisi; nxm ayrıştırma (alan adıyla), protokol kaydı | Otağ |
| `github` | sürümler ve `digest` SHA-256 (isteğe bağlı belirteç) | Otağ |
| `stores` | Steam kütüphaneleri/Workshop, GOG, Epic, Xbox tespiti; Microsoft Store uygulama sürümü (`appx_versions`, oyun güncellemesini fark etmek için) | Vadi + Otağ |
| `version` | hoşgörülü sürüm karşılaştırma | Vadi |
| `settings` / `paths` / `services` | genel ayarlar, veri klasörleri, oyunlara verilen ortak servisler | yeni |
| `game` | **oyun sözleşmesi** (`Game`, `GameInfo`, `GameStatus`, `GameRegistry`) | yeni |

## Oyun sözleşmesi

Rust (`crates/core/src/game.rs`):

```rust
pub trait Game: Send + Sync + 'static {
    fn info(&self) -> &GameInfo;                                   // durağan tanım
    fn status(&self) -> BoxFuture<'_, GameStatus>;                 // ana sayfa kartı (ucuz olmalı)
    fn detect(&self) -> BoxFuture<'_, Vec<InstallCandidate>>;     // ilk kurulum sihirbazı
    fn set_install_path(&self, path: String) -> BoxFuture<'_, AppResult<GameStatus>>;
    fn launch(&self) -> BoxFuture<'_, AppResult<()>>;              // "Oyna"
    fn handle_nxm(&self, url: String) -> BoxFuture<'_, AppResult<JobSnapshot>>;          // varsayılan: desteklenmiyor
    fn install_files(&self, paths: Vec<String>) -> BoxFuture<'_, AppResult<Vec<JobSnapshot>>>; // varsayılan: bağlanmadı
    fn discard_job(&self, job: &JobHandle) {}                      // görev kaldırılınca karantinayı temizle
    fn busy(&self) -> BoxFuture<'_, bool>;                         // varsayılan: false (bkz. Modstead güncellemesi)
}
```

`GameInfo` oyunun kimliğini, Nexus alan(lar)ını, Steam kimliklerini, ek indirme/görsel sunucularını (`hosts`),
içerik kuralını (`content`: ör. Bannerlord ve SMAPI için `dll` olağan, MSFS için hiçbir kod dosyası olağan değil,
`wasm` bilgi) ve kaynak güveni listelerini taşır.

Sözleşme bilerek küçüktür: yalnızca kabuğun oyunlar arası ihtiyacı. Oyunun asıl ekranları kendi komutlarıyla
(`<oyun>_…`) çalışır ve kendi durumunu `app.manage(Arc<Oyun>)` ile tutar.

Arayüz (`src/games/types.ts`): `GameModule { id, name, short, tagline, Icon, Art, routes, ReviewPlan?, confirmJob?, mocks?, porting?, home? }`.
Rotada `fullBleed: true` sayfayı kenardan kenara çizer (üst çubuk görselin üstünde saydam). `home` ana sayfaya
oyunun katkısıdır: `Actions` (vitrindeki Oyna düğmesinin yerine) ve `Panel` (vitrinin altındaki giriş kutucukları);
ikisi de isteğe bağlı, ana sayfa ağ isteği başlatmamalı (bkz. docs/TASARIM.md → Ana sayfa).

## Komut yönlendirme

`src-tauri/src/lib.rs` kabuk komutlarını kendi `generate_handler!` tablosunda tutar. Her oyun paketi
`pub fn handler()` ile kendi tablosunu verir. Kabuk gelen komutun adına bakar: `msfs_` ile başlıyorsa MSFS'in
tablosuna, `bannerlord_` ise Bannerlord'unkine… Bu sayede oyun komutu eklemek için ortak dosyaya dokunmak gerekmez.

Kabuk ayrıca `art://<oyun>/<tür>` protokolünü sunar (Windows'ta `http://art.localhost/…`): oyunun `GameInfo.steam_app_ids`
için Steam'in yerel kütüphane görsel önbelleğindeki kahraman, logo, başlık, dikey kapak ve simge görselleri
(`stores::steam_library_art`). Yalnızca o önbellekten okur (`stores::is_steam_art_path`); CSP'de `img-src` buna açıktır.
CSP `img-src` ayrıca MSFS'in yerel sunucusuna (`http://127.0.0.1:47213-47215`) açıktır: kariyer haritası karolarını oradan alır (`/api/tiles/…`, `games/msfs/hud/menu/API.md`).

Kabuk komutları: `app_info`, `games_status`, `game_status`, `game_detect`, `game_set_path`, `game_launch`,
`game_install_files`, `settings_get`, `settings_update`, `nexus_status`, `nexus_set_key`, `nexus_clear_key`,
`secrets_status`, `secret_set`, `secret_clear`, `nxm_status`, `nxm_register`, `nxm_unregister`, `nxm_open`,
`pending_take`, `jobs_list`, `job_cancel`, `job_dismiss`, `jobs_clear`, `open_url`, `open_app_folder`,
`update_status`, `update_check`, `update_install`.

## Kurulum akışı (tüm oyunlar için aynı iskelet)

```
kaynak (Nexus / GitHub / adres / yerel / nxm)
  │  oyun: services.jobs.create(id, "install", başlık, kaynak)  →  görev (modstead://job)
  ▼
intake::run(services, &job, IntakeRequest { origin, work_dir, content: INFO.content, trusted, known, nexus_lookup })
  │  çöz → izinli indir → özet doğrula (GitHub SHA-256 / Nexus MD5) → güvenli aç → içerik + Defender (+VirusTotal)
  │  hata: karantina silinir, görev "failed"   ·   Defender tehdidi: dosyalar silinir
  ▼
oyun: intake.extract_dir'i inceler → plan (oyuna özel, Serialize)
  │  (oyuna özel bulgu varsa report.findings'e ekle ve security::finalize'ı yeniden çağır)
  │  job.set_staged(OyunaÖzelKarantina{ intake, plan }); job.review(mesaj, Some(report), json!(plan))
  ▼
arayüz: ReviewDialog = SecurityPanel (ortak) + GameModule.ReviewPlan (oyunun) + açık onay kutusu
  │  "Kur" → GameModule.confirmJob → oyunun `<oyun>_confirm_job` komutu
  ▼
oyun: job.take_staged::<…>() → report.blocked varsa reddet; needs_override varsa acceptRisk iste →
      kur (aynı birimde yeniden adlandırma, eskisini yedekle/çöpe at) → job.done(mesaj, sonuç) → services.game_changed(id)
```

Karar kuralları (`security::finalize`): kritik bulgu, Defender tehdidi, VirusTotal ≥2 ya da özet uyuşmazlığı →
**tehlikeli** (özet uyuşmazlığı ve tehdit her zaman engeller; diğerleri `block_dangerous` ayarıyla). Yüksek bulgu
ya da puan ≥30 → **dikkat** ve açık onay. Defender çalışamadıysa (`require_scan`), kaynak özet yayımlamıyorsa
(`require_verified`) ya da site tanınmıyorsa açık onay istenir. Yerel dosyalar yalnızca not alır.

## Modstead güncellemesi

Uygulamanın kendisi `tauri-plugin-updater` ile, imzalı olarak güncellenir (`src-tauri/src/updater.rs`; sürüm hattı ve
anahtar: `docs/RELEASING.md` → Updates).

```
açılıştan ~45 sn sonra, sonra 6 saatte bir (Ayarlar → "Güncellemeleri otomatik denetle"; elle: update_check)
  │  GET github.com/azorkai/modstead/releases/latest/download/latest.json   (taslak ve ön sürüm "latest" olmaz)
  ▼
yeni sürüm (ön sürüm değil, daha büyük) → indirme adresi bu deponun releases/download/…exe'si mi?
  │  indir (bellekte) → minisign imzası gömülü açık anahtarla + imzadaki sürüm = bildirilen sürüm (requireSignedVersion)
  ▼
phase "ready" → modstead://update → arayüz: "Güncelleme hazır · Yeniden başlat" bildirimi + üst çubukta gösterge
  │  kullanıcı "Yeniden başlat" → update_install
  ▼
meşgul mü? (her oyunun Game::busy() + süren indirme/kurulum görevi; incelemede bekleyen sayılmaz) → evetse reddet
  │  hayırsa: pencere durumu kaydedilir, NSIS kurucusu sessiz ilerleme kipinde başlar, Modstead kapanır,
  ▼  kurucu uygulamayı yeniden açar. Basılmazsa güncelleme sonraki açılışta yeniden sunulur.
```

- **Meşgul kuralı (`Game::busy`)**: Modstead yeniden başlatılırsa oyunda yarım kalacak bir iş varsa `true`. Varsayılan
  `false`: modları oyun kapalıyken uygulanan oyunlar için açık oyun engel değildir. MSFS: SimConnect bağlı, sim süreci
  açık ya da kariyer uçuşu başlatılıyor/izleniyor (`career::Live`). Ucuz olmalı; kabuk yalnızca kurulumdan önce ve
  güncelleme hazırken arayüz sorduğunda (`update_status`) çağırır.
- **İzinler**: arayüze eklentinin hiçbir izni verilmez (`capabilities/`); denetim, indirme ve kurulum kabuk
  komutlarından geçer, meşgul kuralı Rust'ta uygulanır. Uçuş ekranı penceresinin (`msfs-deck`) yetkisi yoktur.
- **Ağ**: eklenti kendi HTTP istemcisini kullanır (çekirdeğin `Http`'si değil). Tek sunucu GitHub'dır, HTTPS zorunludur,
  uç nokta `tauri.conf.json`'da sabittir ve indirme adresi bu deponun sürüm dosyalarıyla sınırlıdır.
- **Kurucu**: çalıştırılan tek kurucu Modstead'in kendi imzası doğrulanmış kurucusudur ("kurucular asla çalıştırılmaz"
  kuralı mod arşivleri içindir).
- Hata ayıklama derlemesi kendiliğinden denetlemez ve kurmaz (geliştirme yuvaları kurulu uygulamanın üstüne yazmasın);
  elle denetim çalışır. Önizleme kipinde `?update=ready|busy|downloading|checking|error|never`.

## Olaylar

| Olay | Yük | Kim yayar |
|---|---|---|
| `modstead://job` | `JobSnapshot` | çekirdek (`JobHandle`) |
| `modstead://game-changed` | `{ game }` | oyun (`services.game_changed(id)`) — ana sayfa/kenar çubuğu yenilenir |
| `modstead://nxm` | `{ url, game }` | kabuk (ikinci örnekten gelen bağlantı; arayüz onay sorar) |
| `modstead://files` | `{ paths }` | kabuk (ikinci örnekten gelen arşivler) |
| `modstead://notify` | `{ tone, title, detail }` | herkes (`services.notify`) |
| `modstead://update` | `UpdateView` (`busy` boş) | kabuk (`src-tauri/src/updater.rs`): Modstead güncellemesinin durumu |
| `<oyun>://…` | serbest | oyun (ör. `stardew://smapi-progress`) |

## Veri

| Yer | İçerik |
|---|---|
| `%APPDATA%\app.modstead\settings.json` | genel ayarlar (`crates/core/src/settings.rs`) |
| `%APPDATA%\app.modstead\games\<oyun>\` | oyunun kalıcı verisi: ayarlar, profiller, kurulum kayıtları |
| `%LOCALAPPDATA%\app.modstead\games\<oyun>\` | önbellek, indirmeler, çöp kutusu |
| `%LOCALAPPDATA%\app.modstead\staging\` | varsayılan karantina (oyunlar mümkünse hedefle aynı birimde kendi karantinasını kullanır) |
| `%LOCALAPPDATA%\app.modstead\logs\` | günlük (tauri-plugin-log) |
| `%LOCALAPPDATA%\app.modstead\updater.json` | Modstead güncellemesinin son denetim zamanı |
| Kimlik Bilgisi Yöneticisi | `Modstead/NexusMods/ApiKey`, `Modstead/VirusTotal/ApiKey`, `Modstead/GitHub/Token` |
| `HKCU\Software\Classes\nxm` | yalnızca kullanıcı nxm işleyicisini açarsa (önceki işleyici ayarlarda saklanır) |

Geliştirme yuvaları (`MODSTEAD_DEV_INSTANCE=<ad>`, yalnızca hata ayıklama derlemesi) veriyi
`app.modstead-dev-<ad>` klasörlerine yazar ve tek örnek kilidini atlar.

## İlk kurulum

`src/shell/Onboarding.tsx`, `settings.onboarded` yanlışken açılır. Üç adım:

1. **Hoş geldin.** Bütün oyunlar için `game_detect` (`useDetectMany`) ve `games_status` aynı anda başlar; simgeler
   bulundukça belirginleşir, oyun adımına gelindiğinde sonuç hazırdır.
2. **Oyunlar.** Yalnızca bulunan oyunlar (aday kurulum, kayıtlı yol ya da elle seçilen klasör) sorulur ve öntanımlı
   seçili gelir. Bulunamayanlar "Listede olmayan bir oyunun mu var?" altında durur; `chooseGameFolder` → `game_set_path`
   başarılı olunca oyun bulunanlara katılır. Hiçbiri bulunamazsa aynı liste boş durumla açık gelir ve "Şimdilik geç"
   bütün oyunları gösterir (ana sayfada klasör seçilebilsin diye).
3. **Güvenlik ve hesap.** Kurulum hattının özeti; Nexus anahtarı ve nxm bağlantısı yalnızca seçilen oyunlardan biri
   `GameInfo.nexus` taşıyorsa sorulur.

Kayıt: `settings.games = gamesSetting(seçilenler)` (`src/shell/Rail.tsx`): kayıt sırasında; hepsi ya da hiçbiri seçiliyse
`[]` (= bütün oyunlar). Kenar çubuğunda olmayan oyunlar ana sayfadaki "Diğer oyunlar" kartından (sonradan kurulduysa
"Bu bilgisayarda bulundu" diye öne çıkar) ya da Ayarlar → Oyunlar'dan geri eklenir.

## Yeni oyun ekleme

1. `games/<oyun>/` oluştur (var olan bir oyunu şablon al): `Cargo.toml`, `build.rs` (test ikilileri için bildirim), `src/lib.rs`
   (`ID`, `INFO`, `Game` uygulaması, `init`, `handler`), `ui/index.tsx` (`GameModule`).
2. Kök `Cargo.toml` → `members`; `src-tauri/Cargo.toml` → bağımlılık; `src-tauri/src/lib.rs` → `GAMES` ve `game_handlers()`.
3. `src/games/registry.ts` → `GAMES`; `src/styles/tokens.css` → `[data-game="<oyun>"]` vurgu ve yazı tipi.
4. Önizleme ve geliştirme: `src/lib/mock.ts` (`appInfo.games` ve ana sayfa kartı), `vite.config.ts` (`steamArt` haritası),
   `scripts/dev.mjs` (yuva: port + CDP). Oyunun görsel sunucusu varsa `src-tauri/tauri.conf.json` CSP `img-src`'ye ekle.
5. Gerekirse `crates/core` → hiçbir şey (oyun sabiti çekirdeğe girmez).

Örnek: Cities: Skylines II (`games/cities2`) bu adımlarla eklendi; ortak değişiklik yalnızca kayıt satırları, CSP'ye
`modscontent.paradox-interactive.com`, çalışma alanına `zstd`/`png` (kayıt önizlemesi) ve `art.rs`'te simge için kurulum
klasöründeki Xbox kutucuğu (Xbox uygulaması oyunu `XboxGames` dışına da kurabilir).
