import { useSuspenseQuery } from "@tanstack/react-query";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  eventsByTypeQuery,
  eventsQuery,
  stateIntensityQuery,
  verificationTrendQuery,
} from "@/hooks/useWeather";
import { DemoTag, MetricCard, SectionHeader } from "@/components/hs/primitives";
import { ChartCard } from "@/components/hs/data";
import { axis, tip } from "@/features/dashboard/DashboardPage";
import { VERIFICATION_LABEL } from "@/components/hs/primitives";
import { activeFilterCount, applyFilters, useEventFilters } from "@/features/events/filters";
import { EventFilterBar, NoFilterResults, typeLabel } from "@/features/events/EventFilterBar";

const COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
  "var(--info)",
  "var(--muted-foreground)",
  "var(--sev-critical)",
];

export function AnalyticsPage() {
  const { data: byTypeAll } = useSuspenseQuery(eventsByTypeQuery);
  const { data: trend } = useSuspenseQuery(verificationTrendQuery);
  const { data: statesAll } = useSuspenseQuery(stateIntensityQuery);
  const { data: allEvents } = useSuspenseQuery(eventsQuery);
  const [filters] = useEventFilters();
  const filtering = activeFilterCount(filters) > 0;
  // Same shared filters as map/stream/table; charts recompute from the filtered events.
  const events = applyFilters(allEvents, filters);
  const byType = filtering
    ? Object.entries(
        events.reduce<Record<string, number>>((a, e) => {
          const k = typeLabel(e.type);
          a[k] = (a[k] ?? 0) + 1;
          return a;
        }, {}),
      ).map(([type, count]) => ({ type, count }))
    : byTypeAll;
  const states = filtering
    ? Object.values(
        events.reduce<Record<string, { state: string; events: number; high: number }>>((a, e) => {
          const state = e.state ?? "Unknown";
          const r = (a[state] ??= { state, events: 0, high: 0 });
          r.events++;
          if (e.severity === "high" || e.severity === "critical") r.high++;
          return a;
        }, {}),
      )
    : statesAll;
  const verMix = (Object.keys(VERIFICATION_LABEL) as (keyof typeof VERIFICATION_LABEL)[]).map(
    (k) => ({
      name: VERIFICATION_LABEL[k],
      value: events.filter((e) => e.verification === k).length,
    }),
  );

  return (
    <div className="space-y-3">
      <SectionHeader
        eyebrow="Analytics"
        title="Analytics & Trends"
        description="14-day operational trends across event types, states and verification."
        actions={<DemoTag />}
      />
      <EventFilterBar count={events.length} total={allEvents.length} events={allEvents} />
      {events.length === 0 && <NoFilterResults compact />}
      {filtering && (
        <p className="text-[11px] text-muted-foreground">
          Verification mix, events by type and state intensity reflect the filtered demo events;
          14-day trend charts and headline cards are fixed demo series.
        </p>
      )}
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <MetricCard
          label="Events · 14d"
          value="3,421"
          delta="+8%"
          up
          spark={trend.map((t) => t.verified)}
        />
        <MetricCard
          label="Verified share"
          value="72.6%"
          delta="+2.1 pt"
          up
          tone="low"
          spark={trend.map((t) => t.verified - t.review)}
        />
        <MetricCard
          label="Median verify time"
          value={`${trend.at(-1)!.medianMin} min`}
          delta="-31%"
          up={false}
          tone="medium"
          spark={trend.map((t) => t.medianMin)}
        />
        <MetricCard
          label="High-severity"
          value="687"
          delta="+32%"
          up
          tone="critical"
          spark={[3, 4, 4, 5, 6, 6, 7, 8]}
        />
      </div>
      <div className="grid gap-3 lg:grid-cols-3">
        <ChartCard title="Verification outcomes · daily" className="lg:col-span-2">
          <ResponsiveContainer>
            <BarChart data={trend} margin={{ left: -14, right: 6, top: 6 }}>
              <CartesianGrid stroke="var(--border)" strokeDasharray="2 4" vertical={false} />
              <XAxis dataKey="day" {...axis} />
              <YAxis {...axis} />
              <Tooltip {...tip} cursor={{ fill: "var(--accent)" }} />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              <Bar dataKey="verified" name="Verified" stackId="a" fill="var(--sev-low)" />
              <Bar dataKey="review" name="Needs review" stackId="a" fill="var(--sev-medium)" />
              <Bar
                dataKey="rejected"
                name="Rejected"
                stackId="a"
                fill="var(--sev-critical)"
                radius={[2, 2, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="Current verification mix">
          <ResponsiveContainer>
            <PieChart>
              <Pie
                data={verMix}
                dataKey="value"
                nameKey="name"
                innerRadius={50}
                outerRadius={80}
                paddingAngle={2}
                stroke="var(--panel)"
              >
                {verMix.map((_, i) => (
                  <Cell key={i} fill={COLORS[i]} />
                ))}
              </Pie>
              <Tooltip {...tip} />
              <Legend wrapperStyle={{ fontSize: 10 }} />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="Events by type · 14d">
          <ResponsiveContainer>
            <BarChart data={byType} layout="vertical" margin={{ left: 10, right: 10 }}>
              <XAxis type="number" {...axis} />
              <YAxis type="category" dataKey="type" {...axis} width={80} />
              <Tooltip {...tip} cursor={{ fill: "var(--accent)" }} />
              <Bar dataKey="count" name="Events" fill="var(--chart-1)" radius={[0, 2, 2, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="State intensity">
          <ResponsiveContainer>
            <BarChart data={states} margin={{ left: -14, right: 6, top: 6 }}>
              <CartesianGrid stroke="var(--border)" strokeDasharray="2 4" vertical={false} />
              <XAxis
                dataKey="state"
                {...axis}
                interval={0}
                angle={-30}
                textAnchor="end"
                height={50}
              />
              <YAxis {...axis} />
              <Tooltip {...tip} cursor={{ fill: "var(--accent)" }} />
              <Bar dataKey="events" name="Events" fill="var(--chart-2)" />
              <Bar dataKey="high" name="High+" fill="var(--sev-high)" />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="Median time-to-verify (min)">
          <ResponsiveContainer>
            <LineChart data={trend} margin={{ left: -18, right: 6, top: 6 }}>
              <CartesianGrid stroke="var(--border)" strokeDasharray="2 4" vertical={false} />
              <XAxis dataKey="day" {...axis} interval={2} />
              <YAxis {...axis} />
              <Tooltip {...tip} />
              <Line
                type="monotone"
                dataKey="medianMin"
                name="Median min"
                stroke="var(--primary)"
                strokeWidth={2}
                dot={{ r: 2 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>
    </div>
  );
}
