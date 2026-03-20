const BASE_URL = "https://kkpqfuj-amager.tripletex.dev/v2";
const SESSION_TOKEN =
  "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const DATE = "2026-03-20";
const authHeader = `Basic ${Buffer.from(`0:${SESSION_TOKEN}`).toString("base64")}`;

type Wrapper<T> = { value: T };
type ListResponse<T> = { values?: T[] };

type Customer = { id: number; name?: string; organizationNumber?: string };
type VatType = { id: number; number?: string; percentage?: number; displayName?: string };
type Product = { id: number; name?: string; number?: string; vatType?: VatType };
type Account = {
  id: number;
  number?: number | string;
  isBankAccount?: boolean;
  isInvoiceAccount?: boolean;
  bankAccountNumber?: string;
};
type PaymentType = {
  id: number;
  description?: string;
  displayName?: string;
  sequence?: number;
  debitAccount?: Account | null;
  creditAccount?: Account | null;
};
type Invoice = {
  id: number;
  invoiceNumber?: string | number;
  amountExcludingVatCurrency?: number;
  amountOutstanding?: number;
  amountCurrencyOutstanding?: number;
  orderLines?: Array<{ id?: number; description?: string }>;
};

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      Authorization: authHeader,
      Accept: "application/json",
      ...(init?.body ? { "Content-Type": "application/json; charset=utf-8" } : {}),
      ...(init?.headers ?? {}),
    },
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw Object.assign(new Error(`HTTP ${response.status} ${path}`), {
      status: response.status,
      path,
      data,
    });
  }

  return data as T;
}

function paymentTypeScore(paymentType: PaymentType): number {
  const debitNumber = String(paymentType.debitAccount?.number ?? "");
  const desc = `${paymentType.description ?? ""} ${paymentType.displayName ?? ""}`.toLowerCase();
  let score = 0;
  if (debitNumber.startsWith("19")) score += 100;
  if (paymentType.debitAccount?.isBankAccount) score += 20;
  if (paymentType.debitAccount?.isInvoiceAccount) score += 10;
  if (desc.includes("bank")) score += 5;
  if (desc.includes("betalt")) score += 3;
  score -= paymentType.sequence ?? 0;
  return score;
}

async function ensureInvoiceBankAccount() {
  const accounts = await api<ListResponse<Account>>(`/ledger/account?isBankAccount=true&fields=*`);
  const target =
    accounts.values?.find((account) => account.isInvoiceAccount && String(account.number) === "1920") ??
    accounts.values?.find((account) => account.isInvoiceAccount) ??
    accounts.values?.find((account) => account.isBankAccount);

  if (!target) {
    throw new Error("No bank account found for repair");
  }

  if (target.bankAccountNumber === "12345678903") {
    return target;
  }

  const repaired = await api<Wrapper<Account>>(`/ledger/account/${target.id}`, {
    method: "PUT",
    body: JSON.stringify({
      bankAccountNumber: "12345678903",
    }),
  });
  return repaired.value;
}

