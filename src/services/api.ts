// Backend-backed event, report, and submission services share one typed UI boundary.
// Remaining demo-only services are kept explicit until their backend contracts exist.
import { repo } from "@/data/repository";
import {
  demoEventsByType,
  demoIngestion,
  demoMetrics,
  demoRainfallByRegion,
  demoStateIntensity,
  demoVerificationTrend,
} from "@/data/demo";
import { EVENT_TYPE_LABEL } from "@/data/mockEvents";
import type {
  AIAnalysis,
  DataSource,
  DecisionAction,
  EventState,
  EventGeometry,
  EventType,
  LiveWeatherLocation,
  Metric,
  OfficialAlertRecord,
  Report,
  ReviewAssignmentRecord,
  ReviewQueueFilters,
  ReviewQueuePage,
  ReportReviewAction,
  ReviewerOption,
  ReportStatus,
  SearchResult,
  SatelliteObservation,
  Severity,
  SourceKind,
  VerificationDecision,
  VerificationStatus,
  WeatherAlert,
  WeatherEvent,
  WeatherObservation,
} from "@/types";

const delay = <T>(v: T, ms = 60) => new Promise<T>((r) => setTimeout(() => r(v), ms));

type ApiRole = "analyst" | "citizen" | "verifier" | "admin" | "ml_engineer" | "system_operator";
type BackendEvent = {
  id: string;
  title: string;
  type: string;
  severity: string;
  verification: string;
  location: string;
  district: string | null;
  state: string | null;
  lat: number | null;
  lng: number | null;
  geometry: WeatherEvent["geometry"];
  reportedAt: string;
  reports: number;
  sources: number;
  sourceKinds: string[];
  confidence: number;
  affectedAreaKm2: number;
  images: number;
  videos: number;
  summary: string;
  lifecycleState: string;
  startTime: string;
  lastUpdated: string;
  reportIds: string[];
  sourceIds: string[];
  mediaCount: number;
  duplicateCount: number;
  mergedInto: string | null;
  aiDisclaimer?: string;
};
type BackendEventPage = { items: BackendEvent[]; total_pages: number };
type BackendReport = {
  id: string;
  eventId: string | null;
  text: string;
  language: string;
  location: string;
  lat: number | null;
  lng: number | null;
  reportedAt: string;
  hasMedia: boolean;
  status: string;
  sourceId: string;
  sourceName: string;
  sourceType: string;
  sourceAccount: string;
  receivedAt: string;
  media: { id: string; kind: string }[];
  aiClassification: string | null;
  aiConfidence: number | null;
  duplicateStatus: string;
  duplicateOf: string | null;
  similarity: number | null;
  severity?: string | null;
  priority?: "low" | "normal" | "high";
  reviewer_id?: string | null;
  reviewer_name?: string | null;
  assigned_at?: string | null;
};
type BackendReviewQueuePage = Omit<ReviewQueuePage, "items"> & { items: BackendReport[] };
type BackendCitizenSubmission = {
  id: string;
  hazard: string | null;
  description: string;
  location: string | null;
  lat: number | null;
  lng: number | null;
  language: string;
  observedAt: string;
  submittedAt: string;
  status: string;
  media: { name?: string; kind: string; key?: string }[];
};
type BackendAlert = {
  id: string;
  title: string;
  region: string;
  detail: string;
  severity: string;
  issuedAt: string | null;
  expiresAt: string | null;
  issuer: string;
  eventId: string | null;
  instructions: string[];
  alertType: string;
  affectedArea: string;
  message: string;
  status: string;
  recipients: string[];
  channels: string[];
};
type BackendMetric = {
  label: string;
  value: string;
  hint?: string;
  spark?: number[];
};
type BackendReportAccepted = { report_id: string; status: string; message: string };

export interface CitizenReportInput {
  description: string;
  eventType: string;
  locationText: string;
  latitude?: number;
  longitude?: number;
  occurredAt?: string;
  files: File[];
  triage?: CitizenSubmission["triage"];
  triageError?: string;
}

export class BackendApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "BackendApiError";
  }
}

