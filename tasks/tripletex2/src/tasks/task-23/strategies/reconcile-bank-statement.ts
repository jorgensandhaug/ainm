import type {
  StrategyContext,
  StrategyResult,
} from "../../../runtime/contracts";
import type {
  ReconcileBankStatementInput,
  ReconcileBankStatementStrategy,
} from "../task";
import { RECONCILE_BANK_STATEMENT_TASK_ID } from "../task";

interface ListResponse<TValue> {
  values?: TValue[];
}

interface ResponseWrapper<TValue> {
  value?: TValue;
}

interface AccountSummary {
  id?: number;
  number?: number | string | null;
  name?: string | null;
  displayName?: string | null;
  isBankAccount?: boolean | null;
  isInvoiceAccount?: boolean | null;
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

interface CustomerInvoiceSummary {
  id?: number;
  invoiceNumber?: number | string | null;
  invoiceDate?: string | null;
  amountCurrencyOutstanding?: number | null;
  amountOutstanding?: number | null;
  amountCurrency?: number | null;
  amountIncludingVatCurrency?: number | null;
  customer?: {
    id?: number;
    name?: string | null;
    organizationNumber?: string | number | null;
  } | null;
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

interface PaymentTypeOutSummary {
  id?: number;
  description?: string | null;
  displayName?: string | null;
  isInactive?: boolean | null;
  showIncomingInvoice?: boolean | null;
  currencyCode?: string | null;
  creditAccount?: {
    number?: string | number | null;
    isBankAccount?: boolean | null;
    isInvoiceAccount?: boolean | null;
  } | null;
}

interface SupplierInvoiceSummary {
  id?: number;
  invoiceNumber?: string | null;
  invoiceDate?: string | null;
  invoiceDueDate?: string | null;
  outstandingAmount?: number | null;
  amountCurrency?: number | null;
  supplier?: {
    id?: number;
    name?: string | null;
    organizationNumber?: string | number | null;
  } | null;
}

interface VoucherSummary {
  id?: number;
  number?: number | string | null;
  postings?: VoucherPostingSummary[] | null;
}

interface VoucherPostingSummary {
  account?: {
    id?: number | null;
    number?: number | string | null;
  } | null;
  amountGross?: number | null;
  amountGrossCurrency?: number | null;
  amount?: number | null;
  amountCurrency?: number | null;
}

interface BankStatementAttachment {
  uploadFileName: string;
  textContent: string;
}

interface BankStatementRow {
  rowNumber: number;
  date: string;
  description: string;
  amountNok: number;
  balanceNok?: number;
}

interface CustomerInvoiceCandidate {
  invoice: CustomerInvoiceSummary;
  score: number;
  exactAmount: boolean;
  partialAmount: boolean;
  strongReference: boolean;
  reason: string[];
}

interface SupplierInvoiceCandidate {
  invoice: SupplierInvoiceSummary;
  score: number;
  exactAmount: boolean;
  partialAmount: boolean;
  strongReference: boolean;
  reason: string[];
}

interface NonInvoiceClassification {
  kind: "bank-fee" | "interest-income";
  account: AccountSummary;
}

interface ProcessedRowResult {
  rowNumber: number;
  date: string;
  description: string;
  amountNok: number;
  action:
    | "customer-payment"
    | "supplier-payment"
    | "manual-voucher";
  targetId: number;
  targetNumber?: number | string | null;
  remainingOutstanding?: number;
}

const DEFAULT_BANK_ACCOUNT_NUMBER = 1920;
const DEFAULT_BANK_FEE_ACCOUNT_NUMBERS = [7770, 7790] as const;
const DEFAULT_INTEREST_INCOME_ACCOUNT_NUMBERS = [8050, 8060] as const;

export const strategy = {
  strategyId: "23.reconcile-bank-statement.v1",
  strategyPath:
    "src/tasks/task-23/strategies/reconcile-bank-statement.ts",
  taskId: RECONCILE_BANK_STATEMENT_TASK_ID,
  name: "CSV-driven bank statement reconciliation",
  summary:
    "Parses the attached bank-statement CSV, matches incoming and outgoing lines to open customer and supplier invoices, applies exact or partial payments, and books clearly classifiable residual bank lines as direct vouchers.",
  hypothesis:
    "A correctness-first task-23 floor can come from treating the CSV as the source of truth, reconciling invoice-linked lines directly, and refusing ambiguous rows instead of relying on brittle bank-import format guesses.",
  expectedCallProfile: {
    targetCalls: 6,
    maxCalls: 18,
  },
  stepOutline: [
    "Read and parse the attached CSV using the Norwegian bank-export columns as first-class evidence.",
    "GET /invoice and GET /supplierInvoice to load the open customer and supplier invoices that may match the bank lines.",
    "GET /invoice/paymentType and GET /ledger/paymentTypeOut to resolve one usable incoming and outgoing payment type.",
    "GET /ledger/account once to resolve bank account 1920 plus deterministic fallback accounts for bank fees and interest income.",
    "For each CSV row, register a customer payment, register a supplier payment, or post a direct voucher only when the line is classifiable with high confidence.",
  ],
  status: "active",
  async run(
    ctx: StrategyContext,
    input: ReconcileBankStatementInput,
  ): Promise<StrategyResult> {
    assertNonEmptyText(input.attachmentFileName, "attachmentFileName");

    const attachment = requireCsvAttachment(ctx, input.attachmentFileName);
    const rows = parseBankStatementCsv(attachment.textContent);
    if (rows.length === 0) {
      throw new Error(
        `Attachment "${attachment.uploadFileName}" did not contain any bank rows with a non-zero amount.`,
      );
    }

    const customerInvoiceResponse = await ctx.tripletex.get<
      ListResponse<CustomerInvoiceSummary>
    >("/invoice", {
      query: {
        invoiceDateFrom: "2000-01-01",
        invoiceDateTo: addDays(maxRowDate(rows), 1),
        count: 1000,
        sorting: "-invoiceDate",
        fields: "*,customer(*),orderLines(*),orders(*,orderLines(*))",
      },
    });
    const supplierInvoiceResponse = await ctx.tripletex.get<
      ListResponse<SupplierInvoiceSummary>
    >("/supplierInvoice", {
      query: {
        invoiceDateFrom: "2000-01-01",
        invoiceDateTo: addDays(maxRowDate(rows), 1),
        count: 1000,
        sorting: "-invoiceDate",
        fields: "*,supplier(*),payments(*),voucher(*)",
      },
    });
    const incomingPaymentTypeResponse = await ctx.tripletex.get<
      ListResponse<PaymentTypeSummary>
    >("/invoice/paymentType", {
      query: {
        count: 1000,
        fields: "*,debitAccount(*),creditAccount(*)",
      },
    });
    const outgoingPaymentTypeResponse = await ctx.tripletex.get<
      ListResponse<PaymentTypeOutSummary>
    >("/ledger/paymentTypeOut", {
      query: {
        count: 1000,
        fields: "*,creditAccount(*)",
      },
    });
    const accountResponse = await ctx.tripletex.get<ListResponse<AccountSummary>>(
      "/ledger/account",
      {
        query: {
          number: uniqueNumbers([
            DEFAULT_BANK_ACCOUNT_NUMBER,
            ...DEFAULT_BANK_FEE_ACCOUNT_NUMBERS,
            ...DEFAULT_INTEREST_INCOME_ACCOUNT_NUMBERS,
          ]).join(","),
          fields: "*",
        },
      },
    );

    const customerInvoices = dedupeById(customerInvoiceResponse.values ?? []).map(
      (invoice) => ({
        ...invoice,
        amountCurrencyOutstanding: customerOutstandingAmount(invoice),
      }),
    );
    const supplierInvoices = dedupeById(supplierInvoiceResponse.values ?? []).map(
      (invoice) => ({
        ...invoice,
        outstandingAmount: supplierOutstandingAmount(invoice),
      }),
    );
    const incomingPaymentType = chooseIncomingPaymentType(
      incomingPaymentTypeResponse.values ?? [],
    );
    const outgoingPaymentType = chooseOutgoingPaymentType(
      outgoingPaymentTypeResponse.values ?? [],
    );
    const accounts = accountResponse.values ?? [];
    const bankAccount = pickExactAccount(
      accounts,
      DEFAULT_BANK_ACCOUNT_NUMBER,
      "bank account 1920",
    );
    const bankAccountId = requireNumber(bankAccount.id, "bank account id");

    const processedRows: ProcessedRowResult[] = [];
    const createdEntityIds: Record<string, number> = {};
    let customerPaymentCount = 0;
    let supplierPaymentCount = 0;
    let voucherCount = 0;

    for (const row of rows) {
      if (row.amountNok > 0) {
        const customerMatch = chooseCustomerInvoiceMatch(row, customerInvoices);
        if (customerMatch) {
          const invoiceId = requireNumber(
            customerMatch.invoice.id,
            "customer invoice id",
          );
          const paidAmount = roundToTwo(row.amountNok);
          const paymentResponse = await ctx.tripletex.put<
            ResponseWrapper<CustomerInvoiceSummary>
          >(`/invoice/${invoiceId}/:payment`, {
            query: {
              paymentDate: row.date,
              paymentTypeId: requireNumber(
                incomingPaymentType.id,
                "incoming payment type id",
              ),
              paidAmount,
            },
          });
          const paidInvoice = requireValue(
            paymentResponse.value,
            "paid customer invoice",
          );
          const remainingOutstanding = customerOutstandingAmount(paidInvoice);
          const expectedOutstanding = roundToTwo(
            customerOutstandingAmount(customerMatch.invoice) - paidAmount,
          );
          if (remainingOutstanding !== expectedOutstanding) {
            throw new Error(
              `Customer invoice ${invoiceId} expected outstanding ${expectedOutstanding} after payment row ${row.rowNumber}, but Tripletex returned ${remainingOutstanding}.`,
            );
          }
          customerMatch.invoice.amountCurrencyOutstanding = remainingOutstanding;
          customerPaymentCount += 1;
          createdEntityIds[`customerInvoice${customerPaymentCount}`] = invoiceId;
          processedRows.push({
            rowNumber: row.rowNumber,
            date: row.date,
            description: row.description,
            amountNok: row.amountNok,
            action: "customer-payment",
            targetId: invoiceId,
            targetNumber: paidInvoice.invoiceNumber,
            remainingOutstanding,
          });
          continue;
        }
      } else {
        const supplierMatch = chooseSupplierInvoiceMatch(row, supplierInvoices);
        if (supplierMatch) {
          const invoiceId = requireNumber(
            supplierMatch.invoice.id,
            "supplier invoice id",
          );
          const paidAmount = roundToTwo(Math.abs(row.amountNok));
          const paymentResponse = await ctx.tripletex.post<
            ResponseWrapper<SupplierInvoiceSummary>
          >(`/supplierInvoice/${invoiceId}/:addPayment`, {
            query: {
              paymentType: requireNumber(
                outgoingPaymentType.id,
                "outgoing payment type id",
              ),
              amount: paidAmount,
              paymentDate: row.date,
              partialPayment:
                paidAmount < supplierOutstandingAmount(supplierMatch.invoice),
            },
          });
          const paidInvoice = requireValue(
            paymentResponse.value,
            "paid supplier invoice",
          );
          const remainingOutstanding = supplierOutstandingAmount(paidInvoice);
          const expectedOutstanding = roundToTwo(
            supplierOutstandingAmount(supplierMatch.invoice) - paidAmount,
          );
          if (remainingOutstanding !== expectedOutstanding) {
            throw new Error(
              `Supplier invoice ${invoiceId} expected outstanding ${expectedOutstanding} after payment row ${row.rowNumber}, but Tripletex returned ${remainingOutstanding}.`,
            );
          }
          supplierMatch.invoice.outstandingAmount = remainingOutstanding;
          supplierPaymentCount += 1;
          createdEntityIds[`supplierInvoice${supplierPaymentCount}`] = invoiceId;
          processedRows.push({
            rowNumber: row.rowNumber,
            date: row.date,
            description: row.description,
            amountNok: row.amountNok,
            action: "supplier-payment",
            targetId: invoiceId,
            targetNumber: paidInvoice.invoiceNumber,
            remainingOutstanding,
          });
          continue;
        }
      }

      const classification = classifyNonInvoiceRow(row, accounts);
      if (!classification) {
        throw new Error(
          `CSV row ${row.rowNumber} could not be matched to an open invoice or a supported non-invoice booking pattern. Description="${row.description}", amount=${row.amountNok}.`,
        );
      }

      const amount = roundToTwo(Math.abs(row.amountNok));
      const counterpartyAccountId = requireNumber(
        classification.account.id,
        `${classification.kind} account id`,
      );
      const isIncoming = row.amountNok > 0;
      const voucherResponse = await ctx.tripletex.post<ResponseWrapper<VoucherSummary>>(
        "/ledger/voucher",
        {
          body: {
            date: row.date,
            description: row.description,
            voucherType: null,
            postings: isIncoming
              ? [
                  {
                    row: 1,
                    date: row.date,
                    description: row.description,
                    account: { id: bankAccountId },
                    amountGross: amount,
                    amountGrossCurrency: amount,
                  },
                  {
                    row: 2,
                    date: row.date,
                    description: row.description,
                    account: { id: counterpartyAccountId },
                    amountGross: -amount,
                    amountGrossCurrency: -amount,
                  },
                ]
              : [
                  {
                    row: 1,
                    date: row.date,
                    description: row.description,
                    account: { id: counterpartyAccountId },
                    amountGross: amount,
                    amountGrossCurrency: amount,
                  },
                  {
                    row: 2,
                    date: row.date,
                    description: row.description,
                    account: { id: bankAccountId },
                    amountGross: -amount,
                    amountGrossCurrency: -amount,
                  },
                ],
          },
        },
      );
      const voucher = requireValue(voucherResponse.value, "manual voucher");
      const voucherId = requireNumber(voucher.id, "manual voucher id");
      verifyVoucherBalance(voucher, amount);
      voucherCount += 1;
      createdEntityIds[`voucher${voucherCount}`] = voucherId;
      processedRows.push({
        rowNumber: row.rowNumber,
        date: row.date,
        description: row.description,
        amountNok: row.amountNok,
        action: "manual-voucher",
        targetId: voucherId,
        targetNumber: voucher.number,
      });
    }

    return {
      createdEntityIds,
      notes: [
        `Processed ${processedRows.length} bank rows from ${attachment.uploadFileName}.`,
        `Registered ${customerPaymentCount} customer payments, ${supplierPaymentCount} supplier payments, and ${voucherCount} direct vouchers.`,
      ],
      verification: {
        attachmentFileName: attachment.uploadFileName,
        processedRows,
        incomingPaymentTypeId: incomingPaymentType.id,
        outgoingPaymentTypeId: outgoingPaymentType.id,
      },
    };
  },
} satisfies ReconcileBankStatementStrategy;

function requireCsvAttachment(
  ctx: StrategyContext,
  attachmentFileName: string,
): BankStatementAttachment {
  const matches = (ctx.request?.files ?? []).filter(
    (file) => file.fileName === attachmentFileName,
  );
  if (matches.length !== 1) {
    throw new Error(
      `Expected exactly one request attachment named "${attachmentFileName}", but found ${matches.length}.`,
    );
  }

  const attachment = matches[0];
  const text =
    attachment.textContent ??
    decodeAttachmentBytes(attachment.contentBase64, attachmentFileName);
  if (!text.trim()) {
    throw new Error(
      `Attachment "${attachmentFileName}" did not include readable text content.`,
    );
  }

  return {
    uploadFileName: attachment.fileName,
    textContent: text,
  };
}

function decodeAttachmentBytes(
  contentBase64: string | undefined,
  attachmentFileName: string,
): string {
  if (!contentBase64) {
    throw new Error(
      `Attachment "${attachmentFileName}" did not include textContent or contentBase64.`,
    );
  }

  return Buffer.from(contentBase64, "base64").toString("utf8");
}

function parseBankStatementCsv(text: string): BankStatementRow[] {
  const lines = text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length < 2) {
    throw new Error("Expected a CSV header and at least one bank-statement row.");
  }

