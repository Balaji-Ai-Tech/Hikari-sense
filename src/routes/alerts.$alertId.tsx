import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { alertQuery, eventQuery } from "@/hooks/useWeather";
import {
  DemoTag,
  EmptyState,
  Panel,
  SectionHeader,
  SeverityBadge,
} from "@/components/hs/primitives";
import type { WeatherAlert } from "@/types";
import { EventStreamRow } from "@/features/events/components";

export const Route = createFileRoute("/alerts/$alertId")({
  loader: async ({ context, params }) => {
    const alert = await context.queryClient.ensureQueryData(alertQuery(params.alertId));
    if (alert) await context.queryClient.ensureQueryData(eventQuery(alert.eventId));
    return { title: alert?.title ?? null };
  },
  head: ({ loaderData, params }) => {
    const t = loaderData?.title ? `${loaderData.title} (${params.alertId})` : "Alert";
    return {
      meta: [
        { title: `${t} — HIKARI SENSE` },
        {
          name: "description",
          content: "Demo weather alert details with affected area, channels and the related event.",
        },
        { property: "og:title", content: `${t} — HIKARI SENSE` },
        {
          property: "og:description",
          content: "Demo weather alert details with affected area, channels and the related event.",
        },
        { property: "og:type", content: "website" },
        { name: "twitter:card", content: "summary" },
      ],
    };
  },
  component: AlertDetail,
});

function AlertDetail() {
  const { alertId } = Route.useParams();
  const { data: a } = useSuspenseQuery(alertQuery(alertId));
  if (!a)
    return (
      <EmptyState
        title="Alert not found"
        description={`No alert ${alertId} exists in the demo dataset.`}
      />
    );
  return <AlertBody alert={a} />;
}

function AlertBody({ alert: a }: { alert: WeatherAlert }) {
  const { data: e } = useSuspenseQuery(eventQuery(a.eventId));
  return (
    <div className="space-y-3">
      <Link
        to="/"
        className="inline-flex items-center gap-1 text-[12px] text-muted-foreground hover:text-primary"
      >
        <ArrowLeft className="h-3 w-3" />
        National Dashboard
      </Link>
      <SectionHeader
        eyebrow="Alert"
        title={a.title}
        description={a.message}
        actions={<DemoTag />}
      />
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Panel title="Alert details">
          <dl className="grid grid-cols-[110px_1fr] gap-y-1.5 text-[12px]">
            <dt className="text-muted-foreground">Alert ID</dt>
            <dd className="font-mono text-primary">{a.id}</dd>
            <dt className="text-muted-foreground">Type</dt>
            <dd>{a.alertType}</dd>
            <dt className="text-muted-foreground">Severity</dt>
            <dd>
              <SeverityBadge severity={a.severity} />
            </dd>
            <dt className="text-muted-foreground">Status</dt>
            <dd className="font-semibold uppercase">{a.status}</dd>
            <dt className="text-muted-foreground">Affected area</dt>
            <dd>{a.affectedArea}</dd>
            <dt className="text-muted-foreground">Issued</dt>
            <dd className="font-mono">{a.issuedAt} IST</dd>
            <dt className="text-muted-foreground">Expires</dt>
            <dd className="font-mono">
              {a.expiresAt}
              {a.expiresAt.length <= 5 ? " IST" : ""}
            </dd>
            <dt className="text-muted-foreground">Issuer</dt>
            <dd>{a.issuer} (simulated)</dd>
            <dt className="text-muted-foreground">Recipients</dt>
            <dd>{a.recipients.join(", ")}</dd>
            <dt className="text-muted-foreground">Channels</dt>
            <dd>{a.channels.join(" · ")}</dd>
          </dl>
          <div className="mt-3 text-[10px] uppercase tracking-wider text-muted-foreground">
            Advisory
          </div>
          <ul className="mt-1 list-inside list-disc space-y-0.5 text-[12px]">
            {a.instructions.map((i) => (
              <li key={i}>{i}</li>
            ))}
          </ul>
        </Panel>
        <Panel title="Related event" bodyClassName="p-0">
          {e ? (
            <div>
              <EventStreamRow event={e} />
              <div className="p-3">
                <Link
                  to="/events/$eventId"
                  params={{ eventId: e.id }}
                  className="flex items-center justify-center gap-1.5 rounded-sm bg-primary py-2 text-[12px] font-semibold text-primary-foreground hover:opacity-90"
                >
                  View Event <ExternalLink className="h-3.5 w-3.5" />
                </Link>
              </div>
            </div>
          ) : (
            <div className="p-3">
              <EmptyState title="Linked event missing" description={a.eventId} />
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}
