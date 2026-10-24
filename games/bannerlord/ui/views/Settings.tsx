// Bannerlord ayarları: yalnızca bu oyuna özel olanlar. Dil, tema, güvenlik, Nexus hesabı ve nxm
// kabuğun genel ayarlarındadır (bu sayfadan bağlantı verilir).

import { useEffect } from "react";
import { CheckCircle2, FolderOpen, Search, Settings2 } from "lucide-react";
import { toast } from "sonner";
import { useUi } from "@/lib/store";
import { chooseGameFolder } from "@/shell/actions";
import { api, errorText, type OpenKind } from "../api";
import { useApp } from "../store";
import type { SettingsPatch } from "../types";
import { Badge, Button, PageHeader, Row, Section, Segmented, Skeleton, Switch } from "../components/kit";
import { useT } from "../i18n";

export default function SettingsView() {
  const t = useT();
  const settings = useApp((s) => s.settings);
  const overview = useApp((s) => s.overview);
  const load = useApp((s) => s.load);
  const loadSettings = useApp((s) => s.loadSettings);
  const updateSettings = useApp((s) => s.updateSettings);
  const applyOverview = useApp((s) => s.applyOverview);

  useEffect(() => {
    void loadSettings();
    if (!useApp.getState().ready) void load(false);
  }, [load, loadSettings]);

  const update = (p: SettingsPatch) => void updateSettings(p);
  const open = (kind: OpenKind) => api.openPath(kind).catch((e) => toast.error(errorText(e)));
  const game = overview?.game;

  return (
    <div className="mx-auto max-w-[880px] space-y-5">
      <PageHeader title={t.nav.settings} subtitle={t.settings.intro} />

      <Section
        title={t.settings.game}
        description={game ? `${game.platform === "unknown" ? t.common.manual : game.platform === "steam" ? "Steam" : game.platform.toUpperCase()} · ${game.version}` : t.settings.notFound}
        aside={
          game && (
            <Badge tone="ok" icon={<CheckCircle2 className="size-3" />}>
              {t.settings.found}
            </Badge>
          )
        }
      >
        <Row title={t.settings.gameFolder} description={<span data-selectable className="break-all font-mono text-[11.5px]">{game?.root ?? overview?.gameError}</span>}>
          <div className="flex gap-2">
            {settings?.gamePath && (
              <Button size="sm" variant="ghost" icon={<Search className="size-3.5" />} onClick={() => api.resetGameFolder().then((o) => applyOverview(o)).catch((e) => toast.error(errorText(e)))}>
                {t.settings.autoDetect}
              </Button>
            )}
            <Button size="sm" icon={<FolderOpen className="size-3.5" />} onClick={() => chooseGameFolder("bannerlord").then((s) => s && load(true))}>
              {t.settings.change}
            </Button>
          </div>
        </Row>
        {game && (
          <>
            <Row title="Steam Workshop" description={game.workshopDir ?? t.settings.noWorkshop}>
              {game.workshopDir && <Badge tone="info">{t.settings.scanning}</Badge>}
            </Row>
            <Row title="Bannerlord Software Extender (BLSE)" description={game.blse ? t.settings.blseInstalled : t.settings.blseMissing}>
              <Switch checked={!!settings?.preferBlse && !!game.blse} disabled={!game.blse || !settings} onChange={(v) => update({ preferBlse: v })} label={t.actions.launchWithBlse} />
            </Row>
          </>
        )}
      </Section>

      {!settings ? (
        <Skeleton className="h-64 w-full rounded-2xl" />
      ) : (
        <>
          <Section title={t.settings.install}>
            <Row title={t.settings.unblockTitle} description={t.settings.unblockDesc}>
              <Switch checked={settings.unblockAfterInstall} onChange={(v) => update({ unblockAfterInstall: v })} label={t.issues.fix.unblock} />
            </Row>
            <Row title={t.settings.enableTitle} description={t.settings.enableDesc}>
              <Switch checked={settings.enableAfterInstall} onChange={(v) => update({ enableAfterInstall: v })} label={t.settings.enableLabel} />
            </Row>
            <Row title={t.settings.autoSortTitle} description={t.settings.autoSortDesc}>
              <Switch checked={settings.autoSort} onChange={(v) => update({ autoSort: v })} label={t.actions.autoSort} />
            </Row>
            <Row title={t.settings.backupsTitle} description={t.settings.backupsDesc}>
              <Segmented
                id="bl-backups"
                size="sm"
                value={String(settings.backupsPerModule)}
                onChange={(v) => update({ backupsPerModule: Number(v) })}
                options={["1", "3", "5", "10"].map((v) => ({ value: v, label: v }))}
              />
            </Row>
          </Section>

          <Section title={t.settings.launch}>
            <Row title={t.settings.minimizeTitle}>
              <Switch checked={settings.minimizeOnLaunch} onChange={(v) => update({ minimizeOnLaunch: v })} label={t.titlebar.minimize} />
            </Row>
          </Section>
        </>
      )}

      {game && (
        <Section title={t.settings.folders}>
          {(
            [
              ["modules", t.settings.modulesFolder, game.modulesDir],
              ["configs", t.settings.configFiles, game.configsDir],
              ["backups", t.settings.backupsFolder, `${game.root}\\.modstead\\backups`],
            ] as [OpenKind, string, string][]
          ).map(([kind, title, path]) => (
            <Row key={kind} title={title} description={<span data-selectable className="break-all font-mono text-[11.5px]">{path}</span>}>
              <Button size="sm" variant="ghost" icon={<FolderOpen className="size-3.5" />} onClick={() => open(kind)}>
                {t.common.open}
              </Button>
            </Row>
          ))}
        </Section>
      )}

      <Section title={t.settings.generalTitle} description={t.settings.generalDesc}>
        <Row title={t.settings.openGeneral}>
          <Button size="sm" icon={<Settings2 className="size-3.5" />} onClick={() => useUi.getState().go({ kind: "settings" })}>
            {t.settings.openGeneral}
          </Button>
        </Row>
      </Section>
    </div>
  );
}
