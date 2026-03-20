const BASE_URL = "https://kkpqfuj-amager.tripletex.dev/v2";
const SESSION_TOKEN =
  "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const TODAY = "2026-03-20";

type WrappedValue<T> = { value: T };
type WrappedList<T> = { values: T[] };

type Customer = { id: number; name?: string; organizationNumber?: string };
type Order = { id: number; orderLines?: unknown[] };
type Invoice = {
  id: number;
  invoiceNumber?: string | number;
  amountExcludingVatCurrency?: number;
  amountCurrencyOutstanding?: number;
  amountOutstanding?: number;
};
type PaymentType = {
  id: number;
  description?: string;
  displayName?: string;
  debitAccount?: {
    number?: string | number;
    isBankAccount?: boolean;
    isInvoiceAccount?: boolean;
  } | null;
  creditAccount?: { number?: string | number } | null;
};

const authHeader = `Basic ${Buffer.from(`0:${SESSION_TOKEN}`).toString("base64")}`;

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      Authorization: authHeader,
      Accept: "application/json",
      ...(init?.body ? { "Content-Type": "application/json; charset=utf-8" } : {}),
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${init?.method ?? "GET"} ${path} -> ${res.status}\n${text}`);
  }
  return (await res.json()) as T;
}

function accountNo(value: string | number | undefined) {
  return String(value ?? "");
}

async function main() {
  const seed = Date.now().toString().slice(-6);
  const org = `995${seed}`;
  const email = `codex-reflection-${seed}@example.no`;

  const customerRes = await api<WrappedValue<Customer>>("/customer", {
    method: "POST",
    body: JSON.stringify({
      name: `Codex Reflection Order Flow ${seed} AS`,
      email,
      organizationNumber: org,
    }),
  });

  const customerId = customerRes.value.id;

  const orderRes = await api<WrappedValue<Order>>("/order", {
    method: "POST",
    body: JSON.stringify({
      customer: { id: customerId },
      orderDate: TODAY,
      deliveryDate: TODAY,
      orderLines: [
        {
          product: { id: 84384037 },
          description: "Reflection Training Session 98994294",
          count: 1,
          unitPriceExcludingVatCurrency: 5700,
        },
        {
          product: { id: 84384038 },
          description: "Reflection Consulting Hours 98994294",
          count: 1,
          unitPriceExcludingVatCurrency: 14750,
        },
      ],
    }),
  });

  const orderId = orderRes.value.id;

  const invoiceRes = await api<WrappedValue<Invoice>>(
    `/order/${orderId}/:invoice?invoiceDate=${TODAY}&sendToCustomer=false`,
    { method: "PUT" },
  );
  const invoice = invoiceRes.value;
  const outstanding = invoice.amountCurrencyOutstanding ?? invoice.amountOutstanding;
  if (!invoice.id || typeof outstanding !== "number") {
    throw new Error(`invoice missing id/outstanding: ${JSON.stringify(invoiceRes, null, 2)}`);
  }

  const paymentTypeRes = await api<WrappedList<PaymentType>>(
    "/invoice/paymentType?count=1000&fields=*,debitAccount(*),creditAccount(*)",
  );
  const paymentType =
    paymentTypeRes.values.find((pt) => {
      const debit = pt.debitAccount;
      return (
        accountNo(debit?.number).startsWith("19") &&
        (debit?.isBankAccount === true || debit?.isInvoiceAccount === true)
      );
    }) ??
    paymentTypeRes.values.find((pt) => /bank/i.test(`${pt.description ?? ""} ${pt.displayName ?? ""}`)) ??
    paymentTypeRes.values.find((pt) => accountNo(pt.debitAccount?.number).startsWith("19"));

  if (!paymentType?.id) {
    throw new Error(`no usable payment type: ${JSON.stringify(paymentTypeRes, null, 2)}`);
  }

  const paymentRes = await api<WrappedValue<Invoice>>(
    `/invoice/${invoice.id}/:payment?paymentDate=${TODAY}&paymentTypeId=${paymentType.id}&paidAmount=${encodeURIComponent(String(outstanding))}`,
    { method: "PUT" },
  );

  const remaining = paymentRes.value.amountCurrencyOutstanding ?? paymentRes.value.amountOutstanding;
  if (remaining !== 0) {
    throw new Error(`remaining outstanding != 0: ${JSON.stringify(paymentRes, null, 2)}`);
  }

  console.log(
    JSON.stringify(
      {
        customerId,
        organizationNumber: org,
        orderId,
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        invoiceAmountExcludingVatCurrency: invoice.amountExcludingVatCurrency,
        paidAmount: outstanding,
        paymentType: {
          id: paymentType.id,
          description: paymentType.description,
          displayName: paymentType.displayName,
          debitNumber: paymentType.debitAccount?.number ?? null,
          debitIsBankAccount: paymentType.debitAccount?.isBankAccount ?? null,
          debitIsInvoiceAccount: paymentType.debitAccount?.isInvoiceAccount ?? null,
          creditNumber: paymentType.creditAccount?.number ?? null,
        },
        remainingOutstanding: remaining,
      },
      null,
      2,
    ),
  );
}

await main();
