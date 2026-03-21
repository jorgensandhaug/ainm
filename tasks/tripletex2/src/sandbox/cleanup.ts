import path from "node:path";

import type { RunArtifactV1, RunApiCall, TripletexClient } from "../runtime/contracts";
import { TripletexHttpError } from "../runtime/tripletex-client";
import {
  listFilesRecursive,
  readJsonFile,
  resolveResearchPath,
  tripletex2Root,
  writeJsonFile,
} from "../research/store";
import { createSandboxClient, type SandboxCredentials } from "./client";
import type {
  SandboxApplyReport,
  SandboxCleanupEntityType,
  SandboxCleanupRef,
  SandboxResetActionResult,
  SandboxResetReport,
} from "./types";
import { SANDBOX_RESET_REPORT_SCHEMA_VERSION } from "./types";

const EMPLOYMENT_END_REASON = "EMPLOYMENT_END_INTERNAL_CHANGE";

type CleanupOperation = "delete" | "neutralize" | "credit-note" | "reverse-voucher";

interface CleanupAction {
  actionId: string;
  entityType: SandboxCleanupEntityType;
  entityId: number;
  operation: CleanupOperation;
  priority: number;
  source: string;
}

interface ResponseWrapper<TValue> {
  value?: TValue;
}

interface ListResponse<TValue> {
  values?: TValue[];
}

interface InvoicePostingSummary {
  type?: string | null;
  description?: string | null;
  amountCurrency?: number | null;
  amount?: number | null;
  voucher?: { id?: number | null } | null;
}

interface InvoiceCleanupSummary {
  id?: number | null;
  amountCurrencyOutstanding?: number | null;
  amountOutstanding?: number | null;
  postings?: InvoicePostingSummary[] | null;
}

interface EmployeeCleanupSummary {
  id?: number;
  email?: string;
  userType?: string;
  employments?: Array<{ id?: number }>;
}

interface EmploymentCleanupSummary {
  id?: number;
  startDate?: string;
  endDate?: string;
  employee?: { id?: number };
}

interface DivisionCleanupSummary {
  id?: number;
  endDate?: string;
}

export function deriveCreatedRefsFromResponse(input: {
  method: "POST" | "PUT";
  path: string;
  response: unknown;
  source: string;
  runId?: string;
  taskId?: string;
  strategyId?: string;
}): SandboxCleanupRef[] {
  const refs = deriveBaseRefsFromResponse(input);
  if (input.path === "/project/projectActivity") {
    const activityId = readNumberAtPath(input.response, "value.activity.id");
    if (activityId !== undefined) {
      refs.push({
        entityType: "activity",
        entityId: activityId,
        source: input.source,
        ...(input.runId ? { runId: input.runId } : {}),
        ...(input.taskId ? { taskId: input.taskId } : {}),
        ...(input.strategyId ? { strategyId: input.strategyId } : {}),
      });
    }
  }
  if (input.path === "/employee") {
    const employmentId = readNumberAtPath(input.response, "value.employments.0.id");
    if (employmentId !== undefined) {
      refs.push({
        entityType: "employment",
        entityId: employmentId,
        source: input.source,
        ...(input.runId ? { runId: input.runId } : {}),
        ...(input.taskId ? { taskId: input.taskId } : {}),
        ...(input.strategyId ? { strategyId: input.strategyId } : {}),
      });
    }
  }
  return dedupeRefs(refs);
}

export async function runBestEffortSandboxCleanup(input: {
  credentials: SandboxCredentials;
  dryRun?: boolean;
  now?: () => Date;
  reportRoot?: string;
  client?: TripletexClient;
  files?: readonly string[];
}): Promise<{ report: SandboxResetReport; reportPath: string }> {
  const createdAt = resolveNow(input.now).toISOString();
  const reportId = `sandbox-reset-${createdAt.replaceAll(":", "-").replaceAll(".", "-")}`;
  const reportPath = path.join(
    input.reportRoot ?? resolveResearchPath("sandbox", "reset"),
    `${reportId}.json`,
  );
  const files = input.files ? [...input.files] : await collectSandboxEvidenceFiles();
  const refs = await collectRefsFromFiles(files);
  const actions = buildCleanupActions(refs);
  const client = input.client ?? createSandboxClient(input.credentials);
  const actionResults = input.dryRun
    ? actions.map<SandboxResetActionResult>((action) => ({
        actionId: action.actionId,
        entityType: action.entityType,
        entityId: action.entityId,
        operation: action.operation,
        status: "skipped",
        source: action.source,
        details: "dry-run",
      }))
    : await executeCleanupActions(client, actions, createdAt.slice(0, 10));
  const report: SandboxResetReport = {
    schemaVersion: SANDBOX_RESET_REPORT_SCHEMA_VERSION,
    reportId,
    createdAt,
    dryRun: input.dryRun === true,
    scannedFiles: files.length,
    discoveredRefs: refs,
    actionResults,
    summary: {
      completed: actionResults.filter((result) => result.status === "completed").length,
      failed: actionResults.filter((result) => result.status === "failed").length,
      skipped: actionResults.filter((result) => result.status === "skipped").length,
      alreadyClean: actionResults.filter((result) => result.status === "already-clean").length,
    },
  };
  await writeJsonFile(reportPath, report);
  return { report, reportPath };
}