  const delimiter = detectDelimiter(lines[0]);
  const headerCells = splitCsvLine(lines[0], delimiter).map(normalizeHeader);
  const dateIndex = requireHeaderIndex(headerCells, [
    "dato",
    "date",
    "bokforingsdato",
  ]);
  const descriptionIndex = requireHeaderIndex(headerCells, [
    "forklaring",
    "beskrivelse",
    "description",
    "tekst",
  ]);
  const incomingIndex = findHeaderIndex(headerCells, ["inn", "in", "credit"]);
  const outgoingIndex = findHeaderIndex(headerCells, ["ut", "out", "debit"]);
  const amountIndex = findHeaderIndex(headerCells, ["belop", "amount"]);
  const balanceIndex = findHeaderIndex(headerCells, [
    "saldo",
    "balance",
  ]);

  if (
    amountIndex === undefined &&
    (incomingIndex === undefined || outgoingIndex === undefined)
  ) {
    throw new Error(
      `CSV header must include either a single amount column or explicit incoming/outgoing columns. Header: ${JSON.stringify(headerCells)}`,
    );
  }

  const rows: BankStatementRow[] = [];
  for (const [index, line] of lines.slice(1).entries()) {
    const cells = splitCsvLine(line, delimiter);
    if (cells.every((cell) => cell.trim().length === 0)) {
      continue;
    }

    const date = normalizeDateCell(cells[dateIndex] ?? "");
    const description = (cells[descriptionIndex] ?? "").trim();
    if (!date || !description) {
      continue;
    }

    const incomingAmount =
      incomingIndex !== undefined
        ? parseAmountCell(cells[incomingIndex] ?? "")
        : undefined;
    const outgoingAmount =
      outgoingIndex !== undefined
        ? parseAmountCell(cells[outgoingIndex] ?? "")
        : undefined;
    const directAmount =
      amountIndex !== undefined
        ? parseSignedAmountCell(cells[amountIndex] ?? "")
        : undefined;

    const amountNok = roundToTwo(
      directAmount ??
        (incomingAmount ?? 0) -
          (outgoingAmount ?? 0),
    );
    if (amountNok === 0) {
      continue;
    }

    const balanceNok =
      balanceIndex !== undefined
        ? parseSignedAmountCell(cells[balanceIndex] ?? "")
        : undefined;

    rows.push({
      rowNumber: index + 2,
      date,
      description,
      amountNok,
      ...(balanceNok !== undefined ? { balanceNok } : {}),
    });
  }

