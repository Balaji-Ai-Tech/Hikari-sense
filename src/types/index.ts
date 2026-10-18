export type Severity = "critical" | "high" | "medium" | "low";
export type VerificationStatus =
  | "verified"
  | "corroborated"
  | "needs_review"
  | "low_confidence"
  | "escalated"
  | "needs_more_evidence"
  | "under_review"
  | "received"
  | "processing"
  | "ai_analysis_pending"
  | "ai_analyzed"
  | "pending_human_review"
  | "rejected"
  | "merged";
export type ReportStatus = VerificationStatus;
export type EventState =
  | "DETECTED"
  | "PROCESSING"
  | "ANALYZED"
  | "CORRELATED"
  | "CORROBORATED"
  | "NEEDS_REVIEW"
  | "VERIFIED"
  | "REJECTED"
  | "MERGED";
export type SourceType = "official" | "citizen" | "external" | "scientific";
export type DecisionAction =
  "start_review" | "approve" | "verify" | "reject" | "request_evidence" | "escalate" | "merge";
export type ReportReviewAction = Extract<
  DecisionAction,
  "start_review" | "verify" | "reject" | "request_evidence" | "escalate"
>;
export type DuplicateStatus = "unique" | "suspected" | "merged" | "ignored";
export type AlertStatus = "active" | "expired" | "cancelled";
export type SystemStatus = "operational" | "degraded" | "down" | "maintenance";
export type ConnectorStatus = "connected" | "receiving" | "degraded" | "offline";
export type SourceKind = "IMD" | "Citizen" | "News/RSS" | "Satellite" | "Social" | "Sensor";
export type EventType =
  | "heavy_rainfall"
  | "flood"
  | "thunderstorm"
  | "heatwave"
  | "cyclone"
  | "strong_wind"
  | "fog"
  | "dust_storm";

export type EventGeometry =
  | { type: "Polygon"; coordinates: number[][][] }
  | { type: "MultiPolygon"; coordinates: number[][][][] };

export interface WeatherEvent {
  id: string;
  title: string;
  type: EventType;
  severity: Severity;
  verification: VerificationStatus;
  location: string;
  district: string | null;
  state: string | null;
  lat: number | null;
  lng: number | null;
  geometry?: EventGeometry | null;
  reportedAt: string; // ISO
  reports: number;
  sources: number;
  sourceKinds: SourceKind[];
  confidence: number; // 0..1
  affectedAreaKm2: number;
  images: number;
  videos: number;
  summary: string;
  lifecycleState: EventState;
  startTime: string;
  lastUpdated: string;
  reportIds: string[];
  sourceIds: string[];
  alertIds?: string[];
  decisionIds?: string[];
  mediaCount: number;
  duplicateCount: number;
  mergedInto?: string;
  lifecycle?: LifecycleStage[];
  origin?: "backend" | "demo";
  originError?: string;
  aiDisclaimer?: string;
}

export interface LifecycleStage {
  key: string;
  label: string;
  status: "done" | "current" | "pending" | "skipped";
  at: string | null; // ISO
  description: string;
  system: string;
}

export interface MediaItem {
  id: string;
  kind: "image" | "video";
}

export interface Report {
  id: string;
  eventId: string | null;
  text: string;
  language: string;
  location: string;
  lat: number | null;
  lng: number | null;
  reportedAt: string;
  hasMedia: boolean;
  status: ReportStatus;
  sourceId: string;
  sourceName: string;
  sourceType: SourceType;
  sourceAccount: string;
  receivedAt: string;
  media: MediaItem[];
  aiClassification: EventType | null;
  aiConfidence: number | null;
  duplicateStatus: DuplicateStatus;
  duplicateOf?: string;
  similarity?: number;
  severity?: Severity | null;
  priority?: "low" | "normal" | "high";
  reviewerId?: string | null;
  reviewerName?: string | null;
  assignedAt?: string | null;
  /** DEMO AI translation into English when the original is another language. */
  translation?: string;
}

export interface ReviewQueueFilters {
  status?: string;
  event_type?: string;
  severity?: string;
  location?: string;
  start_date?: string;
  end_date?: string;
  has_media?: boolean;
  ai_confidence_min?: number;
  ai_confidence_max?: number;
  source?: string;
  reviewer_id?: string;
  priority?: "low" | "normal" | "high";
  page: number;
  page_size: number;
}