const apiTokens = new Map<ApiRole, string>();
function apiBaseUrl() {
  const value = (import.meta.env as Record<string, string | boolean | undefined>)[
    "VITE_API_BASE_URL"
  ];
  if (typeof value !== "string" || !value.trim()) {
    if (import.meta.env.DEV) return "http://localhost:8000";
    throw new Error("Set VITE_API_BASE_URL to the HIKARI SENSE API origin.");
  }
  return value.trim().replace(/\/+$/, "");
}

async function getApiToken(role: ApiRole): Promise<string> {
  if (import.meta.env.DEV) {
    const cached = apiTokens.get(role);
    if (cached) return cached;
    const response = await fetch(`${apiBaseUrl()}/api/v1/auth/dev-login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: `hikari-frontend-${role}`, role }),
    });
    if (!response.ok) throw new BackendApiError("Development sign-in failed.", response.status);
    const body = (await response.json()) as { access_token: string };
    apiTokens.set(role, body.access_token);
    return body.access_token;
  }

  const token =
    typeof window === "undefined" ? null : window.sessionStorage.getItem("hs-api-token");
  if (!token) throw new BackendApiError("Sign in to access HIKARI SENSE data.", 401);
  return token;
}

async function backendRequest<T>(
  path: string,
  role: ApiRole | null,
  init: RequestInit = {},
  retryUnauthorized = true,
): Promise<T> {
  const token = role ? await getApiToken(role) : null;
  const headers = new Headers(init.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl()}${path}`, {
      ...init,
      headers,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw error;
    if (import.meta.env.DEV) {
      console.warn("HIKARI SENSE backend request could not complete", {
        endpoint: path.split("?")[0],
        errorType: error instanceof Error ? error.name : "UnknownError",
        detail: error instanceof Error ? error.message : "Unknown network error",
      });
    }
    throw new BackendApiError(
      "HIKARI SENSE backend is unavailable. Check that the API is running at localhost:8000 and allows this frontend origin.",
      0,
    );
  }
  if (response.status === 401 && role && retryUnauthorized && import.meta.env.DEV) {
    apiTokens.delete(role);
    return backendRequest<T>(path, role, init, false);
  }
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      detail?: unknown;
      message?: string;
      error?: { message?: string };
    } | null;
    const detail =
      typeof body?.detail === "string"
        ? body.detail
        : Array.isArray(body?.detail)
          ? body.detail
              .map((item) => (typeof item === "object" && item && "msg" in item ? item.msg : item))
              .join(", ")
          : undefined;
    throw new BackendApiError(
      detail ??
        body?.message ??
        body?.error?.message ??
        `HIKARI SENSE API request failed (${response.status}).`,
      response.status,
    );
  }
  return (await response.json()) as T;
}

function mapBackendEvent(event: BackendEvent): WeatherEvent {
  return {
    id: event.id,
    title: event.title,
    type: event.type as EventType,
    severity: event.severity as Severity,
    verification: event.verification as VerificationStatus,
    location: event.location,
    district: event.district,
    state: event.state,
    lat: event.lat,
    lng: event.lng,
    ...(event.geometry !== undefined ? { geometry: event.geometry } : {}),
    reportedAt: event.reportedAt,
    reports: event.reports,
    sources: event.sources,
    sourceKinds: event.sourceKinds as SourceKind[],
    confidence: event.confidence,
    affectedAreaKm2: event.affectedAreaKm2,
    images: event.images,
    videos: event.videos,
    summary: event.summary,
    lifecycleState: event.lifecycleState as EventState,
    startTime: event.startTime,
    lastUpdated: event.lastUpdated,
    reportIds: event.reportIds,
    sourceIds: event.sourceIds,
    mediaCount: event.mediaCount,
    duplicateCount: event.duplicateCount,
    ...(event.mergedInto ? { mergedInto: event.mergedInto } : {}),
    origin: "backend",
    ...(event.aiDisclaimer ? { aiDisclaimer: event.aiDisclaimer } : {}),
  };
}

