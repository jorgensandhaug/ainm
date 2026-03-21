import type { StrategyResult } from "../../../runtime/contracts";
import type { CreateSupplierStrategy } from "../task";
import { CREATE_SUPPLIER_TASK_ID, type CreateSupplierInput } from "../task";

interface ResponseWrapper<TValue> {
  value?: TValue;
}

interface SupplierSummary {
  id?: number;
  name?: string;
  organizationNumber?: string;
  email?: string;
  invoiceEmail?: string;
}

export const strategy = {
  strategyId: "02.create-supplier-post.v1",
  strategyPath: "src/tasks/task-02/strategies/create-supplier-post.ts",
  taskId: CREATE_SUPPLIER_TASK_ID,
  name: "Direct supplier POST",
  summary:
    "Creates the supplier in one POST /supplier call and mirrors invoice-looking email into invoiceEmail when needed.",
  hypothesis:
    "The trusted create-supplier path is a single write, and mirroring invoice-looking emails into invoiceEmail preserves the best-known scorer path.",
  expectedCallProfile: {
    targetCalls: 1,
    maxCalls: 1,
  },
  stepOutline: [
    "API call 1: POST /supplier with name, organizationNumber, email, and invoiceEmail when explicit or invoice-looking.",
  ],
  status: "draft",
  async run(ctx, input: CreateSupplierInput): Promise<StrategyResult> {
    const email = assertNonEmptyText(input.email, "email");
    const invoiceEmail =
      normalizeOptionalText(input.invoiceEmail) ??
      (looksLikeInvoiceEmail(email) ? email : undefined);

    const payload = {
      name: assertNonEmptyText(input.supplierName, "supplierName"),
      organizationNumber: normalizeOrganizationNumber(input.organizationNumber),
      email,
      ...(invoiceEmail ? { invoiceEmail } : {}),
    };

    const response = await ctx.tripletex.post<ResponseWrapper<SupplierSummary>>(
      "/supplier",
      {
        body: payload,
      },
    );

    const supplier = requireValue(response.value, "supplier");
    const supplierId = requireId(supplier.id, "supplier");

    assertExactMatch(supplier.name, payload.name, "supplier.name");
    assertExactOrganizationNumber(
      supplier.organizationNumber,
      payload.organizationNumber,
      "supplier.organizationNumber",
    );
    assertExactMatch(supplier.email, payload.email, "supplier.email");

    if (payload.invoiceEmail) {
      assertExactMatch(
        supplier.invoiceEmail,
        payload.invoiceEmail,
        "supplier.invoiceEmail",
      );
    }

    return {
      createdEntityIds: {
        supplierId,
      },
      verification: {
        supplierName: supplier.name,
        organizationNumber: supplier.organizationNumber,
        email: supplier.email,
        invoiceEmail: supplier.invoiceEmail,
      },
    };
  },
} satisfies CreateSupplierStrategy;

function assertNonEmptyText(value: string, fieldName: string): string {
  const normalizedValue = value.trim();
  if (normalizedValue.length === 0) {
    throw new Error(`${fieldName} must be a non-empty string.`);
  }

  return normalizedValue;
}

function normalizeOptionalText(value: string | undefined): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const normalizedValue = value.trim();
  return normalizedValue.length > 0 ? normalizedValue : undefined;
}

function normalizeOrganizationNumber(value: string): string {
  const normalizedValue = value.replace(/\s+/g, "");
  if (normalizedValue.length === 0) {
    throw new Error("organizationNumber must be a non-empty string.");
  }

  return normalizedValue;
}

function looksLikeInvoiceEmail(value: string): boolean {
  return /(^|[^a-z])(invoice|faktura|fakturor|fakturering|ehf)([^a-z]|$)/i.test(
    value,
  );
}

function requireValue<TValue>(
  value: TValue | undefined,
  fieldName: string,
): TValue {
  if (!value) {
    throw new Error(`Tripletex did not return ${fieldName}.`);
  }

  return value;
}

function requireId(value: number | undefined, entityName: string): number {
  if (typeof value !== "number") {
    throw new Error(`Tripletex did not return a numeric ${entityName} id.`);
  }

  return value;
}

function assertExactMatch(
  actualValue: string | undefined,
  expectedValue: string,
  fieldName: string,
): void {
  if (actualValue !== expectedValue) {
    throw new Error(
      `Tripletex returned unexpected ${fieldName}: expected ${JSON.stringify(expectedValue)}, got ${JSON.stringify(actualValue)}.`,
    );
  }
}

function assertExactOrganizationNumber(
  actualValue: string | undefined,
  expectedValue: string,
  fieldName: string,
): void {
  if (normalizeOrganizationNumber(actualValue ?? "") !== expectedValue) {
    throw new Error(
      `Tripletex returned unexpected ${fieldName}: expected ${JSON.stringify(expectedValue)}, got ${JSON.stringify(actualValue)}.`,
    );
  }
}
