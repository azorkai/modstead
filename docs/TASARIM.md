# Modstead tasarım dili

## İlkeler

1. **Bir ev, birçok oda.** Kabuk (oyun rayı, ana sayfa, ayarlar) nötr grafit zemin ve Modstead moru taşır. Bir oyuna
   girildiğinde tüm sütun o oyunun kimliğine bürünür: vurgu rengi, başlık yazı tipi, kahraman görseli. Oyun
   değiştirmek aynı evin başka odasına geçmek gibi hissettirmeli; düzen ve davranış hiç değişmez.
2. **Önce açıklık.** Her ekranın tek bir ana işi ve tek bir birincil düğmesi olur. Süs, bilgiyi örtmez.
3. **Güven görünür olsun.** Kaynak, bütünlük, tarama ve karar her kurulumda aynı panelde, aynı dille gösterilir.
4. **Sakin hareket.** Kısa, yumuşak geçişler (120–300 ms); yaylı animasyon yalnızca seçim göstergelerinde.
   "Hareketi azalt" ayarı ve işletim sistemi tercihi her zaman uygulanır.

## Belirteçler (`src/styles/tokens.css`)

Bileşenler yalnızca **anlamsal** adları kullanır. Sabit renk yazılmaz.

| Belirteç | Tailwind | Kullanım |
|---|---|---|
| `--bg` / `--bg-2` | `bg-bg`, `bg-bg-2` | pencere zemini / ray ve kenar çubuğu |
| `--surface`, `-2`, `-3` | `bg-surface…` | kart / yükseltilmiş, girdi / üzerine gelme, basılı |
| `--line`, `--line-strong` | `border-line…` | ince çizgi / vurgulu çizgi |
| `--fg`, `--fg-2`, `--muted` | `text-fg`, `text-fg-2`, `text-muted` | ana metin / ikincil / soluk |
| `--accent`, `-2`, `-ink` | `bg-accent`, `text-accent`, `text-accent-ink` | oyunun (ya da kabukta markanın) vurgusu |
| `--brand`, `-2`, `-ink` | `bg-brand`… | Modstead moru (kabuk, ilk kurulum) |
| `--ok`, `--warn`, `--danger`, `--info` | `text-ok`… | durum renkleri |

Yardımcı sınıflar (`src/styles/components.css`): `.card`, `.card-raised`, `.well`, `.glass`, `.accent-surface`
(birincil düğme degradesi), `.accent-soft`, `.brand-surface`, `.hero-surface` (vurgudan türeyen kahraman zemini),
`.text-display` (oyunun başlık yazı tipi), `.tabular`, `.skeleton`, `.win-btn`.

Tema: `<html data-theme="dark|light">` (varsayılan: sistem). Oyun kimliği: herhangi bir kapsayıcıda
`data-game="<oyun>"`; içindeki her şey o oyunun vurgusunu ve yazı tipini alır (pencereler `Dialog game=…` ile).

## Oyun kimlikleri