export function formatResetReportForResearch(input: {
  taskId: string;
  strategyId: string;
  report: SandboxResetReport;
  reportPath?: string;
  durationMs?: number;
}): {
  command: string;
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs?: number;
  highlights: string[];
} {
  const summaryLine = `research sandbox reset summary: ${JSON.stringify({
    taskId: input.taskId,
    strategyId: input.strategyId,
    scannedFiles: input.report.scannedFiles,
    discoveredRefs: input.report.discoveredRefs.length,
    completed: input.report.summary.completed,
    failed: input.report.summary.failed,
    skipped: input.report.summary.skipped,
    alreadyClean: input.report.summary.alreadyClean,
    ...(input.reportPath ? { reportPath: input.reportPath } : {}),
  })}`;
  const resultLines = input.report.actionResults.slice(0, 20).map((result) =>
    [
      "sandbox-action",
      result.status,
      result.operation,
      result.entityType,
      result.entityId,
      result.source,
      result.errorMessage ?? result.details ?? "",
    ].join("\t"),
  );
  const stdoutLines = [
    summaryLine,
    ...(resultLines.length > 0
      ? resultLines
      : ["research sandbox reset: no sandbox-backed cleanup targets were discovered."]),
  ];
  const stderrLines = input.report.actionResults
    .filter((result) => result.status === "failed" && result.errorMessage)
    .map((result) => `reset warning: ${result.entityType} ${result.entityId}: ${result.errorMessage}`);
  return {
    command: `bun scripts/sandbox.ts reset --task ${input.taskId} --strategy ${input.strategyId}`,
    exitCode: input.report.summary.failed > 0 ? 1 : 0,
    stdout: joinLines(stdoutLines),
    stderr: joinLines(stderrLines),
    ...(input.durationMs !== undefined ? { durationMs: input.durationMs } : {}),
    highlights: [...stdoutLines, ...stderrLines].slice(0, 12),
  };
}

function deriveBaseRefsFromResponse(input: {
  method: "POST" | "PUT";
  path: string;
  response: unknown;
  source: string;
  runId?: string;
  taskId?: string;
  strategyId?: string;
}): SandboxCleanupRef[] {
  const entityType = resolveCreatedEntityType(input.method, input.path);
  if (!entityType) {
    return [];
  }
  const ids = extractResponseIds(input.response);
  return ids.map((entityId) => ({
    entityType,
    entityId,
    source: input.source,
    ...(input.runId ? { runId: input.runId } : {}),
    ...(input.taskId ? { taskId: input.taskId } : {}),
    ...(input.strategyId ? { strategyId: input.strategyId } : {}),
  }));
}

function resolveCreatedEntityType(
  method: "POST" | "PUT",
  pathValue: string,
): SandboxCleanupEntityType | undefined {
  if (method === "POST") {
    switch (pathValue) {
      case "/customer":
        return "customer";
      case "/supplier":
        return "supplier";
      case "/department":
      case "/department/list":
        return "department";
      case "/product":
        return "product";
      case "/project":
      case "/project/list":
        return "project";
      case "/employee":
        return "employee";
      case "/employee/standardTime":
        return "standardTime";
      case "/travelExpense":
        return "travelExpense";
      case "/timesheet/entry":
      case "/timesheet/entry/list":
        return "timesheetEntry";
      case "/ledger/voucher":
        return "voucher";
      case "/ledger/accountingDimensionName":
        return "dimension";
      case "/ledger/accountingDimensionValue":
        return "targetDimensionValue";
      case "/activity":
        return "activity";
      case "/project/projectActivity":
        return "projectActivity";
      case "/project/hourlyRates":
        return "projectHourlyRate";
      case "/project/hourlyRates/projectSpecificRates":
        return "projectSpecificRate";
      case "/project/orderline":
        return "projectOrderline";
      case "/salary/transaction":
        return "salaryTransaction";
      case "/division":
        return "division";
      default:
        return undefined;
    }
  }

  if (matchesPath(pathValue, "/order/{id}/:invoice")) {
    return "invoice";
  }
  if (matchesPath(pathValue, "/invoice/{id}/:createCreditNote")) {
    return "creditNote";
  }
  if (matchesPath(pathValue, "/invoice/{id}/:createReminder")) {
    return "feeInvoice";
  }
  if (matchesPath(pathValue, "/ledger/voucher/{id}/:reverse")) {
    return "voucher";
  }
  return undefined;
}

