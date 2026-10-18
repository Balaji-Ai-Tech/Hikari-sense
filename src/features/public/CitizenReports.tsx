import { useRef, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  CheckCircle2,
  Circle,
  CircleDot,
  FileVideo,
  ImageIcon,
  LocateFixed,
  X,
} from "lucide-react";
import { DemoTag, Panel, SectionHeader } from "@/components/hs/primitives";
import { PanelSkeleton, StateScreen } from "@/components/hs/states";
import { submissionQuery, submissionsQuery, useSubmitReport } from "@/hooks/useWeather";
import { UPLOAD_LIMITS, validateFile } from "@/services/upload";
import { useT, type TKey } from "@/i18n";
import type { AiTriage, CitizenSubmission, UploadedMedia } from "@/types";
import { useServerFn } from "@tanstack/react-start";
import { Sparkles } from "lucide-react";
import { triageCitizenReport } from "@/lib/triage.functions";
import { cn } from "@/lib/utils";

const HAZARDS = [
  "heavy_rainfall",
  "flood",
  "thunderstorm",
  "heatwave",
  "cyclone",
  "strong_wind",
  "fog",
  "dust_storm",
] as const;
/** Downscale the first photo to a small JPEG data URL for AI analysis. */
async function photoDataUrl(file: File): Promise<string | undefined> {
  if (!file.type.startsWith("image/")) return undefined;
  const bmp = await createImageBitmap(file).catch(() => null);
  if (!bmp) return undefined;
  const k = Math.min(1, 1024 / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * k);
  c.height = Math.round(bmp.height * k);
  c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
  return c.toDataURL("image/jpeg", 0.8);
}
const URG_CLS: Record<AiTriage["urgency"], string> = {
  low: "text-sev-low border-sev-low/40",
  medium: "text-sev-medium border-sev-medium/40",
  high: "text-sev-high border-sev-high/40",
  critical: "text-sev-critical border-sev-critical/40",
};
export function TriageCard({ sub }: { sub: CitizenSubmission }) {
  if (!sub.triage && !sub.triageError) return null;
  const a = sub.triage;
  return (
    <div className="mt-3 rounded-sm border border-primary/40 bg-primary/5 p-3 text-left text-[12px]">
      <div className="mb-1.5 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-primary">
        <Sparkles className="h-3.5 w-3.5" />
        AI triage — suggestion only
      </div>
      {a ? (
        <dl className="grid grid-cols-[110px_1fr] gap-y-1">
          <dt className="text-muted-foreground">Hazard</dt>
          <dd className="font-semibold">
            {a.hazard.replace(/_/g, " ")}{" "}
            <span className="font-mono text-muted-foreground">
              {Math.round(a.confidence * 100)}%
            </span>
          </dd>
          <dt className="text-muted-foreground">Urgency</dt>
          <dd>
            <span
              className={cn(
                "rounded-sm border px-1.5 py-0.5 text-[10px] font-bold uppercase",
                URG_CLS[a.urgency],
              )}
            >
              {a.urgency}
            </span>
          </dd>
          <dt className="text-muted-foreground">Analyst queue</dt>
          <dd>{a.queue}</dd>
          <dt className="text-muted-foreground">Why</dt>
          <dd>
            {a.rationale}
            {a.usedPhoto ? " (photo checked)" : ""}
          </dd>
        </dl>
      ) : (
        <p className="text-muted-foreground">{sub.triageError}</p>
      )}
      <p className="mt-1.5 text-[10px] text-muted-foreground">
        A human reviewer makes the final decision.
      </p>
    </div>
  );
}
const input =
  "h-9 w-full rounded-sm border border-border bg-panel-raised px-2.5 text-[13px] outline-none focus:border-primary";

