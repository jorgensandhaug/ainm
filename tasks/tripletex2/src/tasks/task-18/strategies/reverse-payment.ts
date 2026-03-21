import type {
  StrategyContext,
  StrategyResult,
} from "../../../runtime/contracts";
import type {
  ReverseCustomerInvoicePaymentInput,
  ReverseCustomerInvoicePaymentStrategy,
} from "../task";
import { REVERSE_CUSTOMER_INVOICE_PAYMENT_TASK_ID } from "../task";

interface ListResponse<TValue> {
  values?: TValue[];
}

interface ResponseWrapper<TValue> {
  value?: TValue;
}

interface InvoiceEvidenceLine {
  description?: string | null;
  displayName?: string | null;
}

interface InvoiceEvidenceOrder {
  invoiceComment?: string | null;
  orderLines?: InvoiceEvidenceLine[] | null;
}

interface PostingSummary {
  type?: string | null;
  description?: string | null;
  amountCurrency?: number | null;
  amount?: number | null;
  voucher?: { id?: number | null } | null;
}

interface InvoiceSummary {
  id?: number;
  invoiceNumber?: number | string | null;
  customer?: {
    name?: string | null;
    organizationNumber?: string | number | null;
  } | null;
  amountExcludingVatCurrency?: number | null;
  amountExcludingVat?: number | null;
  amountCurrencyOutstanding?: number | null;
  amountOutstanding?: number | null;
  orderLines?: InvoiceEvidenceLine[] | null;
  orders?: InvoiceEvidenceOrder[] | null;
  postings?: PostingSummary[] | null;
}

export const strategy = {
  strategyId: "18.reverse-payment.v1",
  strategyPath: "src/tasks/task-18/strategies/reverse-payment.ts",
  taskId: REVERSE_CUSTOMER_INVOICE_PAYMENT_TASK_ID,
  name: "Reverse exact invoice payment",
  summary:
    "Locates the exact paid customer invoice, extracts its standalone payment voucher from postings, and reverses that voucher in one write.",
  hypothesis:
    "The trusted 2-call locate-then-reverse flow is the reliable minimum for standalone customer-payment reversals.",
  expectedCallProfile: {
    targetCalls: 2,
    maxCalls: 2,
  },
  stepOutline: [
    "API call 1: GET /invoice or /invoice/{id} with postings expansion to locate the exact paid invoice and extract its payment voucher id.",
    "API call 2: PUT /ledger/voucher/{paymentVoucherId}/:reverse using the prompt date or today's date.",
  ],
  status: "active",
  async run(
    ctx: StrategyContext,
    input: ReverseCustomerInvoicePaymentInput,
  ): Promise<StrategyResult> {
    assertPositiveNumber(
      input.amountExcludingVatNok,
      "amountExcludingVatNok",
    );

    const reversalDate = input.reversalDate ?? ctx.clock.today();
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

    const invoice = input.invoiceId
      ? await loadInvoiceById(ctx, input.invoiceId)
      : await loadInvoiceList(ctx, reversalDate).then((response) =>
          selectExactInvoice(response.values ?? [], requirement),
        );

    validateInvoiceMatch(invoice, requirement);

    const paymentVoucherId = extractPaymentVoucherId(invoice);
    const reverseResponse = await ctx.tripletex.put<
      ResponseWrapper<{ id?: number }>
    >(`/ledger/voucher/${paymentVoucherId}/:reverse`, {
      query: {
        date: reversalDate,
      },
    });
    const reverseVoucherId = requireNumber(
      reverseResponse.value?.id,
      "reverse voucher id",
    );

    return {
      createdEntityIds: {
        reverseVoucherId,
      },
      notes: buildCustomerNameNotes(
        invoice.customer?.name,
        input.customerName,
        normalizedOrgNumber,
      ),
      verification: {
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        paymentVoucherId,
        reversalDate,
      },
    };
  },
} satisfies ReverseCustomerInvoicePaymentStrategy;

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
        fields:
          "*,customer(*),orderLines(*),orders(*,orderLines(*)),postings(*,voucher(*),account(*),customer(*),closeGroup(*))",
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
  dateTo: string,
): Promise<ListResponse<InvoiceSummary>> {
  return ctx.tripletex.get<ListResponse<InvoiceSummary>>("/invoice", {
    query: {
      invoiceDateFrom: "2000-01-01",
      invoiceDateTo: dateTo,
      count: 1000,
      sorting: "-invoiceDate",
      fields:
        "*,customer(*),orderLines(*),orders(*,orderLines(*)),postings(*,voucher(*),account(*),customer(*),closeGroup(*))",
    },
  });
}