async function listBackendEvents(
  endpoint: "/api/v1/events" | "/api/v1/public/events",
  role: ApiRole | null,
): Promise<WeatherEvent[]> {
  try {
    const pageSize = 200;
    const first = await backendRequest<BackendEventPage>(
      `${endpoint}?page=1&page_size=${pageSize}`,
      role,
    );
    const remaining = await Promise.all(
      Array.from({ length: Math.max(0, first.total_pages - 1) }, (_, index) =>
        backendRequest<BackendEventPage>(
          `${endpoint}?page=${index + 2}&page_size=${pageSize}`,
          role,
        ),
      ),
    );
    return [first, ...remaining].flatMap((page) => page.items.map(mapBackendEvent));
  } catch (error) {
    console.warn("Falling back to demo events because the backend is unavailable.", error);
    const fallbackError =
      error instanceof BackendApiError && error.status !== 0
        ? `Live event API request failed (HTTP ${error.status}).`
        : "Live event API is unavailable because of a network error.";
    return repo.events().map((event) => ({ ...event, origin: "demo", originError: fallbackError }));
  }
}

function mapBackendReport(report: BackendReport, eventId?: string): Report {
  return {
    id: report.id,
    eventId: report.eventId ?? eventId ?? null,
    text: report.text,
    language: report.language,
    location: report.location,
    lat: report.lat,
    lng: report.lng,
    reportedAt: report.reportedAt,
    hasMedia: report.hasMedia,
    status: report.status as ReportStatus,
    sourceId: report.sourceId,
    sourceName: report.sourceName,
    sourceType: report.sourceType as Report["sourceType"],
    sourceAccount: report.sourceAccount,
    receivedAt: report.receivedAt,
    media: report.media.map((media) => ({ id: media.id, kind: media.kind as "image" | "video" })),
    aiClassification: report.aiClassification as EventType | null,
    aiConfidence: report.aiConfidence,
    duplicateStatus: report.duplicateStatus as Report["duplicateStatus"],
    ...(report.duplicateOf ? { duplicateOf: report.duplicateOf } : {}),
    ...(report.similarity !== null ? { similarity: report.similarity } : {}),
    ...(report.severity ? { severity: report.severity as Severity } : {}),
    ...(report.priority ? { priority: report.priority } : {}),
    ...(report.reviewer_id !== undefined ? { reviewerId: report.reviewer_id } : {}),
    ...(report.reviewer_name !== undefined ? { reviewerName: report.reviewer_name } : {}),
    ...(report.assigned_at !== undefined ? { assignedAt: report.assigned_at } : {}),
  };
}

function mapCitizenSubmission(report: BackendCitizenSubmission): CitizenSubmission {
  return {
    id: report.id,
    hazard: report.hazard,
    description: report.description,
    location: report.location ?? "",
    ...(report.lat !== null ? { lat: report.lat } : {}),
    ...(report.lng !== null ? { lng: report.lng } : {}),
    language: report.language,
    observedAt: report.observedAt,
    submittedAt: report.submittedAt,
    status: report.status,
    receivedAt: report.submittedAt,
    media: report.media.map((media) => ({
      ...(media.name ? { name: media.name } : {}),
      kind: media.kind as "image" | "video",
      key: media.key ?? "",
    })),
  };
}

function mapCitizenReportDetail(report: BackendReport): CitizenSubmission {
  return {
    id: report.id,
    hazard: report.aiClassification,
    description: report.text,
    location: report.location,
    ...(report.lat !== null ? { lat: report.lat } : {}),
    ...(report.lng !== null ? { lng: report.lng } : {}),
    language: report.language,
    observedAt: report.reportedAt,
    submittedAt: report.receivedAt,
    status: report.status,
    receivedAt: report.receivedAt,
    media: report.media.map((media) => ({
      kind: media.kind as "image" | "video",
      key: media.id,
    })),
  };
}

