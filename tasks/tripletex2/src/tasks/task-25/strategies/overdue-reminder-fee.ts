import type {
  StrategyContext,
  StrategyResult,
  TripletexClient,
} from "../../../runtime/contracts";
import { TripletexHttpError } from "../../../runtime/tripletex-client";
import type {
  OverdueReminderFeeInput,
  OverdueReminderFeeStrategy,
} from "../task";
import { OVERDUE_REMINDER_FEE_TASK_ID } from "../task";

interface ListResponse<TValue> {
  values?: TValue[];
}

interface ResponseWrapper<TValue> {
  value?: TValue;
}

interface CustomerSummary {
  id?: number;
}

interface InvoiceSummary {
  id?: number;
  invoiceNumber?: number | string | null;
  invoiceDueDate?: string | null;
  amountCurrencyOutstanding?: number | null;
  amountOutstanding?: number | null;
  amountCurrency?: number | null;
  amountIncludingVatCurrency?: number | null;
  customer?: CustomerSummary | null;
}

interface AccountSummary {
  id?: number;
  number?: number | string | null;
  isBankAccount?: boolean | null;
  isInvoiceAccount?: boolean | null;
  bankAccountNumber?: string | null;
  version?: number | null;
}

interface PaymentTypeSummary {
  id?: number;
  debitAccount?: {
    number?: number | string | null;
    isBankAccount?: boolean | null;
    isInvoiceAccount?: boolean | null;
  } | null;
  creditAccount?: {
    number?: number | string | null;
  } | null;
}

interface VoucherSummary {
  id?: number;
  number?: number | null;
}

type CompletedStrategyResult = StrategyResult & {
  status: "completed";
};

type StrategyApiClient = Pick<TripletexClient, "get" | "post" | "put">;

const REMINDER_FEE_NOK = 50;
const PARTIAL_PAYMENT_NOK = 5000;
const REMINDER_RECEIVABLE_ACCOUNT = 1500;
const REMINDER_INCOME_ACCOUNT = 3400;
const REMINDER_DESCRIPTION = "Purregebyr";
const BANK_ACCOUNT_VALIDATION_MESSAGE =
  "Faktura kan ikke opprettes før selskapet har registrert et bankkontonummer.";

