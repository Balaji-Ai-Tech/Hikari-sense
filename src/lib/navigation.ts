import {
  Activity,
  AlertTriangle,
  Archive,
  BarChart3,
  Bell,
  BrainCircuit,
  CloudRain,
  Copy,
  Cpu,
  Database,
  FileCheck2,
  FileSearch,
  FlaskConical,
  Gauge,
  GitBranch,
  History,
  LayoutDashboard,
  LineChart,
  ListChecks,
  Map,
  MapPinned,
  MessageSquarePlus,
  Newspaper,
  Radio,
  Scale,
  ScrollText,
  Server,
  Settings,
  ShieldCheck,
  Target,
  Users,
  Waves,
  Workflow,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  title: string;
  to: string;
  icon: LucideIcon;
  description: string;
}
export interface NavSection {
  label: string;
  restricted?: boolean;
  items: NavItem[];
}

export const NAV: NavSection[] = [
  {
    label: "Command Center",
    items: [
      {
        title: "National Dashboard",
        to: "/",
        icon: LayoutDashboard,
        description: "National situational overview.",
      },
      {
        title: "Live Events",
        to: "/events",
        icon: Radio,
        description: "Real-time stream of detected weather events across all sources.",
      },
      {
        title: "Live Map",
        to: "/live-map",
        icon: Map,
        description: "Geospatial view of active events and alerts.",
      },
    ],
  },
  {
    label: "Intelligence",
    items: [
      {
        title: "Event Intelligence",
        to: "/event-intelligence",
        icon: BrainCircuit,
        description: "AI-assisted event classification, explanation and source fusion.",
      },
      {
        title: "Rainfall Intelligence",
        to: "/rainfall",
        icon: CloudRain,
        description: "Observed vs normal rainfall, departures and anomalies by region.",
      },
      {
        title: "Prediction",
        to: "/prediction",
        icon: LineChart,
        description: "Short-range nowcasts and model forecast ensembles.",
      },
      {
        title: "Inundation / DIRI",
        to: "/inundation",
        icon: Waves,
        description: "Inundation risk and Disaster Impact Risk Index by district.",
      },
      {
        title: "Impact Assessment",
        to: "/impact",
        icon: Target,
        description: "Population, infrastructure and agriculture exposure estimates.",
      },
      {
        title: "What-If Simulation",
        to: "/simulation",
        icon: FlaskConical,
        description: "Scenario modelling for rainfall, wind and storm surge.",
      },
      {
        title: "Historical Replay",
        to: "/replay",
        icon: History,
        description: "Replay past events on the timeline with all source layers.",
      },
    ],
  },
  {
    label: "Verification",
    items: [
      {
        title: "Verification Queue",
        to: "/verification",
        icon: ListChecks,
        description: "Reports awaiting corroboration and analyst review.",
      },
      {
        title: "Evidence",
        to: "/verification/evidence",
        icon: FileSearch,
        description: "Media, sensor and document evidence linked to events.",
      },
      {
        title: "Duplicate Reports",
        to: "/duplicates",
        icon: Copy,
        description: "Clusters of near-duplicate reports for merge decisions.",
      },
      {
        title: "Human Decisions",
        to: "/decisions",
        icon: Scale,
        description: "Analyst decisions and overrides with rationale.",
      },
    ],
  },
  {
    label: "Public Portal",
    items: [
      {
        title: "Map",
        to: "/public-map",
        icon: Map,
        description: "Verified weather events near you.",
      },
      {
        title: "News & Weather",
        to: "/news-weather",
        icon: Newspaper,
        description: "Public weather updates and advisories.",
      },
      {
        title: "Public Alerts",
        to: "/public-alerts",
        icon: Bell,
        description: "Active official alerts and safety instructions.",
      },
      {
        title: "Report Weather Event",
        to: "/report",
        icon: MessageSquarePlus,
        description: "Submit an observation with location, media and description.",
      },
      {
        title: "My Reports",
        to: "/my-reports",
        icon: Archive,
        description: "Reports you have submitted and their status.",
      },
      {
        title: "Track Report",
        to: "/track",
        icon: MapPinned,
        description: "Track a report by reference ID.",
      },
    ],
  },
  {
    label: "Analytics",
    items: [
      {
        title: "Analytics & Trends",
        to: "/analytics",
        icon: BarChart3,
        description: "Long-term trends across event types and regions.",
      },
      {
        title: "Regional Intelligence",
        to: "/regional",
        icon: Gauge,
        description: "State and district level intelligence summaries.",
      },
      {
        title: "Source Analytics",
        to: "/source-analytics",
        icon: Workflow,
        description: "Volume, latency and reliability by data source.",
      },
      {
        title: "Verification Analytics",
        to: "/verification-analytics",
        icon: FileCheck2,
        description: "Verification throughput, accuracy and turnaround.",
      },
    ],
  },
  {
    label: "Data & System",
    items: [
      {
        title: "Data Sources",
        to: "/data-sources",
        icon: Database,
        description: "Registered sources, credentials and reliability scores.",
      },
      {
        title: "Ingestion Monitoring",
        to: "/ingestion",
        icon: Activity,
        description: "Pipeline throughput, lag and failures.",
      },
      {
        title: "System Health",
        to: "/system-health",
        icon: Server,
        description: "Service uptime, queues and infrastructure status.",
      },
      {
        title: "Model Evaluation",
        to: "/model-evaluation",
        icon: FlaskConical,
        description: "Benchmarks and evaluation runs for ML models.",
      },
      {
        title: "ML Monitoring",
        to: "/ml-monitoring",
        icon: Cpu,
        description: "Drift, latency and prediction quality in production.",
      },
    ],
  },
  {
    label: "Admin",
    restricted: true,
    items: [
      {
        title: "Users & Roles",
        to: "/admin/users",
        icon: Users,
        description: "User accounts and role assignments.",
      },
      {
        title: "Alert Management",
        to: "/admin/alerts",
        icon: Bell,
        description: "Configure alert rules, thresholds and dissemination.",
      },
      {
        title: "Audit Log",
        to: "/admin/audit",
        icon: ScrollText,
        description: "Immutable log of privileged actions.",
      },
      {
        title: "MLOps",
        to: "/admin/mlops",
        icon: GitBranch,
        description: "Model registry, deployments and rollbacks.",
      },
      {
        title: "System Configuration",
        to: "/admin/config",
        icon: Settings,
        description: "Global platform configuration.",
      },
    ],
  },
];

export const ALL_NAV = NAV.flatMap((s) =>
  s.items.map((i) => ({ ...i, section: s.label, restricted: !!s.restricted })),
);
export const findNav = (to: string) => ALL_NAV.find((i) => i.to === to);
/** Active when the path equals the item, or is a descendant that no more specific nav item claims. */
export function isNavActive(itemTo: string, path: string) {
  const p = path.replace(/\/$/, "") || "/";
  if (itemTo === "/") return p === "/";
  if (p === itemTo) return true;
  if (!p.startsWith(itemTo + "/")) return false;
  return !ALL_NAV.some(
    (o) =>
      o.to !== itemTo && o.to.length > itemTo.length && (p === o.to || p.startsWith(o.to + "/")),
  );
}
export { AlertTriangle, ShieldCheck };