function extractResponseIds(response: unknown): number[] {
  if (Array.isArray(response)) {
    return response
      .map((entry) => readNumberAtPath(entry, "id"))
      .filter((value): value is number => value !== undefined);
  }
  const wrappedValueId = readNumberAtPath(response, "value.id");
  if (wrappedValueId !== undefined) {
    return [wrappedValueId];
  }
  const wrappedIds = readArrayAtPath(response, "values")
    .map((entry) => readNumberAtPath(entry, "id"))
    .filter((value): value is number => value !== undefined);
  if (wrappedIds.length > 0) {
    return wrappedIds;
  }
  return [];
}

async function collectSandboxEvidenceFiles(): Promise<string[]> {
  const roots = [
    path.join(tripletex2Root, "runs"),
    resolveResearchPath("verifications"),
    resolveResearchPath("sandbox", "apply"),
  ];
  const nested = await Promise.all(
    roots.map(async (rootPath) => listFilesRecursive(rootPath)),
  );
  return nested.flat().filter((filePath) => filePath.endsWith(".json")).sort();
}

async function collectRefsFromFiles(files: readonly string[]): Promise<SandboxCleanupRef[]> {
  const refs: SandboxCleanupRef[] = [];
  for (const filePath of files) {
    let parsed: unknown;
    try {
      parsed = await readJsonFile<unknown>(filePath);
    } catch {
      continue;
    }
    if (!isRecord(parsed)) {
      continue;
    }
    if (parsed.schemaVersion === "tripletex2.run-artifact.v1") {
      refs.push(...collectRefsFromArtifact(parsed as RunArtifactV1, filePath));
      continue;
    }
    if (parsed.schemaVersion === "tripletex2.sandbox-apply-report.v1") {
      refs.push(...collectRefsFromApplyReport(parsed as SandboxApplyReport, filePath));
    }
  }
  return dedupeRefs(refs);
}

function collectRefsFromApplyReport(
  report: SandboxApplyReport,
  filePath: string,
): SandboxCleanupRef[] {
  return report.createdRefs.map((ref) => ({
    ...ref,
    source: `${ref.source} (${path.relative(tripletex2Root, filePath)})`,
  }));
}

function collectRefsFromArtifact(
  artifact: RunArtifactV1,
  filePath: string,
): SandboxCleanupRef[] {
  if (artifact.mode !== "sandbox") {
    return [];
  }

  const refs: SandboxCleanupRef[] = [];
  for (const call of artifact.execution.apiCalls) {
    refs.push(...collectRefsFromApiCall(call, artifact, filePath));
  }

  const createdEntityIds = artifact.execution.result?.createdEntityIds ?? {};
  const taskId = artifact.task.taskId;
  const sourceBase = `${artifact.runId}:${path.relative(tripletex2Root, filePath)}`;

  if (taskId === "03") {
    refs.push(...collectRegexRefs(createdEntityIds, /^department\d*Id$/, "department", sourceBase, artifact));
  }

  if (taskId === "06" && hasCreateApiCall(artifact.execution.apiCalls, "POST", "/employee")) {
    refs.push(...collectRegexRefs(createdEntityIds, /^employmentId$/, "employment", sourceBase, artifact));
  }

  if (taskId === "12" && hasCreateApiCall(artifact.execution.apiCalls, "POST", "/employee")) {
    refs.push(...collectRegexRefs(createdEntityIds, /^employmentId$/, "employment", sourceBase, artifact));
  }

  if (taskId === "19" && hasCreateApiCall(artifact.execution.apiCalls, "POST", "/employee")) {
    refs.push(...collectRegexRefs(createdEntityIds, /^employmentId$/, "employment", sourceBase, artifact));
  }

  if (taskId === "28") {
    refs.push(...collectRegexRefs(createdEntityIds, /^project\d+Id$/, "project", sourceBase, artifact));
    refs.push(...collectRegexRefs(createdEntityIds, /^projectActivity\d+Id$/, "projectActivity", sourceBase, artifact));
    refs.push(...collectRegexRefs(createdEntityIds, /^activity\d+Id$/, "activity", sourceBase, artifact));
  }

  if (taskId === "29") {
    refs.push(...collectTask29Refs(artifact, sourceBase));
  }

  return dedupeRefs(refs);
}

