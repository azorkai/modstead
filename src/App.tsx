import { useEffect } from "react";
import { Toaster } from "sonner";
import { useLang } from "@/lib/i18n";
import { useSettings } from "@/lib/queries";
import { applyReduceMotion, applyTheme } from "@/lib/theme";
import { AppShell } from "@/shell/AppShell";
import { LogoMark } from "@/shell/Logo";
import { Onboarding } from "@/shell/Onboarding";
import { useBackendEvents } from "@/shell/useBackendEvents";

function Splash() {
  return (
    <div data-tauri-drag-region className="flex h-full items-center justify-center">
      <LogoMark size={44} className="animate-pulse opacity-80" />
    </div>
  );
}

export default function App() {
  const { data: settings } = useSettings();
  useBackendEvents();

  useEffect(() => {
    if (!settings) return;
    applyTheme(settings.theme);
    applyReduceMotion(settings.reduceMotion);
    useLang.getState().setLang(settings.resolvedLanguage);
  }, [settings]);

  return (
    <>
      {!settings ? <Splash /> : settings.onboarded ? <AppShell /> : <Onboarding />}
      <Toaster
        position="bottom-right"
        theme={settings?.theme === "light" ? "light" : settings?.theme === "dark" ? "dark" : "system"}
        toastOptions={{
          classNames: {
            toast: "!bg-surface !border !border-line-strong !text-fg !rounded-2xl !shadow-lg !font-sans",
            description: "!text-fg-2",
            actionButton: "!bg-accent !text-accent-ink !rounded-full !font-semibold",
          },
        }}
      />
    </>
  );
}