| Oyun | Vurgu (koyu / açık) | Başlık yazı tipi | Görsel motif | Oyuna özel veri renkleri |
|---|---|---|---|---|
| Kabuk (Modstead) | `#8f7fff` / `#6a55f5` | Inter | çatı + katmanlar | — |
| MSFS | `#ff7a1a` / `#e2600a` | Outfit | gün batımı, pist, tırmanan uçak | 2020 `#4ea8ff`, 2024 `#b08cff` |
| Bannerlord | `#e3b45c` / `#a2700f` | Fraunces | katmanlı dağlar, sancak, kıvılcım | — |
| Stardew | `#34d17a` / `#23874f` | Pixelify Sans (yalnızca başlıklarda) | piksel gece, tepeler, çit, filiz | mevsim vurguları (Vadi'den taşınırsa) |
| Cities: Skylines II | `#38b8f2` / `#0a7cbd` | Overpass (Highway Gothic'ten türeyen tabela yazısı; oyunun kendi arayüz yazı tipi) | kıyı silueti, gökdelenler, asma köprü, rüzgâr türbinleri | para `¢` (oyunun simgesi); kayıt görselleri oyunun kendi önizlemesi |

**Vitrin görselleri (başlatıcı hissi):** kullanıcı görsel ağırlıklı, cilalı bir "oyun başlatıcısı" istiyor (Steam yeniden
tasarımı ve mor oyun paneli referansları); lacivert zemin + parlayan degrade lekeler + cam kartlar estetiğini "AI slop"
diye reddetti. Bu yüzden:

- Büyük yüzeyler (ana sayfa kartı, genel bakış, kenar çubuğu kartı) oyunun **Steam kütüphane görsellerini** kullanır:
  `useArt(oyun, "hero" | "logo" | "header" | "portrait")` (`@/lib/art`). Kaynak önce Steam'in yerel önbelleği
  (`appcache/librarycache`), sonra Modstead'in disk önbelleği, en son Steam'in herkese açık mağaza deposu (izinli görsel
  sunucusu; bkz. `src-tauri/src/art.rs`). Önizleme kipinde aynı görselleri Vite geliştirme sunucusu verir; pakete girmez.
- **Oyun simgesi her yerde `GameIcon`** (`@/shell/GameIcon`): oyunun kendi .exe simgesi (Xbox kurulumunda mağaza
  kutucuğu), oyun renginde koyu karo üstünde; iki temada da aynı görünür. Simge yoksa vurgu renginde glif karosu. Ray,
  kartlar, kenar çubuğu, palet, indirmeler, ayarlar bunu kullanır; oyun sayfalarında da glif yerine bunu kullan.
- **Görsel alanları iki temada da koyu kalır.** Oyun logoları açık renklidir: görselin üstündeki perde sabit koyu
  (`rgb(8 9 12 / …)`) degradedir, `var(--bg)` ile karıştırılmaz (açık temada logo kaybolur). Üstündeki yazı `text-white`,
  ikincil yazı `text-white/75`; logo yoksa `text-display` metin logo; etiketler buzlu (`glass`).
- Görsel yoksa (Steam dışı kurulum, MSFS gibi önbellekte olmayan oyun) `games/<oyun>/ui/Art.tsx` SVG çizimi
  `.hero-surface` üzerinde kullanılır. SVG rengi `currentColor` (vurgu) ve katman saydamlığıyla verir, oyunun telifli
  görsellerini kopyalamaz. Kenar çubuğu kartında solda soldurma maskesi uygulanır (ad okunsun).
- Zemin düzdür; arka plana ışık lekesi/parıltı eklenmez.

## Tipografi

| Rol | Boyut / ağırlık | Not |
|---|---|---|
| Sayfa başlığı | 26 px · 600 · `text-display` | `PageHeader` |
| Kahraman başlığı | 34 px · 600 · `text-display` | oyun genel bakışı |
| Bölüm başlığı | 13.5–14 px · 600 | kart üst bilgileri |
| Gövde | 13.5 px | `body` varsayılanı (Inter, `cv11 ss01 ss03`) |
| Küçük | 12–12.5 px | açıklamalar |
| Etiket | 11–11.5 px · büyük harf · 0.08em | bölüm etiketleri (`OYUNLARIN`) |
| Yol, özet, kimlik | JetBrains Mono 11–11.5 px | `font-mono`, seçilebilir (`data-selectable`) |
| Sayılar | `tabular` | istatistikler, ilerleme |

Pixelify Sans küçük boyutta okunaksızdır ("C/O", "5/S"): yalnızca başlıklarda kullanılır, mod adlarında ve sayılarda asla.

## Yerleşim

- Oyun rayı 76 px · oyun kenar çubuğu 248 px · üst çubuk 54 px · içerik dolgusu 32 px yatay, 28 px üst.
- İçerik genişliği: ana sayfa 1240 px, oyun sayfaları 1180 px, ayarlar 880 px (ortalanmış).
- Yarıçaplar: kart 18 px, iç kutu 14 px, düğme/girdi 10 px, rozet 6 px, kahraman alanı 24 px.
- Boş alanlar pencereyi sürükler: `data-tauri-drag-region` (CSS `app-region` WebView2'de çalışmaz).

## Bileşenler (`@/ui`)

| Bileşen | Ne zaman |
|---|---|
| `Button` (`primary`, `brand`, `secondary`, `ghost`, `subtle`, `danger`; `sm/md/lg`; `loading`, `icon`, `trailing`) | Ekranda tek `primary`. Yıkıcı işlem `danger` + `ConfirmDialog`. |
| `IconButton` | araç çubukları; `label` zorunlu (erişilebilirlik ve ipucu) |
| `Switch`, `Checkbox`, `Segmented`, `Input`, `Kbd` | form öğeleri; `Segmented` aynı sayfada birden fazlaysa `id` ver |
| `Badge` (`neutral/accent/ok/warn/danger/info`, `dot`) | durum ve sayım |
| `Progress`, `ScoreRing`, `Spinner`, `Skeleton` | ilerleme ve yükleniyor (boş beyaz alan yerine iskelet) |
| `EmptyState` | boş liste: simge + başlık + tek cümle + (varsa) tek eylem |
| `PageHeader`, `Section` + `Row`, `Stat` | sayfa iskeleti, ayar listeleri, istatistik kutuları |
| `Dialog` (+`DialogHeader/Body/Footer`), `ConfirmDialog` | pencereler (Esc kapatır; oyunun kimliği `game` ile) |
| `ModCover` | görseli olmayan mod için addan türeyen kapak; görsel yüklenemezse baş harflere düşer |
| `Tooltip` | ray gibi yalnızca simge olan yerler |
| `SecurityPanel` | kurulum incelemesi (ortak; oyunlar değiştirmez) |
| `GameOverview` (`@/shell/GameOverview`) | oyunun genel bakış sayfası şablonu |

Bildirimler `sonner` (`toast`). Hata mesajı `notifyError(e)` (`@/shell/actions`) ile.

## Davranış kalıpları

- **Yükleniyor:** iskelet; 300 ms'den kısa işlerde gösterge yok.
- **Hata:** satır içi açıklama ya da bildirim; teknik ayrıntı açıklamada, başlık sade.
- **Yıkıcı işlem:** onay penceresi, geri alınabiliyorsa "geri al" bildirimi.
- **Kurulum:** her zaman görev → inceleme penceresi → onay. Doğrudan kurulum yok.
- **Klavye:** Ctrl+K komut paleti, Ctrl+, ayarlar, Esc pencere/panel kapatır.

## Simgeler

`lucide-react` 1.55 (marka simgeleri yok; GitHub/Steam gerekiyorsa oyunun kendi SVG'si). Listelerde 16 px,
düğmelerde 14–16 px, rayda 21 px; çizgi kalınlığı 2.

## Erişilebilirlik

Odak çerçevesi vurgu renginde ve görünür; simge düğmelerinde `aria-label`; renk tek başına anlam taşımaz
(rozetlerde metin de var); metin kontrastı koyu ve açık temada denetlenir.

## Eski uygulamalardan sınıf adı karşılıkları

| Otağ (Bannerlord) | Vadi (Stardew) | Hangar (MSFS, düz CSS) | Modstead |
|---|---|---|---|
| `bg-bg`, `bg-bg-2` | `bg-bg`, `bg-bg-2` | `var(--bg)`, `var(--frame)` | `bg-bg`, `bg-bg-2` |
| `bg-surface…` | `bg-surface…` | `var(--surface…)` | `bg-surface…` |
| `border-line`, `border-line-strong` | aynı | `var(--line)`, `var(--line-2)` | `border-line`, `border-line-strong` |
| `text-text`, `text-text-2`, `text-text-3` | `text-fg`, `text-fg-2`, `text-muted` | `var(--ink)`, `-2`, `-3` | `text-fg`, `text-fg-2`, `text-muted` |
| `text-gold`, `bg-gold`, `gold-surface` | `text-accent`, `bg-accent` | `var(--accent)` | `text-accent`, `bg-accent`, `accent-surface` |
| `text-gold-ink` | `text-accent-ink` | `var(--accent-ink)` | `text-accent-ink` |
| `text-red`, `text-green`, `text-amber`, `text-blue` | `text-danger`, `text-ok`, `text-warn`, `text-info` | `var(--red)`, `--green`, `--amber` | `text-danger`, `text-ok`, `text-warn`, `text-info` |
| `font-display` (Fraunces) | `pixel-title` | `var(--f-ui)` (Outfit) | `text-display` |
| `panel` | `card` | `.card` vb. | `card` |
| `ModAvatar` | `Avatar`, `PixelCover` | `Thumb`, `Poster` | `ModCover` (+ oyunun kendi kapak/poster bileşeni) |
| `Dialog` | `Modal` | özel | `Dialog` |

Oyuna özel görsel bileşenler (Vadi'nin `Pixel.tsx`, Hangar'ın `Poster.tsx`) oyun klasörüne taşınır ve renklerini
belirteçlerden alacak şekilde uyarlanır.

## Denetim (ekran görüntüsüyle)

Her ekran önizleme kipinde (örnek verilerle) koyu ve açık temada denetlenir:

```bash
node scripts/dev.mjs <oyun> --preview   # http://127.0.0.1:142x/?view=game:<oyun>[:<sayfa>]&theme=dark
```

Önizleme adres parametreleri: `?view=home|settings|game:<oyun>[:<sayfa>]`, `&theme=dark|light`, `&lang=en`, `&jobs=1`,
`&review=<görev>`, `&palette=1`, `&onboarding=1` (ilk kurulum), `&installed=<oyun>,<oyun>` ya da `&installed=none`
(örnek veride yalnızca bu oyunlar kurulu görünür; parametre yoksa hepsi kurulu).

Ekran görüntüsü için başsız Edge'i ayrı bir CDP portunda açıp `Page.captureScreenshot` kullan (sanal zaman
kipindeki `--screenshot` veri gelince başlayan animasyonları yakalayamaz).
Oyunların önizleme verisi `GameModule.mocks` ile verilir; yeni her komut için bir örnek ekle.