function collectTask29Refs(
  artifact: RunArtifactV1,
  sourceBase: string,
): SandboxCleanupRef[] {
  const refs: SandboxCleanupRef[] = [];
  const verification = artifact.execution.result?.verification;
  if (isRecord(verification)) {
    const employeeSummaries = readArrayAtPath(verification, "employeeSummaries");
    for (const entry of employeeSummaries) {
      const created = readBooleanAtPath(entry, "created");
      const employeeId = readNumberAtPath(entry, "employeeId");
      if (created === true && employeeId !== undefined) {
        refs.push(withArtifactRef("employee", employeeId, sourceBase, artifact));
      }
    }
    for (const entry of readArrayAtPath(verification, "timesheetEntryIds")) {
      if (typeof entry === "number") {
        refs.push(withArtifactRef("timesheetEntry", entry, sourceBase, artifact));
      }
    }
  }
  return refs;
}

function collectRefsFromApiCall(
  call: RunApiCall,
  artifact: RunArtifactV1,
  filePath: string,
): SandboxCleanupRef[] {
  if (!call.entityIds || !isSuccessfulStatus(call.status)) {
    return [];
  }
  const method = call.method;
  if (method !== "POST" && method !== "PUT") {
    return [];
  }
  const entityType = resolveCreatedEntityType(method, call.path);
  if (!entityType) {
    return [];
  }
  const firstId = Object.values(call.entityIds).find((value) => typeof value === "number");
  if (typeof firstId !== "number") {
    return [];
  }
  return [
    withArtifactRef(
      entityType,
      firstId,
      `${artifact.runId}:${path.relative(tripletex2Root, filePath)}`,
      artifact,
    ),
  ];
}

function withArtifactRef(
  entityType: SandboxCleanupEntityType,
  entityId: number,
  source: string,
  artifact: RunArtifactV1,
): SandboxCleanupRef {
  return {
    entityType,
    entityId,
    source,
    runId: artifact.runId,
    taskId: artifact.task.taskId,
    strategyId: artifact.strategy.strategyId,
  };
}

function collectRegexRefs(
  values: Record<string, number>,
  pattern: RegExp,
  entityType: SandboxCleanupEntityType,
  source: string,
  artifact: RunArtifactV1,
): SandboxCleanupRef[] {
  return Object.entries(values)
    .filter(([key, value]) => pattern.test(key) && typeof value === "number")
    .map(([, value]) => withArtifactRef(entityType, value, source, artifact));
}

function buildCleanupActions(refs: readonly SandboxCleanupRef[]): CleanupAction[] {
  const actions = refs.map((ref) => {
    const { operation, priority } = resolveCleanupBehavior(ref.entityType);
    return {
      actionId: `${ref.entityType}-${ref.entityId}`,
      entityType: ref.entityType,
      entityId: ref.entityId,
      operation,
      priority,
      source: ref.source,
    } satisfies CleanupAction;
  });
  return actions.sort((left, right) => left.priority - right.priority || left.actionId.localeCompare(right.actionId));
}

function resolveCleanupBehavior(
  entityType: SandboxCleanupEntityType,
): { operation: CleanupOperation; priority: number } {
  switch (entityType) {
    case "invoice":
    case "feeInvoice":
      return { operation: "credit-note", priority: 10 };
    case "creditNote":
      return { operation: "neutralize", priority: 10 };
    case "timesheetEntry":
    case "projectOrderline":
    case "projectActivity":
    case "projectHourlyRate":
    case "projectSpecificRate":
    case "salaryTransaction":
    case "travelExpense":
    case "voucher":
      return { operation: "delete", priority: 15 };
    case "order":
      return { operation: "delete", priority: 20 };
    case "employment":
    case "employee":
    case "standardTime":
    case "division":
      return { operation: "neutralize", priority: 25 };
    case "project":
      return { operation: "delete", priority: 30 };
    case "department":
    case "product":
    case "dimension":
    case "targetDimensionValue":
      return { operation: "delete", priority: 35 };
    case "customer":
    case "supplier":
      return { operation: "delete", priority: 40 };
    case "activity":
    case "attachment":
      return { operation: "neutralize", priority: 50 };
  }
}

