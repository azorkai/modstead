# Cities: Skylines II (`games/cities2`)

Modstead'in Cities: Skylines II bölümü. Önceki bir uygulamadan taşınmadı; sıfırdan yazıldı (24.10.2026).

## Ne yapar

| Sayfa | İçerik |
|---|---|
| Genel bakış | Vitrin + "Oyna" (Steam'de geliştirici kipi seçenekleri), mağaza/sürüm, Paradox hesabı durumu, **kaldığın şehir** (en son kaydın oyundaki önizlemesi, nüfus, para, harita), sayılar, dikkat gerekenler, son oturum (sürüm, ekran kartı, çökme), disk, Paradox Mods'ta öne çıkanlar |
| Modlar | Paradox Mods abonelikleri (oyunun önbelleği; salt okunur, katalog bilgisiyle zenginleşir) + yerel modlar (aç/kapat, çöpe taşı, klasör). Uyumluluk, bekleyen güncelleme, eski sürüm birikintisi, BepInEx, bilinen kötü amaçlı sürüm rozetleri; çöp kutusu |
| Mod bul | **Paradox Mods kataloğu** (27 binden fazla içerik: arama, etiket, sıralama, mod sayfası çekmecesi: ekran görüntüleri, gerekenler kurulu mu, uyumluluk, açıklama, sürüm notları) + Nexus Mods (indirilip güvenlik hattından geçer) |
| Sağlık | Puan, bulgular ve tek tık çözümler, kurulu modların güvenlik taraması (Defender + bilinen kötü amaçlı DLL özeti), günlük özeti (hatalar modlarla eşlenir) ve günlük görüntüleyici |
| Kayıtlar | Şehir kartları (önizleme `.cok` içinden), ayrıntı: oyun tarihi, tema, seçenekler, kaydedilirken açık modlar; yedekle / geri yükle / sil |
| Oyun ayarları | Oyun klasörü, oyun verisi, yedek ve çöp klasörü; başlatma seçenekleri; değişiklikten önce kayıt yedeği, yedek sayısı, çöp süresi; disk |

## Doğrulanmış bilgiler (bu makinede ve kaynaklarda)

- Oyun verisi: `%USERPROFILE%\AppData\LocalLow\Colossal Order\Cities Skylines II`. Sürüm her açılışta `version` dosyasına yazılır (`1.6.2f1 (768.21d1) [6300.27778]`).
- Paradox Mods abonelikleri: `.cache\Mods\pdx_mods\<modId>_<sürüm>` (1.1–1.5'te `mods_subscribed`); kökler `.cache\Mods\mod_directory.json`'da. Oyun güncellemede eski sürüm klasörünü çoğu zaman silmez.
- Yerel modlar: `Mods\<klasör>`; oyun kendiliğinden yükler, başına `.` konan klasörü yüklemez (Paradox wiki, Modding Toolchain).
- Paradox hesabı: `.pdxsdk\LastUserId.txt` → `.pdxsdk\<kimlik>\database.json` (`LoggedIn`, `PseudonymizedUserData.IdType`). Kayıtlar `Saves\<aynı kimlik>\*.cok` (+ `.cok.cid`), haritalar `Maps\`.
- `.cok` sıkıştırmasız ZIP'tir: `<ad>.SaveGameMetadata` (BOM'lu JSON: cityName, population, money, mapName, theme, simulationDate, options, modsEnabled…), `<ad>.Texture` (18 baytlık başlık + zstd'li RGBA8, satırlar alttan üste; 680×383) ve `<ad>.SaveGameData`.
- Xbox uygulaması oyunu kullanıcının seçtiği klasöre kurabilir (`D:\Games\Cities- Skylines II - PC Edition\Content`); `WindowsApps` yolu oraya bağlanır, klasör kullanıcıya salt okunurdur. Kurulum kayıt defterindeki paket kaydından (`AppModel\Repository\Packages`) ve `Player.log`'daki `Mono path` satırından bulunur. Başlatma: `shell:AppsFolder\ParadoxInteractive.CitiesSkylinesII-PCEdition_zfnrdv2de78ny!Cities2`. Steam: 949230, `steam://run/949230//--developerMode/`.
- Paradox Mods açık API'si (giriş gerekmez): `POST https://api.paradox-interactive.com/mods?metadata=yes` (gövde: `gameName: cities_skylines_2`, `os`, `sortBy: best|popularity|created|updated|rating`, `time` yalnızca `best` ile, `searchQuery`, `tags`, `page`, `pageSize`) ve `GET …/mods?modId=<n>&os=Windows` (açıklama, ekran görüntüleri, `requirements`, `changelog`, `requiredVersion`). Görseller `modscontent.paradox-interactive.com` (CSP'de izinli).
- Nexus: alan adı `citiesskylines2`, oyun kimliği 5833 (~121 mod; çoğu Paradox Mods modlarının yerel kopyası ya da 1.1 öncesi BepInEx dönemi).
- 2024'te Paradox Mods'taki "Traffic" modunun 0.2.3 sürümü (`80095_13`, `FastMath.dll`, SHA-256 `8c6c3f9b…cead`) kötü amaçlı kod taşıdı; `mods::KNOWN_BAD` ile yakalanır. Modun güncel sürümleri temizdir.

## Bilerek yapılmayanlar

- **Paradox Mods'tan indirme/abonelik yok.** Abonelik Paradox hesabıyla eşitlenir ve oyun indirir; Modstead katalogu gösterir, sayfayı açar, kurulu modları ve bağımlılıklarını denetler. Paradox hesabı kimlik bilgisi istenmez.
- Paradox abonelikleri Modstead'den açılıp kapatılmaz (oyunun oynatma listesi yönetir); yalnızca eski sürüm/yarım indirme klasörleri ve bilinen kötü amaçlı sürüm silinebilir (yeniden indirilebilir önbellek).
- Oyun klasörüne hiçbir şey yazılmaz; BepInEx kalıntıları yalnızca Steam/elle kurulumda çöpe taşınabilir (paket kurulumu korumalıdır).
- Thunderstore: CS2 topluluğu 1.1 öncesi BepInEx dönemine ait; kaynak olarak eklenmedi.

## Yapı

```
src/lib.rs        INFO (cities2, Nexus 5833, Steam 949230, hosts), ayarlar, yollar, Game uygulaması, komut tablosu
src/detect.rs     kurulum (Steam, Xbox klasörü, Store paketi, günlük), sürüm, Paradox hesabı, başlatma hedefi, BepInEx
src/mods.rs       Paradox önbelleği + yerel mod taraması, eski sürümler, BepInEx, KNOWN_BAD, çift kopya
src/paradox.rs    Paradox Mods katalog istemcisi, kurulu modların meta önbelleği (pdx-meta.json), uyumluluk
src/saves.rs      kayıt bilgisi, önizleme (zstd → PNG, önbellekli), yedek/geri yükle/sil
src/health.rs     sağlık bulguları ve puan
src/logs.rs       günlük özeti, mod eşleme, çökme dökümleri, görüntüleyici
src/ops.rs        aç/kapat, çöp kutusu, önbellek temizliği, BepInEx kaldırma
src/install.rs    güvenlik hattı → plan (kod modu / kayıt / harita) → onay → kopyalama
src/discover.rs   Paradox ve Nexus komutları
src/commands.rs   ortam, ayarlar, anlık görüntü, sağlık, kayıtlar, günlükler, başlatma, klasörler, onay
ui/               Overview, Mods, Discover (+PdxSheet), Health, Saves, Settings, ReviewPlan; i18n (TR/EN), mock
```

## Deneme

```bash
cargo test -p game-cities2
cargo test -p game-cities2 real_ -- --ignored --nocapture      # bu makinedeki kurulum + Paradox API (salt okunur)
node scripts/dev.mjs cities2 --preview                          # http://127.0.0.1:1424/?view=game:cities2
#   &review=cs2-review  inceleme penceresinin örnek planı
```
