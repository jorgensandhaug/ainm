import type { HttpMethod } from "../runtime/contracts";

export const SANDBOX_PLAN_SCHEMA_VERSION = "tripletex2.sandbox-plan.v1";
export const SANDBOX_APPLY_REPORT_SCHEMA_VERSION =
  "tripletex2.sandbox-apply-report.v1";
export const SANDBOX_RESET_REPORT_SCHEMA_VERSION =
  "tripletex2.sandbox-reset-report.v1";

export type SandboxCleanupEntityType =
  | "activity"
  | "attachment"
  | "creditNote"
  | "customer"
  | "department"
  | "dimension"
  | "division"
  | "employee"
  | "employment"
  | "feeInvoice"
  | "invoice"
  | "order"
  | "product"
  | "project"
  | "projectActivity"
  | "projectHourlyRate"
  | "projectOrderline"
  | "projectSpecificRate"
  | "salaryTransaction"
  | "standardTime"
  | "supplier"
  | "targetDimensionValue"
  | "timesheetEntry"
  | "travelExpense"
  | "voucher";

export interface SandboxCleanupRef {
  entityType: SandboxCleanupEntityType;
  entityId: number;
  source: string;
  runId?: string;
  taskId?: string;
  strategyId?: string;
  details?: string;
}

export interface SandboxPlanStep {
  stepId: string;
  description?: string;
  method: HttpMethod;
  path: string;
  query?: Record<string, string | number | boolean | null>;
  body?: unknown;
  capture?: Record<string, string>;
  continueOnError?: boolean;
}

export interface SandboxPlan {
  schemaVersion: typeof SANDBOX_PLAN_SCHEMA_VERSION;
  planId: string;
  description?: string;
  initialValues?: Record<string, unknown>;
  steps: SandboxPlanStep[];
}

export interface SandboxApplyReportStep {
  stepId: string;
  method: HttpMethod;
  path: string;
  query?: Record<string, string | number | boolean | null>;
  body?: unknown;
  status: "planned" | "completed" | "failed";
  captured?: Record<string, unknown>;
  response?: unknown;
  errorMessage?: string;
}

export interface SandboxApplyReport {
  schemaVersion: typeof SANDBOX_APPLY_REPORT_SCHEMA_VERSION;
  reportId: string;
  createdAt: string;
  dryRun: boolean;
  planId: string;
  planPath?: string;
  description?: string;
  capturedValues: Record<string, unknown>;
  createdRefs: SandboxCleanupRef[];
  steps: SandboxApplyReportStep[];
}

export interface SandboxResetActionResult {
  actionId: string;
  entityType: SandboxCleanupEntityType;
  entityId: number;
  operation: "delete" | "neutralize" | "credit-note" | "reverse-voucher";
  status: "completed" | "failed" | "skipped" | "already-clean";
  path?: string;
  source: string;
  details?: string;
  errorMessage?: string;
}

export interface SandboxResetReport {
  schemaVersion: typeof SANDBOX_RESET_REPORT_SCHEMA_VERSION;
  reportId: string;
  createdAt: string;
  dryRun: boolean;
  scannedFiles: number;
  discoveredRefs: SandboxCleanupRef[];
  actionResults: SandboxResetActionResult[];
  summary: {
    completed: number;
    failed: number;
    skipped: number;
    alreadyClean: number;
  };
}