function selectExactInvoice(
  invoices: readonly InvoiceSummary[],
  requirement: InvoiceRequirement,
): InvoiceSummary {
  const matches = invoices.filter((invoice) =>
    invoiceMatches(invoice, requirement),
  );

  if (matches.length === 0) {
    throw new Error(
      `Expected one paid invoice for organization number ${requirement.organizationNumber}, description "${requirement.lineDescription}", and amount ${requirement.amountExcludingVatNok}, but none matched.`,
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
    `Expected exactly one paid invoice match, but found ${matches.length}: ${JSON.stringify(
      matches.map((invoice) => ({
        id: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        customerName: invoice.customer?.name ?? null,
        organizationNumber: invoice.customer?.organizationNumber ?? null,
        amountExcludingVat: exVatAmount(invoice),
        outstandingAmount: outstandingAmount(invoice),
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
      `Invoice ${invoice.id ?? "(unknown)"} did not match the required exact-reversal criteria.`,
    );
  }
}

function invoiceMatches(
  invoice: InvoiceSummary,
  requirement: InvoiceRequirement,
): boolean {
  if (
    requirement.invoiceId !== undefined &&
    comparableNumber(invoice.id) !== requirement.invoiceId
  ) {
    return false;
  }

  if (
    requirement.invoiceNumber !== undefined &&
    comparableNumber(invoice.invoiceNumber) !== requirement.invoiceNumber
  ) {
    return false;
  }

  if (
    normalizeOrganizationNumber(invoice.customer?.organizationNumber) !==
    requirement.organizationNumber
  ) {
    return false;
  }

  if (exVatAmount(invoice) !== requirement.amountExcludingVatNok) {
    return false;
  }

  if (outstandingAmount(invoice) !== 0) {
    return false;
  }

  if (!matchesLineEvidence(invoice, requirement.lineDescription)) {
    return false;
  }

  return true;
}

function matchesLineEvidence(
  invoice: InvoiceSummary,
  normalizedDescription: string,
): boolean {
  const evidence = extractEvidence(invoice).map(normalizeText);
  return (
    evidence.includes(normalizedDescription) ||
    evidence.some((value) => value.includes(normalizedDescription))
  );
}

function extractEvidence(invoice: InvoiceSummary): string[] {
  const texts: string[] = [];

  for (const line of invoice.orderLines ?? []) {
    if (line.description) {
      texts.push(line.description);
    }
    if (line.displayName) {
      texts.push(line.displayName);
    }
  }

  for (const order of invoice.orders ?? []) {
    if (order.invoiceComment) {
      texts.push(order.invoiceComment);
    }
    for (const line of order.orderLines ?? []) {
      if (line.description) {
        texts.push(line.description);
      }
      if (line.displayName) {
        texts.push(line.displayName);
      }
    }
  }

  return texts;
}

function extractPaymentVoucherId(invoice: InvoiceSummary): number {
  const postings = invoice.postings ?? [];
  const invoiceVoucherIds = new Set<number>();

  for (const posting of postings) {
    const voucherId = comparableNumber(posting.voucher?.id);
    if (!voucherId) {
      continue;
    }
    if (posting.type === "OUTGOING_INVOICE_CUSTOMER_POSTING") {
      invoiceVoucherIds.add(voucherId);
    }
  }

  const typedPaymentVoucherIds = new Set<number>();
  for (const posting of postings) {
    const voucherId = comparableNumber(posting.voucher?.id);
    if (!voucherId) {
      continue;
    }
    if (
      posting.type === "INCOMING_PAYMENT" ||
      posting.type === "INCOMING_PAYMENT_OPPOSITE"
    ) {
      typedPaymentVoucherIds.add(voucherId);
    }
  }

  if (typedPaymentVoucherIds.size === 1) {
    const voucherId = [...typedPaymentVoucherIds][0];
    if (invoiceVoucherIds.has(voucherId)) {
      throw new Error(
        `Invoice ${invoice.id ?? "(unknown)"} used shared invoice/payment voucher ${voucherId}; this is not the standalone reversal flow.`,
      );
    }
    return voucherId;
  }

  if (typedPaymentVoucherIds.size > 1) {
    throw new Error(
      `Invoice ${invoice.id ?? "(unknown)"} exposed multiple typed payment vouchers: ${[...typedPaymentVoucherIds].join(", ")}.`,
    );
  }

  const fallbackPaymentVoucherIds = new Set<number>();
  for (const posting of postings) {
    const voucherId = comparableNumber(posting.voucher?.id);
    const amount =
      comparableNumber(posting.amountCurrency) ?? comparableNumber(posting.amount);
    const description = normalizeText(posting.description);
    if (!voucherId || amount === null) {
      continue;
    }
    if (amount < 0 && description.startsWith("betaling:")) {
      fallbackPaymentVoucherIds.add(voucherId);
    }
  }

  if (fallbackPaymentVoucherIds.size !== 1) {
    throw new Error(
      `Invoice ${invoice.id ?? "(unknown)"} did not expose exactly one fallback payment voucher: ${[...fallbackPaymentVoucherIds].join(", ")}.`,
    );
  }

  const voucherId = [...fallbackPaymentVoucherIds][0];
  if (invoiceVoucherIds.has(voucherId)) {
    throw new Error(
      `Invoice ${invoice.id ?? "(unknown)"} used shared invoice/payment voucher ${voucherId}; this is not the standalone reversal flow.`,
    );
  }

  return voucherId;
}

function outstandingAmount(invoice: InvoiceSummary): number | null {
  return (
    comparableNumber(invoice.amountCurrencyOutstanding) ??
    comparableNumber(invoice.amountOutstanding)
  );
}

function exVatAmount(invoice: InvoiceSummary): number | null {
  return (
    comparableNumber(invoice.amountExcludingVatCurrency) ??
    comparableNumber(invoice.amountExcludingVat)
  );
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

function normalizeText(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function sameText(
  left: string | null | undefined,
  right: string | null | undefined,
): boolean {
  return normalizeText(left) === normalizeText(right);
}

function normalizeOrganizationNumber(
  value: string | number | null | undefined,
): string {
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
    `Invoice lookup matched organization number ${organizationNumber}, but stored customer name "${(actualName ?? "").trim()}" differed from extracted input "${requestedName.trim()}".`,
  ];
}

function assertPositiveNumber(value: number, fieldName: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${fieldName} must be a positive number.`);
  }
}