export const strategy = {
  strategyId: "25.overdue-reminder-fee.v1",
  strategyPath: "src/tasks/task-25/strategies/overdue-reminder-fee.ts",
  taskId: OVERDUE_REMINDER_FEE_TASK_ID,
  name: "Overdue reminder fee and partial payment",
  summary:
    "Finds the one overdue unpaid invoice, posts the reminder-fee voucher, creates and sends the reminder-fee invoice, then registers the fixed partial payment.",
  hypothesis:
    "The proven production path is one bounded invoice scan, one payment-type read, one account read, then three writes, with company-bank-account repair only if invoice creation is blocked.",
  expectedCallProfile: {
    targetCalls: 6,
    maxCalls: 9,
  },
  stepOutline: [
    "API call 1: GET /invoice with expanded customer data and locate the single overdue unpaid invoice.",
    "API call 2: GET /invoice/paymentType and score one usable incoming payment type.",
    "API call 3: GET /ledger/account for accounts 1500 and 3400.",
    "API call 4: POST /ledger/voucher for the 50 NOK reminder-fee ledger posting.",
    "API call 5: POST /invoice?sendToCustomer=true to create and send the reminder-fee invoice for the same customer.",
    "API call 6: PUT /invoice/{id}/:payment with the fixed 5000 NOK partial payment.",
    "Conditional recovery: if invoice creation is blocked by a missing company bank account, repair one bank account and retry the same invoice write once.",
  ],
  status: "active",
  async run(
    ctx: StrategyContext,
    _input: OverdueReminderFeeInput,
  ): Promise<StrategyResult> {
    const api = resolveApiClient(ctx);
    const runDate = ctx.clock.today();

    const invoiceResponse = await api.get<ListResponse<InvoiceSummary>>("/invoice", {
      query: {
        invoiceDateFrom: "1900-01-01",
        invoiceDateTo: "2100-12-31",
        count: 1000,
        sorting: "-invoiceDate",
        fields: "*,customer(*)",
      },
    });
    const overdueInvoice = selectSingleOverdueInvoice(
      dedupeInvoicesById(invoiceResponse.values ?? []),
      runDate,
    );

    const overdueInvoiceId = requireNumber(overdueInvoice.id, "overdue invoice id");
    const customerId = requireNumber(
      overdueInvoice.customer?.id,
      "overdue invoice customer id",
    );
    const outstandingBefore = requireOutstandingAmount(overdueInvoice);
    if (outstandingBefore < PARTIAL_PAYMENT_NOK) {
      throw new Error(
        `Expected overdue invoice ${overdueInvoiceId} outstanding amount to be at least ${PARTIAL_PAYMENT_NOK}, but got ${outstandingBefore}.`,
      );
    }

    const paymentTypeResponse = await api.get<ListResponse<PaymentTypeSummary>>(
      "/invoice/paymentType",
      {
        query: {
          count: 1000,
          fields: "*,debitAccount(*),creditAccount(*)",
        },
      },
    );
    const paymentType = choosePaymentType(paymentTypeResponse.values ?? []);

    const accountResponse = await api.get<ListResponse<AccountSummary>>(
      "/ledger/account",
      {
        query: {
          number: `${REMINDER_RECEIVABLE_ACCOUNT},${REMINDER_INCOME_ACCOUNT}`,
          fields: "*",
        },
      },
    );
    const reminderReceivableAccount = pickAccountByNumber(
      accountResponse.values ?? [],
      REMINDER_RECEIVABLE_ACCOUNT,
    );
    const reminderIncomeAccount = pickAccountByNumber(
      accountResponse.values ?? [],
      REMINDER_INCOME_ACCOUNT,
    );

    const description = `${REMINDER_DESCRIPTION} ${
      overdueInvoice.invoiceNumber ?? overdueInvoiceId
    }`;
    const voucherResponse = await api.post<ResponseWrapper<VoucherSummary>>(
      "/ledger/voucher",
      {
        body: {
          date: runDate,
          description,
          voucherType: null,
          postings: [
            {
              row: 1,
              date: runDate,
              description,
              account: {
                id: requireNumber(
                  reminderReceivableAccount.id,
                  "reminder receivable account id",
                ),
              },
              customer: { id: customerId },
              currency: { id: 1 },
              amount: REMINDER_FEE_NOK,
              amountCurrency: REMINDER_FEE_NOK,
              amountGross: REMINDER_FEE_NOK,
              amountGrossCurrency: REMINDER_FEE_NOK,
            },
            {
              row: 2,
              date: runDate,
              description,
              account: {
                id: requireNumber(
                  reminderIncomeAccount.id,
                  "reminder income account id",
                ),
              },
              currency: { id: 1 },
              amount: -REMINDER_FEE_NOK,
              amountCurrency: -REMINDER_FEE_NOK,
              amountGross: -REMINDER_FEE_NOK,
              amountGrossCurrency: -REMINDER_FEE_NOK,
            },
          ],
        },
      },
    );
    const voucher = requireValue(voucherResponse.value, "voucher");

    const feeInvoiceOutcome = await createReminderFeeInvoice(api, customerId, runDate);
    const feeInvoice = requireValue(feeInvoiceOutcome.response.value, "fee invoice");
    const feeInvoiceId = requireNumber(feeInvoice.id, "fee invoice id");

    const paymentResponse = await api.put<ResponseWrapper<InvoiceSummary>>(
      `/invoice/${overdueInvoiceId}/:payment`,
      {
        query: {
          paymentDate: runDate,
          paymentTypeId: requireNumber(paymentType.id, "payment type id"),
          paidAmount: PARTIAL_PAYMENT_NOK,
        },
      },
    );
    const updatedInvoice = requireValue(
      paymentResponse.value,
      "paid overdue invoice",
    );
    const remainingOutstanding = requireOutstandingAmount(updatedInvoice);
    if (remainingOutstanding !== outstandingBefore - PARTIAL_PAYMENT_NOK) {
      throw new Error(
        `Expected overdue invoice ${overdueInvoiceId} remaining outstanding amount to be ${outstandingBefore - PARTIAL_PAYMENT_NOK}, but got ${remainingOutstanding}.`,
      );
    }

    const notes: string[] = [];
    if (feeInvoiceOutcome.usedBankAccountRepair) {
      notes.push(
        "Tripletex required a company bank account before sending the reminder-fee invoice, so the strategy repaired one bank account and retried the same invoice write.",
      );
    }

    const result: CompletedStrategyResult = {
      status: "completed",
      createdEntityIds: {
        customerId,
        voucherId: requireNumber(voucher.id, "voucher id"),
        feeInvoiceId,
      },
      notes,
      verification: {
        runDate,
        overdueInvoiceId,
        overdueInvoiceNumber: overdueInvoice.invoiceNumber,
        overdueOutstandingBefore: outstandingBefore,
        partialPaymentAmount: PARTIAL_PAYMENT_NOK,
        remainingOutstanding,
        voucherNumber: voucher.number,
        feeInvoiceNumber: feeInvoice.invoiceNumber,
        feeInvoiceAmount:
          feeInvoice.amountCurrency ?? feeInvoice.amountIncludingVatCurrency,
        paymentTypeId: paymentType.id,
        reminderFeeAmount: REMINDER_FEE_NOK,
        sendToCustomerRequested: true,
        usedBankAccountRepair: feeInvoiceOutcome.usedBankAccountRepair,
      },
    };

    return result;
  },
} satisfies OverdueReminderFeeStrategy;

