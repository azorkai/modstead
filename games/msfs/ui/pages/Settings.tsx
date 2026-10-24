// MSFS ayarları: kütüphane klasörü, simlerin paket klasörleri (otomatik ya da elle), kurulum davranışı.

import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { FolderOpen, HardDrive, Lightbulb, Plane, Settings2 } from "lucide-react";
import { bytes } from "@/lib/format";
import { errorMessage, isTauri } from "@/lib/ipc";
import { queryClient } from "@/lib/queries";
import { useUi } from "@/lib/store";
import { notifyError } from "@/shell/actions";
import { Badge, Button, PageHeader, Row, Section, Skeleton, Switch } from "@/ui";
import { api } from "../api";
import { SIMS, SIM_COLOR, SIM_SHORT } from "../format";
import { useMsfsT } from "../i18n";
import { chooseLibrary } from "../parts";
import { invalidateAll, mk, useMsfsSettings, useSnapshot } from "../queries";
import type { MsfsSettings, SimId } from "../types";

async function save(patch: Partial<MsfsSettings>, ok?: string) {
  try {
    const s = await api.saveSettings(patch);
    queryClient.setQueryData(mk.settings, s);
    invalidateAll();
    if (ok) toast.success(ok);
  } catch (e) {
    toast.error(errorMessage(e));
  }
}

export default function Settings() {
  const t = useMsfsT();
  const { data: settings } = useMsfsSettings();
  const { data: scan } = useSnapshot();
  const { data: suggestion } = useQuery({ queryKey: mk.suggestion, queryFn: api.suggestLibrary, enabled: !!settings && !settings.libraryPath, staleTime: Infinity });

  if (!settings) {
    return (
      <div className="mx-auto max-w-[880px] space-y-4">
        <Skeleton className="h-10 w-60" />
        <Skeleton className="h-40" />
      </div>
    );
  }

  const setOverride = (sim: SimId, patch: { packagesPath?: string | null; disabled?: boolean } | null) => {
    const next = { ...settings.simOverrides };
    if (patch === null) delete next[sim];
    else next[sim] = { packagesPath: next[sim]?.packagesPath ?? null, disabled: next[sim]?.disabled ?? false, ...patch };
    void save({ simOverrides: next }, t.settings.saved);
  };

  const pickPackages = async (sim: SimId) => {
    if (!isTauri) return;
    const { open } = await import("@tauri-apps/plugin-dialog");
    const picked = await open({ directory: true, multiple: false, title: `MSFS ${SIM_SHORT[sim]} · ${t.settings.packages}` });
    if (typeof picked === "string") setOverride(sim, { packagesPath: picked });
  };

  return (
    <div className="mx-auto flex max-w-[880px] flex-col gap-5 pb-16">
      <PageHeader title={t.settings.title} subtitle={t.settings.subtitle} />

      <Section title={t.settings.library} description={t.settings.libraryDesc}>
        <Row
          icon={<HardDrive className="size-4" />}
          title={settings.libraryPath ? <span className="font-mono text-[12.5px]" data-selectable>{settings.libraryPath}</span> : t.settings.notSet}
          description={scan?.libraryFree != null && settings.libraryPath ? t.settings.free(bytes(scan.libraryFree)) : undefined}
        >
          {settings.libraryPath && (
            <Button size="sm" variant="ghost" icon={<FolderOpen className="size-3.5" />} onClick={() => api.reveal("library").catch(notifyError)}>
              {t.common.reveal}
            </Button>
          )}
          <Button size="sm" variant={settings.libraryPath ? "secondary" : "primary"} onClick={() => chooseLibrary(settings.libraryPath ?? suggestion?.path)}>
            {settings.libraryPath ? t.settings.change : t.settings.choose}
          </Button>
        </Row>
        {!settings.libraryPath && suggestion && (
          <Row icon={<Lightbulb className="size-4" />} title={<span className="font-mono text-[12.5px]">{suggestion.path}</span>} description={suggestion.reason}>
            <Button size="sm" variant="subtle" onClick={() => save({ libraryPath: suggestion.path }, t.settings.saved)}>
              {t.settings.useSuggested}
            </Button>
          </Row>
        )}
      </Section>

      <Section title={t.settings.sims} description={t.settings.simsDesc}>
        {SIMS.map((sim) => {
          const s = scan?.sims.find((x) => x.id === sim);
          const ov = settings.simOverrides[sim];
          return (
            <Row
              key={sim}
              icon={<Plane className="size-4" style={{ color: SIM_COLOR[sim] }} />}
              title={
                <span className="flex items-center gap-2">
                  MSFS {SIM_SHORT[sim]}
                  {s && <Badge tone={s.detected ? "neutral" : "warn"}>{t.common.edition[s.edition] ?? s.edition}</Badge>}
                  {ov?.packagesPath && <Badge tone="accent">{t.settings.manual}</Badge>}
                </span>
              }
              description={
                s?.packagesPath ? (
                  <span className="block truncate font-mono text-[11.5px]" title={s.packagesPath} data-selectable>
                    {s.packagesPath}
                  </span>
                ) : undefined
              }
            >
              <div className="flex items-center gap-2">
                {ov?.packagesPath ? (
                  <Button size="sm" variant="ghost" onClick={() => setOverride(sim, { packagesPath: null })}>
                    {t.settings.auto}
                  </Button>
                ) : (
                  <Button size="sm" variant="ghost" disabled={ov?.disabled} onClick={() => pickPackages(sim)}>
                    {t.settings.pickPackages}
                  </Button>
                )}
                <span className="h-5 w-px bg-[var(--line)]" />
                <span className="text-[12px] text-fg-2">{t.settings.ignore}</span>
                <Switch checked={!!ov?.disabled} onChange={(v) => setOverride(sim, { disabled: v })} label={t.settings.ignore} size="sm" />
              </div>
            </Row>
          );
        })}
        {scan?.sims.some((s) => s.sharesPackages) && <Row title={t.settings.shares} />}
      </Section>

      <Section title={t.settings.install}>
        <Row title={t.settings.strip} description={t.settings.stripDesc}>
          <Switch checked={settings.stripExecutables} onChange={(v) => save({ stripExecutables: v }, t.settings.saved)} label={t.settings.strip} />
        </Row>
        <Row icon={<Settings2 className="size-4" />} title={t.settings.globalNote}>
          <Button size="sm" variant="secondary" onClick={() => useUi.getState().go({ kind: "settings" })}>
            {t.settings.openGlobal}
          </Button>
        </Row>
      </Section>
    </div>
  );
}
