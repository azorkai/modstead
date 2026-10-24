import "@fontsource-variable/inter";
import "@fontsource-variable/jetbrains-mono";
import "@fontsource-variable/outfit";
import "@fontsource-variable/fraunces";
import "@fontsource-variable/overpass";
import "@fontsource/pixelify-sans/500.css";
import "@fontsource/pixelify-sans/600.css";
import "./styles/index.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import App from "./App";
import { GAMES } from "./games/registry";
import { isTauri } from "./lib/ipc";
import { registerMocks } from "./lib/mock";
import { queryClient } from "./lib/queries";
import { initTheme } from "./lib/theme";

// Önizleme kipinde oyunların örnek verileri.
for (const g of GAMES) registerMocks(g.mocks);

initTheme();

if (isTauri) {
  // Uygulama içinde tarayıcının sağ tık menüsü ve sayfa yenileme kısayolları kapalı.
  window.addEventListener("contextmenu", (e) => {
    const target = e.target as HTMLElement;
    if (!target.closest("input, textarea, [data-selectable]")) e.preventDefault();
  });
  window.addEventListener("keydown", (e) => {
    if (e.key === "F5" || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "r")) e.preventDefault();
  });
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
);
