import { EventSkeleton } from "@/components/hs/states";
import { createFileRoute } from "@tanstack/react-router";
import { eventQuery, eventReportsQuery, eventsQuery } from "@/hooks/useWeather";
import { EventDetailPage } from "@/features/events/EventDetailPage";

export const Route = createFileRoute("/events/$eventId")({
  loader: async ({ context, params }) => {
    const [event] = await Promise.all([
      context.queryClient.ensureQueryData(eventQuery(params.eventId)),
      context.queryClient.ensureQueryData(eventsQuery),
      context.queryClient.ensureQueryData(eventReportsQuery(params.eventId)),
    ]);
    return { title: event?.title ?? null };
  },
  head: ({ loaderData, params }) => {
    const t = loaderData?.title ? `${loaderData.title} (${params.eventId})` : "Event";
    return {
      meta: [
        { title: `${t} — HIKARI SENSE` },
        {
          name: "description",
          content:
            "Event details: AI analysis, source corroboration, verification score and timeline.",
        },
        { property: "og:title", content: `${t} — HIKARI SENSE` },
        {
          property: "og:description",
          content:
            "Event details: AI analysis, source corroboration, verification score and timeline.",
        },
      ],
    };
  },
  pendingComponent: EventSkeleton,
  component: EventDetailRoute,
});

function EventDetailRoute() {
  const { eventId } = Route.useParams();
  return <EventDetailPage eventId={eventId} />;
}