export interface ReviewQueuePage {
  items: Report[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
  status_counts: Record<string, number>;
}

export interface ReviewerOption {
  id: string;
  username: string;
  display_name: string;
  roles: string[];
  is_active: boolean;
  active_assignments: number;
}

export interface ReviewAssignmentRecord {
  id: string;
  report_id: string;
  reviewer_id: string;
  reviewer_name: string;
  assigned_by_user_id: string | null;
  assigned_by_name: string;
  assigned_by_role: string;
  assigned_at: string;
  unassigned_by_user_id: string | null;
  unassigned_by_name: string | null;
  unassigned_by_role: string | null;
  unassigned_at: string | null;
  reason: string;
  active: boolean;
}
/** Kept for map/evidence components. */
export type CitizenReport = Report;

export interface VerificationDecision {
  id: string;
  eventId: string | null;
  reportId?: string;
  action: DecisionAction;
  reason: string;
  decidedAt: string;
  decidedBy: string;
  fromState: string | null;
  toState: string | null;
  targetEventId?: string;
}

export type SearchResult = {
  kind: "event" | "report" | "alert";
  id: string;
  title: string;
  location: string;
  status: string;
  eventId?: string;
};

export interface WeatherAlert {
  id: string;
  title: string;
  region: string;
  detail: string;
  severity: Severity;
  issuedAt: string; // HH:mm IST
  expiresAt: string;
  issuer: string;
  eventId: string;
  instructions: string[];
  alertType: string;
  affectedArea: string;
  message: string;
  status: AlertStatus;
  recipients: string[];
  channels: string[];
}

export interface WeatherObservation {
  id: string;
  reportId: string;
  sourceRecordId: string;
  provider: string;
  recordType: "current" | "forecast";
  observedAt: string;
  latitude: number;
  longitude: number;
  location: string | null;
  temperatureC: number | null;
  humidityPct: number | null;
  precipitationMm: number | null;
  windSpeedMs: number | null;
  windDirectionDeg: number | null;
  precipitationProbabilityPct: number | null;
  weatherCode: number | null;
  attribution: string;
}

export interface LiveWeatherLocation {
  name: string;
  latitude: number;
  longitude: number;
  accuracyMeters?: number;
}

export interface SatelliteObservation {
  id: string;
  sourceRecordId: string;
  observedAt: string;
  latitude: number;
  longitude: number;
  location: string | null;
  summary: string;
  sourceAccount: string;
  status: string;
}

export interface OfficialAlertRecord {
  id: string;
  reportId: string;
  sourceRecordId: string;
  issuer: string;
  event: string;
  urgency: string;
  severity: string;
  certainty: string;
  messageType: string;
  issuedAt: string;
  expiresAt: string | null;
  headline: string;
  description: string;
  instructions: string;
  areas: string[];
  references: string[];
  sourceUrl: string | null;
  latitude: number | null;
  longitude: number | null;
  location: string | null;
}

export interface DataSource {
  id: string;
  name: string;
  kind: string;
  status: ConnectorStatus;
  reliability: number;
  throughput: string;
  lastSync: string;
  description: string;
}

export interface Metric {
  label: string;
  value: string;
  delta?: string;
  up?: boolean;
  hint?: string;
  spark: number[];
}

export interface EventFilters {
  q: string;
  type: EventType | "all";
  severity: Severity | "all";
  verification: VerificationStatus | "all";
  state: string;
  source: SourceKind | "all";
  minConfidence: number;
  withinMinutes: number; // 0 = any
  /** PS 26069 date filter. Dates are YYYY-MM-DD (IST), times HH:MM. */
  datePreset: "all" | "today" | "yesterday" | "7d" | "30d" | "custom";
  dateFrom: string;
  dateTo: string;
  timeFrom: string;
  timeTo: string;
  district: string;
  city: string;
  /** Optional GPS area: centre + radius in km ("" = off). */
  gpsLat: string;
  gpsLng: string;
  gpsRadiusKm: string;
  /** PS 26069 source category (additional filter). */
  sourceCategory: "all" | "social" | "dataset" | "website" | "api" | "citizen";
  media: "all" | "text" | "photo" | "video";
}

export interface AuditEntry {
  id: string;
  at: string;
  actor: string;
  role: string;
  action: string;
  entity: "Event" | "Report" | "Alert" | "User";
  entityId: string;
  result: "Success" | "Failed";
  reason?: string;
  from?: string;
  to?: string;
  related?: string;
  session: string;
}
export interface UploadedMedia {
  name?: string;
  size?: number;
  kind: "image" | "video";
  key: string;
}
export interface AiTriage {
  hazard: string;
  urgency: "low" | "medium" | "high" | "critical";
  queue: string;
  confidence: number;
  rationale: string;
  usedPhoto: boolean;
}
export interface CitizenSubmission {
  triage?: AiTriage;
  triageError?: string;
  id: string;
  hazard: string | null;
  description: string;
  location: string;
  lat?: number;
  lng?: number;
  language: string;
  observedAt: string;
  submittedAt?: string;
  media: UploadedMedia[];
  contact?: string;
  status?: string;
  message?: string;
  receivedAt?: string;
}
export interface AlertInput {
  eventId: string;
  title: string;
  region: string;
  message: string;
  severity: Severity;
  issuedAt: string;
  expiresAt: string;
  instructions: string[];
  alertType: string;
  affectedArea: string;
  status: AlertStatus;
  recipients: string[];
  channels: string[];
}
