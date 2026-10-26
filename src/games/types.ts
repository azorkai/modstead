// Arayüzde oyun sözleşmesi. Her oyun paketi `games/<id>/ui/index.tsx` içinde bir GameModule
// dışa aktarır; kabuk kenar çubuğunu, sayfaları, komut paletini ve kurulum incelemesini bundan kurar.
// Rust tarafındaki karşılığı: crates/core/src/game.rs (`Game` trait'i).

import type { ComponentType } from "react";
import type { LucideIcon } from "lucide-react";
import type { GameId, GameStatus, JobSnapshot } from "@/lib/types";

export interface Text {
  tr: string;
  en: string;
}

export interface GameRoute {
  /** Kalıcı kimlik (adreste ve "son sayfa" hafızasında kullanılır). */
  id: string;
  label: Text;
  icon: LucideIcon;
  Component: ComponentType;
  /** Kenar çubuğunda sayı rozeti (ör. güncelleme sayısı). */
  badge?: (status: GameStatus | undefined) => number | null | undefined;
  /** Sayfa kenardan kenara çizilir (üstte görsel): üst çubuk görselin üstünde saydam durur, içerik dolgusu sayfanındır. */
  fullBleed?: boolean;
}

export interface GameModule {
  id: GameId;
  /** Marka adı; dilden bağımsız. */
  name: string;
  short: string;
  tagline: Text;
  /** Kenar çubuğu ve kartlarda oyunun simgesi. */
  Icon: LucideIcon;
  /** Kahraman alanlarında süs görseli (SVG); oyunun vurgu rengini kullanır. */
  Art?: ComponentType<{ className?: string }>;
  routes: GameRoute[];
  /** Kurulum incelemesinde güvenlik raporunun yanında oyunun planı. */
  ReviewPlan?: ComponentType<{ job: JobSnapshot; onOptions: (o: unknown) => void }>;
  /** Kullanıcı onayından sonra kurulumu başlatır (oyunun `<id>_confirm_job` komutu). */
  confirmJob?: (job: JobSnapshot, opts: { acceptRisk: boolean; options: unknown }) => Promise<unknown>;
  /** Önizleme kipi örnek verileri: komut adı → yanıt. */
  mocks?: Record<string, (args?: Record<string, unknown>) => unknown>;
  /** Taşıma sürerken: önceki uygulama ve buraya gelecek özellikler. */
  porting?: { app: string; path: string; features: Text[] };
  /** Ana sayfa vitrinine oyunun katkısı (isteğe bağlı). */
  home?: {
    /** Vitrindeki "Oyna" düğmesinin yerine (ör. MSFS: her sim için ayrı başlat). Görsel üstünde, koyu zeminde çizilir. */
    Actions?: ComponentType;
    /** Vitrinin altında oyuna özel giriş kutucukları (kütüphane, kariyer, keşfet…). */
    Panel?: ComponentType;
  };
}
