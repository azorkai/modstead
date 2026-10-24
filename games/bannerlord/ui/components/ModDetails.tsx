import { useEffect, useState, type ReactNode } from "react";
import { motion } from "motion/react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CircleDashed,
  ExternalLink,
  FolderOpen,
  ShieldAlert,
  Trash2,
  X,
} from "lucide-react";
import clsx from "clsx";
import { toast } from "sonner";
import { api, errorText } from "../api";
import type { DepRef, ModuleDetails, ModuleInfo } from "../types";
import { fmtBytes, fmtDate } from "../format";
import { nexusModUrl, workshopUrl } from "../links";
import { moduleOf, useApp } from "../store";
import { Badge, Button, IconButton, ModuleAvatar, Switch } from "./kit";
import { IssueCard } from "./IssueCard";
import { useT } from "../i18n";

export function ModDetails({ module: m, onClose }: { module: ModuleInfo; onClose: () => void }) {
  const t = useT();
  const order = useApp((s) => s.order);
  const modules = useApp((s) => s.modules);
  const issues = useApp((s) => s.issues);
  const overview = useApp((s) => s.overview);
  const toggle = useApp((s) => s.toggle);
  const applyOverview = useApp((s) => s.applyOverview);
  const confirm = useApp((s) => s.confirm);
  const select = useApp((s) => s.select);
  const [details, setDetails] = useState<ModuleDetails | null>(null);

  useEffect(() => {
    let alive = true;
    setDetails(null);
    api
      .moduleDetails(m.id)
      .then((d) => alive && setDetails(d))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [m.id, m.version]);

  const entry = order.find((e) => e.id.toLowerCase() === m.id.toLowerCase());
  const myIssues = issues.filter((i) => i.moduleId.toLowerCase() === m.id.toLowerCase());
  const shadow = overview?.shadowed.find((s) => s.id.toLowerCase() === m.id.toLowerCase());
  const record = overview?.installs[m.id.toLowerCase()];
  const blocked = m.dlls.filter((d) => d.blocked).length;

  const sourceLinks: { label: string; url: string }[] = [];
  if (m.workshopId) sourceLinks.push({ label: "Steam Workshop", url: workshopUrl(m.workshopId) });
  if (record?.source.kind === "nexus") sourceLinks.push({ label: "Nexus Mods", url: nexusModUrl(record.source.modId) });
  for (const s of m.updateSources) {
    if (!sourceLinks.some((l) => l.url === s.url)) sourceLinks.push({ label: s.provider === "nexus" ? "Nexus Mods" : "GitHub", url: s.url });
  }

  const uninstall = async () => {
    const ok = await confirm({
      title: t.details.uninstallTitle(m.name),
      body: t.details.uninstallBody,
      confirmLabel: t.details.uninstall,
      danger: true,
    });
    if (!ok) return;
    try {
      applyOverview(await api.uninstallModule(m.id), true);
      select(null);
      toast.success(t.details.uninstalled(m.name), { description: t.details.movedToBackups });
    } catch (e) {
      toast.error(errorText(e));
    }
  };

  const deps = m.deps.filter((d) => d.kind !== "incompatible");
  const incompatible = m.deps.filter((d) => d.kind === "incompatible");

  return (
    <motion.div
      key={m.id}
      initial={{ opacity: 0, x: 12 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.18, ease: "easeOut" }}
      className="flex h-full flex-col"
    >
      <div className="relative border-b border-line px-5 pb-4 pt-5">
        <IconButton label={t.common.close} className="absolute right-3 top-3" onClick={onClose}>
          <X className="size-4" />
        </IconButton>
        <div className="flex items-start gap-3.5 pr-8">
          <ModuleAvatar id={m.id} name={m.name} size={48} official={m.isOfficial} />
          <div className="min-w-0">
            <h2 className="text-[19px] font-semibold leading-tight tracking-tight text-fg">{m.name}</h2>
            <div className="selectable mt-0.5 truncate font-mono text-[11.5px] text-muted">{m.id}</div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <Badge tone="neutral" className="font-mono">{m.version || t.details.noVersion}</Badge>
              {m.isOfficial ? <Badge tone="accent">{t.details.officialModule}</Badge> : <Badge>{m.moduleType}</Badge>}
              <Badge tone={m.location === "workshop" ? "info" : "neutral"}>
                {m.location === "workshop" ? "Steam Workshop" : t.details.modulesFolder}
              </Badge>
            </div>
          </div>
        </div>
        <div className="mt-4 flex items-center gap-2">
          <label className="flex h-9 flex-1 items-center gap-3 rounded-[10px] border border-line bg-surface-2/60 px-3">
            <Switch checked={!!entry?.enabled} onChange={(v) => toggle(m.id, v)} label={t.common.enabled} />
            <span className="text-[12.5px] font-medium">{entry?.enabled ? t.common.enabled : t.common.disabled}</span>
          </label>
          <IconButton label={t.common.openFolder} onClick={() => api.openPath("module", m.id).catch((e) => toast.error(errorText(e)))}>
            <FolderOpen className="size-4" />
          </IconButton>
          {!m.isOfficial && m.location === "modules" && (
            <IconButton label={t.details.uninstallHint} onClick={uninstall} className="hover:!text-danger">
              <Trash2 className="size-4" />
            </IconButton>
          )}
        </div>
      </div>

      <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
        {myIssues.length > 0 && (
          <Block title={t.details.issues}>
            <div className="space-y-2">
              {myIssues.map((i) => (
                <IssueCard key={i.id} issue={i} />
              ))}
            </div>
          </Block>
        )}

        {shadow && (
          <div className="rounded-xl border border-warn/25 bg-warn/5 p-3 text-[12px] text-fg-2">
            <div className="mb-1 font-semibold text-warn">{t.details.secondCopy(shadow.location, shadow.version)}</div>
            {t.details.loadsOnly(m.location, m.version)}
          </div>
        )}

        <Block title={`${t.details.dependencies} · ${deps.length}`}>
          {deps.length === 0 ? (
            <p className="text-[12px] text-muted">{t.details.noDependencies}</p>
          ) : (
            <div className="overflow-hidden rounded-xl border border-line">
              {deps.map((d) => (
                <DepRow key={d.id} dep={d} self={m} />
              ))}
            </div>
          )}
          {incompatible.length > 0 && (
            <p className="mt-2 text-[12px] text-fg-2">
              {t.details.incompatible} <span className="font-mono text-danger">{incompatible.map((d) => d.id).join(", ")}</span>
            </p>
          )}
        </Block>

        {details && details.dependents.length > 0 && (
          <Block title={`${t.details.dependents} · ${details.dependents.length}`}>
            <div className="flex flex-wrap gap-1.5">
              {details.dependents.map((d) => (
                <Badge key={d}>{d}</Badge>
              ))}
            </div>
          </Block>
        )}

        {m.dlls.length > 0 && (
          <Block
            title={`${t.details.dllFiles} · ${m.dlls.length}`}
            aside={blocked > 0 ? <Badge tone="danger">{t.details.blockedN(blocked)}</Badge> : <Badge tone="ok">{t.details.noBlocks}</Badge>}
          >
            <div className="max-h-48 overflow-y-auto rounded-xl border border-line">
              {m.dlls.map((d) => (
                <div key={d.name} className="flex items-center gap-2 border-b border-line px-3 py-1.5 last:border-b-0">
                  {d.blocked ? (
                    <ShieldAlert className="size-3.5 text-danger" />
                  ) : d.exists ? (
                    <Check className="size-3.5 text-ok" />
                  ) : (
                    <X className="size-3.5 text-danger" />
                  )}
                  <span className="selectable flex-1 truncate font-mono text-[11.5px] text-fg-2">{d.name}</span>
                  {d.declared && <span className="text-[10.5px] text-muted">{t.details.mainDll}</span>}
                </div>
              ))}
            </div>
          </Block>
        )}

        <Block title={t.details.info}>
          <dl className="grid grid-cols-[110px_1fr] gap-x-3 gap-y-2 text-[12px]">
            <Dt>{t.details.size}</Dt>
            <dd className="text-fg-2 tabular">{details ? `${fmtBytes(details.size)} · ${t.common.files(details.files)}` : "…"}</dd>
            <Dt>{t.details.category}</Dt>
            <dd className="text-fg-2">{m.category}</dd>
            {record && (
              <>
                <Dt>{t.details.install}</Dt>
                <dd className="text-fg-2">
                  {record.source.kind === "nexus"
                    ? `Nexus #${record.source.modId}`
                    : record.source.kind === "github"
                      ? `GitHub ${record.source.repo} ${record.source.tag}`
                      : t.details.localArchive}{" "}
                  · {fmtDate(record.installedAt)}
                </dd>
                <Dt>{t.details.archiveSha}</Dt>
                <dd className="selectable truncate font-mono text-[11px] text-muted" title={record.archiveSha256}>
                  {record.archiveSha256}
                </dd>
              </>
            )}
            <Dt>{t.details.location}</Dt>
            <dd className="selectable break-all font-mono text-[11px] text-muted">{m.path}</dd>
            {details && details.backups.length > 0 && (
              <>
                <Dt>{t.details.backups}</Dt>
                <dd className="text-fg-2">{t.details.backupsKept(details.backups.length)}</dd>
              </>
            )}
          </dl>
        </Block>

        {sourceLinks.length > 0 && (
          <Block title={t.common.source}>
            <div className="flex flex-wrap gap-2">
              {sourceLinks.map((l) => (
                <Button
                  key={l.url}
                  size="sm"
                  variant="secondary"
                  icon={<ExternalLink className="size-3.5" />}
                  onClick={() => api.openUrl(l.url).catch((e) => toast.error(errorText(e)))}
                >
                  {l.label}
                </Button>
              ))}
            </div>
          </Block>
        )}
      </div>
    </motion.div>
  );

  function DepRow({ dep, self }: { dep: DepRef; self: ModuleInfo }) {
    const target = moduleOf(modules, dep.id);
    const at = order.findIndex((e) => e.id.toLowerCase() === dep.id.toLowerCase());
    const me = order.findIndex((e) => e.id.toLowerCase() === self.id.toLowerCase());
    const on = at >= 0 && order[at].enabled;
    let state: "ok" | "missing" | "off" | "order" = "ok";
    if (!target) state = "missing";
    else if (!on) state = "off";
    else if ((dep.order === "before" && at > me) || (dep.order === "after" && at < me)) state = "order";
    const optional = dep.kind === "optional";
    return (
      <div className="flex items-center gap-2.5 border-b border-line px-3 py-2 last:border-b-0">
        {state === "ok" ? (
          <Check className="size-3.5 text-ok" />
        ) : optional ? (
          <CircleDashed className="size-3.5 text-muted" />
        ) : (
          <X className="size-3.5 text-danger" />
        )}
        <button
          className="min-w-0 flex-1 truncate text-left text-[12.5px] text-fg hover:underline disabled:no-underline"
          disabled={!target}
          onClick={() => target && select(target.id)}
        >
          {target?.name ?? dep.id}
        </button>
        {dep.order !== "any" && (
          <span title={dep.order === "before" ? t.details.loadBefore : t.details.loadAfter} className="text-muted">
            {dep.order === "before" ? <ArrowLeft className="size-3.5" /> : <ArrowRight className="size-3.5" />}
          </span>
        )}
        <span
          className={clsx(
            "text-[11px]",
            state === "ok" && "text-muted",
            state !== "ok" && (optional ? "text-muted" : "text-danger"),
          )}
        >
          {state === "ok"
            ? optional
              ? t.details.depOptional
              : dep.version ?? t.details.depRequired
            : state === "missing"
              ? optional
                ? t.details.depMissingOptional
                : t.details.depNotInstalled
              : state === "off"
                ? t.details.depDisabled
                : t.details.depWrongOrder}
        </span>
      </div>
    );
  }
}

function Block({ title, children, aside }: { title: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <section>
      <div className="mb-2 flex items-center gap-2">
        <h4 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">{title}</h4>
        <div className="ml-auto">{aside}</div>
      </div>
      {children}
    </section>
  );
}

function Dt({ children }: { children: ReactNode }) {
  return <dt className="text-muted">{children}</dt>;
}
