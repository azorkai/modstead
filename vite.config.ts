import { createReadStream, existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, URL } from "node:url";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Tauri geliştirme sunucusu sabit bir portta çalışır. Tarayıcıda açıldığında arayüz örnek verilerle
// "önizleme kipinde" çalışır (src/lib/mock.ts). Birden fazla örnek aynı anda çalışıyorsa MODSTEAD_PORT ile ayrı port.
const port = Number(process.env.MODSTEAD_PORT) || 1420;

/** Önizleme kipinde oyun görselleri: uygulamadaki `art://` ile aynı kaynak (Steam'in yerel önbelleği).
 *  Yalnızca geliştirme sunucusunda çalışır; görseller pakete girmez. */
function steamArt(): Plugin {
  const apps: Record<string, number[]> = { msfs: [1250410, 2537590], bannerlord: [261550], stardew: [413150], cities2: [949230] };
  const files: Record<string, string> = { hero: "library_hero.jpg", logo: "logo.png", header: "header.jpg", portrait: "library_600x900.jpg" };
  const root = process.env.STEAM_ROOT || "C:/Program Files (x86)/Steam";
  return {
    name: "modstead-steam-art",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use("/__art/", (req, res) => {
        const [game, kind] = (req.url ?? "").replace(/^\//, "").split("/");
        for (const id of apps[game] ?? []) {
          const name = files[kind];
          if (!name) break;
          const file = join(root, "appcache", "librarycache", String(id), name);
          if (existsSync(file)) {
            res.setHeader("Content-Type", file.endsWith(".png") ? "image/png" : "image/jpeg");
            createReadStream(file).pipe(res);
            return;
          }
        }
        res.statusCode = 404;
        res.end();
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), steamArt()],
  clearScreen: false,
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  server: {
    port,
    strictPort: true,
    host: "127.0.0.1",
    watch: { ignored: ["**/src-tauri/**", "**/crates/**", "**/games/*/src/**"] },
  },
  build: {
    target: "es2022",
    sourcemap: false,
    chunkSizeWarningLimit: 1200,
  },
});