  return rows;
}

function chooseCustomerInvoiceMatch(
  row: BankStatementRow,
  invoices: readonly CustomerInvoiceSummary[],
): CustomerInvoiceCandidate | undefined {
  const candidates = invoices
    .filter((invoice) => customerOutstandingAmount(invoice) > 0)
    .map((invoice) => scoreCustomerInvoice(row, invoice))
    .filter((candidate) => candidate.score > 0)
    .sort(compareCandidates);

  const winner = candidates[0];
  const runnerUp = candidates[1];
  if (!winner) {
    return undefined;
  }

  if (
    runnerUp &&
    winner.score === runnerUp.score &&
    winner.strongReference === runnerUp.strongReference
  ) {
    throw new Error(
      `Bank row ${row.rowNumber} matched multiple customer invoices equally well: ${JSON.stringify(
        candidates.slice(0, 3).map((candidate) => ({
          invoiceId: candidate.invoice.id,
          invoiceNumber: candidate.invoice.invoiceNumber,
          customerName: candidate.invoice.customer?.name ?? null,
          outstandingAmount: customerOutstandingAmount(candidate.invoice),
          score: candidate.score,
          reason: candidate.reason,
        })),
      )}`,
    );
  }

  if (!winner.strongReference && !winner.exactAmount) {
    return undefined;
  }

  if (!winner.strongReference && winner.partialAmount) {
    return undefined;
  }

  return winner;
}

function chooseSupplierInvoiceMatch(
  row: BankStatementRow,
  invoices: readonly SupplierInvoiceSummary[],
): SupplierInvoiceCandidate | undefined {
  const candidates = invoices
    .filter((invoice) => supplierOutstandingAmount(invoice) > 0)
    .map((invoice) => scoreSupplierInvoice(row, invoice))
    .filter((candidate) => candidate.score > 0)
    .sort(compareCandidates);

  const winner = candidates[0];
  const runnerUp = candidates[1];
  if (!winner) {
    return undefined;
  }

  if (
    runnerUp &&
    winner.score === runnerUp.score &&
    winner.strongReference === runnerUp.strongReference
  ) {
    throw new Error(
      `Bank row ${row.rowNumber} matched multiple supplier invoices equally well: ${JSON.stringify(
        candidates.slice(0, 3).map((candidate) => ({
          invoiceId: candidate.invoice.id,
          invoiceNumber: candidate.invoice.invoiceNumber,
          supplierName: candidate.invoice.supplier?.name ?? null,
          outstandingAmount: supplierOutstandingAmount(candidate.invoice),
          score: candidate.score,
          reason: candidate.reason,
        })),
      )}`,
    );
  }

  if (!winner.strongReference && !winner.exactAmount) {
    return undefined;
  }

  if (!winner.strongReference && winner.partialAmount) {
    return undefined;
  }

  return winner;
}

function scoreCustomerInvoice(
  row: BankStatementRow,
  invoice: CustomerInvoiceSummary,
): CustomerInvoiceCandidate {
  const description = normalizeText(row.description);
  const invoiceNumberText = normalizeText(String(invoice.invoiceNumber ?? ""));
  const customerName = normalizeText(invoice.customer?.name ?? "");
  const organizationNumber = normalizeOrganizationNumber(
    invoice.customer?.organizationNumber,
  );
  const evidence = normalizeText(extractCustomerInvoiceEvidence(invoice));
  const outstandingAmount = customerOutstandingAmount(invoice);
  const rowAmount = roundToTwo(row.amountNok);

  let score = 0;
  const reason: string[] = [];

  const exactAmount = outstandingAmount === rowAmount;
  const partialAmount = rowAmount > 0 && rowAmount < outstandingAmount;
  if (exactAmount) {
    score += 6;
    reason.push("exact-outstanding-amount");
  } else if (partialAmount) {
    score += 2;
    reason.push("partial-outstanding-amount");
  } else {
    return { invoice, score: 0, exactAmount, partialAmount, strongReference: false, reason };
  }

  let strongReference = false;
  if (invoiceNumberText && description.includes(invoiceNumberText)) {
    score += 8;
    strongReference = true;
    reason.push("invoice-number");
  }
  if (customerName && hasMeaningfulTokenOverlap(description, customerName)) {
    score += 5;
    strongReference = true;
    reason.push("customer-name");
  }
  if (organizationNumber && description.includes(organizationNumber)) {
    score += 5;
    strongReference = true;
    reason.push("organization-number");
  }
  if (evidence && hasMeaningfulTokenOverlap(description, evidence)) {
    score += 3;
    reason.push("invoice-evidence");
  }

  return {
    invoice,
    score,
    exactAmount,
    partialAmount,
    strongReference,
    reason,
  };
}

function scoreSupplierInvoice(
  row: BankStatementRow,
  invoice: SupplierInvoiceSummary,
): SupplierInvoiceCandidate {
  const description = normalizeText(row.description);
  const invoiceNumberText = normalizeText(String(invoice.invoiceNumber ?? ""));
  const supplierName = normalizeText(invoice.supplier?.name ?? "");
  const organizationNumber = normalizeOrganizationNumber(
    invoice.supplier?.organizationNumber,
  );
  const outstandingAmount = supplierOutstandingAmount(invoice);
  const rowAmount = roundToTwo(Math.abs(row.amountNok));

  let score = 0;
  const reason: string[] = [];

  const exactAmount = outstandingAmount === rowAmount;
  const partialAmount = rowAmount > 0 && rowAmount < outstandingAmount;
  if (exactAmount) {
    score += 6;
    reason.push("exact-outstanding-amount");
  } else if (partialAmount) {
    score += 2;
    reason.push("partial-outstanding-amount");
  } else {
    return { invoice, score: 0, exactAmount, partialAmount, strongReference: false, reason };
  }

  let strongReference = false;
  if (invoiceNumberText && description.includes(invoiceNumberText)) {
    score += 8;
    strongReference = true;
    reason.push("invoice-number");
  }
  if (supplierName && hasMeaningfulTokenOverlap(description, supplierName)) {
    score += 5;
    strongReference = true;
    reason.push("supplier-name");
  }
  if (organizationNumber && description.includes(organizationNumber)) {
    score += 5;
    strongReference = true;
    reason.push("organization-number");
  }

  return {
    invoice,
    score,
    exactAmount,
    partialAmount,
    strongReference,
    reason,
  };
}

function classifyNonInvoiceRow(
  row: BankStatementRow,
  accounts: readonly AccountSummary[],
): NonInvoiceClassification | undefined {
  const description = normalizeText(row.description);
  if (
    includesAny(description, ["gebyr", "bank fee", "bankgebyr", "fee", "charge"])
  ) {
    return {
      kind: "bank-fee",
      account: pickFallbackAccount(
        accounts,
        DEFAULT_BANK_FEE_ACCOUNT_NUMBERS,
        ["bank", "gebyr", "fee"],
        "bank fee account",
      ),
    };
  }

  if (
    includesAny(description, ["rente", "interest", "innskuddsrente"])
  ) {
    return {
      kind: "interest-income",
      account: pickFallbackAccount(
        accounts,
        DEFAULT_INTEREST_INCOME_ACCOUNT_NUMBERS,
        ["rente", "interest"],
        "interest income account",
      ),
    };
  }

  return undefined;
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

      if (paymentType.debitAccount?.isBankAccount) {
        score += 6;
      }
      if (paymentType.debitAccount?.isInvoiceAccount) {
        score += 4;
      }
      if (debitNumber.startsWith("19")) {
        score += 3;
      }
      if (debitNumber === "1920") {
        score += 3;
      }
      if (name.includes("bank")) {
        score += 2;
      }
      if (name.includes("betalt")) {
        score += 1;
      }
      if (creditNumber.startsWith("15")) {
        score += 1;
      }

      return { paymentType, score };
    })
    .sort((left, right) => right.score - left.score)[0];

  if (!winner?.paymentType.id || winner.score <= 0) {
    throw new Error("Could not resolve a usable incoming customer payment type.");
  }

  return winner.paymentType;
}