export interface EventService {
  list(): Promise<WeatherEvent[]>;
  publicList(): Promise<WeatherEvent[]>;
  get(id: string): Promise<WeatherEvent | null>;
  subscribe(onMessage: (message: EventStreamMessage) => void): () => void;
}
export type EventStreamMessage = { type: string; event_id?: string; [key: string]: unknown };
export interface ReportService {
  list(): Promise<Report[]>;
  byEvent(eventId: string): Promise<Report[]>;
  resolveDuplicate(id: string, r: "merged" | "ignored", role: ApiRole): Promise<void>;
}
export interface AlertService {
  list(): Promise<WeatherAlert[]>;
  get(id: string): Promise<WeatherAlert | null>;
}
export interface SourceService {
  list(): Promise<DataSource[]>;
  health(): Promise<BackendSourceHealth[]>;
}
export interface VerificationService {
  decisions(): Promise<VerificationDecision[]>;
  aiAnalysis(reportId: string, role: ApiRole): Promise<AIAnalysis>;
  runAiAnalysis(reportId: string, role: ApiRole): Promise<AIAnalysis>;
  reportQueue(role: ApiRole, filters: ReviewQueueFilters): Promise<ReviewQueuePage>;
  reviewers(role: ApiRole): Promise<ReviewerOption[]>;
  assignmentHistory(reportId: string, role: ApiRole): Promise<ReviewAssignmentRecord[]>;
  assignReviewer(
    reportId: string,
    input: { reviewerId: string | null; reason: string },
    role: ApiRole,
  ): Promise<ReviewAssignmentRecord[]>;
  reportAudit(reportId: string, role: ApiRole): Promise<ReportAuditEvent[]>;
  reportEvidence(reportId: string, role: ApiRole): Promise<ReportEvidence[]>;
  decide(
    input: {
      eventId: string;
      action: DecisionAction;
      reason: string;
      targetEventId?: string;
    },
    role: ApiRole,
  ): Promise<VerificationDecision>;
  decideReport(
    input: { reportId: string; action: ReportReviewAction; reason: string },
    role: ApiRole,
  ): Promise<VerificationDecision>;
}
export interface ReportAuditEvent {
  id: string;
  at: string;
  actor: string;
  role: string;
  action: string;
  reason: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
}
export interface ReportEvidence {
  id: string;
  source: string;
  sourceCode: string;
  sourceType: string;
  summary: string;
  observedAt: string;
  distanceKm: number;
  minutesApart: number;
  reliability: number | null;
  status: string;
  classification: "POTENTIAL_CONTEXT";
  note: string;
  lat: number | null;
  lng: number | null;
  geometry?: EventGeometry | null;
}
export interface SearchService {
  search(q: string): Promise<SearchResult[]>;
}

export const eventService: EventService = {
  list: () => listBackendEvents("/api/v1/events", "analyst"),
  publicList: () => listBackendEvents("/api/v1/public/events", null),
  subscribe: (onMessage) => {
    let active = true;
    let socket: WebSocket | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let attempts = 0;

    const scheduleReconnect = () => {
      if (!active || retryTimer) return;
      const delayMs = Math.min(30_000, 1_000 * 2 ** Math.min(attempts++, 5));
      retryTimer = setTimeout(() => {
        retryTimer = undefined;
        void connect();
      }, delayMs);
    };

    const connect = async () => {
      try {
        const token = await getApiToken("analyst");
        if (!active) return;
        const configuredUrl = (import.meta.env as Record<string, string | undefined>)[
          "VITE_WS_URL"
        ];
        const url = new URL(configuredUrl || "/api/v1/stream/events", apiBaseUrl());
        if (url.protocol === "https:") url.protocol = "wss:";
        else if (url.protocol === "http:") url.protocol = "ws:";
        socket = new WebSocket(url.toString(), ["hikari-auth", token]);
        socket.onopen = () => {
          attempts = 0;
        };
        socket.onmessage = (event) => {
          try {
            const message = JSON.parse(String(event.data)) as EventStreamMessage;
            if (typeof message.type === "string") onMessage(message);
          } catch {
            // Ignore malformed or non-JSON stream frames.
          }
        };
        socket.onclose = scheduleReconnect;
        socket.onerror = () => socket?.close();
      } catch {
        scheduleReconnect();
      }
    };

    void connect();
    return () => {
      active = false;
      if (retryTimer) clearTimeout(retryTimer);
      socket?.close();
    };
  },
  get: async (id) => {
    try {
      return mapBackendEvent(await backendRequest<BackendEvent>(`/api/v1/events/${id}`, "analyst"));
    } catch (error) {
      if (error instanceof BackendApiError && error.status === 404) return repo.event(id);
      if (error instanceof Error) {
        console.warn(`Falling back to demo event ${id} because the backend is unavailable.`, error);
        return repo.event(id);
      }
      return repo.event(id);
    }
  },
};
export const reportService: ReportService = {
  list: async () =>
    (await backendRequest<BackendReport[]>("/api/v1/reports", "analyst")).map((report) =>
      mapBackendReport(report),
    ),
  byEvent: async (id) =>
    (
      await backendRequest<BackendReport[]>(
        `/api/v1/events/${encodeURIComponent(id)}/reports`,
        "analyst",
      )
    ).map((report) => mapBackendReport(report, id)),
  resolveDuplicate: async (id, resolution, role) => {
    await backendRequest(
      `/api/v1/reports/${encodeURIComponent(id)}/duplicate?resolution=${resolution}`,
      role,
      {
        method: "POST",
      },
    );
  },
};
function mapBackendAlert(alert: BackendAlert): WeatherAlert {
  return {
    id: alert.id,
    title: alert.title,
    region: alert.region,
    detail: alert.detail,
    severity: alert.severity as Severity,
    issuedAt: alert.issuedAt ?? "—",
    expiresAt: alert.expiresAt ?? "—",
    issuer: alert.issuer,
    eventId: alert.eventId ?? "",
    instructions: alert.instructions,
    alertType: alert.alertType,
    affectedArea: alert.affectedArea,
    message: alert.message,
    status: alert.status as WeatherAlert["status"],
    recipients: alert.recipients,
    channels: alert.channels,
  };
}