async function executeCleanupActions(
  client: TripletexClient,
  actions: readonly CleanupAction[],
  today: string,
): Promise<SandboxResetActionResult[]> {
  const results = new Map<string, SandboxResetActionResult>();
  let pending = [...actions];

  for (let pass = 1; pass <= 2 && pending.length > 0; pass += 1) {
    const nextPending: CleanupAction[] = [];
    for (const action of pending) {
      const result = await executeCleanupAction(client, action, today);
      const shouldRetry =
        result.status === "failed" &&
        pass < 2 &&
        action.operation === "delete";
      if (shouldRetry) {
        nextPending.push(action);
        continue;
      }
      results.set(action.actionId, result);
    }
    pending = nextPending;
  }

  for (const action of pending) {
    if (!results.has(action.actionId)) {
      results.set(action.actionId, {
        actionId: action.actionId,
        entityType: action.entityType,
        entityId: action.entityId,
        operation: action.operation,
        status: "failed",
        source: action.source,
        errorMessage: "Cleanup dependency retry budget exhausted.",
      });
    }
  }

  return [...results.values()].sort((left, right) => left.actionId.localeCompare(right.actionId));
}

async function executeCleanupAction(
  client: TripletexClient,
  action: CleanupAction,
  today: string,
): Promise<SandboxResetActionResult> {
  try {
    switch (action.operation) {
      case "delete":
        return await runDeleteAction(client, action);
      case "credit-note":
        return await runInvoiceNeutralization(client, action, today);
      case "neutralize":
        return await runNeutralizeAction(client, action, today);
      case "reverse-voucher":
        return await reverseVoucher(client, action.entityId, today, action);
    }
  } catch (error) {
    if (isNotFound(error)) {
      return {
        actionId: action.actionId,
        entityType: action.entityType,
        entityId: action.entityId,
        operation: action.operation,
        status: "already-clean",
        source: action.source,
      };
    }
    return {
      actionId: action.actionId,
      entityType: action.entityType,
      entityId: action.entityId,
      operation: action.operation,
      status: "failed",
      source: action.source,
      errorMessage: error instanceof Error ? error.message : String(error),
    };
  }
}

async function runDeleteAction(
  client: TripletexClient,
  action: CleanupAction,
): Promise<SandboxResetActionResult> {
  const deletePath = resolveDeletePath(action.entityType, action.entityId);
  if (!deletePath) {
    return {
      actionId: action.actionId,
      entityType: action.entityType,
      entityId: action.entityId,
      operation: action.operation,
      status: "skipped",
      source: action.source,
      details: "No delete path is available for this entity type.",
    };
  }
  await client.delete<unknown>(deletePath);
  return {
    actionId: action.actionId,
    entityType: action.entityType,
    entityId: action.entityId,
    operation: action.operation,
    status: "completed",
    path: deletePath,
    source: action.source,
  };
}

function resolveDeletePath(
  entityType: SandboxCleanupEntityType,
  entityId: number,
): string | undefined {
  switch (entityType) {
    case "customer":
      return `/customer/${entityId}`;
    case "supplier":
      return `/supplier/${entityId}`;
    case "department":
      return `/department/${entityId}`;
    case "product":
      return `/product/${entityId}`;
    case "project":
      return `/project/${entityId}`;
    case "order":
      return `/order/${entityId}`;
    case "dimension":
      return `/ledger/accountingDimensionName/${entityId}`;
    case "targetDimensionValue":
      return `/ledger/accountingDimensionValue/${entityId}`;
    case "travelExpense":
      return `/travelExpense/${entityId}`;
    case "timesheetEntry":
      return `/timesheet/entry/${entityId}`;
    case "salaryTransaction":
      return `/salary/transaction/${entityId}`;
    case "projectHourlyRate":
      return `/project/hourlyRates/${entityId}`;
    case "projectSpecificRate":
      return `/project/hourlyRates/projectSpecificRates/${entityId}`;
    case "projectActivity":
      return `/project/projectActivity/${entityId}`;
    case "projectOrderline":
      return `/project/orderline/${entityId}`;
    case "voucher":
      return `/ledger/voucher/${entityId}`;
    default:
      return undefined;
  }
}

