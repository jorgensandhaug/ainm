const BASE_URL = "https://kkpqfuj-amager.tripletex.dev/v2";
const SESSION_TOKEN =
  "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";

const INVOICE_DATE = "2026-03-20";
const INVOICE_DUE_DATE = "2026-04-03";
const DESCRIPTION = "Datenberatung";
const AMOUNT_EX_VAT = 45150;
const REPAIR_BANK_ACCOUNT_NUMBER = "12345678903";

type ApiList<T> = { values?: T[] };
type ApiValue<T> = { value?: T };

type Customer = { id: number };
type VatType = {
  id: number;
  percentage?: number | null;
  parentType?: { id?: number | null } | null;
};
type LedgerAccount = {
  id: number;
  number?: number | string | null;
  isInvoiceAccount?: boolean | null;
};
type Invoice = {
  id: number;
  invoiceNumber?: number | string | null;
  amountExcludingVatCurrency?: number | null;
  amountCurrency?: number | null;
};

class ApiError extends Error {
  status: number;
  payload: unknown;

  constructor(status: number, payload: unknown) {
    super(`${status}`);
    this.status = status;
    this.payload = payload;
  }
}

const AUTH_HEADER = `Basic ${Buffer.from(`0:${SESSION_TOKEN}`, "utf8").toString("base64")}`;

function buildUrl(path: string): string {
  return new URL(path.replace(/^\//, ""), BASE_URL.endsWith("/") ? BASE_URL : `${BASE_URL}/`).toString();
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const response = await fetch(buildUrl(path), {
    method,
    headers: {
      Authorization: AUTH_HEADER,
      Accept: "application/json",
      ...(body === undefined ? {} : { "Content-Type": "application/json; charset=utf-8" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;
  if (!response.ok) throw new ApiError(response.status, payload);
  return payload as T;
}

function deepText(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map((item) => deepText(item)).join(" ");
  if (value && typeof value === "object") {
    return Object.values(value as Record<string, unknown>)
      .map((item) => deepText(item))
      .join(" ");
  }
  return String(value ?? "");
}

function isMissingBankAccount(error: unknown): error is ApiError {
  return (
    error instanceof ApiError &&
    error.status === 422 &&
    deepText(error.payload).includes("Faktura kan ikke opprettes før selskapet har registrert et bankkontonummer.")
  );
}

function chooseZeroVat(values: VatType[]): VatType {
  const zero = values.filter((entry) => Number(entry.percentage) === 0);
  if (zero.length === 0) throw new Error("No outgoing 0% VAT type available");
  return zero.find((entry) => {
    const parentId = entry.parentType?.id;
    return parentId === 0 || parentId === undefined || parentId === null;
  }) ?? zero[0];
}

function chooseInvoiceBankAccount(values: LedgerAccount[]): LedgerAccount {
  return (
    values.find((entry) => entry.isInvoiceAccount && String(entry.number) === "1920") ??
    values.find((entry) => entry.isInvoiceAccount) ??
    values.find((entry) => String(entry.number) === "1920") ??
    values[0] ??
    (() => {
      throw new Error("No bank account available for repair");
    })()
  );
}

function makeOrgNumber(): string {
  const weights = [3, 2, 7, 6, 5, 4, 3, 2];
  for (let i = 0; i < 1000; i += 1) {
    const stem = `999${`${Date.now() + i}`.slice(-5)}`;
    const digits = stem.split("").map(Number);
    const sum = digits.reduce((acc, digit, index) => acc + digit * weights[index], 0);
    const remainder = sum % 11;
    const control = remainder === 0 ? 0 : 11 - remainder;
    if (control < 10) return `${stem}${control}`;
  }
  throw new Error("Unable to generate valid organization number");
}

async function repairBankAccount(): Promise<void> {
  const accounts = await request<ApiList<LedgerAccount>>("GET", "ledger/account?isBankAccount=true&fields=*");
  const target = chooseInvoiceBankAccount(accounts.values ?? []);
  await request<ApiValue<LedgerAccount>>("PUT", `ledger/account/${target.id}`, {
    bankAccountNumber: REPAIR_BANK_ACCOUNT_NUMBER,
  });
}

async function main(): Promise<void> {
  const organizationNumber = makeOrgNumber();
  const customerName = `Bergwerk Reflection ${organizationNumber} GmbH`;

  const customer = await request<ApiValue<Customer>>("POST", "customer", {
    name: customerName,
    organizationNumber,
    invoiceSendMethod: "MANUAL",
  });
  const customerId = customer.value?.id;
  if (!customerId) throw new Error("Customer create returned no id");

  const vatResponse = await request<ApiList<VatType>>(
    "GET",
    `ledger/vatType?typeOfVat=OUTGOING&vatDate=${INVOICE_DATE}&fields=*`,
  );
  const vatRows = (vatResponse.values ?? []).map((entry) => ({
    id: entry.id,
    percentage: entry.percentage ?? null,
  }));
  const zeroVat = chooseZeroVat(vatResponse.values ?? []);

  const payload = {
    invoiceDate: INVOICE_DATE,
    invoiceDueDate: INVOICE_DUE_DATE,
    customer: { id: customerId },
    orders: [
      {
        customer: { id: customerId },
        orderDate: INVOICE_DATE,
        deliveryDate: INVOICE_DATE,
        orderLines: [
          {
            description: DESCRIPTION,
            count: 1,
            unitPriceExcludingVatCurrency: AMOUNT_EX_VAT,
            vatType: { id: zeroVat.id },
          },
        ],
      },
    ],
  };

  let invoiceResponse: ApiValue<Invoice>;
  try {
    invoiceResponse = await request<ApiValue<Invoice>>("POST", "invoice", payload);
  } catch (error) {
    if (!isMissingBankAccount(error)) throw error;
    await repairBankAccount();
    invoiceResponse = await request<ApiValue<Invoice>>("POST", "invoice", payload);
  }

  const invoice = invoiceResponse.value;
  if (!invoice?.id) throw new Error("Invoice create returned no id");
  if (Number(invoice.amountExcludingVatCurrency) !== AMOUNT_EX_VAT) {
    throw new Error(`Wrong ex-VAT total: ${JSON.stringify(invoice)}`);
  }
  if (Number(invoice.amountCurrency) !== AMOUNT_EX_VAT) {
    throw new Error(`Wrong total: ${JSON.stringify(invoice)}`);
  }

  console.log(
    JSON.stringify(
      {
        organizationNumber,
        customerId,
        vatRows,
        chosenVatTypeId: zeroVat.id,
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber ?? null,
        amountExcludingVatCurrency: invoice.amountExcludingVatCurrency ?? null,
        amountCurrency: invoice.amountCurrency ?? null,
      },
      null,
      2,
    ),
  );
}

await main();