function chooseOutgoingPaymentType(
  paymentTypes: readonly PaymentTypeOutSummary[],
): PaymentTypeOutSummary {
  const winner = [...paymentTypes]
    .filter((paymentType) => paymentType.isInactive !== true)
    .map((paymentType) => {
      let score = 0;
      const creditNumber = normalizeAccountNumber(
        paymentType.creditAccount?.number,
      );
      const label = normalizeText(
        paymentType.displayName ?? paymentType.description ?? "",
      );

      if (paymentType.showIncomingInvoice) {
        score += 4;
      }
      if (!paymentType.currencyCode || paymentType.currencyCode === "NOK") {
        score += 2;
      }
      if (creditNumber.startsWith("19")) {
        score += 3;
      }
      if (creditNumber === "1920") {
        score += 4;
      }
      if (label.includes("bank")) {
        score += 2;
      }
      if (paymentType.creditAccount?.isBankAccount) {
        score += 3;
      }
      if (paymentType.creditAccount?.isInvoiceAccount) {
        score += 2;
      }

      return { paymentType, score };
    })
    .sort((left, right) => right.score - left.score)[0];

  if (!winner?.paymentType.id || winner.score <= 0) {
    throw new Error("Could not resolve a usable outgoing supplier payment type.");
  }

  return winner.paymentType;
}