export const alertService: AlertService = {
  list: async () => {
    try {
      return (await backendRequest<BackendAlert[]>("/api/v1/public/alerts", null)).map(
        mapBackendAlert,
      );
    } catch (error) {
      console.warn("Falling back to demo alerts because the backend is unavailable.", error);
      return repo.alerts();
    }
  },
  get: async (id) => {
    try {
      return mapBackendAlert(await backendRequest<BackendAlert>(`/api/v1/alerts/${id}`, "analyst"));
    } catch (error) {
      if (error instanceof BackendApiError && error.status === 404) return repo.alert(id);
      console.warn(`Falling back to demo alert ${id} because the backend is unavailable.`, error);
      return repo.alert(id);
    }
  },
};

export type BackendSource = {
  id: string;
  name: string;
  kind: string;
  status: string;
  reliability: number;
  throughput: string;
  lastSync: string;
  description: string;
  health: string;
};

export type BackendSourceHealth = {
  source_id: string;
  code: string;
  status: string;
  last_success: string | null;
  last_failure: string | null;
  latency_ms: number;
  records_received: number;
  records_processed: number;
  error_count: number;
  last_error: string | null;
  is_live: boolean;
  note: string;
};

export type WeatherObservationResponse = {
  items: WeatherObservation[];
  total: number;
  source: {
    code: string;
    status: string;
    lastSuccess: string | null;
    recordsReceived: number;
    recordsProcessed: number;
    errorCount: number;
    lastError: string | null;
    recordsPersisted: number;
  };
};

export type WeatherLocationResult = LiveWeatherLocation & {
  id: number | null;
  country: string | null;
  countryCode: string | null;
  admin1: string | null;
  admin2: string | null;
  admin3: string | null;
  timezone: string | null;
};

type ForecastValues = { time: string[]; [field: string]: Array<string | number | null> };

export type LiveWeatherResponse = {
  requested: { latitude: number; longitude: number };
  coordinates: { latitude: number; longitude: number };
  location: string | null;
  timezone: string | null;
  current: Record<string, string | number | null>;
  hourly: ForecastValues;
  daily: ForecastValues;
  fetchedAt: string;
  provider: string;
  attribution: string;
};

export type SatelliteObservationsResponse = {
  items: SatelliteObservation[];
  total: number;
  source: {
    code: string;
    status: string;
    lastSuccess: string | null;
    recordsReceived: number;
    recordsProcessed: number;
    errorCount: number;
    lastError: string | null;
    recordsPersisted: number;
  };
};