async function main() {
  const seed = `${Date.now()}`.slice(-6);
  const customerOrg = `999${seed}`;
  const productNumberA = `91${seed}`;
  const productNumberB = `92${seed}`;

  const customer = await api<Wrapper<Customer>>(`/customer`, {
    method: "POST",
    body: JSON.stringify({
      name: `Codex Reflection ${seed} AS`,
      email: `codex-reflection-${seed}@example.no`,
      organizationNumber: customerOrg,
    }),
  });

  const vatTypes = await api<ListResponse<VatType>>(
    `/ledger/vatType?typeOfVat=OUTGOING&vatDate=${encodeURIComponent(DATE)}&fields=*`,
  );
  const vatType =
    vatTypes.values?.find((candidate) => candidate.percentage === 25 && candidate.number === "3") ??
    vatTypes.values?.find((candidate) => candidate.percentage === 25) ??
    vatTypes.values?.[0];
  if (!vatType) {
    throw new Error("No usable VAT type found");
  }

  const productA = await api<Wrapper<Product>>(`/product`, {
    method: "POST",
    body: JSON.stringify({
      name: `Codex Reflection Product A ${seed}`,
      number: productNumberA,
      priceExcludingVatCurrency: 36900,
      vatType: { id: vatType.id },
    }),
  });
  const productB = await api<Wrapper<Product>>(`/product`, {
    method: "POST",
    body: JSON.stringify({
      name: `Codex Reflection Product B ${seed}`,
      number: productNumberB,
      priceExcludingVatCurrency: 19450,
      vatType: { id: vatType.id },
    }),
  });

  const orderResp = await api<Wrapper<{ id: number; orderLines?: unknown[] }>>(`/order`, {
    method: "POST",
    body: JSON.stringify({
      customer: { id: customer.value.id },
      orderDate: DATE,
      deliveryDate: DATE,
      orderLines: [
        {
          product: { id: productA.value.id },
          description: productA.value.name,
          count: 1,
          unitPriceExcludingVatCurrency: 36900,
        },
        {
          product: { id: productB.value.id },
          description: productB.value.name,
          count: 1,
          unitPriceExcludingVatCurrency: 19450,
        },
      ],
    }),
  });

  let invoice: Invoice;
  try {
    const invoiceResp = await api<Wrapper<Invoice>>(
      `/order/${orderResp.value.id}/:invoice?invoiceDate=${encodeURIComponent(DATE)}&sendToCustomer=false`,
      { method: "PUT" },
    );
    invoice = invoiceResp.value;
  } catch (error) {
    const message = JSON.stringify((error as { data?: unknown }).data ?? {});
    if (!message.includes("bankkontonummer")) {
      throw error;
    }
    const repairedAccount = await ensureInvoiceBankAccount();
    const invoiceResp = await api<Wrapper<Invoice>>(
      `/order/${orderResp.value.id}/:invoice?invoiceDate=${encodeURIComponent(DATE)}&sendToCustomer=false`,
      { method: "PUT" },
    );
    invoice = invoiceResp.value;
    console.log(
      JSON.stringify(
        {
          repairedBankAccountId: repairedAccount.id,
          repairedBankAccountNumber: repairedAccount.bankAccountNumber,
        },
        null,
        2,
      ),
    );
  }

  const outstanding = invoice.amountCurrencyOutstanding ?? invoice.amountOutstanding;
  if (outstanding == null) {
    throw new Error("Invoice outstanding amount missing");
  }

  const paymentTypes = await api<ListResponse<PaymentType>>(
    `/invoice/paymentType?count=1000&fields=*,debitAccount(*),creditAccount(*)`,
  );
  const paymentType =
    paymentTypes.values
      ?.slice()
      .sort((a, b) => paymentTypeScore(b) - paymentTypeScore(a))
      .find((candidate) => String(candidate.debitAccount?.number ?? "").startsWith("19")) ??
    paymentTypes.values?.slice().sort((a, b) => paymentTypeScore(b) - paymentTypeScore(a))[0];

  if (!paymentType) {
    throw new Error("No payment type found");
  }

  const paymentResp = await api<Wrapper<Invoice>>(
    `/invoice/${invoice.id}/:payment?paymentDate=${encodeURIComponent(DATE)}&paymentTypeId=${paymentType.id}&paidAmount=${encodeURIComponent(String(outstanding))}&paidAmountCurrency=${encodeURIComponent(String(outstanding))}`,
    { method: "PUT" },
  );
  const paidInvoice = paymentResp.value;
  const remaining = paidInvoice.amountCurrencyOutstanding ?? paidInvoice.amountOutstanding;

  console.log(
    JSON.stringify(
      {
        seed,
        customerId: customer.value.id,
        customerOrg,
        vatType: {
          id: vatType.id,
          number: vatType.number,
          percentage: vatType.percentage,
          displayName: vatType.displayName,
        },
        productIds: [productA.value.id, productB.value.id],
        productNumbers: [productNumberA, productNumberB],
        orderId: orderResp.value.id,
        orderCreateResponseLineCount: Array.isArray(orderResp.value.orderLines)
          ? orderResp.value.orderLines.length
          : null,
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        invoiceAmountExVat: invoice.amountExcludingVatCurrency,
        invoiceOutstandingBeforePayment: outstanding,
        paymentTypeId: paymentType.id,
        paymentTypeDescription: paymentType.description ?? paymentType.displayName,
        paymentDebitAccountNumber: paymentType.debitAccount?.number,
        paymentCreditAccountNumber: paymentType.creditAccount?.number ?? null,
        remainingOutstandingAfterPayment: remaining,
      },
      null,
      2,
    ),
  );
}

await main();