interface FileRow {
  id: string;
  file: File;
  url: string;
}
const fmtSize = (b: number) =>
  b > 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.ceil(b / 1024)} KB`;

export function ReportPage() {
  const t = useT();
  const submit = useSubmitReport();
  const [hazard, setHazard] = useState<(typeof HAZARDS)[number]>("heavy_rainfall");
  const [desc, setDesc] = useState("");
  const [loc, setLoc] = useState("");
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [when, setWhen] = useState(() =>
    new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16),
  );
  const [files, setFiles] = useState<FileRow[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<CitizenSubmission | null>(null);
  const [analysing, setAnalysing] = useState(false);
  const triage = useServerFn(triageCitizenReport);
  const fileRef = useRef<HTMLInputElement>(null);

  const add = (list: FileList | null) => {
    if (!list) return;
    let count = files.length;
    for (const file of Array.from(list)) {
      const v = validateFile(file, count);
      if (v) {
        setErr(`${file.name}: ${t(`upload.${v}` as TKey)}`);
        continue;
      }
      count++;
      const row: FileRow = {
        id: crypto.randomUUID(),
        file,
        url: URL.createObjectURL(file),
      };
      setFiles((fs) => [...fs, row]);
    }
  };
  const locate = () =>
    navigator.geolocation?.getCurrentPosition((p) => {
      setCoords({ lat: p.coords.latitude, lng: p.coords.longitude });
      if (!loc) setLoc(`${p.coords.latitude.toFixed(4)}, ${p.coords.longitude.toFixed(4)}`);
    });

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!desc.trim() || !loc.trim()) {
      setErr(t("report.required"));
      return;
    }
    setErr(null);
    setAnalysing(true);
    const photo = files.find((f) => f.file.type.startsWith("image/"));
    const image = photo ? await photoDataUrl(photo.file) : undefined;
    const ai = await triage({
      data: { description: desc.trim(), hazard, location: loc.trim(), ...(image ? { image } : {}) },
    }).catch(() => ({
      ok: false as const,
      error: "AI analysis failed — the report was still sent for human review.",
    }));
    setAnalysing(false);
    const sub = await submit
      .mutateAsync({
        eventType: hazard,
        description: desc.trim(),
        locationText: loc.trim(),
        ...(coords ?? {}),
        occurredAt: new Date(when).toISOString(),
        files: files.map((f) => f.file),
        ...(ai.ok ? { triage: ai.triage } : { triageError: ai.error }),
      })
      .catch((x: Error) => {
        setErr(x.message);
        return null;
      });
    if (sub) setDone(sub);
  };

  if (done)
    return (
      <div className="mx-auto mt-10 max-w-md rounded-md border border-sev-low/40 bg-panel p-6 text-center">
        <CheckCircle2 className="mx-auto h-9 w-9 text-sev-low" />
        <h1 className="mt-3 font-display text-xl font-semibold">
          {done.message || t("report.success")}
        </h1>
        <div className="mt-1 text-xs font-semibold uppercase text-muted-foreground">
          {done.status || "RECEIVED"}
        </div>
        <div className="mt-2 text-xs text-muted-foreground">{t("report.yourId")}</div>
        <div className="font-mono text-lg font-bold text-primary">{done.id}</div>
        <TriageCard sub={done} />
        <div className="mt-4 flex justify-center gap-2">
          <Link
            to="/track"
            search={{ id: done.id }}
            className="inline-flex h-8 items-center rounded-sm bg-primary px-3 text-[12px] text-primary-foreground"
          >
            {t("report.track")}
          </Link>
          <button
            onClick={() => {
              setDone(null);
              setDesc("");
              setFiles([]);
            }}
            className="h-8 rounded-sm border border-border px-3 text-[12px]"
          >
            {t("report.another")}
          </button>
        </div>
      </div>
    );

  return (
    <div className="space-y-3">
      <SectionHeader
        eyebrow="HIKARI SENSE"
        title={t("report.title")}
        description={t("report.desc")}
        actions={<span className="font-mono text-[10px] font-semibold text-sev-low">LIVE API</span>}
      />
      <form onSubmit={onSubmit} className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_340px]">
        <Panel title={t("report.title")}>
          <div className="space-y-3">
            <fieldset>
              <legend className="mb-1.5 text-[12px] font-medium">{t("report.hazard")}</legend>
              <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
                {HAZARDS.map((h) => (
                  <button
                    type="button"
                    key={h}
                    onClick={() => setHazard(h)}
                    aria-pressed={hazard === h}
                    className={cn(
                      "rounded-sm border px-2 py-2 text-[12px]",
                      hazard === h
                        ? "border-primary bg-primary/15 text-primary"
                        : "border-border bg-panel-raised hover:bg-sidebar-accent",
                    )}
                  >
                    {t(`hazard.${h}`)}
                  </button>
                ))}
              </div>
            </fieldset>
            <label className="block text-[12px] font-medium">
              {t("report.description")}
              <textarea
                value={desc}
                onChange={(e) => setDesc(e.target.value)}
                rows={4}
                maxLength={1000}
                className={cn(input, "mt-1 h-auto py-2")}
              />
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-[12px] font-medium">
                {t("report.location")}
                <div className="mt-1 flex gap-1.5">
                  <input
                    value={loc}
                    onChange={(e) => setLoc(e.target.value)}
                    maxLength={200}
                    className={input}
                  />
                  <button
                    type="button"
                    onClick={locate}
                    title={t("report.useLocation")}
                    aria-label={t("report.useLocation")}
                    className="grid h-9 w-9 shrink-0 place-items-center rounded-sm border border-border"
                  >
                    <LocateFixed className="h-4 w-4" />
                  </button>
                </div>
              </label>
              <label className="block text-[12px] font-medium">
                {t("report.time")}
                <input
                  type="datetime-local"
                  value={when}
                  onChange={(e) => setWhen(e.target.value)}
                  className={cn(input, "mt-1")}
                />
              </label>
            </div>
            {err && (
              <p role="alert" className="text-[12px] text-sev-critical">
                {err}
              </p>
            )}
            <button
              type="submit"
              disabled={analysing || submit.isPending}
              className="h-9 rounded-sm bg-primary px-4 text-[13px] font-medium text-primary-foreground disabled:opacity-50"
            >
              {analysing ? "AI is analysing your report…" : t("common.submit")}
            </button>
          </div>
        </Panel>
        <Panel
          title={t("report.media")}
          actions={
            <span className="font-mono text-[9px] font-semibold text-muted-foreground">
              UP TO {UPLOAD_LIMITS.maxFiles} FILES
            </span>
          }
        >
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="w-full rounded-sm border border-dashed border-border bg-panel-raised/50 px-3 py-5 text-[12px] text-muted-foreground hover:border-primary"
          >
            {t("report.media")}
            <div className="mt-1 text-[10px]">{t("report.mediaHint")}</div>
          </button>
          <input
            ref={fileRef}
            type="file"
            multiple
            accept={UPLOAD_LIMITS.types.join(",")}
            className="hidden"
            onChange={(e) => {
              add(e.target.files);
              e.target.value = "";
            }}
          />
          <ul className="mt-2 space-y-1.5">
            {files.map((f) => (
              <li
                key={f.id}
                className="flex items-center gap-2 rounded-sm border border-border p-1.5"
              >
                {f.file.type.startsWith("image/") ? (
                  <img src={f.url} alt="" className="h-10 w-10 rounded-sm object-cover" />
                ) : (
                  <div className="grid h-10 w-10 place-items-center rounded-sm bg-panel-raised">
                    <FileVideo className="h-4 w-4" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[11px]">{f.file.name}</div>
                  <div className="font-mono text-[9px] text-muted-foreground">
                    {fmtSize(f.file.size)} · ready to submit
                  </div>
                </div>
                <button
                  type="button"
                  aria-label={`${t("common.remove")} ${f.file.name}`}
                  onClick={() => setFiles((fs) => fs.filter((x) => x.id !== f.id))}
                >
                  <X className="h-3.5 w-3.5 text-muted-foreground" />
                </button>
              </li>
            ))}
          </ul>
          <p className="mt-2 flex items-center gap-1 text-[10px] text-muted-foreground">
            <ImageIcon className="h-3 w-3" />
            {t("report.demoUpload")}
          </p>
        </Panel>
      </form>
    </div>
  );
}

/** Stages are derived from backend status; no progress timestamps are estimated. */
const STAGES = ["submitted", "received", "processing", "human"] as const;
export function trackStages(sub: CitizenSubmission) {
  const status = (sub.status ?? "RECEIVED").toLowerCase();
  const processingComplete = [
    "needs_review",
    "low_confidence",
    "verified",
    "corroborated",
    "escalated",
    "rejected",
    "merged",
  ].includes(status);
  const decided = ["verified", "corroborated", "rejected", "merged"].includes(status);
  const review = ["needs_review", "low_confidence", "escalated"].includes(status);
  const states = [
    "done",
    "done",
    processingComplete ? "done" : "current",
    decided ? "done" : review ? "current" : "pending",
  ] as const;
  const times = [sub.submittedAt ?? null, sub.receivedAt ?? null, null, null];
  return STAGES.map((key, i) => ({
    key,
    status: states[i]!,
    at: times[i]!,
  }));
}

function Tracker({ sub }: { sub: CitizenSubmission }) {
  const t = useT();
  const stages = trackStages(sub);
  return (
    <Panel title={`${sub.id} · ${t(`hazard.${sub.hazard}` as TKey)}`} actions={<DemoTag />}>
      <div className="mb-3 text-[12px] text-muted-foreground">
        {sub.location} · {new Date(sub.observedAt).toLocaleString()}
      </div>
      <ol className="space-y-2">
        {stages.map((s) => (
          <li key={s.key} className="flex items-center gap-2.5 text-[12px]">
            {s.status === "done" ? (
              <CheckCircle2 className="h-4 w-4 text-sev-low" />
            ) : s.status === "current" ? (
              <CircleDot className="h-4 w-4 text-primary" />
            ) : (
              <Circle className="h-4 w-4 text-muted-foreground" />
            )}
            <span className={cn(s.status === "pending" && "text-muted-foreground")}>
              {t(`stage.${s.key}` as TKey)}
            </span>
            <span className="ml-auto font-mono text-[10px] text-muted-foreground">
              {s.at
                ? new Date(s.at).toLocaleString()
                : s.status === "current"
                  ? t("stage.inProgress")
                  : t("stage.pending")}
            </span>
          </li>
        ))}
      </ol>
      <TriageCard sub={sub} />
    </Panel>
  );
}

export function MyReportsPage() {
  const t = useT();
  const { data, isPending, isError, refetch } = useQuery(submissionsQuery);
  return (
    <div className="space-y-3">
      <SectionHeader
        eyebrow="HIKARI SENSE"
        title={t("my.title")}
        description={t("my.desc")}
        actions={<DemoTag />}
      />
      {isError ? (
        <StateScreen
          kind="dataUnavailable"
          title={t("error.data")}
          actions={[{ label: t("common.retry"), onClick: () => refetch(), primary: true }]}
        />
      ) : isPending ? (
        <PanelSkeleton />
      ) : !data?.length ? (
        <StateScreen
          kind="noReports"
          title={t("my.empty")}
          actions={[{ label: t("nav./report"), to: "/report", primary: true }]}
        />
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {data.map((s) => (
            <Tracker key={s.id} sub={s} />
          ))}
        </div>
      )}
    </div>
  );
}

export function TrackPage({ id }: { id?: string | undefined }) {
  const t = useT();
  const navigate = useNavigate();
  const [q, setQ] = useState(id ?? "");
  const { data, isFetching, isError, refetch } = useQuery({
    ...submissionQuery(id ?? ""),
    enabled: !!id,
    refetchInterval: 5000,
  });
  return (
    <div className="space-y-3">
      <SectionHeader
        eyebrow="HIKARI SENSE"
        title={t("track.title")}
        description={t("track.desc")}
        actions={<DemoTag />}
      />
      <form
        onSubmit={(e) => {
          e.preventDefault();
          navigate({ to: "/track", search: { id: q.trim().toUpperCase() } });
        }}
        className="flex max-w-md gap-2"
      >
        <input
          aria-label={t("track.title")}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t("track.placeholder")}
          className={input}
        />
        <button className="h-9 rounded-sm bg-primary px-4 text-[13px] text-primary-foreground">
          {t("track.button")}
        </button>
      </form>
      {id &&
        (isError ? (
          <StateScreen
            kind="dataUnavailable"
            title={t("error.data")}
            actions={[{ label: t("common.retry"), onClick: () => refetch(), primary: true }]}
          />
        ) : isFetching && !data ? (
          <PanelSkeleton />
        ) : data ? (
          <div className="max-w-xl">
            <Tracker sub={data} />
          </div>
        ) : (
          <StateScreen
            kind="invalidReportId"
            title={t("track.invalid")}
            actions={[
              { label: t("nav./my-reports"), to: "/my-reports" },
              { label: t("nav./report"), to: "/report", primary: true },
            ]}
          />
        ))}
    </div>
  );
}