function pickExactAccount(
  accounts: readonly AccountSummary[],
  accountNumber: number,
  label: string,
): AccountSummary {
  const match = accounts.find(
    (account) => normalizeAccountNumber(account.number) === String(accountNumber),
  );
  if (!match?.id) {
    throw new Error(`Could not resolve ${label} account ${accountNumber}.`);
  }

  return match;
}

function pickFallbackAccount(
  accounts: readonly AccountSummary[],
  preferredNumbers: readonly number[],
  nameTokens: readonly string[],
  label: string,
): AccountSummary {
  for (const preferredNumber of preferredNumbers) {
    const exact = accounts.find(
      (account) =>
        normalizeAccountNumber(account.number) === String(preferredNumber),
    );
    if (exact?.id) {
      return exact;
    }
  }

  const fuzzy = accounts.find((account) =>
    nameTokens.some((token) =>
      normalizeText(`${account.name ?? ""} ${account.displayName ?? ""}`).includes(
        normalizeText(token),
      ),
    ),
  );
  if (fuzzy?.id) {
    return fuzzy;
  }

  throw new Error(`Could not resolve ${label}.`);
}

function verifyVoucherBalance(voucher: VoucherSummary, amount: number): void {
  const postings = voucher.postings ?? [];
  if (postings.length !== 2) {
    return;
  }

  const amounts = postings.map((posting) =>
    roundToTwo(
      posting.amountGrossCurrency ??
        posting.amountGross ??
        posting.amountCurrency ??
        posting.amount ??
        0,
    ),
  );
  const absoluteAmounts = amounts.map((entry) => Math.abs(entry)).sort();
  if (
    absoluteAmounts.length !== 2 ||
    absoluteAmounts[0] !== amount ||
    absoluteAmounts[1] !== amount
  ) {
    throw new Error(
      `Voucher ${voucher.id ?? "(unknown)"} did not echo the expected balanced amount ${amount}.`,
    );
  }
}