export type OfficialAlertsResponse = {
  items: OfficialAlertRecord[];
  total: number;
  source: {
    code: string;
    status: string;
    lastSuccess: string | null;
    recordsReceived: number;
    recordsProcessed: number;
    errorCount: number;
    lastError: string | null;
    recordsPersisted: number;
  };
};

export type DisasterSummaryResponse = {
  status: "completed" | "empty";
  summary: string | null;
  precautions: string[];
  sources: {
    name: string;
    status: "available" | "stale" | "unavailable";
    latestAt: string | null;
    records: number;
  }[];
  limitations: string[];
  advisory: true;
  model: string;
};

export const weatherService = {
  observations: () =>
    backendRequest<WeatherObservationResponse>("/api/v1/weather/observations?limit=200", null),
  searchLocations: (query: string, signal?: AbortSignal) => {
    const params = new URLSearchParams({ q: query });
    return backendRequest<{ items: WeatherLocationResult[]; source: string }>(
      `/api/v1/weather/locations?${params.toString()}`,
      null,
      signal ? { signal } : {},
    );
  },
  live: (location: LiveWeatherLocation, signal?: AbortSignal, refresh = false) => {
    const params = new URLSearchParams({
      latitude: String(location.latitude),
      longitude: String(location.longitude),
      location: location.name,
      refresh: String(refresh),
    });
    return backendRequest<LiveWeatherResponse>(
      `/api/v1/weather/live?${params.toString()}`,
      null,
      signal ? { signal } : {},
    );
  },
  satelliteObservations: () =>
    backendRequest<SatelliteObservationsResponse>("/api/v1/satellite/observations?limit=500", null),
};

export const officialAlertService = {
  list: () =>
    backendRequest<OfficialAlertsResponse>("/api/v1/official-alerts?active_only=true", null),
};

export const aiSummaryService = {
  analyze: () =>
    backendRequest<DisasterSummaryResponse>("/api/v1/ai/analyze", null, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    }),
};

export const sourceService: SourceService = {
  list: async () =>
    (await backendRequest<BackendSource[]>("/api/v1/sources", "analyst")).map((source) => ({
      id: source.id,
      name: source.name,
      kind: source.kind,
      status: source.status as DataSource["status"],
      reliability: Number(source.reliability) || 0,
      throughput: source.throughput,
      lastSync: source.lastSync,
      description: source.description,
    })),
  health: () => backendRequest<BackendSourceHealth[]>("/api/v1/sources/health", "analyst"),
};
export const verificationService: VerificationService = {
  decisions: async () =>
    backendRequest<VerificationDecision[]>("/api/v1/verification/decisions", "analyst"),
  aiAnalysis: (reportId, role) =>
    backendRequest<AIAnalysis>(`/api/v1/ai/reports/${encodeURIComponent(reportId)}`, role),
  runAiAnalysis: (reportId, role) =>
    backendRequest<AIAnalysis>(`/api/v1/ai/reports/${encodeURIComponent(reportId)}/analyze`, role, {
      method: "POST",
    }),
  reportQueue: async (role, filters) => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(filters)) {
      if (value !== undefined && value !== "") params.set(key, String(value));
    }
    const page = await backendRequest<BackendReviewQueuePage>(
      `/api/v1/verification/reports/queue?${params.toString()}`,
      role,
    );
    return { ...page, items: page.items.map((report) => mapBackendReport(report)) };
  },
  reviewers: (role) => backendRequest<ReviewerOption[]>("/api/v1/verification/reviewers", role),
  assignmentHistory: (reportId, role) =>
    backendRequest<ReviewAssignmentRecord[]>(
      `/api/v1/verification/reports/${encodeURIComponent(reportId)}/assignments`,
      role,
    ),
  assignReviewer: (reportId, input, role) =>
    backendRequest<ReviewAssignmentRecord[]>(
      `/api/v1/verification/reports/${encodeURIComponent(reportId)}/assignment`,
      role,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reviewer_id: input.reviewerId, reason: input.reason }),
      },
    ),
  reportAudit: (reportId, role) =>
    backendRequest<ReportAuditEvent[]>(
      `/api/v1/verification/reports/${encodeURIComponent(reportId)}/audit`,
      role,
    ),
  reportEvidence: (reportId, role) =>
    backendRequest<ReportEvidence[]>(
      `/api/v1/verification/reports/${encodeURIComponent(reportId)}/evidence`,
      role,
    ),
  decide: async (input, role) =>
    backendRequest<VerificationDecision>("/api/v1/verification/decide", role, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }),
  decideReport: async ({ reportId, action, reason }, role) =>
    backendRequest<VerificationDecision>(
      `/api/v1/verification/reports/${encodeURIComponent(reportId)}/decide`,
      role,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, reason }),
      },
    ),
};