async function createReminderFeeInvoice(
  api: StrategyApiClient,
  customerId: number,
  runDate: string,
): Promise<{
  response: ResponseWrapper<InvoiceSummary>;
  usedBankAccountRepair: boolean;
}> {
  const body = {
    invoiceDate: runDate,
    invoiceDueDate: runDate,
    customer: { id: customerId },
    orders: [
      {
        customer: { id: customerId },
        orderDate: runDate,
        deliveryDate: runDate,
        orderLines: [
          {
            description: REMINDER_DESCRIPTION,
            count: 1,
            unitPriceExcludingVatCurrency: REMINDER_FEE_NOK,
          },
        ],
      },
    ],
  };

  try {
    return {
      response: await api.post<ResponseWrapper<InvoiceSummary>>("/invoice", {
        query: {
          sendToCustomer: true,
        },
        body,
      }),
      usedBankAccountRepair: false,
    };
  } catch (error) {
    if (!needsBankAccountRepair(error)) {
      throw error;
    }

    await repairMissingCompanyBankAccount(api);
    return {
      response: await api.post<ResponseWrapper<InvoiceSummary>>("/invoice", {
        query: {
          sendToCustomer: true,
        },
        body,
      }),
      usedBankAccountRepair: true,
    };
  }
}

function resolveApiClient(ctx: StrategyContext): StrategyApiClient {
  const ctxWithFetch = ctx as StrategyContext & {
    fetch?: StrategyApiClient;
  };

  return ctxWithFetch.fetch ?? ctx.tripletex;
}

function selectSingleOverdueInvoice(
  invoices: readonly InvoiceSummary[],
  runDate: string,
): InvoiceSummary {
  const overdueInvoices = invoices.filter((invoice) => isOverdueInvoice(invoice, runDate));

  if (overdueInvoices.length !== 1) {
    throw new Error(
      `Expected exactly one overdue unpaid invoice, but found ${overdueInvoices.length}.`,
    );
  }

  return overdueInvoices[0];
}

function isOverdueInvoice(invoice: InvoiceSummary, runDate: string): boolean {
  return (
    typeof invoice.invoiceDueDate === "string" &&
    invoice.invoiceDueDate < runDate &&
    requireOutstandingAmount(invoice) > 0
  );
}

function dedupeInvoicesById(
  invoices: readonly InvoiceSummary[],
): InvoiceSummary[] {
  const seen = new Set<number>();
  const deduped: InvoiceSummary[] = [];

  for (const invoice of invoices) {
    const id = invoice.id;
    if (typeof id === "number") {
      if (seen.has(id)) {
        continue;
      }
      seen.add(id);
    }

    deduped.push(invoice);
  }

  return deduped;
}