function customerOutstandingAmount(invoice: CustomerInvoiceSummary): number {
  return roundToTwo(
    requireMaybeNumber(invoice.amountCurrencyOutstanding) ??
      requireMaybeNumber(invoice.amountOutstanding) ??
      0,
  );
}

function supplierOutstandingAmount(invoice: SupplierInvoiceSummary): number {
  return roundToTwo(requireMaybeNumber(invoice.outstandingAmount) ?? 0);
}

function extractCustomerInvoiceEvidence(invoice: CustomerInvoiceSummary): string {
  const parts = [
    invoice.customer?.name,
    invoice.customer?.organizationNumber?.toString(),
    ...(invoice.orderLines ?? []).flatMap((line) => [
      line.description,
      line.displayName,
      line.productName,
    ]),
    ...(invoice.orders ?? []).flatMap((order) => [
      order.comment,
      order.invoiceComment,
      ...(order.orderLines ?? []).flatMap((line) => [
        line.description,
        line.displayName,
        line.productName,
      ]),
    ]),
  ];

  return parts.filter((value): value is string => Boolean(value)).join(" ");
}

function compareCandidates(
  left: { score: number; strongReference: boolean; exactAmount: boolean },
  right: { score: number; strongReference: boolean; exactAmount: boolean },
): number {
  return (
    right.score - left.score ||
    Number(right.strongReference) - Number(left.strongReference) ||
    Number(right.exactAmount) - Number(left.exactAmount)
  );
}

