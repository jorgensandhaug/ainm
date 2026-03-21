import type {
  StrategyContext,
  StrategyResult,
} from "../../../runtime/contracts";
import type {
  RegisterCustomerInvoicePaymentInput,
  RegisterCustomerInvoicePaymentStrategy,
} from "../task";
import { REGISTER_CUSTOMER_INVOICE_PAYMENT_TASK_ID } from "../task";

interface ListResponse<TValue> {
  values?: TValue[];
}

interface ResponseWrapper<TValue> {
  value?: TValue;
}

interface InvoiceEvidenceLine {
  description?: string | null;
  displayName?: string | null;
  productName?: string | null;
}

interface InvoiceEvidenceOrder {
  comment?: string | null;
  invoiceComment?: string | null;
  orderLines?: InvoiceEvidenceLine[] | null;
}

interface InvoiceSummary {
  id?: number;
  invoiceNumber?: number | string | null;
  invoiceDate?: string | null;
  comment?: string | null;
  invoiceComment?: string | null;
  deliveryComment?: string | null;
  yourReference?: string | null;
  ourReference?: string | null;
  reference?: string | null;
  customer?: {
    id?: number;
    name?: string | null;
    organizationNumber?: string | number | null;
  } | null;
  currency?: {
    code?: string | null;
  } | null;
  amountExcludingVatCurrency?: number | null;
  amountExcludingVat?: number | null;
  amountCurrencyOutstanding?: number | null;
  amountOutstanding?: number | null;
  orderLines?: InvoiceEvidenceLine[] | null;
  orders?: InvoiceEvidenceOrder[] | null;
}

interface PaymentTypeSummary {
  id?: number;
  name?: string | null;
  debitAccount?: {
    number?: string | number | null;
    isBankAccount?: boolean | null;
    isInvoiceAccount?: boolean | null;
  } | null;
  creditAccount?: {
    number?: string | number | null;
  } | null;
}

type CompletedStrategyResult = StrategyResult & {
  status: "completed";
};

export const strategy = {
  strategyId: "17.register-payment.v1",
  strategyPath: "src/tasks/task-17/strategies/register-payment.ts",
  taskId: REGISTER_CUSTOMER_INVOICE_PAYMENT_TASK_ID,
  name: "Register exact invoice payment",
  summary:
    "Locates the exact unpaid customer invoice from the prompt keys, resolves a valid incoming payment type, and pays the live outstanding amount in one write.",
  hypothesis:
    "The exact-match 3-call path from the trusted standard is the reliable minimum for standalone customer-invoice payment registration.",
  expectedCallProfile: {
    targetCalls: 3,
    maxCalls: 3,
  },
  stepOutline: [
    "API call 1: GET /invoice or /invoice/{id} to locate the exact unpaid invoice from prompt identifiers.",
    "API call 2: GET /invoice/paymentType to resolve a valid incoming bank payment type.",
    "API call 3: PUT /invoice/{id}/:payment using the invoice object's live outstanding amount.",
  ],
  status: "active",
  async run(
    ctx: StrategyContext,
    input: RegisterCustomerInvoicePaymentInput,
  ): Promise<StrategyResult> {
    assertNormalizedDigits(
      input.customerOrganizationNumber,
      "customerOrganizationNumber",
    );
    assertNonEmptyText(input.lineDescription, "lineDescription");
    assertPositiveNumber(
      input.amountExcludingVatNok,
      "amountExcludingVatNok",
    );

    const paymentDate = input.paymentDate ?? ctx.clock.today();
    const normalizedOrgNumber = normalizeOrganizationNumber(
      input.customerOrganizationNumber,
    );
    const normalizedDescription = normalizeText(input.lineDescription);
    const normalizedCustomerName = normalizeText(input.customerName);

    const invoice = input.invoiceId
      ? await loadInvoiceById(ctx, input.invoiceId)
      : await loadInvoiceList(ctx, paymentDate).then((response) =>
          selectExactInvoice(response.values ?? [], {
            invoiceId: input.invoiceId,
            invoiceNumber: input.invoiceNumber,
            organizationNumber: normalizedOrgNumber,
            lineDescription: normalizedDescription,
            customerName: normalizedCustomerName,
            amountExcludingVatNok: input.amountExcludingVatNok,
            requireOutstanding: "positive",
          }),
        );

    validateInvoiceMatch(invoice, {
      invoiceId: input.invoiceId,
      invoiceNumber: input.invoiceNumber,
      organizationNumber: normalizedOrgNumber,
      lineDescription: normalizedDescription,
      customerName: normalizedCustomerName,
      amountExcludingVatNok: input.amountExcludingVatNok,
      requireOutstanding: "positive",
    });

    const invoiceId = requireNumber(invoice.id, "invoice id");
    const outstandingAmount = requireOutstandingAmount(invoice, "positive");

    const paymentTypeResponse = await ctx.tripletex.get<
      ListResponse<PaymentTypeSummary>
    >("/invoice/paymentType", {
      query: {
        count: 1000,
        fields: "*,debitAccount(*),creditAccount(*)",
      },
    });
    const paymentType = chooseIncomingPaymentType(
      paymentTypeResponse.values ?? [],
    );

    const paymentResponse = await ctx.tripletex.put<ResponseWrapper<InvoiceSummary>>(
      `/invoice/${invoiceId}/:payment`,
      {
        query: {
          paymentDate,
          paymentTypeId: requireNumber(paymentType.id, "paymentType id"),
          paidAmount: outstandingAmount,
        },
      },
    );

    const paidInvoice = paymentResponse.value;
    if (!paidInvoice) {
      throw new Error("Tripletex payment response did not include an invoice.");
    }

    const remainingOutstanding = requireOutstandingAmount(paidInvoice, "zero");
    if (remainingOutstanding !== 0) {
      throw new Error(
        `Expected invoice ${invoiceId} to be fully paid, but remaining outstanding was ${remainingOutstanding}.`,
      );
    }

    const notes = buildCustomerNameNotes(
      invoice.customer?.name,
      input.customerName,
      normalizedOrgNumber,
    );

    const result: CompletedStrategyResult = {
      status: "completed",
      notes,
      verification: {
        invoiceId,
        invoiceNumber: invoice.invoiceNumber,
        paymentDate,
        paymentTypeId: paymentType.id,
        paidAmount: outstandingAmount,
        remainingOutstanding,
      },
    };

    return result;
  },
} satisfies RegisterCustomerInvoicePaymentStrategy;

