# Modstead tasarım dili

Modstead bir **oyun başlatıcısıdır**, yönetim paneli değil: büyük vitrin görselleri, görselin üstünde yazı, gerçek
verinin kendisi görsel öğe olarak. Dil, herkese açık sitenin (azorkai.github.io/modstead) dilidir; uygulama daha
yoğun, daha sakin ve klavyeyle kullanılabilir. Koyu ve açık tema eşit derecede birincil.

## İlkeler

1. **Bir ev, birçok oda.** Kabuk (oyun rayı, ana sayfa, ayarlar) "mürekkep" zemin ve kobalt vurgu taşır; Modstead
   işareti turuncudur. Bir oyuna girildiğinde tüm sütun o oyunun kimliğine bürünür: vurgu rengi, başlık yazı tipi,
   vitrin görseli. Ekranda **tek vurgu** vardır: kabukta kobalt, oyunda oyunun rengi.
2. **Önce görsel ve veri.** Büyük alanlar oyunun kendi görselleridir; sayılar (mod sayısı, sorun, para) büyük
   Archivo rakamlarla yazılır. Süs için ikon kutusu, parıltı, degrade leke yoktur.
3. **Tipografi hiyerarşiyi taşır.** Geniş, büyük harfli başlık + eş aralıklı küçük üst etiket + sade gövde.
   Kutu içinde kutu yerine boşluk ve ince çizgi.
4. **Güven görünür olsun.** Kaynak, bütünlük, tarama ve karar her kurulumda aynı panelde, aynı dille gösterilir.
5. **Sakin hareket.** Kısa geçişler (120–300 ms); yaylı animasyon yalnızca seçim göstergelerinde. "Hareketi azalt"
   ayarı ve işletim sistemi tercihi her zaman uygulanır.

Reddedilenler (kullanıcı "AI slop" dedi): lacivert zemin + parlayan degrade lekeler + cam kartlar; her şeyin ince
kenarlı koyu kutu olması; ışıltılı (sparkle) boş durum simgesi; "İyi akşamlar" gibi genel karşılama başlıkları.

## Belirteçler (`src/styles/tokens.css`)

Bileşenler yalnızca **anlamsal** adları kullanır. Sabit renk yazılmaz (oyunun görselleri ve oyuna özel veri renkleri
hariç). Adlar kalıcıdır: yeni belirteç eklenir, var olanın adı değişmez.

| Belirteç | Tailwind | Koyu / açık | Kullanım |
|---|---|---|---|
| `--bg` / `--bg-2` | `bg-bg`, `bg-bg-2` | `#090b17` / `#eef1f8` · `#05070f` / `#e3e8f3` | pencere zemini / ray ve kenar çubuğu |
| `--surface`, `-2`, `-3` | `bg-surface…` | `#0e1122`… / `#ffffff`… | kart / girdi, üzerine gelme / basılı, seçili |
| `--line`, `--line-strong` | `border-line…` | mavimsi saydam çizgi | ince çizgi / vurgulu çizgi |
| `--fg`, `--fg-2`, `--muted` | `text-fg`, `text-fg-2`, `text-muted` | AA kontrast | ana metin / ikincil / soluk |
| `--accent`, `-2`, `-ink` | `bg-accent`, `text-accent`, `text-accent-ink` | oyunun rengi (kabukta kobalt) | birincil düğme, odak, seçim |
| `--brand`, `-2`, `-ink` | `bg-brand`… | kobalt `#3f67ff` / `#2448e0` | kabuk (ayarlar, ilk kurulum) |
| `--mark` | `text-mark`, `bg-mark` | turuncu `#ff7a1a` | **yalnızca** Modstead işareti (logo, ana sayfa göstergesi) |
| `--ink` | `bg-ink` | her temada `#070914` | görsel alanları ve koyu adalar |
| `--ok`, `--warn`, `--danger`, `--info` | `text-ok`… | | durum renkleri |

Tema: `<html data-theme="dark|light">` (varsayılan: sistem). Oyun kimliği: herhangi bir kapsayıcıda
`data-game="<oyun>"`; içindeki her şey o oyunun vurgusunu ve yazı tipini alır (pencereler `Dialog game=…` ile).

**Koyu ada:** görsel alanları (vitrin, kenar çubuğu kartı, Hakkında kartı) iki temada da koyudur. Kapsayıcıya
`data-theme="dark"` verilir; içindeki bütün bileşenler (düğme, rozet, girdi) koyu temadaki hâlini alır. Ada bir oyun
alanının içindeyse **`data-game` de adaya yazılır** (yoksa ada kabuğun kobaltına döner):
`<section data-theme="dark" data-game="msfs">`.

## Yazı tipleri

