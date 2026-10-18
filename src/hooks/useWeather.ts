import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  alertAdminService,
  aiSummaryService,
  auditService,
  submissionService,
  alertService,
  officialAlertService,
  analyticsService,
  eventService,
  reportService,
  sourceService,
  verificationService,
  weatherService,
} from "@/services/api";
import type { DecisionAction, ReportReviewAction, ReviewQueueFilters } from "@/types";
import { useRole } from "@/lib/roles";
import type { Role } from "@/lib/actor";

export const metricsQuery = queryOptions({
  queryKey: ["metrics"],
  queryFn: analyticsService.metrics,
});
export const eventsQuery = queryOptions({ queryKey: ["events"], queryFn: eventService.list });
export const publicEventsQuery = queryOptions({
  queryKey: ["publicEvents"],
  queryFn: eventService.publicList,
});
export const weatherObservationsQuery = queryOptions({
  queryKey: ["weatherObservations"],
  queryFn: weatherService.observations,
  staleTime: 60_000,
  refetchInterval: 5 * 60_000,
});
export const officialAlertsQuery = queryOptions({
  queryKey: ["officialAlerts"],
  queryFn: officialAlertService.list,
  staleTime: 60_000,
  refetchInterval: 5 * 60_000,
});
export const aiSummaryQuery = queryOptions({
  queryKey: ["aiDisasterSummary"],
  queryFn: aiSummaryService.analyze,
  enabled: false,
  retry: false,
  staleTime: 5 * 60_000,
});
export const satelliteObservationsQuery = queryOptions({
  queryKey: ["satelliteObservations"],
  queryFn: weatherService.satelliteObservations,
  staleTime: 60_000,
  refetchInterval: 5 * 60_000,
});
export const eventQuery = (id: string) =>
  queryOptions({ queryKey: ["event", id], queryFn: () => eventService.get(id) });
export const reportsQuery = queryOptions({ queryKey: ["reports"], queryFn: reportService.list });
export const eventReportsQuery = (id: string) =>
  queryOptions({ queryKey: ["reports", id], queryFn: () => reportService.byEvent(id) });
export const alertsQuery = queryOptions({ queryKey: ["alerts"], queryFn: alertService.list });
export const alertQuery = (id: string) =>
  queryOptions({ queryKey: ["alert", id], queryFn: () => alertService.get(id) });
export const sourcesQuery = queryOptions({ queryKey: ["sources"], queryFn: sourceService.list });
export const decisionsQuery = queryOptions({
  queryKey: ["decisions"],
  queryFn: verificationService.decisions,
});
export const citizenReviewQueueQuery = (role: Role, filters: ReviewQueueFilters) =>
  queryOptions({
    queryKey: ["citizenReviewQueue", role, filters],
    queryFn: () => verificationService.reportQueue(role, filters),
  });
export const reportAuditQuery = (reportId: string, role: Role) =>
  queryOptions({
    queryKey: ["reportAudit", reportId, role],
    queryFn: () => verificationService.reportAudit(reportId, role),
  });
export const reportEvidenceQuery = (reportId: string, role: Role) =>
  queryOptions({
    queryKey: ["reportEvidence", reportId, role],
    queryFn: () => verificationService.reportEvidence(reportId, role),
  });
export const reviewersQuery = (role: Role) =>
  queryOptions({
    queryKey: ["reviewers", role],
    queryFn: () => verificationService.reviewers(role),
  });
export const reportAssignmentsQuery = (reportId: string, role: Role) =>
  queryOptions({
    queryKey: ["reportAssignments", reportId, role],
    queryFn: () => verificationService.assignmentHistory(reportId, role),
  });
export const ingestionQuery = queryOptions({
  queryKey: ["ingestion"],
  queryFn: analyticsService.ingestion,
});
export const rainfallQuery = queryOptions({
  queryKey: ["rainfall"],
  queryFn: analyticsService.rainfallByRegion,
});
export const eventsByTypeQuery = queryOptions({
  queryKey: ["eventsByType"],
  queryFn: analyticsService.eventsByType,
});
export const verificationTrendQuery = queryOptions({
  queryKey: ["verTrend"],
  queryFn: analyticsService.verificationTrend,
});
export const stateIntensityQuery = queryOptions({
  queryKey: ["stateIntensity"],
  queryFn: analyticsService.stateIntensity,
});

