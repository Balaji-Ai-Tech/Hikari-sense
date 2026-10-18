import { NoFilterResults } from "@/features/events/EventFilterBar";
import { useState } from "react";
import { DemoTag, Panel, SectionHeader } from "@/components/hs/primitives";
import { EventDrawer, EventFilterBar, StreamList } from "@/features/events/components";
import { useCommandCenterData } from "@/features/events/CommandCenter";
import type { WeatherEvent } from "@/types";
import { MapLibreEventMap } from "./MapLibreEventMap";

export function LiveMapPage() {
  const data = useCommandCenterData();
  const [focusId, setFocusId] = useState<string | undefined>();
  const [drawer, setDrawer] = useState<WeatherEvent | null>(null);
  return (
    <div className="space-y-3">
      <SectionHeader
        eyebrow="Command Center"
        title="Live Map"
        description="MapLibre basemap with HIKARI SENSE event intelligence overlays. Use Layers to toggle overlays."
        actions={<DemoTag />}
      />
      <EventFilterBar
        count={data.filtered.length}
        total={data.stream.visible.length}
        events={data.events}
      />
      {data.filtered.length === 0 && <NoFilterResults compact />}
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_330px]">
        <Panel title="National Event Layer" bodyClassName="p-0">
          <MapLibreEventMap
            events={data.filtered}
            reports={data.reports}
            selectedId={focusId}
            onSelect={(e) => setFocusId(e.id)}
            className="h-[calc(100vh-230px)] min-h-[480px]"
          />
        </Panel>
        <Panel title="Events in view" bodyClassName="p-0">
          <div className="h-[calc(100vh-230px)] min-h-[480px] overflow-y-auto">
            <StreamList
              events={data.filtered}
              latestId={data.stream.latestId}
              selectedId={focusId}
              onSelect={(e) => {
                setFocusId(e.id);
                setDrawer(e);
              }}
            />
          </div>
        </Panel>
      </div>
      <EventDrawer
        event={drawer}
        onClose={() => setDrawer(null)}
        onViewOnMap={(e) => setFocusId(e.id)}
      />
    </div>
  );
}