function dedupeById<TValue extends { id?: number | null }>(
  values: readonly TValue[],
): TValue[] {
  const seen = new Set<number>();
  const deduped: TValue[] = [];
  for (const value of values) {
    const id = value.id;
    if (typeof id !== "number" || seen.has(id)) {
      continue;
    }
    seen.add(id);
    deduped.push(value);
  }
  return deduped;
}

function uniqueNumbers(values: readonly number[]): number[] {
  return [...new Set(values.filter((value) => Number.isFinite(value)))];
}

function maxRowDate(rows: readonly BankStatementRow[]): string {
  return [...rows]
    .map((row) => row.date)
    .sort()
    .at(-1) ?? "2100-01-01";
}

function detectDelimiter(headerLine: string): string {
  const candidates = [";", ",", "\t"];
  let best = ";";
  let bestCount = -1;
  for (const candidate of candidates) {
    const count = splitCsvLine(headerLine, candidate).length;
    if (count > bestCount) {
      best = candidate;
      bestCount = count;
    }
  }
  return best;
}

function splitCsvLine(line: string, delimiter: string): string[] {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === "\"") {
      const next = line[index + 1];
      if (inQuotes && next === "\"") {
        current += "\"";
        index += 1;
        continue;
      }
      inQuotes = !inQuotes;
      continue;
    }
    if (!inQuotes && character === delimiter) {
      cells.push(current);
      current = "";
      continue;
    }
    current += character;
  }

  cells.push(current);
  return cells.map((cell) => cell.trim());
}

