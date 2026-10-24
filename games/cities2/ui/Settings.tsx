// Cities: Skylines II'ye özel ayarlar: klasörler (oyun, oyun verisi, yedek ve çöp), başlatma seçenekleri
// (Steam'de geliştirici kipi), güvenlik ağı (değişiklikten önce kayıt yedeği, yedek sayısı, çöp süresi), disk.
// Tema, dil, güvenlik ve hesaplar kabuğun genel ayarlarındadır.

import { Archive, Code2, FolderOpen, Gamepad2, HardDrive, Info, MonitorCog, Trash2, UserRound } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { bytes } from "@/lib/format";
import { isTauri } from "@/lib/ipc";
import { chooseGameFolder, notifyError } from "@/shell/actions";
import { Badge, Button, PageHeader, Row, Section, Segmented, Skeleton, Switch } from "@/ui";
import { api, type FolderKind } from "./api";
import { useS } from "./i18n";
import { GAME, refreshAll, useCitiesSettings, useCitiesSync, useEnv } from "./queries";
import type { Cities2Settings } from "./types";

const KEEP = ["3", "5", "10", "0"] as const;
const DAYS = ["7", "30", "90", "0"] as const;

export default function Settings() {
  useCitiesSync();
  const t = useS();
  const { data: env } = useEnv();
  const { data: settings } = useCitiesSettings();
  const update = useMutation({
    mutationFn: (patch: Partial<Cities2Settings>) => api.updateSettings({ ...settings!, ...patch }),
    onSuccess: () => refreshAll(),
    onError: notifyError,
  });
  const set = (patch: Partial<Cities2Settings>) => settings && update.mutate(patch);

  const pickDir = async (key: "userDir" | "dataDir") => {
    if (!isTauri) return;
    const { open } = await import("@tauri-apps/plugin-dialog");
    const picked = await open({ directory: true, multiple: false, title: key === "userDir" ? t.settings.userFolder : t.settings.dataFolder });
    if (typeof picked === "string") update.mutate({ [key]: picked }, { onSuccess: () => toast.success(t.settings.saved) });
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
  const open = (kind: FolderKind) => api.openPath(kind).catch(notifyError);

  return (
    <div className="mx-auto flex max-w-[880px] flex-col gap-5 pb-12">
      <PageHeader title={t.settings.title} />

      <Section title={t.settings.paths}>
        <Row
          icon={<Gamepad2 className="size-4" />}
          title={t.settings.gameFolder}
          description={
            <>
              <span className="block font-mono text-[11.5px]" data-selectable>
                {env.gamePath ?? "—"}
              </span>
              {t.settings.gameFolderHint}
            </>
          }
        >
          <div className="flex shrink-0 gap-2">
            {env.gamePath && env.store && <Badge>{t.store[env.store] ?? env.store}</Badge>}
            <Button size="sm" onClick={async () => (await chooseGameFolder(GAME)) && refreshAll()}>
              {t.settings.choose}
            </Button>
          </div>
        </Row>
        <Row
          icon={<UserRound className="size-4" />}
          title={t.settings.userFolder}
          description={
            <>
              <span className="block font-mono text-[11.5px]" data-selectable>
                {env.userDir}
              </span>
              {t.settings.userFolderHint}
            </>
          }
        >
          <div className="flex shrink-0 gap-2">
            {env.userDirExists && (
              <Button size="sm" variant="ghost" icon={<FolderOpen className="size-3.5" />} onClick={() => open("user")}>
                {t.settings.open}
              </Button>
            )}
            {settings.userDir && (
              <Button size="sm" variant="ghost" onClick={() => set({ userDir: null })}>
                {t.settings.reset}
              </Button>
            )}
            <Button size="sm" onClick={() => pickDir("userDir")}>
              {t.settings.choose}
            </Button>
          </div>
        </Row>
        <Row
          icon={<Archive className="size-4" />}
          title={t.settings.dataFolder}
          description={
            <>
              <span className="block font-mono text-[11.5px]" data-selectable>
                {env.dataDir}
              </span>
              {t.settings.dataFolderHint}
            </>
          }
        >
          <div className="flex shrink-0 gap-2">
            <Button size="sm" variant="ghost" icon={<FolderOpen className="size-3.5" />} onClick={() => open("data")}>
              {t.settings.open}
            </Button>
            {settings.dataDir && (
              <Button size="sm" variant="ghost" onClick={() => set({ dataDir: null })}>
                {t.settings.reset}
              </Button>
            )}
            <Button size="sm" onClick={() => pickDir("dataDir")}>
              {t.settings.choose}
            </Button>
          </div>
        </Row>
      </Section>

      <Section title={t.settings.launch} description={!env.launch.supportsOptions && env.launch.kind !== "none" ? t.settings.launchOptionsUnsupported : undefined}>
        <Row icon={<Code2 className="size-4" />} title={t.settings.developerMode} description={<><span className="font-mono text-[11.5px] text-fg">--developerMode</span> · {t.settings.developerModeHint}</>}>
          <Switch checked={settings.developerMode} disabled={!env.launch.supportsOptions} label={t.settings.developerMode} onChange={(v) => set({ developerMode: v })} />
        </Row>
        <Row icon={<MonitorCog className="size-4" />} title={t.settings.uiDeveloperMode} description={<><span className="font-mono text-[11.5px] text-fg">--uiDeveloperMode</span> · {t.settings.uiDeveloperModeHint}</>}>
          <Switch checked={settings.uiDeveloperMode} disabled={!env.launch.supportsOptions} label={t.settings.uiDeveloperMode} onChange={(v) => set({ uiDeveloperMode: v })} />
        </Row>
      </Section>

      <Section title={t.settings.safety}>
        <Row icon={<Archive className="size-4" />} title={t.settings.backupBeforeChanges} description={t.settings.backupBeforeChangesHint}>
          <Switch checked={settings.backupBeforeChanges} label={t.settings.backupBeforeChanges} onChange={(v) => set({ backupBeforeChanges: v })} />
        </Row>
        <Row icon={<Info className="size-4" />} title={t.settings.backupsKeep} description={t.settings.backupsKeepHint}>
          <Segmented
            id="cs2-keep"
            value={(KEEP as readonly string[]).includes(String(settings.saveBackupsKeep)) ? String(settings.saveBackupsKeep) : "5"}
            onChange={(v) => set({ saveBackupsKeep: Number(v) })}
            options={KEEP.map((k) => ({ value: k, label: k === "0" ? "∞" : k }))}
          />
        </Row>
        <Row icon={<Trash2 className="size-4" />} title={t.settings.trashDays}>
          <Segmented
            id="cs2-days"
            value={(DAYS as readonly string[]).includes(String(settings.trashRetentionDays)) ? String(settings.trashRetentionDays) : "30"}
            onChange={(v) => set({ trashRetentionDays: Number(v) })}
            options={DAYS.map((d) => ({ value: d, label: d === "0" ? "∞" : d }))}
          />
        </Row>
      </Section>

      <Section title={t.settings.disks}>
        {env.disks.map((d) => (
          <Row
            key={d.path}
            icon={<HardDrive className="size-4" />}
            title={d.label}
            description={
              <span className="font-mono text-[11.5px]" data-selectable>
                {d.path}
              </span>
            }
          >
            <div className="flex shrink-0 items-center gap-2">
              {d.low && <Badge tone="warn">{t.settings.low}</Badge>}
              <span className="tabular text-[12.5px] font-medium text-fg-2">{t.settings.free(bytes(d.free))}</span>
            </div>
          </Row>
        ))}
      </Section>
    </div>
  );
}
