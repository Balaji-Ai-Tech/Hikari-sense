import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, LoaderCircle, RotateCw, Sparkles } from "lucide-react";
import { Panel } from "@/components/hs/primitives";
import { aiSummaryQuery } from "@/hooks/useWeather";
import { BackendApiError } from "@/services/api";

export function DisasterSummaryPanel() {
  const [requested, setRequested] = useState(false);
  const summary = useQuery(aiSummaryQuery);
  const quotaExceeded = summary.error instanceof BackendApiError && summary.error.status === 429;
  const runSummary = () => {
    setRequested(true);
    void summary.refetch();
  };

  return (
    <Panel
      title="Disaster Intelligence Summary"
      actions={
        <button
          type="button"
          onClick={runSummary}
          disabled={summary.isFetching}
          className="inline-flex items-center gap-1.5 rounded-sm border border-border px-2 py-1 text-[11px] font-medium hover:bg-panel-raised disabled:cursor-wait disabled:opacity-60"
        >
          {summary.isFetching ? (
            <LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
          ) : requested ? (
            <RotateCw className="h-3.5 w-3.5" aria-hidden="true" />
          ) : (
            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
          )}
          {summary.isFetching ? "Analyzing" : requested ? "Refresh summary" : "Generate summary"}
        </button>
      }
      className="min-w-0"
    >
      <div aria-busy={summary.isFetching}>
        {!requested && (
          <p className="text-xs text-muted-foreground">
            No summary generated. HIKARI selects public weather and SACHET data on the backend.
          </p>
        )}
        {summary.isFetching && (
          <p className="flex items-center gap-2 text-xs text-muted-foreground" role="status">
            <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
            Preparing an advisory from public weather observations and SACHET alerts…
          </p>
        )}
        {summary.error && !summary.isFetching && (
          <div className="flex items-start gap-2 text-xs" role="alert">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-sev-high" aria-hidden="true" />
            <p>
              <span className="font-semibold">
                {quotaExceeded ? "Quota or rate limit reached." : "Summary unavailable."}
              </span>{" "}
              {summary.error.message}
            </p>
          </div>
        )}
        {summary.data && !summary.isFetching && (
          <div className="space-y-3">
            {summary.data.status === "empty" ? (
              <p className="text-xs text-muted-foreground">
                No persisted current weather observations or active SACHET alerts are available.
              </p>
            ) : (
              <>
                <p className="text-sm leading-relaxed">{summary.data.summary}</p>
                {summary.data.precautions.length > 0 && (
                  <ul className="list-disc space-y-1 pl-5 text-xs">
                    {summary.data.precautions.map((precaution, index) => (
                      <li key={`${index}-${precaution}`}>{precaution}</li>
                    ))}
                  </ul>
                )}
              </>
            )}
            <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-border pt-2 text-[10px]">
              {summary.data.sources.map((source) => (
                <span key={source.name} className="font-mono">
                  {source.name}: {source.status.toUpperCase()} ·{" "}
                  {source.latestAt ? new Date(source.latestAt).toLocaleString() : "no observation"}
                </span>
              ))}
            </div>
            <p className="text-[10px] text-muted-foreground">
              Gemini · {summary.data.model} · Advisory only. Not incident verification or official
              guidance.
            </p>
            <ul className="space-y-0.5 text-[10px] text-muted-foreground">
              {summary.data.limitations.map((limitation) => (
                <li key={limitation}>{limitation}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Panel>
  );
}
