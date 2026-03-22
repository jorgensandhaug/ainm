import type {
  StrategyContext,
  StrategyResult,
} from "../../../runtime/contracts";
import type {
  IssueFullCreditNoteInput,
  IssueFullCreditNoteStrategy,
} from "../task";
import { ISSUE_FULL_CREDIT_NOTE_TASK_ID } from "../task";

interface ListResponse<TValue> {
  values?: TValue[];
}

interface ResponseWrapper<TValue> {
  value?: TValue;
}

interface InvoiceEvidenceLine {
  description?: string | null;
}

interface InvoiceEvidenceOrder {
  orderLines?: InvoiceEvidenceLine[] | null;
}

interface InvoiceSummary {
  id?: number;
  invoiceNumber?: number | string | null;
  invoiceDate?: string | null;
  customer?: {
    name?: string | null;
    organizationNumber?: string | number | null;
  } | null;
  isCreditNote?: boolean | null;
  isCredited?: boolean | null;
  creditedInvoice?:
    | number
    | string
    | { id?: number | string | null }
    | null;
  amountExcludingVatCurrency?: number | null;
  amountExcludingVat?: number | null;
  orderLines?: InvoiceEvidenceLine[] | null;
  orders?: InvoiceEvidenceOrder[] | null;
}

export const strategy = {
  strategyId: "10.issue-full-credit-note.v1",
  strategyPath: "src/tasks/task-10/strategies/issue-full-credit-note.ts",
  taskId: ISSUE_FULL_CREDIT_NOTE_TASK_ID,
  name: "Issue exact full credit note",
  summary:
    "Locates the exact original invoice from prompt keys and creates one unsent full credit note in the proven two-call flow.",
  hypothesis:
    "A single decisive invoice read followed by PUT /invoice/{id}/:createCreditNote is the minimum reliable public path for this exact task shape.",
  expectedCallProfile: {
    targetCalls: 2,
    maxCalls: 2,
  },
  stepOutline: [
    "API call 1: GET /invoice with a wide bounded date range and expanded customer plus order-line fields.",
    "API call 2: PUT /invoice/{id}/:createCreditNote with the requested date and sendToCustomer=false.",
  ],
  status: "active",
  async run(
    ctx: StrategyContext,
    input: IssueFullCreditNoteInput,
  ): Promise<StrategyResult> {
    assertPositiveNumber(input.amountExcludingVatNok, "amountExcludingVatNok");

    const creditNoteDate = input.creditNoteDate ?? ctx.clock.today();
    const normalizedOrgNumber = normalizeOrganizationNumber(
      input.customerOrganizationNumber,
    );
    const normalizedDescription = normalizeText(input.lineDescription);
    const normalizedCustomerName = normalizeText(input.customerName);
    const requirement: InvoiceRequirement = {
      invoiceId: input.invoiceId,
      invoiceNumber: input.invoiceNumber,
      organizationNumber: normalizedOrgNumber,
      lineDescription: normalizedDescription,
      customerName: normalizedCustomerName,
      amountExcludingVatNok: input.amountExcludingVatNok,
    };

    const originalInvoice = input.invoiceId
      ? await loadInvoiceById(ctx, input.invoiceId)
      : await loadInvoiceList(ctx, creditNoteDate).then((response) =>
          selectExactInvoice(response.values ?? [], requirement),
        );

    validateInvoiceMatch(originalInvoice, requirement);

    const originalInvoiceId = requireNumber(originalInvoice.id, "invoice id");
    const creditResponse = await ctx.tripletex.put<ResponseWrapper<InvoiceSummary>>(
      `/invoice/${originalInvoiceId}/:createCreditNote`,
      {
        query: {
          date: creditNoteDate,
          sendToCustomer: false,
        },
      },
    );

    const creditNote = creditResponse.value;
    if (!creditNote) {
      throw new Error(
        "Tripletex credit-note response did not include the created credit note.",
      );
    }

    if (creditNote.isCreditNote !== true) {
      throw new Error("Tripletex did not confirm isCreditNote=true.");
    }

    if (resolveCreditedInvoiceId(creditNote.creditedInvoice) !== originalInvoiceId) {
      throw new Error(
        `Tripletex credit note response did not link back to invoice ${originalInvoiceId}.`,
      );
    }

    verifyFullCreditAmount(originalInvoice, creditNote);

    return {
      createdEntityIds: {
        originalInvoiceId,
        creditNoteId: requireNumber(creditNote.id, "credit note id"),
      },
      notes: buildCustomerNameNotes(
        originalInvoice.customer?.name,
        input.customerName,
        normalizedOrgNumber,
      ),
      verification: {
        originalInvoiceNumber: originalInvoice.invoiceNumber,
        creditNoteNumber: creditNote.invoiceNumber,
        creditNoteDate,
        sendToCustomerRequested: false,
      },
    };
  },
} satisfies IssueFullCreditNoteStrategy;

