import type { Report } from "@/types";

/** Original report content + clearly labelled DEMO AI translation. UI translation never touches this text. */
export function ReportText({
  report,
  clamp = true,
}: {
  report: Pick<Report, "text" | "language" | "translation">;
  clamp?: boolean;
}) {
  if (!report.translation)
    return <span className={clamp ? "line-clamp-2" : ""}>{report.text}</span>;
  return (
    <div className="space-y-1 text-[11px]">
      <div>
        <span className="mr-1 font-mono text-[9px] uppercase text-muted-foreground">
          Original · {report.language}
        </span>
        <span className={clamp ? "line-clamp-2" : ""}>{report.text}</span>
      </div>
      <div className="border-l-2 border-primary/50 pl-2">
        <span
          className="mr-1 rounded-sm bg-primary/15 px-1 font-mono text-[9px] font-semibold uppercase text-primary"
          title="Machine translation for review only — not official"
        >
          AI translation — demo · English
        </span>
        <span className="text-muted-foreground">{report.translation}</span>
      </div>
    </div>
  );
}