export const PENDING: WeatherEvent["verification"][] = [
  "needs_review",
  "low_confidence",
  "escalated",
  "needs_more_evidence",
  "under_review",
];
export const isClosed = (e: WeatherEvent) =>
  e.verification === "rejected" || e.verification === "merged";

/** KPIs derived from the same dataset every page uses. */
export function deriveKpis(events: WeatherEvent[], alerts: WeatherAlert[]): Metric[] {
  const ids = new Set(events.map((e) => e.id));
  const live = events.filter((e) => !isClosed(e));
  const vals = [
    events.reduce((s, e) => s + e.reports, 0),
    live.length,
    events.filter((e) => e.verification === "verified").length,
    events.filter((e) => PENDING.includes(e.verification)).length,
    live.filter((e) => e.severity === "high" || e.severity === "critical").length,
    alerts.filter((a) => a.status === "active" && ids.has(a.eventId)).length,
  ];
  return demoMetrics.map(({ delta: _d, ...m }, i) => ({
    ...m,
    value: vals[i]!.toLocaleString("en-IN"),
    hint: "derived",
  }));
}

function mapBackendMetric(metric: BackendMetric): Metric {
  return {
    label: metric.label,
    value: metric.value,
    ...(metric.hint ? { hint: metric.hint } : {}),
    spark: metric.spark ?? [0],
  };
}

export const searchService: SearchService = {
  search: async (q) => {
    const s = q.trim().toLowerCase();
    if (s.length < 2) return [];
    const hit = (...xs: (string | null | undefined)[]) =>
      xs.some((x) => x?.toLowerCase().includes(s));
    const [ev, reports] = await Promise.all([eventService.list(), reportService.list()]);
    const out: SearchResult[] = [
      ...ev
        .filter((e) =>
          hit(e.id, e.title, e.location, e.district, e.state, EVENT_TYPE_LABEL[e.type], e.type),
        )
        .map((e) => ({
          kind: "event" as const,
          id: e.id,
          title: EVENT_TYPE_LABEL[e.type],
          location: `${e.location}, ${e.state ?? "Unknown state"}`,
          status: e.verification,
        })),
      ...repo
        .alerts()
        .filter((a) => hit(a.id, a.title, a.affectedArea, a.eventId))
        .map((a) => ({
          kind: "alert" as const,
          id: a.id,
          title: a.title,
          location: a.affectedArea,
          status: a.status,
          eventId: a.eventId,
        })),
      ...reports
        .filter((r) => hit(r.id))
        .map((r) => ({
          kind: "report" as const,
          id: r.id,
          title: `${r.sourceName} report`,
          location: r.location,
          status: r.status,
          ...(r.eventId ? { eventId: r.eventId } : {}),
        })),
    ];
    return out.slice(0, 12);
  },
};

export const analyticsService = {
  metrics: async () =>
    (await backendRequest<BackendMetric[]>("/api/v1/stats/kpis", "analyst")).map(mapBackendMetric),
  ingestion: () => delay(demoIngestion),
  rainfallByRegion: () => delay(demoRainfallByRegion),
  eventsByType: async () =>
    backendRequest<Array<{ name: string; value: number }>>("/api/v1/stats/by-type", "analyst"),
  verificationTrend: () => delay(demoVerificationTrend),
  stateIntensity: () => delay(demoStateIntensity),
};