type InvoiceRequirement = {
  invoiceId?: number;
  invoiceNumber?: number;
  organizationNumber: string;
  lineDescription: string;
  customerName: string;
  amountExcludingVatNok: number;
};

async function loadInvoiceById(
  ctx: StrategyContext,
  invoiceId: number,
): Promise<InvoiceSummary> {
  const response = await ctx.tripletex.get<ResponseWrapper<InvoiceSummary>>(
    `/invoice/${invoiceId}`,
    {
      query: {
        fields: "*,customer(*),orderLines(*),orders(*,orderLines(*))",
      },
    },
  );

  if (!response.value) {
    throw new Error(`Tripletex did not return invoice ${invoiceId}.`);
  }

  return response.value;
}

async function loadInvoiceList(
  ctx: StrategyContext,
  creditNoteDate: string,
): Promise<ListResponse<InvoiceSummary>> {
  return ctx.tripletex.get<ListResponse<InvoiceSummary>>("/invoice", {
    query: {
      invoiceDateFrom: "2000-01-01",
      invoiceDateTo: addDays(creditNoteDate, 1),
      count: 1000,
      sorting: "-invoiceDate",
      fields: "*,customer(*),orderLines(*),orders(*,orderLines(*))",
    },
  });
}

function selectExactInvoice(
  invoices: readonly InvoiceSummary[],
  requirement: InvoiceRequirement,
): InvoiceSummary {
  const matches = dedupeInvoicesById(
    invoices.filter((invoice) => invoiceMatches(invoice, requirement)),
  );

  if (matches.length === 0) {
    throw new Error(
      `Expected one invoice for organization number ${requirement.organizationNumber}, description "${requirement.lineDescription}", and amount ${requirement.amountExcludingVatNok}, but none matched.`,
    );
  }

  if (matches.length === 1) {
    return matches[0];
  }

  if (requirement.customerName) {
    const exactNameMatches = matches.filter((invoice) =>
      sameText(invoice.customer?.name, requirement.customerName),
    );
    if (exactNameMatches.length === 1) {
      return exactNameMatches[0];
    }
  }

  throw new Error(
    `Expected exactly one invoice match, but found ${matches.length}: ${JSON.stringify(
      matches.map((invoice) => ({
        id: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        customerName: invoice.customer?.name ?? null,
        organizationNumber: invoice.customer?.organizationNumber ?? null,
        amountExcludingVat: exVatAmount(invoice),
        evidence: extractEvidence(invoice),
      })),
    )}`,
  );
}

function validateInvoiceMatch(
  invoice: InvoiceSummary,
  requirement: InvoiceRequirement,
): void {
  if (!invoiceMatches(invoice, requirement)) {
    throw new Error(
      `Invoice ${invoice.id ?? "(unknown)"} did not match the required credit-note criteria.`,
    );
  }
}

function invoiceMatches(
  invoice: InvoiceSummary,
  requirement: InvoiceRequirement,
): boolean {
  if (
    requirement.invoiceId !== undefined &&
    requireComparableNumber(invoice.id) !== requirement.invoiceId
  ) {
    return false;
  }

  if (
    requirement.invoiceNumber !== undefined &&
    requireComparableNumber(invoice.invoiceNumber) !== requirement.invoiceNumber
  ) {
    return false;
  }

  if (
    normalizeOrganizationNumber(invoice.customer?.organizationNumber) !==
    requirement.organizationNumber
  ) {
    return false;
  }

  if (invoice.isCreditNote === true || invoice.isCredited === true) {
    return false;
  }

  if (exVatAmount(invoice) !== requirement.amountExcludingVatNok) {
    return false;
  }

  return matchesLineEvidence(invoice, requirement.lineDescription);
}