Kendi barındırılan, SIL OFL 1.1 lisanslı (`src/assets/fonts/`, lisans dosyaları yanında; `src/styles/fonts.css`):

| Yazı tipi | Rol |
|---|---|
| **Archivo** (değişken; ağırlık 500–900, genişlik 100–125 %) | başlıklar, sayılar, bölüm başlıkları |
| **Instrument Sans** (değişken; 400–700) | arayüz metni (`body`) |
| JetBrains Mono (`@fontsource`) | üst etiketler (`eyebrow`), yollar, özetler, kimlikler |

Oyunların başlık yazı tipleri: MSFS ve kabuk Archivo; Bannerlord Fraunces, Stardew Pixelify Sans (yalnızca
başlıklarda), Cities: Skylines II Overpass. Başlık biçimi oyuna göre değişir (`--display-case`, `--display-stretch`,
`--display-weight`, `--display-tracking`): Archivo'da büyük harf ve geniş, Fraunces/Pixelify'da olduğu gibi.

## Yardımcı sınıflar (`src/styles/components.css`)

| Sınıf | Ne |
|---|---|
| `.headline` | büyük başlık: oyunun başlık yazı tipi, kabukta/MSFS'te BÜYÜK HARF, geniş, 850 ağırlık, sıkı satır |
| `.title` | bölüm ve pencere başlığı: başlık yazı tipi, hafif geniş, 700, küçük harfli |
| `.eyebrow` | üst etiket: eş aralıklı, 10.5 px, büyük harf, 0.14em aralık (sitedeki "kicker"); yanına vurgu noktası |
| `.num` | büyük sayı: Archivo 800, %112 genişlik, tablo rakamları |
| `.card`, `.card-raised`, `.well` | yüzeyler (kart 16 px köşe, iç kutu 12 px) |
| `.on-image` | görsel üstündeki buzlu etiket (iki temada koyu, yazı beyaz) |
| `.accent-surface`, `.brand-surface`, `.accent-soft` | düz vurgu dolgusu (degrade ve parıltı yok) / yumuşak vurgu |
| `.hero-surface` | görselsiz kahraman alanı: düz zemin + vurgu renginde **dikey ışık çizgileri** |
| `.fluted` | aynı ışık çizgileri herhangi bir kapsayıcıda (koyu adalarda; ör. Ayarlar → Hakkında) |
| `.text-display` | yalnızca oyunun başlık yazı tipi (eski kullanım; yenide `.headline` / `.title`) |
| `.tabular`, `.skeleton`, `.pulse-dot`, `.win-btn`, `.glass` | yardımcılar |

Dikey ışık çizgileri (sitedeki "oluklu ışık") **seyrek** kullanılır: görselsiz kahraman alanı, Hakkında kartı, ilk
kurulum. Zemine ışık lekesi ya da radyal parıltı eklenmez.

## Tipografi ölçeği

