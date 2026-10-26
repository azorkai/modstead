# Modstead sim içi API

Modstead açıkken bilgisayarda `127.0.0.1` üzerinde dinleyen küçük bir sunucu çalışır
(`games/msfs/src/career/hud_server.rs`). Port sırayla `47213`, `47214`, `47215` denenir; ilk yanıt veren kullanılır.
Simin içindeki sayfalar (araç çubuğu paneli ve ana menü kutusu) kodlarını, görünümlerini ve kariyer verisini
buradan alır. Modstead güncellenince sim kapatılmadan yenilenir.

Uçuş ekranı (`deck.html`, ön yüzün ikinci girişi; ayar ve pencere: `games/msfs/src/career/deck.rs`) da sayfasını
ve bütün verisini bu sunucudan alır. Aynı sayfa Modstead'in ayrı penceresinde, bilgisayardaki herhangi bir
tarayıcıda (`http://127.0.0.1:<port>/deck`) ve isteğe bağlı yerel ağ kipinde aynı ağdaki bir tablette çalışır.

## Güvenlik

Bu bilgisayardan (`127.0.0.1`) gelen istekler:

- Yalnızca `Host: 127.0.0.1:<port>` ya da `localhost:<port>` kabul edilir (DNS yeniden bağlamaya karşı).
- `GET` yanıtlarını başka kaynaktan okumaya yalnızca `Origin: coui://…` için izin verilir (CORS). Uçuş ekranı
  sayfası aynı kaynaktan (`http://127.0.0.1:<port>`) okuduğu için CORS gerekmez.
- `POST` yalnızca `Origin: coui://…` ile kabul edilir; başka kaynaktan ya da kaynaksız gelen `POST` 403 alır.
  `Content-Type: application/json` olduğu için tarayıcı önce `OPTIONS` sorar; sunucu yalnızca `coui://` için izin verir.
- Dosya ya da kabuk erişimi yoktur. Diskten yalnızca uydu karosu önbelleği okunur (yolu yalnızca rakamlardan
  kurulur). Yalnızca aşağıdaki uçlar vardır.