export const auditQuery = queryOptions({ queryKey: ["audit"], queryFn: auditService.list });
export const submissionsQuery = queryOptions({
  queryKey: ["submissions"],
  queryFn: submissionService.list,
});
export const submissionQuery = (id: string) =>
  queryOptions({ queryKey: ["submission", id], queryFn: () => submissionService.get(id) });

const LIVE_KEYS = [
  "events",
  "event",
  "reports",
  "alerts",
  "alert",
  "decisions",
  "metrics",
  "audit",
  "submissions",
  "submission",
  "citizenReviewQueue",
  "reportAudit",
  "reportEvidence",
  "reportAssignments",
  "reviewers",
];
const invalidateAll = (qc: ReturnType<typeof useQueryClient>) =>
  LIVE_KEYS.forEach((k) => qc.invalidateQueries({ queryKey: [k] }));

export function useSubmitReport() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: submissionService.submit, onSuccess: () => invalidateAll(qc) });
}
export function useSaveAlert() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: alertAdminService.save,
    onSuccess: (a) => {
      invalidateAll(qc);
      toast.success(`${a.id} saved`, { description: "Simulated — no SMS or email was sent" });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}
export function useAlertStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: "active" | "cancelled" }) =>
      alertAdminService.setStatus(id, status),
    onSuccess: (_, v) => {
      invalidateAll(qc);
      toast.success(`${v.id} ${v.status === "active" ? "activated" : "deactivated"}`, {
        description: "Simulated dissemination",
      });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}
export function useInvalidateAll() {
  const qc = useQueryClient();
  return () => invalidateAll(qc);
}

/** Verification decision → repository → every page refreshes from the same data. */
export function useDecide() {
  const qc = useQueryClient();
  const role = useRole();
  return useMutation({
    mutationFn: (input: Parameters<typeof verificationService.decide>[0]) => {
      if (!role) throw new Error("Choose an authenticated role before making a decision.");
      return verificationService.decide(input, role);
    },
    onSuccess: (d) => {
      LIVE_KEYS.forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
      toast.success(`${d.eventId} → ${d.toState}`, {
        description: `${d.id} · recorded in the verification audit trail`,
      });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useReportReview() {
  const qc = useQueryClient();
  const role = useRole();
  return useMutation({
    mutationFn: (input: { reportId: string; action: ReportReviewAction; reason: string }) => {
      if (!role) throw new Error("Choose an authenticated role before reviewing reports.");
      return verificationService.decideReport(input, role);
    },
    onSuccess: (decision) => {
      invalidateAll(qc);
      toast.success(`${decision.reportId} → ${decision.toState}`, {
        description: `${decision.id} · saved to the review audit trail`,
      });
    },
    onError: (error: Error) => toast.error(error.message),
  });
}

export function useAssignReviewer(reportId: string) {
  const qc = useQueryClient();
  const role = useRole();
  return useMutation({
    mutationFn: (input: { reviewerId: string | null; reason: string }) => {
      if (!role) throw new Error("Choose an authenticated role before assigning a reviewer.");
      return verificationService.assignReviewer(reportId, input, role);
    },
    onSuccess: () => {
      invalidateAll(qc);
      toast.success(`Assignment saved for ${reportId}`);
    },
    onError: (error: Error) => toast.error(error.message),
  });
}

export function useResolveDuplicate() {
  const qc = useQueryClient();
  const role = useRole();
  return useMutation({
    mutationFn: ({ id, resolution }: { id: string; resolution: "merged" | "ignored" }) => {
      if (!role) throw new Error("Choose an authenticated role before resolving duplicates.");
      return reportService.resolveDuplicate(id, resolution, role);
    },
    onSuccess: (_, v) => {
      LIVE_KEYS.forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
      toast.success(
        `${v.id} ${v.resolution === "merged" ? "merged as duplicate" : "kept as independent report"}`,
        { description: "Session-only demo change" },
      );
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export type { DecisionAction };