| Rol | Biçim |
|---|---|
| Vitrin başlığı (logo yoksa) | `.headline` 48–56 px |
| Sayfa başlığı | `PageHeader`: `.eyebrow` (vurgu noktalı) + `.headline` 34 px + 13.5 px açıklama |
| Bölüm / kart başlığı | `.title` 15 px (kart üst bilgisi 52 px yüksek) |
| Pencere başlığı | `.title` 18 px (veri başlıklarında `plain`: Instrument Sans 600) |
| Büyük sayı | `.num` 26 px (`Stat`), 40 px (giriş kutucukları, vitrin) |
| Gövde | Instrument Sans 13.5 px; ikincil 12–12.5 px `text-fg-2`; soluk `text-muted` |
| Üst etiket | `.eyebrow` 10.5 px; Türkçede `lang="tr"` sayesinde büyük harf doğru (2020'DE ETKİN) |
| Yol, özet, kimlik | JetBrains Mono 11–11.5 px, seçilebilir (`data-selectable`) |

## Yerleşim

- Oyun rayı 72 px · oyun kenar çubuğu 240 px · üst çubuk 52 px · içerik dolgusu 32 px yatay, 28 px üst.
- **Kenardan kenara sayfalar** (ana sayfa; rotada `fullBleed: true`, ör. MSFS genel bakış): üstte vitrin görseli,
  üst çubuk görselin üstünde saydam ve koyu durur (`TopBar overlay`), kaydırınca buzlu, dolu çubuğa döner. Sayfa kendi
  dolgusunu verir: vitrin içi ve altı aynı kapsayıcıda hizalanır (ana sayfa `max-w-[1520px] px-10`, oyun sayfası
  `max-w-[1320px] px-10`).
- Diğer içerik genişlikleri: oyun sayfaları 1180 px, ayarlar 1120 px (solda yapışkan bölüm dizini).
- Köşeler: kart 16 px, iç kutu 12 px, pencere 20 px; **düğme, girdi, bölümlü seçici, rozet ve kenar çubuğu
  öğeleri haptır** (`rounded-full`), simge düğmeleri yuvarlak.
- Boş alanlar pencereyi sürükler: `data-tauri-drag-region` (CSS `app-region` WebView2'de çalışmaz).

## Vitrin görselleri (başlatıcı hissi)

- Büyük yüzeyler oyunun **Steam kütüphane görsellerini** kullanır: `useArt(oyun, "hero" | "logo" | "header" |
  "portrait")` (`@/lib/art`). Kaynak önce Steam'in yerel önbelleği, sonra Modstead'in disk önbelleği, en son Steam'in
  herkese açık deposu (bkz. `src-tauri/src/art.rs`). Önizleme kipinde aynı görselleri Vite sunucusu verir
  (`STEAM_ROOT` ile başka bir klasör gösterilebilir).
- Görselin üstündeki perde sabit koyu (`rgb(7 9 20 / …)`): üstte (üst çubuk), solda (yazı), altta (sayılar).
  `var(--bg)` ile karıştırılmaz (açık temada logo kaybolur). Yazı `text-white`, ikincil `text-white/75`; logo yoksa
  `.headline` metin logo; görsel üstü etiketler `.on-image`.
- **Oyun simgesi her yerde `GameIcon`** (`@/shell/GameIcon`): oyunun kendi .exe simgesi, oyun renginde koyu karo.
- Görsel yoksa `games/<oyun>/ui/Art.tsx` SVG çizimi `.hero-surface` üzerinde; renk `currentColor` (vurgu).

## Ana sayfa

Yukarıdan aşağı: **vitrin** (öne çıkan oyun: en son açılan, yoksa ilk kurulu; görsel, logo, durum üst etiketi,
kurulumlar, başlat düğmeleri, sağ altta büyük sayılar) → oyunun **giriş kutucukları** (`GameModule.home.Panel`;
MSFS: Kütüphane, Kariyer, Keşfet, Sağlık; gerçek veriyle) → varsa diğer oyunlar → **son indirmeler ve kurulumlar**
(boşken: arşivi bırakma çağrısı + kurulumdan önceki dört adım) ve **güvenlik ve hesaplar**.

Oyunlar ana sayfaya `GameModule.home` ile katkı verir (isteğe bağlı, ikisi de):
`Actions` (vitrindeki Oyna düğmesinin yerine; ör. MSFS'te her sim için başlat) ve `Panel` (vitrinin altı).
Ana sayfa ağ isteği başlatmaz; yalnızca önbellekteki veriyi okur.

## Bileşenler (`@/ui`)

| Bileşen | Ne zaman |
|---|---|
| `Button` (`primary`, `brand`, `secondary`, `ghost`, `subtle`, `danger`; `sm/md/lg` = 28/36/44 px; `loading`, `icon`, `trailing`) | Ekranda tek `primary`. Yıkıcı işlem `danger` + `ConfirmDialog`. Hap biçimli. |
| `IconButton` | araç çubukları; `label` zorunlu (erişilebilirlik ve ipucu); yuvarlak |
| `Switch`, `Checkbox`, `Segmented`, `Input`, `Kbd` | form öğeleri; `Segmented` aynı sayfada birden fazlaysa `id` ver |
| `Badge` (`neutral/accent/ok/warn/danger/info`, `dot`) | durum ve sayım (hap) |
| `Progress`, `ScoreRing`, `Spinner`, `Skeleton` | ilerleme ve yükleniyor (boş beyaz alan yerine iskelet) |
| `EmptyState` | boş liste: kesik çizgili halkada simge + başlık + tek cümle + (varsa) tek eylem |
| `PageHeader` (`eyebrow`, `title`, `subtitle`, `actions`) | sayfa başlığı |
| `Section` + `Row`, `Stat` | ayar listeleri; istatistik kutusu (eş aralıklı etiket + büyük sayı) |
| `Dialog` (+`DialogHeader/Body/Footer`), `ConfirmDialog` | pencereler (Esc kapatır; oyunun kimliği `game` ile) |
| `ModCover` | görseli olmayan mod için addan türeyen kapak |
| `Scribble` | el çizimi alt çizgi (`currentColor`, genelde `text-mark`); ekranda en fazla bir tane (ilk kurulum başlığı) |
| `Tooltip` | ray gibi yalnızca simge olan yerler |
| `SecurityPanel` | kurulum incelemesi (ortak; oyunlar değiştirmez) |
| `GameOverview` (`@/shell/GameOverview`) | oyunun genel bakış sayfası şablonu |

Bildirimler `sonner` (`toast`). Hata mesajı `notifyError(e)` (`@/shell/actions`) ile.

## Davranış kalıpları

- **Yükleniyor:** iskelet; 300 ms'den kısa işlerde gösterge yok.
- **Boş durum:** neyin olmadığını ve ilk adımı söyler; mümkünse süreci öğretir (ana sayfadaki dört adım).
- **Hata:** satır içi açıklama ya da bildirim; teknik ayrıntı açıklamada, başlık sade.
- **Yıkıcı işlem:** onay penceresi, geri alınabiliyorsa "geri al" bildirimi.
- **Kurulum:** her zaman görev → inceleme penceresi → onay. Doğrudan kurulum yok.
- **Klavye:** Ctrl+K komut paleti, Ctrl+, ayarlar, Esc pencere/panel kapatır. Etkin gezinme öğesinde `aria-current`.

## Metin

- Türkçe asıl, İngilizce eş. İngilizcede tekil/çoğul ayrılır ("1 game, 64 mods"); Türkçede sayıdan sonra isim
  tekildir ("1 oyun, 64 mod"). Yıl ekleri okunuşa göre: 2020'de, 2024'te (MSFS sözlüğündeki `de()`).
- Kabuk "sen" dilini kullanır.

## Simgeler

`lucide-react` (marka simgeleri yok). Listelerde 16 px, düğmelerde 14–16 px, rayda 19 px; çizgi kalınlığı 2.
Simge kutusu (kenarlıklı kare) yerine yuvarlak, kenarsız `bg-surface-2` zemin ya da doğrudan simge.

## Erişilebilirlik

Odak çerçevesi vurgu renginde, 2 px ve görünür; simge düğmelerinde `aria-label`; renk tek başına anlam taşımaz
(rozetlerde metin de var); metin kontrastı koyu ve açık temada AA. Önemli eylemler 44 px (`Button size="lg"`).

## Eski sınıf adı karşılıkları

| Otağ (Bannerlord) | Vadi (Stardew) | Hangar (MSFS, düz CSS) | Modstead |
|---|---|---|---|
| `bg-bg`, `bg-bg-2` | `bg-bg`, `bg-bg-2` | `var(--bg)`, `var(--frame)` | `bg-bg`, `bg-bg-2` |
| `bg-surface…` | `bg-surface…` | `var(--surface…)` | `bg-surface…` |
| `border-line`, `border-line-strong` | aynı | `var(--line)`, `var(--line-2)` | `border-line`, `border-line-strong` |
| `text-text`, `text-text-2`, `text-text-3` | `text-fg`, `text-fg-2`, `text-muted` | `var(--ink)`, `-2`, `-3` | `text-fg`, `text-fg-2`, `text-muted` |
| `text-gold`, `bg-gold`, `gold-surface` | `text-accent`, `bg-accent` | `var(--accent)` | `text-accent`, `bg-accent`, `accent-surface` |
| `text-gold-ink` | `text-accent-ink` | `var(--accent-ink)` | `text-accent-ink` |
| `text-red`, `text-green`, `text-amber`, `text-blue` | `text-danger`, `text-ok`, `text-warn`, `text-info` | `var(--red)`, `--green`, `--amber` | `text-danger`, `text-ok`, `text-warn`, `text-info` |
| `font-display` (Fraunces) | `pixel-title` | `var(--f-ui)` (Outfit) | `.headline` / `.title` (`text-display` yalnızca yazı tipi) |
| `panel` | `card` | `.card` vb. | `card` |
| `ModAvatar` | `Avatar`, `PixelCover` | `Thumb`, `Poster` | `ModCover` (+ oyunun kendi kapak/poster bileşeni) |
| `Dialog` | `Modal` | özel | `Dialog` |

## Denetim (ekran görüntüsüyle)

Her ekran önizleme kipinde (örnek verilerle) koyu ve açık temada, Türkçe ve İngilizce denetlenir; pencere boyları
1920×1027 ve 1366×768.

```bash
node scripts/dev.mjs <oyun> --preview   # http://127.0.0.1:142x/?view=game:<oyun>[:<sayfa>]&theme=dark
```

Önizleme adres parametreleri: `?view=home|settings|game:<oyun>[:<sayfa>]`, `&theme=dark|light`, `&lang=en`, `&jobs=1`,
`&review=<görev>`, `&palette=1`, `&onboarding=1` (ilk kurulum), `&installed=<oyun>,<oyun>` ya da `&installed=none`,
MSFS kariyeri için `&career=new|idle|ready|flying|landed`, ana sayfanın boş etkinlik durumu için `&activity=empty`.

Ekran görüntüsü için başsız Edge'i ayrı bir CDP portunda açıp `Page.captureScreenshot` kullan (sanal zaman
kipindeki `--screenshot` veri gelince başlayan animasyonları yakalayamaz). Oyunların önizleme verisi
`GameModule.mocks` ile verilir; yeni her komut için bir örnek ekle.
