import type { UserRole } from "./index";

export type ExamAvailabilityStatus =
  | "upcoming"
  | "ready"
  | "verification_required"
  | "in_progress"
  | "submitted"
  | "unavailable"
  | "expired"
  | "blocked";

export type AttemptStatus =
  | "not_started"
  | "starting"
  | "in_progress"
  | "paused"
  | "submitted"
  | "locked"
  | "reset_by_teacher"
  | "abandoned";

export type ReadinessStatus =
  | "not_checked"
  | "checking"
  | "ready"
  | "missing_camera"
  | "missing_microphone"
  | "screen_permission_required"
  | "permission_denied"
  | "server_unreachable"
  | "blocked";

export type IdentityVerificationStatus =
  | "not_started"
  | "camera_required"
  | "liveness_pending"
  | "verifying"
  | "verified"
  | "failed"
  | "expired";

export type MonitoringStatus =
  | "inactive"
  | "starting"
  | "active"
  | "degraded"
  | "permission_revoked"
  | "stopping"
  | "stopped"
  | "failed";

export type MonitorState =
  | "idle"
  | "starting"
  | "active"
  | "degraded"
  | "failed"
  | "stopping";

export type ExamMonitorName =
  | "screen"
  | "camera"
  | "microphone"
  | "application_security"
  | "ai_model"
  | "backend_heartbeat"
  | "event_socket";

export type ExamMonitorErrorCode =
  | "not_implemented"
  | "unsupported"
  | "start_failed"
  | "health_check_failed"
  | "inactive"
  | "required_monitor_failed"
  | "optional_monitor_degraded"
  | "cleanup_failed";

export interface MonitorStatus {
  name: ExamMonitorName;
  state: MonitorState;
  required: boolean;
  checkedAt: string;
  message: string;
  errorCode?: ExamMonitorErrorCode | string;
  metadata?: Record<string, unknown>;
}

export interface HealthCheckResult {
  healthy: boolean;
  state: MonitorState;
  checkedAt: string;
  message: string;
  errorCode?: ExamMonitorErrorCode | string;
  metadata?: Record<string, unknown>;
}

export interface SuspicionEvent {
  ruleId: string;
  scoreDelta: number;
  totalSuspicionScore: number;
  severity: "low" | "medium" | "high";
  occurredAt: string;
  evidenceReference?: string;
}

export type SubmissionStatus =
  | "not_started"
  | "draft_saved"
  | "submitting"
  | "submitted"
  | "queued_offline"
  | "failed";

export interface ExamMonitoringPolicy {
  requireCamera: boolean;
  requireMicrophone: boolean;
  requireScreenCapture: boolean;
  requireIdentityVerification: boolean;
  requireLivenessChecks: boolean;
  allowOfflineDrafts: boolean;
  allowMultipleDisplays: boolean;
  telemetryIntervalMs: number;
  screenSnapshotIntervalMs: number;
}

export type ApiErrorCode =
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "validation_error"
  | "network_error"
  | "server_error"
  | "unknown";

export interface ApiErrorResult {
  ok: false;
  code: ApiErrorCode;
  message: string;
  status?: number;
  details?: unknown;
}

export interface StudentExamRouteParams {
  examId: string;
}

export type RouteAuthState =
  | { status: "loading" }
  | { status: "anonymous" }
  | { status: "authenticated"; role: UserRole; studentId?: string | null; activeExamId?: string | null };

export type ConsentStatus = "not_requested" | "accepted" | "rejected" | "expired";

export type PermissionCapability =
  | "camera"
  | "microphone"
  | "screen_capture"
  | "face_verification"
  | "application_security"
  | "network_telemetry"
  | "ai_assisted_monitoring";

export type PermissionCapabilityStatus = "not_requested" | "required" | "not_required" | "granted" | "denied";

export type MonitoringStartupStatus =
  | "not_started"
  | "pending"
  | "starting"
  | "active"
  | "failed"
  | "stopped";

export type ReadinessCheckState =
  | "pending"
  | "checking"
  | "passed"
  | "warning"
  | "failed"
  | "unsupported";