async function runNeutralizeAction(
  client: TripletexClient,
  action: CleanupAction,
  today: string,
): Promise<SandboxResetActionResult> {
  switch (action.entityType) {
    case "employee":
      return neutralizeEmployee(client, action, today);
    case "employment":
      return neutralizeEmployment(client, action, today);
    case "division":
      return neutralizeDivision(client, action, today);
    case "standardTime":
      return {
        actionId: action.actionId,
        entityType: action.entityType,
        entityId: action.entityId,
        operation: action.operation,
        status: "skipped",
        source: action.source,
        details: "Standard time entries are left in place once the employee has been ended and email-neutralized.",
      };
    case "activity":
      return {
        actionId: action.actionId,
        entityType: action.entityType,
        entityId: action.entityId,
        operation: action.operation,
        status: "skipped",
        source: action.source,
        details: "Tripletex exposes no delete or update path for activity cleanup.",
      };
    case "attachment":
      return {
        actionId: action.actionId,
        entityType: action.entityType,
        entityId: action.entityId,
        operation: action.operation,
        status: "skipped",
        source: action.source,
        details: "Attachment cleanup is handled indirectly by voucher deletion when available.",
      };
    case "creditNote":
      return {
        actionId: action.actionId,
        entityType: action.entityType,
        entityId: action.entityId,
        operation: action.operation,
        status: "skipped",
        source: action.source,
        details: "Credit notes cannot be safely removed through the current API surface.",
      };
    default:
      return {
        actionId: action.actionId,
        entityType: action.entityType,
        entityId: action.entityId,
        operation: action.operation,
        status: "skipped",
        source: action.source,
        details: "No neutralizer is implemented for this entity type.",
      };
  }
}

async function neutralizeEmployee(
  client: TripletexClient,
  action: CleanupAction,
  today: string,
): Promise<SandboxResetActionResult> {
  const employee = (await client.get<ResponseWrapper<EmployeeCleanupSummary>>(
    `/employee/${action.entityId}`,
    { query: { fields: "*,employments(*)" } },
  )).value;
  if (!employee) {
    throw new Error(`Employee ${action.entityId} could not be loaded.`);
  }

  const desiredEmail = buildNeutralizedEmail(employee.email, action.entityId, today);
  const employments = employee.employments ?? [];
  for (const employment of employments) {
    if (typeof employment.id === "number") {
      await neutralizeEmployment(
        client,
        {
          ...action,
          actionId: `${action.actionId}-employment-${employment.id}`,
          entityType: "employment",
          entityId: employment.id,
        },
        today,
      );
    }
  }

  await client.put(`/employee/${action.entityId}`, {
    body: {
      ...(desiredEmail ? { email: desiredEmail } : {}),
      userType: "NO_ACCESS",
    },
  });
  return {
    actionId: action.actionId,
    entityType: action.entityType,
    entityId: action.entityId,
    operation: action.operation,
    status: "completed",
    path: `/employee/${action.entityId}`,
    source: action.source,
    details: desiredEmail ? `email -> ${desiredEmail}` : "userType -> NO_ACCESS",
  };
}

async function neutralizeEmployment(
  client: TripletexClient,
  action: CleanupAction,
  today: string,
): Promise<SandboxResetActionResult> {
  const employment = (await client.get<ResponseWrapper<EmploymentCleanupSummary>>(
    `/employee/employment/${action.entityId}`,
    { query: { fields: "*" } },
  )).value;
  if (!employment) {
    throw new Error(`Employment ${action.entityId} could not be loaded.`);
  }
  if (employment.endDate && employment.endDate <= today) {
    return {
      actionId: action.actionId,
      entityType: action.entityType,
      entityId: action.entityId,
      operation: action.operation,
      status: "already-clean",
      source: action.source,
    };
  }
  await client.put(`/employee/employment/${action.entityId}`, {
    body: {
      endDate: selectEndDate(today, employment.startDate),
      employmentEndReason: EMPLOYMENT_END_REASON,
      isRemoveAccessAtEmploymentEnded: true,
    },
  });
  return {
    actionId: action.actionId,
    entityType: action.entityType,
    entityId: action.entityId,
    operation: action.operation,
    status: "completed",
    path: `/employee/employment/${action.entityId}`,
    source: action.source,
  };
}

async function neutralizeDivision(
  client: TripletexClient,
  action: CleanupAction,
  today: string,
): Promise<SandboxResetActionResult> {
  const division = (await client.get<ResponseWrapper<DivisionCleanupSummary>>(
    `/division/${action.entityId}`,
    { query: { fields: "*" } },
  )).value;
  if (!division) {
    throw new Error(`Division ${action.entityId} could not be loaded.`);
  }
  if (division.endDate && division.endDate <= today) {
    return {
      actionId: action.actionId,
      entityType: action.entityType,
      entityId: action.entityId,
      operation: action.operation,
      status: "already-clean",
      source: action.source,
    };
  }
  await client.put(`/division/${action.entityId}`, {
    body: {
      endDate: today,
    },
  });
  return {
    actionId: action.actionId,
    entityType: action.entityType,
    entityId: action.entityId,
    operation: action.operation,
    status: "completed",
    path: `/division/${action.entityId}`,
    source: action.source,
  };
}