function normalizeHeader(value: unknown): string {
  return normalizeText(value);
}

function requireHeaderIndex(
  headers: readonly string[],
  aliases: readonly string[],
): number {
  const index = findHeaderIndex(headers, aliases);
  if (index === undefined) {
    throw new Error(
      `CSV header did not contain any of the expected columns ${aliases.join(", ")}.`,
    );
  }
  return index;
}

function findHeaderIndex(
  headers: readonly string[],
  aliases: readonly string[],
): number | undefined {
  const normalizedAliases = aliases.map(normalizeHeader);
  const index = headers.findIndex((header) =>
    normalizedAliases.includes(header),
  );
  return index >= 0 ? index : undefined;
}

function normalizeDateCell(value: unknown): string | undefined {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) {
    return undefined;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }

  const match = trimmed.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/);
  if (!match) {
    return undefined;
  }

  const day = match[1]!.padStart(2, "0");
  const month = match[2]!.padStart(2, "0");
  const year =
    match[3]!.length === 2 ? `20${match[3]}` : match[3]!.padStart(4, "0");
  return `${year}-${month}-${day}`;
}

function parseAmountCell(value: unknown): number | undefined {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) {
    return undefined;
  }

  return roundToTwo(parseNormalizedNumber(trimmed));
}

function parseSignedAmountCell(value: unknown): number | undefined {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) {
    return undefined;
  }

  return roundToTwo(parseNormalizedNumber(trimmed));
}

function parseNormalizedNumber(value: unknown): number {
  const compact = String(value ?? "")
    .replace(/\s+/g, "")
    .replace(/\u00A0/g, "")
    .replace(/\.(?=\d{3}(?:\D|$))/g, "")
    .replace(/,(?=\d{3}(?:\D|$))/g, "")
    .replace(",", ".");
  const parsed = Number(compact);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Could not parse numeric value "${value}".`);
  }
  return parsed;
}

function normalizeText(value: unknown): string {
  const str = String(value ?? "");
  if (!str) {
    return "";
  }

  return str
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function normalizeOrganizationNumber(
  value: string | number | null | undefined,
): string {
  return String(value ?? "").replace(/\D+/g, "");
}

function normalizeAccountNumber(value: string | number | null | undefined): string {
  return String(value ?? "").replace(/\D+/g, "");
}

function hasMeaningfulTokenOverlap(left: unknown, right: unknown): boolean {
  const leftTokens = new Set(
    String(left ?? "").split(/\s+/).filter((token) => token.length >= 4),
  );
  const rightTokens = String(right ?? "")
    .split(/\s+/)
    .filter((token) => token.length >= 4);
  return rightTokens.some((token) => leftTokens.has(token));
}

function includesAny(text: string, candidates: readonly string[]): boolean {
  return candidates.some((candidate) => text.includes(normalizeText(candidate)));
}

function addDays(date: string, days: number): string {
  const utc = new Date(`${date}T00:00:00.000Z`);
  utc.setUTCDate(utc.getUTCDate() + days);
  return utc.toISOString().slice(0, 10);
}

function roundToTwo(value: number): number {
  return Math.round(value * 100) / 100;
}

function requireValue<TValue>(
  value: TValue | null | undefined,
  label: string,
): TValue {
  if (value === null || value === undefined) {
    throw new Error(`Tripletex did not return ${label}.`);
  }
  return value;
}

function requireNumber(
  value: number | string | null | undefined,
  label: string,
): number {
  const numeric =
    typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  if (!Number.isFinite(numeric)) {
    throw new Error(`Expected ${label} to be numeric, got ${String(value)}.`);
  }
  return numeric;
}

function requireMaybeNumber(
  value: number | string | null | undefined,
): number | undefined {
  if (value === null || value === undefined || value === "") {
    return undefined;
  }
  const numeric = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : undefined;
}

function assertNonEmptyText(
  value: string | null | undefined,
  label: string,
): asserts value is string {
  if (!value?.trim()) {
    throw new Error(`Expected ${label} to be a non-empty string.`);
  }
}
