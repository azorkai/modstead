// Stardew'e özel ayarlar: oyun klasörü, SMAPI, yedek/çöp klasörü, yedekleme ve güncelleme tercihleri, klasörler.
// Tema, dil, güvenlik ve hesaplar kabuğun genel ayarlarındadır.

import { FolderOpen, Gamepad2, HardDrive, Play, ScrollText, Sprout, Wrench } from "lucide-react";
import { toast } from "sonner";
import { bytes } from "@/lib/format";
import { isTauri } from "@/lib/ipc";
import { chooseGameFolder, notifyError } from "@/shell/actions";
import { Badge, Button, Input, PageHeader, Row, Section, Segmented, Skeleton, Switch } from "@/ui";
import { api } from "./api";
import { useS } from "./i18n";
import { installSmapi, refreshAll, useAction, useEnv, useStardewSettings, useStardewSync } from "./queries";
import type { StardewSettings } from "./types";

const RETENTION = ["7", "30", "90", "0"] as const;

export default function Settings() {
  useStardewSync();
  const t = useS();
  const { data: env } = useEnv();
  const { data: settings } = useStardewSettings();
  const update = useAction((patch: Partial<StardewSettings>) => api.updateSettings({ ...settings!, ...patch }), { success: () => null });
  const set = (patch: Partial<StardewSettings>) => settings && update.mutate(patch);

  const pickDataDir = async () => {
    if (!isTauri) return;
    const { open } = await import("@tauri-apps/plugin-dialog");
    const picked = await open({ directory: true, multiple: false, title: t.settings.pickDataDir });
    if (typeof picked === "string") update.mutate({ dataDir: picked }, { onSuccess: () => toast.success(t.settings.saved) });
  };

  const launchVanilla = async () => {
    try {
      await api.launch(true);
      toast.success(t.settings.launched);
      refreshAll();
    } catch (e) {
      notifyError(e);
    }
  };

  if (!settings || !env) {
    return (
      <div className="mx-auto max-w-[880px] space-y-5">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-48 rounded-[18px]" />
        <Skeleton className="h-64 rounded-[18px]" />
      </div>
    );
  }
  const dataDisk = env.disks.find((d) => d.path === env.dataDir);

  return (
    <div className="mx-auto flex max-w-[880px] flex-col gap-5">
      <PageHeader title={t.settings.title} subtitle={t.settings.subtitle} />

      <Section title={t.settings.game}>
        <Row icon={<Sprout className="size-4" />} title={t.settings.gameFolder} description={<span className="font-mono text-[11.5px]" data-selectable>{env.gamePath ?? t.settings.notFound}</span>}>
          <div className="flex shrink-0 gap-2">
            {env.gamePath && (
              <Button size="sm" variant="ghost" icon={<FolderOpen className="size-3.5" />} onClick={() => api.openPath("game").catch(notifyError)}>
                {t.common.openFolder}
              </Button>
            )}
            <Button size="sm" onClick={async () => (await chooseGameFolder("stardew")) && refreshAll()}>
              {t.settings.change}
            </Button>
          </div>
        </Row>
        <Row
          icon={<Wrench className="size-4" />}
          title={t.settings.smapi}
          description={env.smapi.installed ? t.settings.smapiInstalled(env.smapi.version ?? "?") : <span className="text-warn">{t.settings.smapiMissing}</span>}
        >
          <Button size="sm" variant={env.smapi.installed ? "secondary" : "primary"} disabled={!env.gamePath} onClick={installSmapi}>
            {env.smapi.installed ? t.settings.reinstall : t.settings.install}
          </Button>
        </Row>
        <Row icon={<Gamepad2 className="size-4" />} title={t.settings.vanilla} description={t.settings.vanillaHint}>
          <Button size="sm" variant="ghost" icon={<Play className="size-3.5" />} disabled={!env.gamePath || env.running} onClick={launchVanilla}>
            {t.settings.vanilla}
          </Button>
        </Row>
      </Section>

      <Section title={t.settings.backups}>
        <Row
          icon={<HardDrive className="size-4" />}
          title={t.settings.dataDir}
          description={
            <>
              <span className="block font-mono text-[11.5px]" data-selectable>
                {env.dataDir}
              </span>
              <span className="mt-1 flex items-center gap-2">
                {t.settings.dataDirHint}
                {dataDisk?.free != null && <Badge tone={dataDisk.low ? "warn" : "neutral"}>{dataDisk.low ? t.settings.lowDisk : t.settings.free(bytes(dataDisk.free))}</Badge>}
              </span>
            </>
          }
        >
          <div className="flex shrink-0 gap-2">
            {settings.dataDir && (
              <Button size="sm" variant="ghost" onClick={() => set({ dataDir: null })}>
                {t.settings.reset}
              </Button>
            )}
            <Button size="sm" onClick={pickDataDir}>
              {t.settings.change}
            </Button>
          </div>
        </Row>
        <Row title={t.settings.autoBackup} description={t.settings.autoBackupHint}>
          <Switch checked={settings.backupSavesOnLaunch} onChange={(v) => set({ backupSavesOnLaunch: v })} label={t.settings.autoBackup} />
        </Row>
        <Row title={t.settings.keep} description={t.settings.keepHint}>
          <Input
            type="number"
            min={1}
            max={200}
            className="w-24"
            inputClassName="tabular text-right"
            defaultValue={settings.saveBackupsKeep}
            onBlur={(e) => {
              const n = Math.max(1, Math.min(200, Number(e.target.value) || 10));
              if (n !== settings.saveBackupsKeep) set({ saveBackupsKeep: n });
            }}
          />
        </Row>
        <Row title={t.settings.retention} description={t.settings.retentionHint}>
          <Segmented
            id="sdv-retention"
            size="sm"
            value={String(settings.trashRetentionDays) as (typeof RETENTION)[number]}
            onChange={(v) => set({ trashRetentionDays: Number(v) })}
            options={RETENTION.map((v) => ({ value: v, label: v === "0" ? t.settings.forever : t.settings.days(Number(v)) }))}
          />
        </Row>
      </Section>

      <Section title={t.settings.updates}>
        <Row title={t.settings.autoCheck} description={t.settings.autoCheckHint}>
          <Switch checked={settings.autoCheckUpdates} onChange={(v) => set({ autoCheckUpdates: v })} label={t.settings.autoCheck} />
        </Row>
      </Section>

      <Section title={t.settings.folders}>
        <div className="flex flex-wrap gap-2 px-5 py-4">
          <Button size="sm" icon={<FolderOpen className="size-3.5" />} disabled={!env.gamePath} onClick={() => api.openPath("mods").catch(notifyError)}>
            {t.settings.mods}
          </Button>
          <Button size="sm" icon={<FolderOpen className="size-3.5" />} onClick={() => api.openPath("saves").catch(notifyError)}>
            {t.settings.savesFolder}
          </Button>
          <Button size="sm" icon={<ScrollText className="size-3.5" />} onClick={() => api.openPath("logs").catch(notifyError)}>
            {t.settings.logs}
          </Button>
          <Button size="sm" icon={<HardDrive className="size-3.5" />} onClick={() => api.openPath("data").catch(notifyError)}>
            {t.settings.dataDir}
          </Button>
        </div>
      </Section>
    </div>
  );
}