function choosePaymentType(
  paymentTypes: readonly PaymentTypeSummary[],
): PaymentTypeSummary {
  const usable = paymentTypes.filter((paymentType) => typeof paymentType.id === "number");
  if (usable.length === 0) {
    throw new Error("Tripletex did not return a usable invoice payment type.");
  }

  return [...usable].sort(
    (left, right) => scorePaymentType(right) - scorePaymentType(left),
  )[0];
}

function scorePaymentType(paymentType: PaymentTypeSummary): number {
  const debitNumber = normalizeAccountNumber(paymentType.debitAccount?.number);
  const creditNumber = normalizeAccountNumber(paymentType.creditAccount?.number);
  let score = 0;

  if (debitNumber.startsWith("19")) {
    score += 8;
  }
  if (paymentType.debitAccount?.isBankAccount) {
    score += 5;
  }
  if (paymentType.debitAccount?.isInvoiceAccount) {
    score += 3;
  }
  if (creditNumber === String(REMINDER_RECEIVABLE_ACCOUNT)) {
    score += 2;
  }

  return score;
}

function pickAccountByNumber(
  accounts: readonly AccountSummary[],
  accountNumber: number,
): AccountSummary {
  const matches = accounts.filter(
    (account) => normalizeAccountNumber(account.number) === String(accountNumber),
  );

  if (matches.length !== 1) {
    throw new Error(
      `Expected exactly one ledger account ${accountNumber}, but found ${matches.length}.`,
    );
  }

  return matches[0];
}

async function repairMissingCompanyBankAccount(
  api: StrategyApiClient,
): Promise<void> {
  const accountResponse = await api.get<ListResponse<AccountSummary>>(
    "/ledger/account",
    {
      query: {
        isBankAccount: true,
        fields: "*",
      },
    },
  );
  const account = chooseRepairableBankAccount(accountResponse.values ?? []);

  await api.put(`/ledger/account/${requireNumber(account.id, "bank account id")}`, {
    body: {
      id: account.id,
      ...(typeof account.version === "number" ? { version: account.version } : {}),
      bankAccountNumber: chooseRepairBankAccountNumber(account.bankAccountNumber),
    },
  });
}

function chooseRepairableBankAccount(
  accounts: readonly AccountSummary[],
): AccountSummary {
  const preferred =
    accounts.find(
      (account) =>
        account.isInvoiceAccount === true &&
        normalizeAccountNumber(account.number) === "1920",
    ) ??
    accounts.find((account) => account.isInvoiceAccount === true) ??
    accounts.find((account) => normalizeAccountNumber(account.number) === "1920") ??
    accounts[0];

  if (!preferred?.id) {
    throw new Error(
      "Tripletex required a company bank account, but no bank ledger account was available for repair.",
    );
  }

  return preferred;
}

function chooseRepairBankAccountNumber(existingValue: string | null | undefined): string {
  const normalized = normalizeAccountNumber(existingValue);
  if (/^\d{11}$/.test(normalized)) {
    return normalized;
  }

  return "12345678903";
}

function needsBankAccountRepair(error: unknown): boolean {
  return (
    error instanceof TripletexHttpError &&
    error.status === 422 &&
    error.message.includes(BANK_ACCOUNT_VALIDATION_MESSAGE)
  );
}

function requireValue<TValue>(
  value: TValue | undefined,
  label: string,
): TValue {
  if (value === undefined) {
    throw new Error(`Tripletex did not return a ${label} payload.`);
  }

  return value;
}

function requireNumber(
  value: number | string | null | undefined,
  label: string,
): number {
  const normalized = Number(value);
  if (!Number.isFinite(normalized)) {
    throw new Error(`Tripletex did not return a valid ${label}.`);
  }

  return normalized;
}

function requireOutstandingAmount(invoice: InvoiceSummary): number {
  const outstanding =
    invoice.amountCurrencyOutstanding ?? invoice.amountOutstanding;
  const normalized = Number(outstanding);

  if (!Number.isFinite(normalized)) {
    throw new Error(
      "Tripletex did not return amountCurrencyOutstanding or amountOutstanding on the invoice payload.",
    );
  }

  return normalized;
}

function normalizeAccountNumber(
  value: number | string | null | undefined,
): string {
  return String(value ?? "").replace(/\s+/g, "");
}
