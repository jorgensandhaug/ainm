import { Buffer } from "node:buffer";

const BASE_URL = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN =
  "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";

const TODAY = "2026-03-20";
const FIXED_PRICE = 1000;
const PARTIAL_AMOUNT = 250;
const RUN_TAG = "codex-postrun-20260320-fixed-price-bank-repair";

const auth = `Basic ${Buffer.from(`0:${TOKEN}`).toString("base64")}`;

type Json = Record<string, any>;

async function api<T = any>(
  method: string,
  path: string,
  options: {
    query?: Record<string, string | number | boolean | undefined>;
    body?: unknown;
  } = {},
): Promise<T> {
  const url = new URL(`${BASE_URL}${path}`);
  for (const [key, value] of Object.entries(options.query ?? {})) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }

  const response = await fetch(url, {
    method,
    headers: {
      Authorization: auth,
      Accept: "application/json",
      ...(options.body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : null;

  if (!response.ok) {
    const error = new Error(`${method} ${url.pathname}${url.search} -> ${response.status}`);
    (error as any).details = data;
    throw error;
  }

  return data as T;
}

function controlDigit(firstTen: string): string | null {
  const digits = firstTen.split("").map(Number);
  let sum = 0;
  let weight = 2;
  for (let i = digits.length - 1; i >= 0; i--) {
    sum += digits[i] * weight;
    weight = weight === 7 ? 2 : weight + 1;
  }
  const remainder = 11 - (sum % 11);
  const digit = remainder === 11 ? 0 : remainder;
  if (digit === 10) return null;
  return String(digit);
}

function generateBankAccountNumber(existing: Set<string>): string {
  for (let prefix = 1000000000; prefix < 1000005000; prefix++) {
    const firstTen = String(prefix).padStart(10, "0");
    const digit = controlDigit(firstTen);
    if (!digit) continue;
    const candidate = `${firstTen}${digit}`;
    if (!existing.has(candidate)) return candidate;
  }
  throw new Error("Could not generate unique bank account number");
}

function pickVatType(values: any[]): any {
  const withPercent = values
    .filter((v) => typeof v?.percentage === "number")
    .sort((a, b) => b.percentage - a.percentage);
  const exactly25 = withPercent.find((v) => v.percentage === 25);
  if (exactly25) return exactly25;
  const positive = withPercent.find((v) => v.percentage > 0);
  return positive ?? values[0];
}

function pickInvoiceBankAccount(values: any[]): any | undefined {
  return (
    values.find((account) => account?.isInvoiceAccount && Number(account?.number) === 1920) ??
    values.find((account) => account?.isInvoiceAccount) ??
    values[0]
  );
}

async function main() {
  const employees = await api<Json>("GET", "/employee", {
    query: {
      assignableProjectManagers: true,
      count: 10,
      fields: "*",
    },
  });
  const projectManager = (employees.values ?? [])[0];
  if (!projectManager?.id) {
    throw new Error("No assignable project manager found in sandbox");
  }

  const customerCreate = await api<Json>("POST", "/customer", {
    body: {
      name: `${RUN_TAG} customer`,
      invoiceSendMethod: "MANUAL",
    },
  });
  const customer = customerCreate.value;

  const projectCreate = await api<Json>("POST", "/project", {
    body: {
      name: `${RUN_TAG} project`,
      startDate: TODAY,
      customer: { id: customer.id },
      projectManager: { id: projectManager.id },
      isFixedPrice: true,
      fixedprice: FIXED_PRICE,
      invoiceOnAccountVatHigh: false,
    },
  });
  const project = projectCreate.value;

  const vatTypeSearch = await api<Json>("GET", "/ledger/vatType", {
    query: {
      typeOfVat: "OUTGOING",
      vatDate: TODAY,
      fields: "*",
    },
  });
  const vatType = pickVatType(vatTypeSearch.values ?? []);
  if (!vatType?.id) {
    throw new Error("No outgoing VAT type found in sandbox");
  }

  const orderCreate = await api<Json>("POST", "/order", {
    body: {
      customer: { id: customer.id },
      project: { id: project.id },
      orderDate: TODAY,
      deliveryDate: TODAY,
      invoiceOnAccountVatHigh: false,
      orderLines: [
        {
          description: `${RUN_TAG} partial billing`,
          count: 1,
          unitPriceExcludingVatCurrency: PARTIAL_AMOUNT,
          vatType: { id: vatType.id },
        },
      ],
    },
  });
  const order = orderCreate.value;

  const accounts = await api<Json>("GET", "/ledger/account", {
    query: {
      isBankAccount: true,
      fields: "*",
    },
  });
  const bankAccounts = accounts.values ?? [];
  const invoiceAccount = pickInvoiceBankAccount(bankAccounts);
  if (!invoiceAccount?.id) {
    throw new Error("No invoice bank account found in sandbox");
  }

  let invoice: any;
  let bankRepairTriggered = false;

  try {
    const invoiceCreate = await api<Json>("PUT", `/order/${order.id}/:invoice`, {
      query: {
        invoiceDate: TODAY,
        sendToCustomer: false,
      },
    });
    invoice = invoiceCreate.value;
  } catch (error: any) {
    const message =
      error?.details?.validationMessages?.[0]?.message ??
      error?.details?.message ??
      "";
    if (!String(message).includes("registrert et bankkontonummer")) {
      throw error;
    }

    bankRepairTriggered = true;
    const existingNumbers = new Set(
      bankAccounts
        .map((account: any) => String(account?.bankAccountNumber ?? "").trim())
        .filter(Boolean),
    );
    const bankAccountNumber =
      String(invoiceAccount.bankAccountNumber ?? "").trim() ||
      generateBankAccountNumber(existingNumbers);

    await api<Json>("PUT", `/ledger/account/${invoiceAccount.id}`, {
      body: { bankAccountNumber },
    });

    const invoiceRetry = await api<Json>("PUT", `/order/${order.id}/:invoice`, {
      query: {
        invoiceDate: TODAY,
        sendToCustomer: false,
      },
    });
    invoice = invoiceRetry.value;
  }

  let verifiedInvoice = invoice;
  if (!verifiedInvoice?.orders?.[0]?.project?.id) {
    const invoiceVerify = await api<Json>("GET", `/invoice/${invoice.id}`, {
      query: {
        fields: "*,orders(*,project(*),orderLines(*)),orderLines(*)",
      },
    });
    verifiedInvoice = invoiceVerify.value;
  }

  console.log(
    JSON.stringify(
      {
        bankRepairTriggered,
        invoiceAccountId: invoiceAccount.id,
        invoiceAccountNumber: invoiceAccount.number,
        invoiceAccountBankAccountNumber: invoiceAccount.bankAccountNumber,
        customerId: customer.id,
        projectId: project.id,
        orderId: order.id,
        invoiceId: verifiedInvoice.id,
        invoiceAmountExcludingVatCurrency: verifiedInvoice.amountExcludingVatCurrency,
        amountCurrencyOutstanding: verifiedInvoice.amountCurrencyOutstanding,
        linkedProjectId: verifiedInvoice.orders?.[0]?.project?.id,
        vatTypeId: vatType.id,
        vatTypePercentage: vatType.percentage,
      },
      null,
      2,
    ),
  );
}

await main().catch((error: any) => {
  console.error(error?.message ?? error);
  if (error?.details) {
    console.error(JSON.stringify(error.details, null, 2));
  }
  process.exit(1);
});