// ---------- audit, citizen submissions, alert management (DEMO) ----------
import type { AlertInput, AuditEntry, CitizenSubmission } from "@/types";
export const auditService = {
  list: (): Promise<AuditEntry[]> => delay(repo.audit()),
  roleChanged: (from: string, to: string) => repo.recordRoleChange(from, to),
  userRole: (id: string, name: string, from: string, to: string) =>
    repo.setUserRole(id, name, from, to),
};
export const submissionService = {
  list: async (): Promise<CitizenSubmission[]> =>
    (await backendRequest<BackendCitizenSubmission[]>("/api/v1/citizen/reports", "citizen")).map(
      mapCitizenSubmission,
    ),
  get: async (id: string): Promise<CitizenSubmission | null> => {
    try {
      return mapCitizenReportDetail(
        await backendRequest<BackendReport>(
          `/api/v1/citizen/reports/${encodeURIComponent(id)}`,
          "citizen",
        ),
      );
    } catch (error) {
      if (error instanceof BackendApiError && error.status === 404) return null;
      throw error;
    }
  },
  mediaUrl: async (id: string, role: ApiRole) => {
    const token = await getApiToken(role);
    const response = await fetch(`${apiBaseUrl()}/api/v1/media/${encodeURIComponent(id)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) throw new BackendApiError("Evidence could not be opened.", response.status);
    return URL.createObjectURL(await response.blob());
  },
  submit: async (input: CitizenReportInput & { triage?: CitizenSubmission["triage"] }) => {
    const body = new FormData();
    body.set("description", input.description);
    body.set("event_type", input.eventType);
    body.set("location_text", input.locationText);
    if (input.latitude !== undefined) body.set("latitude", String(input.latitude));
    if (input.longitude !== undefined) body.set("longitude", String(input.longitude));
    if (input.occurredAt) body.set("occurred_at", input.occurredAt);
    input.files.forEach((file) => body.append("files", file, file.name));
    const response = await backendRequest<BackendReportAccepted>(
      "/api/v1/citizen/reports",
      "citizen",
      {
        method: "POST",
        body,
      },
    );
    return {
      id: response.report_id,
      hazard: input.eventType,
      description: input.description,
      location: input.locationText,
      ...(input.latitude !== undefined ? { lat: input.latitude } : {}),
      ...(input.longitude !== undefined ? { lng: input.longitude } : {}),
      language: "en",
      observedAt: input.occurredAt ?? new Date().toISOString(),
      media: input.files.map((file) => ({
        name: file.name,
        size: file.size,
        kind: file.type.startsWith("video/") ? ("video" as const) : ("image" as const),
        key: file.name,
      })),
      status: response.status,
      message: response.message,
      receivedAt: new Date().toISOString(),
      ...(input.triage ? { triage: input.triage } : {}),
    };
  },
};

export interface AdminUser {
  id: string;
  username: string;
  display_name: string;
  email: string | null;
  roles: string[];
  is_active: boolean;
}

export interface RolePermissionMatrixRow {
  name: string;
  permissions: string[];
}

export const adminService = {
  users: (role: ApiRole, query = "") => {
    const params = new URLSearchParams();
    if (query.trim()) params.set("q", query.trim());
    return backendRequest<AdminUser[]>(
      `/api/v1/users${params.size ? `?${params.toString()}` : ""}`,
      role,
    );
  },
  rolePermissions: (role: ApiRole) =>
    backendRequest<RolePermissionMatrixRow[]>("/api/v1/rbac/roles", role),
  setUserRole: (userId: string, nextRole: string, role: ApiRole) =>
    backendRequest<{ id: string; roles: string[] }>(
      `/api/v1/users/${encodeURIComponent(userId)}/role`,
      role,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: nextRole }),
      },
    ),
  setUserActive: (userId: string, isActive: boolean, role: ApiRole) =>
    backendRequest<{ id: string; is_active: boolean }>(
      `/api/v1/users/${encodeURIComponent(userId)}/status`,
      role,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: isActive }),
      },
    ),
};
export const alertAdminService = {
  save: async (input: AlertInput & { id?: string }) => repo.saveAlert(input),
  setStatus: async (id: string, status: WeatherAlert["status"]) => repo.setAlertStatus(id, status),
};