Yerel ağ kipi (isteğe bağlı, **varsayılan kapalı**; Modstead'deki uçuş ekranı ayarından açılır):

- Açıkken sunucu aynı portla bilgisayarın yerel ağ adresinde de (yalnızca özel adresler: `10/8`, `172.16/12`,
  `192.168/16`) dinler. Kapatınca o dinleyici gerçekten kapanır; yeniden açınca yeniden bağlanır.
- Ağdan gelen istekte `Host` tam olarak `<ağ adresi>:<port>` olmalıdır; değilse 403 (DNS yeniden bağlama).
- Ağdan yalnızca `GET` kabul edilir: `POST` ve `OPTIONS` 403 alır. `/hud/…` ve `/menu/…` ağa kapalıdır (404).
  Ağdan gelen yanıtlara CORS izni verilmez.
- Her `/api/…` isteği anahtar ister: `X-Modstead-Key: <anahtar>` başlığı ya da `k=<anahtar>` sorgu parametresi.
  Yoksa ya da yanlışsa 401. Karşılaştırma sabit zamanlıdır.
- Anahtarsız yalnızca uçuş ekranının sayfası ve derlenmiş ön yüz dosyaları açılır (içlerinde veri yoktur).
- Anahtar 128 rastgele bittir (26 karakter, küçük harfli base32). Yalnızca Windows Kimlik Bilgisi Yöneticisi'nde
  durur (`Modstead/MSFS/DeckKey`); diske yalnızca "açık mı" bilgisi yazılır (`career/deck.json`). İlk açılışta
  üretilir; "anahtarı yenile" eski adresi ve QR kodunu hemen geçersiz kılar.
- Tabletin açacağı adres `http://<ağ adresi>:<port>/deck?k=<anahtar>&lang=tr` biçimindedir; QR kodu bunu taşır.
  Sayfa anahtarı adresten alıp her `/api` isteğine ekler. Bütün yanıtlarda `Referrer-Policy: no-referrer` vardır.
- Windows güvenlik duvarı ilk açılışta izin sorar; dinleme hatası arayüzde `lan.error` olarak görünür.

## Uçlar

| Yöntem | Yol | Yanıt |
|---|---|---|
| GET | `/hud/v` | `{"app":"modstead-career-hud","v":"<sürüm özeti>"}`: panel ve menü dosyaları değişince değişir |
| GET | `/hud/app.js`, `/hud/app.css`, `/hud/body.html` | araç çubuğu panelinin kodu, görünümü, işaretlemesi |
| GET | `/menu/app.js`, `/menu/app.css` | ana menü arayüzünün kodu ve görünümü |
| GET | `/api/state` | Modstead uygulamasındaki `msfs_career_state` ile aynı JSON (`CareerView`) |
| GET | `/api/live` | `msfs_career_live` ile aynı JSON (`Live`: bağlantı, kamera, başlatma adımı, kontroller) |
| GET | `/api/board` | `msfs_career_board` ile aynı JSON (iş ilanları, `Job[]`); her işte `conditions` (hava ve zaman senaryosu: `time`, `weather`, `utc`, `utcOffsetMin`, `wx`, `payBonus`…; bkz. `career/conditions.rs`) |
| GET | `/api/aircraft` | `msfs_career_aircraft` ile aynı JSON (`AircraftOption[]`) ve her kayıtta `family` (gerçek tip adı ya da `null`) ile `photo` (`/api/photo/<id>.jpg` ya da `null`) |
| GET | `/api/photo/<id>.jpg` | uçak ailesinin fotoğrafı (640×360 JPEG) |
| GET | `/api/call/<komut>?a=<JSON>` | aşağıdaki salt okunur komutlardan birinin sonucu (uygulamadaki Tauri komutuyla aynı JSON) |
| GET | `/api/tiles/<katman>/<z>/<x>/<y>` | harita karosu (256 px JPEG, Web Mercator); ayrıntı aşağıda |
| GET | `/api/deck/qr.svg` | yerel ağ adresinin QR kodu (`image/svg+xml`); yerel ağ kipi kapalıysa 404 |
| GET | `/deck` (`/deck/`) | uçuş ekranı sayfası (`deck.html`); `?lang=tr\|en`, yerel ağda ayrıca `?k=<anahtar>` |
| GET | `/assets/<dosya>`, `/favicon.svg` | uçuş ekranının derlenmiş dosyaları (JS, CSS, yazı tipi, görsel) |
| POST | `/api/accept` | gövde `{"id":"<iş kimliği>"}` |
| POST | `/api/pick` | gövde `{"title":"<simdeki başlık>","livery":""}` |
| POST | `/api/launch` | gövde `{"start":{"runway":true,"end":null}}` (`start` verilmezse işin son seçimi) |
| POST | `/api/cancel` | gövde `{}`: henüz uçulmamış işi bırakır |
| POST | `/api/deck/open` | gövde `{}`: Modstead'de uçuş ekranı penceresini açar ya da öne getirir |
| GET | `/api/sim-assist` | `{"unpause":<n>,"notice":<metin\|null>}`: sim içi koda yardım isteği (aşağıda) |
| POST | `/api/sim-assist` | gövde `{"id":"<n>","result":"<sonuç>"}`: isteğin nasıl işlendiği; yalnızca günlüğe yazılır |

### `/api/sim-assist`

MSFS 2024 bazı başlatmalardan sonra uçağı aktif duraklatmada bırakıyor; Modstead bunu SimConnect ile görüyor ama her
zaman kapatamıyor (bkz. `games/msfs/src/career/pause_guard.rs`). Ana arayüzdeki Modstead kodu (`ModsteadMenu.js`)
bu ucu uçuşta da iki saniyede bir yoklar:

- `unpause` 0 değilse ve daha önce işlenmemişse simin araç çubuğunun yaptığını yapar: `TOOLBAR_SET_ACTIVE_PAUSE`, `false`
  (kapatır; aç/kapa değil). Önce simin `JS_LISTENER_TOOLBAR_PANELS` dinleyicisi aranır, yoksa `engine.call`. Sonucu
  (`toolbar`, `no-listener,engine-ok` …) `POST /api/sim-assist` ile bildirir. Her numara bir kez işlenir.
- `notice` varsa (ör. "Pause tuşuna basın") bildirimde gösterilir; kalkınca bildirim kapanır.

`POST` yanıtları: başarıda `200 {"ok":true}`, hata durumunda `400 {"error":"<kullanıcıya gösterilecek ileti>"}`.
İletiler Modstead'in dilindedir (Türkçe ya da İngilizce).

### `/api/call/<komut>`

`a` parametresi URL kodlanmış bir JSON nesnesidir (komutun argümanları; argümansız komutlarda verilmeyebilir).
Bozuk argüman ya da komut hatası `400 {"error":"…"}`, listede olmayan komut 404 verir. Yalnızca şunlar çağrılabilir:

| Komut | Argümanlar | Yanıt |
|---|---|---|
| `msfs_career_state` | — | `CareerView` |
| `msfs_career_live` | — | `Live` |
| `msfs_career_map_airports` | `{"south":…,"west":…,"north":…,"east":…,"detail":0\|1\|2}` | `MapAirport[]` |
| `msfs_career_weather` | — | `Metar[]` (önbellekte olmayanlar aviationweather.gov'dan istenir) |
| `msfs_career_track` | — | aktif uçuşun şimdiye kadarki izi, `TrackPoint[]` (`[enlem, boylam, irtifa ft, yer hızı kt]`); aktif takip yoksa `[]` |
| `msfs_career_deck_info` | — | `DeckInfo` (aşağıda) |
| `msfs_career_tiles_info` | — | `TilesInfo` (aşağıda, "Harita karoları") |

Örnek: `GET /api/call/msfs_career_map_airports?a=%7B%22south%22%3A40%2C%22west%22%3A28%2C%22north%22%3A42%2C%22east%22%3A30%2C%22detail%22%3A0%7D`

### `DeckInfo`

Uygulamadaki `msfs_career_deck_info`, `msfs_career_deck_set_lan(on)` ve `msfs_career_deck_rotate()` komutları da
bunu döner (`msfs_career_deck_open()` pencereyi açar, `msfs_career_track()` izi verir).

```json
{
  "port": 47213,
  "localUrl": "http://127.0.0.1:47213/deck?lang=tr",
  "lan": {
    "enabled": true,
    "ip": "192.168.1.23",
    "url": "http://192.168.1.23:47213/deck?k=<anahtar>&lang=tr",
    "error": null
  },
  "qrSvg": "<svg …>",
  "windowOpen": false
}
```

- `port` ve `localUrl`: sunucu çalışmıyorsa `null`.
- `lan.url` ve `qrSvg`: yalnızca yerel ağ kipi açık ve dinleniyorken; `lan.ip` bilinen ağ adresidir (kapalıyken de).
- `lan.error`: açılamadıysa nedeni (ör. ağ adresi yok, port kullanımda), Modstead'in dilinde.

## Harita karoları

`GET /api/tiles/<katman>/<z>/<x>/<y>`: XYZ düzeni (sol üst köşe 0/0), Web Mercator (EPSG:3857), 256×256 px, JPEG
(simin içindeki panelin tarayıcısı WebP açmaz). Yolda yalnızca ondalık rakamlar vardır; uzantı yoktur.
Bu bilgisayardan anahtarsız, yerel ağdan anahtarla (`k=` ya da `X-Modstead-Key`) açılır; `coui://` sayfaları
yanıtı CORS ile okuyabilir (tuvale çizilen karo tuvali kirletmez).

| Katman | z | Kaynak | Atıf ve lisans |
|---|---|---|---|
| `relief` | 0–5 | Çevrimdışı, Modstead'e gömülü: Natural Earth II gölgeli kabartma ve su (`NE2_50M_SR_W`), Web Mercator'a izdüşürülmüş (`games/msfs/data/relief.tiles`, üreten betik `games/msfs/tools/relief_tiles.py`) | "Natural Earth"; kamu malı |
| `sat` | 0–13 | Çevrimiçi: EOX Sentinel-2 cloudless 2016 (`tiles.maps.eox.at`, katman `s2cloudless_3857`) | "EOxCloudless https://cloudless.eox.at by EOX IT Services GmbH (Contains modified Copernicus Sentinel data 2016)"; CC BY 4.0. Görüntü gösterilirken atıf görünmelidir |

Yanıtlar:

- `200`: `Content-Type: image/jpeg`, `Cache-Control: public, max-age=…` (`relief` 7 gün, `sat` 30 gün).
- `404 {"error":"not found"}`: bilinmeyen katman, katmanın aralığı dışındaki `z`, `2^z`'den büyük `x`/`y`, bozuk yol.
- `503 {"error":"tile unavailable: …"}`: çevrimiçi karo şu an alınamıyor (ağ yok, sunucu hatası). İstemci aynı
  karonun yerine `relief` katmanını (gerekirse bir üst düzeyden büyüterek) çizmelidir.

Uydu karoları çekirdeğin izin listeli HTTPS istemcisiyle (Modstead'in `User-Agent`'ıyla) indirilir ve diskte
saklanır: `%LOCALAPPDATA%pp.modstead\games\msfs	iles\sat\<z>\<x>\<y>.jpg`. Önbellek 512 MB'ı aşınca en uzun
süredir kullanılmayan karolar silinir. Aynı karonun eşzamanlı istekleri tek indirmeye iner, aynı anda en çok 4 karo
indirilir, tek indirme en çok 8 sn sürer. Başarısız karo 60 sn (sunucuda olmayan karo 30 dk) yeniden istenmez;
bağlantı hatasından sonra 15 sn boyunca hiç indirme denenmez (istemci hemen 503 alır).

### `TilesInfo`

Uygulamadaki `msfs_career_tiles_info` komutu ve `/api/call/msfs_career_tiles_info`:

```json
{
  "base": "http://127.0.0.1:47213",
  "layers": [
    { "id": "relief", "minZoom": 0, "maxZoom": 5, "online": false, "attribution": "Natural Earth",
      "license": "Public Domain", "licenseUrl": "https://www.naturalearthdata.com/about/terms-of-use/" },
    { "id": "sat", "minZoom": 0, "maxZoom": 13, "online": true,
      "attribution": "EOxCloudless https://cloudless.eox.at by EOX IT Services GmbH (Contains modified Copernicus Sentinel data 2016)",
      "license": "CC BY 4.0", "licenseUrl": "https://creativecommons.org/licenses/by/4.0/" }
  ]
}
```

- `base`: bu bilgisayardaki sunucunun kökü; sunucu açılamadıysa `null`. Karo adresi `${base}/api/tiles/<katman>/<z>/<x>/<y>`.
  Uçuş ekranı (yerel ağda da) kendi kaynağını ve `?k=<anahtar>` ekini kullanır.
- `maxZoom`'dan yakın görünümde istemci son düzeyin karosunu büyütür; sunucu daha yüksek `z` için 404 verir.
- Uygulama penceresinin CSP'si `img-src`'de `http://127.0.0.1:47213-47215`'e açıktır (`src-tauri/tauri.conf.json`).
  Pencerede karolar `<img>` ya da tuvale çizilerek kullanılır; uygulamanın kaynağına CORS izni verilmez (piksel
  okunmaz).

## Geliştirme

Hata ayıklama derlemesinde gömülü ön yüz dosyaları yoktur; sayfa yolları (`/deck` → `/deck.html` ve `/api`,
`/hud`, `/menu` dışındaki her `GET`) Vite geliştirme sunucusuna (`127.0.0.1:$MODSTEAD_PORT`, yoksa `1420`) aktarılır.
Üst klasör (`..`) hiç aktarılmaz; yerel ağdan gelen isteklerde ayrıca `/@fs/`, gizli dosyalar (Vite'ın
`/node_modules/.vite/` klasörü hariç) ve kodlanmış yollar kapalıdır. Sıcak yenileme (WebSocket) aktarılmaz. Sürüm derlemesinde bu aktarma derlenmez.

Sürüm derlemesindeki sayfa kendi güvenlik politikasıyla verilir (`connect-src 'self'`, satır içi betik yok,
`frame-ancestors 'none'`): uçuş ekranı dış kaynak yüklemez.

Tiplerin alanları `games/msfs/ui/career/types.ts` dosyasındadır (`CareerView`, `Live`, `Job`, `AircraftOption`, `TrackPoint`).