function matchesLineEvidence(
  invoice: InvoiceSummary,
  normalizedDescription: string,
): boolean {
  const evidence = extractEvidence(invoice).map(normalizeText);
  return evidence.includes(normalizedDescription);
}

function extractEvidence(invoice: InvoiceSummary): string[] {
  const texts: string[] = [];

  for (const line of invoice.orderLines ?? []) {
    if (line.description) {
      texts.push(line.description);
    }
  }

  for (const order of invoice.orders ?? []) {
    for (const line of order.orderLines ?? []) {
      if (line.description) {
        texts.push(line.description);
      }
    }
  }

  return [...new Set(texts)];
}

function exVatAmount(invoice: InvoiceSummary): number | null {
  return (
    comparableNumber(invoice.amountExcludingVatCurrency) ??
    comparableNumber(invoice.amountExcludingVat)
  );
}

function absoluteExVatAmount(invoice: InvoiceSummary): number | null {
  const amount = exVatAmount(invoice);
  return amount === null ? null : Math.abs(amount);
}

function verifyFullCreditAmount(
  originalInvoice: InvoiceSummary,
  creditNote: InvoiceSummary,
): void {
  const originalAmount = absoluteExVatAmount(originalInvoice);
  const creditNoteAmount = absoluteExVatAmount(creditNote);

  if (originalAmount === null || creditNoteAmount === null) {
    return;
  }

  if (creditNoteAmount !== originalAmount) {
    throw new Error(
      `Tripletex credit note amount ${creditNoteAmount} did not fully reverse original invoice amount ${originalAmount}.`,
    );
  }
}

function dedupeInvoicesById(
  invoices: readonly InvoiceSummary[],
): InvoiceSummary[] {
  const unique: InvoiceSummary[] = [];
  const seenIds = new Set<number>();

  for (const invoice of invoices) {
    const invoiceId = requireComparableNumber(invoice.id);
    if (invoiceId === undefined) {
      unique.push(invoice);
      continue;
    }

    if (seenIds.has(invoiceId)) {
      continue;
    }

    seenIds.add(invoiceId);
    unique.push(invoice);
  }

  return unique;
}

function resolveCreditedInvoiceId(
  value: InvoiceSummary["creditedInvoice"],
): number | undefined {
  if (value && typeof value === "object") {
    return requireComparableNumber(value.id);
  }

  return requireComparableNumber(value);
}

function requireComparableNumber(value: unknown): number | undefined {
  const parsed = comparableNumber(value);
  return parsed === null ? undefined : parsed;
}

function comparableNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function requireNumber(value: unknown, label: string): number {
  const parsed = comparableNumber(value);
  if (parsed === null) {
    throw new Error(`Tripletex did not return ${label}.`);
  }
  return parsed;
}

function normalizeText(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

function sameText(left: unknown, right: unknown): boolean {
  return normalizeText(left) === normalizeText(right);
}

function normalizeOrganizationNumber(value: unknown): string {
  return String(value ?? "").replace(/\D+/g, "");
}

function buildCustomerNameNotes(
  actualName: string | null | undefined,
  requestedName: string | undefined,
  organizationNumber: string,
): string[] {
  if (!requestedName || sameText(actualName, requestedName)) {
    return [];
  }

  return [
    `Invoice lookup matched organization number ${organizationNumber}, but stored customer name "${String(actualName ?? "").trim()}" differed from extracted input "${String(requestedName ?? "").trim()}".`,
  ];
}

function assertPositiveNumber(value: unknown, fieldName: string): void {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) {
    throw new Error(`${fieldName} must be a positive number.`);
  }
}

function addDays(dateString: string, days: number): string {
  const date = new Date(`${dateString}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