async function runInvoiceNeutralization(
  client: TripletexClient,
  action: CleanupAction,
  today: string,
): Promise<SandboxResetActionResult> {
  if (action.entityType === "creditNote") {
    return {
      actionId: action.actionId,
      entityType: action.entityType,
      entityId: action.entityId,
      operation: action.operation,
      status: "skipped",
      source: action.source,
      details: "Credit note cleanup is left as-is.",
    };
  }

  const invoice = await loadInvoiceForCleanup(client, action.entityId);
  try {
    const creditNoteId = await createCreditNote(client, action.entityId, today);
    return {
      actionId: action.actionId,
      entityType: action.entityType,
      entityId: action.entityId,
      operation: action.operation,
      status: "completed",
      path: `/invoice/${action.entityId}/:createCreditNote`,
      source: action.source,
      details: `creditNoteId ${creditNoteId}`,
    };
  } catch (error) {
    if (outstandingAmount(invoice) === 0) {
      const paymentVoucherId = extractPaymentVoucherId(invoice);
      if (paymentVoucherId !== undefined) {
        await reverseVoucher(client, paymentVoucherId, today, action);
        const creditNoteId = await createCreditNote(client, action.entityId, today);
        return {
          actionId: action.actionId,
          entityType: action.entityType,
          entityId: action.entityId,
          operation: action.operation,
          status: "completed",
          path: `/invoice/${action.entityId}/:createCreditNote`,
          source: action.source,
          details: `reversed payment voucher ${paymentVoucherId}; creditNoteId ${creditNoteId}`,
        };
      }
    }
    throw error;
  }
}

async function reverseVoucher(
  client: TripletexClient,
  voucherId: number,
  today: string,
  action: CleanupAction,
): Promise<SandboxResetActionResult> {
  await client.put(`/ledger/voucher/${voucherId}/:reverse`, {
    query: {
      date: today,
    },
  });
  return {
    actionId: `${action.actionId}-reverse-${voucherId}`,
    entityType: "voucher",
    entityId: voucherId,
    operation: "reverse-voucher",
    status: "completed",
    path: `/ledger/voucher/${voucherId}/:reverse`,
    source: action.source,
  };
}

async function loadInvoiceForCleanup(
  client: TripletexClient,
  invoiceId: number,
): Promise<InvoiceCleanupSummary> {
  const response = await client.get<ResponseWrapper<InvoiceCleanupSummary>>(
    `/invoice/${invoiceId}`,
    {
      query: {
        fields: "*,postings(*,voucher(*),account(*),customer(*),closeGroup(*))",
      },
    },
  );
  if (!response.value) {
    throw new Error(`Invoice ${invoiceId} could not be loaded.`);
  }
  return response.value;
}

async function createCreditNote(
  client: TripletexClient,
  invoiceId: number,
  today: string,
): Promise<number> {
  const response = await client.put<ResponseWrapper<{ id?: number }>>(
    `/invoice/${invoiceId}/:createCreditNote`,
    {
      query: {
        date: today,
        sendToCustomer: false,
        sendType: "MANUAL",
      },
    },
  );
  const createdId = response.value?.id;
  if (typeof createdId !== "number") {
    throw new Error(`Tripletex did not return a credit note id for invoice ${invoiceId}.`);
  }
  return createdId;
}

function extractPaymentVoucherId(invoice: InvoiceCleanupSummary): number | undefined {
  const postings = invoice.postings ?? [];
  const invoiceVoucherIds = new Set<number>();
  for (const posting of postings) {
    const voucherId = toFiniteNumber(posting.voucher?.id);
    if (!voucherId) {
      continue;
    }
    if (posting.type === "OUTGOING_INVOICE_CUSTOMER_POSTING") {
      invoiceVoucherIds.add(voucherId);
    }
  }

  const typedPaymentVoucherIds = new Set<number>();
  for (const posting of postings) {
    const voucherId = toFiniteNumber(posting.voucher?.id);
    if (!voucherId) {
      continue;
    }
    if (posting.type === "INCOMING_PAYMENT" || posting.type === "INCOMING_PAYMENT_OPPOSITE") {
      typedPaymentVoucherIds.add(voucherId);
    }
  }
  if (typedPaymentVoucherIds.size === 1) {
    const voucherId = [...typedPaymentVoucherIds][0];
    return invoiceVoucherIds.has(voucherId) ? undefined : voucherId;
  }

  const fallbackPaymentVoucherIds = new Set<number>();
  for (const posting of postings) {
    const voucherId = toFiniteNumber(posting.voucher?.id);
    const amount = toFiniteNumber(posting.amountCurrency) ?? toFiniteNumber(posting.amount);
    const description = normalizeText(posting.description);
    if (!voucherId || amount === undefined) {
      continue;
    }
    if (amount < 0 && description.startsWith("betaling:")) {
      fallbackPaymentVoucherIds.add(voucherId);
    }
  }
  if (fallbackPaymentVoucherIds.size !== 1) {
    return undefined;
  }
  const voucherId = [...fallbackPaymentVoucherIds][0];
  return invoiceVoucherIds.has(voucherId) ? undefined : voucherId;
}

