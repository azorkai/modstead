// Uçuş ekranının giriş noktası (deck.html). Modstead'in yerel sunucusu sayfayı `/deck` adresinden verir: komutlar
// o zaman HTTP ile gider (salt okunur kapı, yerel ağda anahtarlı). Vite'ın kendisi `/deck.html` olarak verdiğinde
// (tarayıcı önizlemesi) örnek veriler kullanılır. Dil ve tema adresten gelir (`lang=tr|en`, `theme=dark|light`).

import "@fontsource-variable/inter";
import "@fontsource-variable/jetbrains-mono";
import "@fontsource-variable/outfit";
import "@/styles/index.css";
import "../msfs.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { useLang, type Lang } from "@/lib/i18n";
import { setRemoteTransport } from "@/lib/ipc";
import { registerMocks } from "@/lib/mock";
import { queryClient } from "@/lib/queries";
import { setTileSource } from "../career/map/raster";
import { Deck, THEME_KEY } from "./Deck";

const KEY_STORE = "modstead.deck.key";

async function start() {
  const url = new URL(location.href);
  const params = url.searchParams;

  if (/^\/deck\/?$/.test(location.pathname)) {
    // Anahtar adres çubuğunda kalmasın (ekran görüntüsü, geçmiş); sekme açık kaldıkça oturumda saklanır.
    let key = params.get("k");
    try {
      if (key) sessionStorage.setItem(KEY_STORE, key);
      else key = sessionStorage.getItem(KEY_STORE);
    } catch {
      /* depolama kapalı olabilir */
    }
    if (params.has("k")) {
      params.delete("k");
      const rest = params.toString();
      history.replaceState(history.state, "", `${url.pathname}${rest ? `?${rest}` : ""}${url.hash}`);
    }
    setRemoteTransport({ base: location.origin, key });
    // Harita karoları da aynı sunucudan; yerel ağda anahtar adreste gider (<img> başlık taşıyamaz).
    setTileSource({ base: location.origin, key });
  } else {
    // Önizleme: örnek veriler yalnızca burada yüklenir, pakette ayrı parçadır.
    const { careerMocks } = await import("../career/mocks");
    registerMocks(careerMocks);
  }

  const lang = params.get("lang");
  if (lang === "tr" || lang === "en") useLang.getState().setLang(lang as Lang);
  else document.documentElement.lang = useLang.getState().lang;
  document.title = useLang.getState().lang === "en" ? "Flight deck · Modstead" : "Uçuş ekranı · Modstead";

  // Tema: adres > bu cihazda son seçilen > koyu.
  let theme = params.get("theme");
  if (theme !== "dark" && theme !== "light") {
    try {
      theme = localStorage.getItem(THEME_KEY);
    } catch {
      theme = null;
    }
  }
  document.documentElement.dataset.theme = theme === "light" ? "light" : "dark";

  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <Deck />
      </QueryClientProvider>
    </StrictMode>,
  );
}

void start();
