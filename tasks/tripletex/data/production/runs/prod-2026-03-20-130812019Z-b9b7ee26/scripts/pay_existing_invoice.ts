const BASE_URL = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const SESSION_TOKEN = "AuygPY-0MkpxnniD-txAfZyz_KhI_d-gl_hhry-GG90";
const TODAY = "2026-03-20";
const TOMORROW = "2026-03-21";
const CUSTOMER_ORG = "951612936";
const TARGET_EX_VAT = 39250;

type WrappedValue<T> = { value: T };
type WrappedList<T> = { values: T[] };

type Customer = { id: number };
type Account = {
  number?: string | number;
  isBankAccount?: boolean;
  isInvoiceAccount?: boolean;
};
type PaymentType = {
  id: number;
  description?: string;
  displayName?: string;
  debitAccount?: Account | null;
  creditAccount?: Account | null;
};
type InvoiceLine = {
  description?: string;
  amountExcludingVatCurrency?: number;
  unitPriceExcludingVatCurrency?: number;
  count?: number;
  product?: { productNumber?: string | number; id?: number };
};
type Invoice = {
  id: number;
  invoiceNumber?: string | number;
  amountExcludingVatCurrency?: number;
  amountCurrencyOutstanding?: number;
  amountOutstanding?: number;
  customer?: { id?: number };
  orderLines?: InvoiceLine[];
  orders?: { orderLines?: InvoiceLine[] }[];
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

function onlyOne<T>(values: T[], label: string): T {
  if (values.length !== 1) {
    throw new Error(`${label}: expected 1 result, got ${values.length}`);
  }
  return values[0];
}

function accountNumber(value: string | number | undefined): string {
  return String(value ?? "");
}

function hasTargetLines(invoice: Invoice): boolean {
  const lines = [...(invoice.orderLines ?? []), ...(invoice.orders ?? []).flatMap((o) => o.orderLines ?? [])];
  const has4430 = lines.some(
    (line) =>
      String(line.product?.productNumber ?? "") === "4430" ||
      line.description === "Informe de análisis" ||
      line.unitPriceExcludingVatCurrency === 20900,
  );
  const has7773 = lines.some(
    (line) =>
      String(line.product?.productNumber ?? "") === "7773" ||
      line.description === "Sesión de formación" ||
      line.unitPriceExcludingVatCurrency === 18350,
  );
  return has4430 && has7773;
}

async function main() {
  const customerRes = await api<WrappedList<Customer>>(
    `/customer?organizationNumber=${encodeURIComponent(CUSTOMER_ORG)}&fields=*`,
  );
  const customer = onlyOne(customerRes.values ?? [], "customer lookup");

  const invoiceRes = await api<WrappedList<Invoice>>(
    `/invoice?customerId=${customer.id}&invoiceDateFrom=${TODAY}&invoiceDateTo=${TOMORROW}&count=1000&fields=*,customer(*),orderLines(*,product(*)),orders(*,orderLines(*,product(*)))`,
  );

  const candidates = (invoiceRes.values ?? [])
    .filter((invoice) => (invoice.amountCurrencyOutstanding ?? invoice.amountOutstanding ?? 0) > 0)
    .filter((invoice) => invoice.amountExcludingVatCurrency === TARGET_EX_VAT)
    .filter(hasTargetLines)
    .sort((a, b) => b.id - a.id);

  const invoice = onlyOne(candidates.slice(0, 1), "matching unpaid invoice");
  const outstanding = invoice.amountCurrencyOutstanding ?? invoice.amountOutstanding;
  if (typeof outstanding !== "number") {
    throw new Error(`invoice missing outstanding amount: ${JSON.stringify(invoice, null, 2)}`);
  }

  const paymentTypeRes = await api<WrappedList<PaymentType>>(
    "/invoice/paymentType?count=1000&fields=*,debitAccount(*),creditAccount(*)",
  );
  const paymentTypes = paymentTypeRes.values ?? [];

  const paymentType =
    paymentTypes.find((pt) => {
      const debit = pt.debitAccount;
      return (
        accountNumber(debit?.number).startsWith("19") &&
        (debit?.isBankAccount === true || debit?.isInvoiceAccount === true)
      );
    }) ??
    paymentTypes.find((pt) => /bank/i.test(`${pt.description ?? ""} ${pt.displayName ?? ""}`)) ??
    paymentTypes.find((pt) => accountNumber(pt.debitAccount?.number).startsWith("19"));

  if (!paymentType?.id) {
    throw new Error(`no payment type found: ${JSON.stringify(paymentTypes, null, 2)}`);
  }

  const paymentRes = await api<WrappedValue<Invoice>>(
    `/invoice/${invoice.id}/:payment?paymentDate=${TODAY}&paymentTypeId=${paymentType.id}&paidAmount=${encodeURIComponent(String(outstanding))}`,
    { method: "PUT" },
  );

  const remaining = paymentRes.value.amountCurrencyOutstanding ?? paymentRes.value.amountOutstanding;
  if (remaining !== 0) {
    throw new Error(`remaining outstanding is not zero: ${JSON.stringify(paymentRes, null, 2)}`);
  }

  console.log(
    JSON.stringify(
      {
        customerId: customer.id,
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        paidAmount: outstanding,
        paymentTypeId: paymentType.id,
        remainingOutstanding: remaining,
      },
      null,
      2,
    ),
  );
}

await main();
