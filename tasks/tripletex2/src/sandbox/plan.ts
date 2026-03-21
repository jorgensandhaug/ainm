import path from "node:path";

import type { QueryValue } from "../runtime/contracts";
import { resolveResearchPath, writeJsonFile } from "../research/store";
import { callSandboxClient, createSandboxClient, type SandboxCredentials } from "./client";
import { deriveCreatedRefsFromResponse } from "./cleanup";
import type {
  SandboxApplyReport,
  SandboxCleanupRef,
  SandboxPlan,
  SandboxPlanStep,
} from "./types";
import { SANDBOX_APPLY_REPORT_SCHEMA_VERSION } from "./types";

export async function applySandboxPlan(input: {
  plan: SandboxPlan;
  credentials: SandboxCredentials;
  planPath?: string;
  dryRun?: boolean;
  now?: () => Date;
  reportRoot?: string;
  client?: ReturnType<typeof createSandboxClient>;
}): Promise<{ report: SandboxApplyReport; reportPath: string }> {
  const createdAt = resolveNow(input.now).toISOString();
  const reportId = `sandbox-apply-${sanitizeId(input.plan.planId)}-${createdAt.replaceAll(":", "-").replaceAll(".", "-")}`;
  const reportPath = path.join(
    input.reportRoot ?? resolveResearchPath("sandbox", "apply"),
    `${reportId}.json`,
  );
  const client = input.client ?? createSandboxClient(input.credentials);
  const capturedValues: Record<string, unknown> = {
    ...(input.plan.initialValues ?? {}),
  };
  const createdRefs: SandboxCleanupRef[] = [];
  const steps: SandboxApplyReport["steps"] = [];

  for (const rawStep of input.plan.steps) {
    const step = renderStep(rawStep, capturedValues, input.dryRun === true);
    if (input.dryRun === true) {
      steps.push({
        stepId: step.stepId,
        method: step.method,
        path: step.path,
        ...(step.query ? { query: step.query } : {}),
        ...(step.body !== undefined ? { body: step.body } : {}),
        status: "planned",
      });
      continue;
    }

    try {
      const response = await callSandboxClient<unknown>(client, step.method, step.path, {
        ...(step.query ? { query: step.query as Record<string, QueryValue> } : {}),
        ...(step.body !== undefined ? { body: step.body } : {}),
      });
      const captured = captureValues(step, response);
      Object.assign(capturedValues, captured);
      if (step.method === "POST" || step.method === "PUT") {
        createdRefs.push(
          ...deriveCreatedRefsFromResponse({
            method: step.method,
            path: step.path,
            response,
            source: `plan:${input.plan.planId}:${step.stepId}`,
          }),
        );
      }
      steps.push({
        stepId: step.stepId,
        method: step.method,
        path: step.path,
        ...(step.query ? { query: step.query } : {}),
        ...(step.body !== undefined ? { body: step.body } : {}),
        status: "completed",
        ...(Object.keys(captured).length > 0 ? { captured } : {}),
        response,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      steps.push({
        stepId: step.stepId,
        method: step.method,
        path: step.path,
        ...(step.query ? { query: step.query } : {}),
        ...(step.body !== undefined ? { body: step.body } : {}),
        status: "failed",
        errorMessage: message,
      });
      if (!step.continueOnError) {
        break;
      }
    }
  }

  const report: SandboxApplyReport = {
    schemaVersion: SANDBOX_APPLY_REPORT_SCHEMA_VERSION,
    reportId,
    createdAt,
    dryRun: input.dryRun === true,
    planId: input.plan.planId,
    ...(input.planPath ? { planPath: input.planPath } : {}),
    ...(input.plan.description ? { description: input.plan.description } : {}),
    capturedValues,
    createdRefs,
    steps,
  };
  await writeJsonFile(reportPath, report);
  return { report, reportPath };
}

function renderStep(
  step: SandboxPlanStep,
  context: Record<string, unknown>,
  allowUnresolved: boolean,
): SandboxPlanStep {
  return {
    ...step,
    path: renderTemplate(step.path, context, allowUnresolved),
    ...(step.query
      ? {
          query: Object.fromEntries(
            Object.entries(step.query).map(([key, value]) => [
              key,
              renderTemplateValue(value, context, allowUnresolved),
            ]),
          ),
        }
      : {}),
    ...(step.body !== undefined
      ? { body: renderTemplateValue(step.body, context, allowUnresolved) }
      : {}),
  };
}

function captureValues(
  step: SandboxPlanStep,
  response: unknown,
): Record<string, unknown> {
  const captured: Record<string, unknown> = {};
  for (const [name, responsePath] of Object.entries(step.capture ?? {})) {
    captured[name] = getPathValue(response, responsePath);
  }
  return captured;
}

function renderTemplateValue(
  value: unknown,
  context: Record<string, unknown>,
  allowUnresolved: boolean,
): any {
  if (typeof value === "string") {
    const scalarMatch = value.match(/^\{\{\s*([^}]+?)\s*\}\}$/);
    if (scalarMatch) {
      const resolved = getPathValue(context, scalarMatch[1].trim());
      if (resolved === undefined) {
        if (allowUnresolved) {
          return value;
        }
        throw new Error(`Template path "${scalarMatch[1].trim()}" resolved to undefined.`);
      }
      return resolved;
    }
    return renderTemplate(value, context, allowUnresolved);
  }
  if (Array.isArray(value)) {
    return value.map((entry) => renderTemplateValue(entry, context, allowUnresolved));
  }
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [
        key,
        renderTemplateValue(entry, context, allowUnresolved),
      ]),
    );
  }
  return value;
}

function renderTemplate(
  template: string,
  context: Record<string, unknown>,
  allowUnresolved: boolean,
): string {
  return template.replaceAll(/\{\{\s*([^}]+?)\s*\}\}/g, (_match, rawPath) => {
    const value = getPathValue(context, String(rawPath).trim());
    if (value === undefined || value === null) {
      if (allowUnresolved) {
        return `{{${String(rawPath).trim()}}}`;
      }
      throw new Error(`Template path "${String(rawPath).trim()}" resolved to ${String(value)}.`);
    }
    if (typeof value === "object") {
      throw new Error(`Template path "${String(rawPath).trim()}" resolved to a non-scalar value.`);
    }
    return String(value);
  });
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

function sanitizeId(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "-");
}

function resolveNow(now?: () => Date): Date {
  return now ? now() : new Date();
}
