# Modstead sim içi API

Modstead açıkken bilgisayarda yalnızca `127.0.0.1` üzerinde dinleyen küçük bir sunucu çalışır
(`games/msfs/src/career/hud_server.rs`). Port sırayla `47213`, `47214`, `47215` denenir; ilk yanıt veren kullanılır.
Simin içindeki sayfalar (araç çubuğu paneli ve ana menü kutusu) kodlarını, görünümlerini ve kariyer verisini
buradan alır. Modstead güncellenince sim kapatılmadan yenilenir.

## Güvenlik

- Yalnızca `Host: 127.0.0.1:<port>` ya da `localhost:<port>` kabul edilir (DNS yeniden bağlamaya karşı).
- `GET` yanıtlarını tarayıcıların okumasına yalnızca `Origin: coui://…` için izin verilir (CORS).
- `POST` yalnızca `Origin: coui://…` ile kabul edilir; başka kaynaktan ya da kaynaksız gelen `POST` 403 alır.
  `Content-Type: application/json` olduğu için tarayıcı önce `OPTIONS` sorar; sunucu yalnızca `coui://` için izin verir.
- Dosya ya da kabuk erişimi yoktur; yalnızca aşağıdaki kariyer işlemleri vardır.

## Uçlar

| Yöntem | Yol | Yanıt |
|---|---|---|
| GET | `/hud/v` | `{"app":"modstead-career-hud","v":"<sürüm özeti>"}`: panel ve menü dosyaları değişince değişir |
| GET | `/hud/app.js`, `/hud/app.css`, `/hud/body.html` | araç çubuğu panelinin kodu, görünümü, işaretlemesi |
| GET | `/menu/app.js`, `/menu/app.css` | ana menü arayüzünün kodu ve görünümü |
| GET | `/api/state` | Modstead uygulamasındaki `msfs_career_state` ile aynı JSON (`CareerView`) |
| GET | `/api/live` | `msfs_career_live` ile aynı JSON (`Live`: bağlantı, kamera, başlatma adımı, kontroller) |
| GET | `/api/board` | `msfs_career_board` ile aynı JSON (iş ilanları, `Job[]`) |
| GET | `/api/aircraft` | `msfs_career_aircraft` ile aynı JSON (`AircraftOption[]`) ve her kayıtta `family` (gerçek tip adı ya da `null`) ile `photo` (`/api/photo/<id>.jpg` ya da `null`) |
| GET | `/api/photo/<id>.jpg` | uçak ailesinin fotoğrafı (640×360 JPEG) |
| POST | `/api/accept` | gövde `{"id":"<iş kimliği>"}` |
| POST | `/api/pick` | gövde `{"title":"<simdeki başlık>","livery":""}` |
| POST | `/api/launch` | gövde `{"start":{"runway":true,"end":null}}` (`start` verilmezse işin son seçimi) |
| POST | `/api/cancel` | gövde `{}`: henüz uçulmamış işi bırakır |

`POST` yanıtları: başarıda `200 {"ok":true}`, hata durumunda `400 {"error":"<kullanıcıya gösterilecek ileti>"}`.
İletiler Modstead'in dilindedir (Türkçe ya da İngilizce).

Tiplerin alanları `games/msfs/ui/career/types.ts` dosyasındadır (`CareerView`, `Live`, `Job`, `AircraftOption`).