function outstandingAmount(invoice: InvoiceCleanupSummary): number | undefined {
  return toFiniteNumber(invoice.amountCurrencyOutstanding) ?? toFiniteNumber(invoice.amountOutstanding);
}

function buildNeutralizedEmail(
  email: string | undefined,
  employeeId: number,
  today: string,
): string | undefined {
  const normalized = (email ?? "").trim().toLowerCase();
  if (normalized.length === 0) {
    return undefined;
  }
  if (normalized.includes("+sandbox-reset-")) {
    return normalized;
  }
  const atIndex = normalized.indexOf("@");
  if (atIndex === -1) {
    return `sandbox-reset-${today}-${employeeId}@example.invalid`;
  }
  return `${normalized.slice(0, atIndex)}+sandbox-reset-${today}-${employeeId}${normalized.slice(atIndex)}`;
}

function selectEndDate(today: string, startDate?: string): string {
  if (startDate && startDate > today) {
    return startDate;
  }
  return today;
}

function hasCreateApiCall(
  apiCalls: readonly RunApiCall[],
  method: "POST" | "PUT",
  pathValue: string,
): boolean {
  return apiCalls.some((call) => call.method === method && call.path === pathValue && isSuccessfulStatus(call.status));
}

function matchesPath(actualPath: string, template: string): boolean {
  const actualSegments = actualPath.split("/").filter(Boolean);
  const templateSegments = template.split("/").filter(Boolean);
  if (actualSegments.length !== templateSegments.length) {
    return false;
  }
  for (let index = 0; index < actualSegments.length; index += 1) {
    const actual = actualSegments[index];
    const expected = templateSegments[index];
    if (expected.startsWith("{") && expected.endsWith("}")) {
      continue;
    }
    if (actual !== expected) {
      return false;
    }
  }
  return true;
}

function dedupeRefs(refs: readonly SandboxCleanupRef[]): SandboxCleanupRef[] {
  const seen = new Map<string, SandboxCleanupRef>();
  for (const ref of refs) {
    const key = `${ref.entityType}:${ref.entityId}`;
    if (!seen.has(key)) {
      seen.set(key, ref);
    }
  }
  return [...seen.values()].sort((left, right) =>
    `${left.entityType}:${left.entityId}`.localeCompare(`${right.entityType}:${right.entityId}`),
  );
}

function readArrayAtPath(root: unknown, dottedPath: string): unknown[] {
  const value = getPathValue(root, dottedPath);
  return Array.isArray(value) ? value : [];
}

function readBooleanAtPath(root: unknown, dottedPath: string): boolean | undefined {
  const value = getPathValue(root, dottedPath);
  return typeof value === "boolean" ? value : undefined;
}

function readNumberAtPath(root: unknown, dottedPath: string): number | undefined {
  const value = getPathValue(root, dottedPath);
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function getPathValue(root: unknown, dottedPath: string): unknown {
  return dottedPath.split(".").reduce<unknown>((current, segment) => {
    if (current === null || current === undefined) {
      return undefined;
    }
    if (Array.isArray(current)) {
      const index = Number(segment);
      return Number.isInteger(index) ? current[index] : undefined;
    }
    if (typeof current !== "object") {
      return undefined;
    }
    return (current as Record<string, unknown>)[segment];
  }, root);
}

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === "object" && value !== null;
}

function isSuccessfulStatus(status: number | undefined): boolean {
  return typeof status === "number" && status >= 200 && status < 300;
}

function joinLines(lines: readonly string[]): string {
  return lines.length > 0 ? `${lines.join("\n")}\n` : "";
}

function resolveNow(now?: () => Date): Date {
  return now ? now() : new Date();
}

function isNotFound(error: unknown): boolean {
  return error instanceof TripletexHttpError && error.status === 404;
}

function normalizeText(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function toFiniteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}