type InvoiceRequirement = {
  invoiceId?: number;
  invoiceNumber?: number;
  organizationNumber: string;
  lineDescription: string;
  customerName: string;
  amountExcludingVatNok: number;
  requireOutstanding: "positive" | "zero";
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
          "*,customer(*),currency(*),orderLines(*),orders(*,orderLines(*))",
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
      invoiceDateTo: addDays(dateTo, 1),
      count: 1000,
      sorting: "-invoiceDate",
      fields: "*,customer(*),currency(*),orderLines(*),orders(*,orderLines(*))",
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
      `Expected one unpaid invoice for organization number ${requirement.organizationNumber}, description "${requirement.lineDescription}", and amount ${requirement.amountExcludingVatNok}, but none matched.`,
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
    `Expected exactly one unpaid invoice match, but found ${matches.length}: ${JSON.stringify(
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
      `Invoice ${invoice.id ?? "(unknown)"} did not match the required exact-payment criteria.`,
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

  if (exVatAmount(invoice) !== requirement.amountExcludingVatNok) {
    return false;
  }

  const liveOutstanding = outstandingAmount(invoice);
  if (requirement.requireOutstanding === "positive") {
    if (liveOutstanding === null || liveOutstanding <= 0) {
      return false;
    }
  } else if (liveOutstanding !== 0) {
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
  return evidence.some(
    (text) =>
      text === normalizedDescription || text.includes(normalizedDescription),
  );
}

function extractEvidence(invoice: InvoiceSummary): string[] {
  const texts: string[] = [];

  pushEvidenceText(texts, invoice.comment);
  pushEvidenceText(texts, invoice.invoiceComment);
  pushEvidenceText(texts, invoice.deliveryComment);
  pushEvidenceText(texts, invoice.yourReference);
  pushEvidenceText(texts, invoice.ourReference);
  pushEvidenceText(texts, invoice.reference);

  for (const line of invoice.orderLines ?? []) {
    pushEvidenceText(texts, line.description);
    pushEvidenceText(texts, line.displayName);
    pushEvidenceText(texts, line.productName);
  }

  for (const order of invoice.orders ?? []) {
    pushEvidenceText(texts, order.comment);
    pushEvidenceText(texts, order.invoiceComment);
    for (const line of order.orderLines ?? []) {
      pushEvidenceText(texts, line.description);
      pushEvidenceText(texts, line.displayName);
      pushEvidenceText(texts, line.productName);
    }
  }

  return texts;
}

function chooseIncomingPaymentType(
  paymentTypes: readonly PaymentTypeSummary[],
): PaymentTypeSummary {
  const winner = [...paymentTypes]
    .map((paymentType) => {
      let score = 0;
      const debitNumber = normalizeAccountNumber(paymentType.debitAccount?.number);
      const creditNumber = normalizeAccountNumber(
        paymentType.creditAccount?.number,
      );
      const name = normalizeText(paymentType.name);

      if (debitNumber.startsWith("19")) {
        score += 10;
      }
      if (paymentType.debitAccount?.isBankAccount) {
        score += 5;
      }
      if (paymentType.debitAccount?.isInvoiceAccount) {
        score += 3;
      }
      if (name.includes("bank")) {
        score += 2;
      }
      if (name.includes("betalt")) {
        score += 1;
      }
      if (!creditNumber) {
        score += 1;
      }

      return { paymentType, score };
    })
    .sort((left, right) => right.score - left.score)[0];

  if (!winner?.paymentType.id || winner.score <= 0) {
    throw new Error("Tripletex did not return a usable incoming payment type.");
  }

  return winner.paymentType;
}

function requireOutstandingAmount(
  invoice: InvoiceSummary,
  expectation: "positive" | "zero",
): number {
  const value = outstandingAmount(invoice);

  if (value === null) {
    throw new Error(
      `Invoice ${invoice.id ?? "(unknown)"} did not include an outstanding amount.`,
    );
  }

  if (expectation === "positive" && value <= 0) {
    throw new Error(
      `Invoice ${invoice.id ?? "(unknown)"} was not unpaid; outstanding amount was ${value}.`,
    );
  }

  if (expectation === "zero" && value !== 0) {
    throw new Error(
      `Invoice ${invoice.id ?? "(unknown)"} still had outstanding amount ${value}.`,
    );
  }

  return value;
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

function normalizeAccountNumber(
  value: string | number | null | undefined,
): string {
  return normalizeOrganizationNumber(value);
}

function pushEvidenceText(texts: string[], value: string | null | undefined): void {
  if (value) {
    texts.push(value);
  }
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

function assertNonEmptyText(value: string, fieldName: string): void {
  if (normalizeText(value) === "") {
    throw new Error(`${fieldName} must be a non-empty string.`);
  }
}

function assertNormalizedDigits(value: string, fieldName: string): void {
  if (normalizeOrganizationNumber(value) === "") {
    throw new Error(`${fieldName} must include at least one digit.`);
  }
}

function addDays(dateString: string, days: number): string {
  const date = new Date(`${dateString}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