export type ReadinessCheckId =
  | "camera_availability"
  | "microphone_availability"
  | "display_configuration"
  | "screen_capture_support"
  | "camera_permission"
  | "microphone_permission"
  | "screen_capture_permission"
  | "backend_availability"
  | "backend_latency"
  | "application_version_compatibility"
  | "device_id_availability"
  | "encrypted_draft_storage_availability"
  | "system_time_difference"
  | "required_ai_model_availability";

export type ReadinessErrorCode =
  | "not_found"
  | "permission_denied"
  | "permission_prompt_required"
  | "network_error"
  | "latency_high"
  | "version_incompatible"
  | "missing_device_id"
  | "multiple_displays"
  | "not_implemented"
  | "unsupported_platform"
  | "adapter_exception";

export interface ReadinessCheckResult {
  checkId: ReadinessCheckId;
  label: string;
  state: ReadinessCheckState;
  errorCode?: ReadinessErrorCode;
  message: string;
  remediation: string;
  checkedAt: string;
  retryable: boolean;
  required: boolean;
  rawDiagnostic: Record<string, unknown>;
}

export type ReadinessReportStatus = "pending" | "checking" | "ready" | "warning" | "blocked";

export interface DeviceReadinessReport {
  studentId: string;
  examId: string;
  attemptId?: string | null;
  deviceId?: string | null;
  policyVersion: string;
  configurationFingerprint: string;
  status: ReadinessReportStatus;
  canStartExam: boolean;
  startedAt: string;
  completedAt?: string | null;
  results: ReadinessCheckResult[];
}

export type NetworkProbeErrorCode =
  | "timeout"
  | "dns_resolution"
  | "connection_refused"
  | "tls_failure"
  | "invalid_response"
  | "http_failure"
  | "unauthorized"
  | "server_unavailable"
  | "configuration_missing"
  | "offline"
  | "network_error";

export interface NetworkProbeResult {
  reachable: boolean;
  latencyMs?: number;
  statusCode?: number;
  checkedAt: string;
  errorCode?: NetworkProbeErrorCode | string;
  message?: string;
}

export type IdentityVerificationCode =
  | "VERIFIED"
  | "FACE_NOT_REGISTERED"
  | "FACE_MISMATCH"
  | "MODEL_UNAVAILABLE"
  | "CAMERA_UNAVAILABLE"
  | "PERMISSION_DENIED"
  | "LOW_QUALITY_CAPTURE"
  | "LIVENESS_FAILED"
  | "EXPIRED"
  | "SCOPE_MISMATCH";

export type IdentityVerificationMethod = "face_match" | "development_simulation";

export interface IdentityVerificationResultRecord {
  matched: boolean;
  code: IdentityVerificationCode;
  message: string;
  studentId: string;
  examId: string;
  attemptId: string;
  deviceId: string;
  verificationTimestamp: string;
  verificationMethod: IdentityVerificationMethod;
  verificationPolicyVersion: string;
  expiresAt: string;
}

export interface ExamPreparationConsentRecord {
  status: ConsentStatus;
  consentPolicyVersion: string;
  consentTimestamp: string;
  studentId: string;
  examId: string;
  attemptId?: string | null;
  deviceId?: string | null;
}

export interface ExamPreparationReadinessReport {
  status: ReadinessStatus;
  checkedAt?: string | null;
  missingCapabilities: PermissionCapability[];
  notes: string[];
  deviceReport?: DeviceReadinessReport | null;
}

export interface ExamPreparationPermissionStatus {
  camera: PermissionCapabilityStatus;
  microphone: PermissionCapabilityStatus;
  screenCapture: PermissionCapabilityStatus;
  faceVerification: PermissionCapabilityStatus;
  applicationSecurity: PermissionCapabilityStatus;
  networkTelemetry: PermissionCapabilityStatus;
  aiAssistedMonitoring: PermissionCapabilityStatus;
}

export interface ExamPreparationState {
  selectedExamId: string;
  studentId: string;
  attemptId?: string | null;
  deviceId?: string | null;
  consent: ExamPreparationConsentRecord | null;
  readinessReport: ExamPreparationReadinessReport;
  permissionStatus: ExamPreparationPermissionStatus;
  identityVerificationStatus: IdentityVerificationStatus;
  rulesAcknowledged: boolean;
  monitoringStartupStatus: MonitoringStartupStatus;
}
