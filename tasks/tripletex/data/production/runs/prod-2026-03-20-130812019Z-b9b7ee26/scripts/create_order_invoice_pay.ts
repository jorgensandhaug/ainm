const BASE_URL = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const SESSION_TOKEN = "AuygPY-0MkpxnniD-txAfZyz_KhI_d-gl_hhry-GG90";
const TODAY = "2026-03-20";

type WrappedValue<T> = { value: T };
type WrappedList<T> = { values: T[]; fullResultSize?: number };

type Customer = {
  id: number;
  name?: string;
  displayName?: string;
  organizationNumber?: string;
};

type Product = {
  id: number;
  name?: string;
  displayName?: string;
  productNumber?: string | number;
};

type Account = {
  id?: number;
  number?: string | number;
};

type PaymentType = {
  id: number;
  description?: string;
  displayName?: string;
  debitAccount?: Account;
  creditAccount?: Account;
};

type Invoice = {
  id: number;
  invoiceNumber?: number | string;
  amountCurrencyOutstanding?: number;
  amountOutstanding?: number;
  amountExcludingVatCurrency?: number;
  amountIncludingVatCurrency?: number;
  currency?: { code?: string };
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

  if (res.status === 204) {
    return undefined as T;
  }

  return (await res.json()) as T;
}

function onlyOne<T>(values: T[], label: string): T {
  if (values.length !== 1) {
    throw new Error(`${label}: expected 1 result, got ${values.length}`);
  }
  return values[0];
}

function accountPrefix(value: string | number | undefined): string {
  return String(value ?? "");
}

async function main() {
  const customerRes = await api<WrappedList<Customer>>(
    `/customer?organizationNumber=${encodeURIComponent("951612936")}&fields=*`,
  );
  const customer = onlyOne(customerRes.values ?? [], "customer lookup");

  const productQuery = new URLSearchParams();
  productQuery.append("productNumber", "4430");
  productQuery.append("productNumber", "7773");
  productQuery.set("fields", "*");

  let productRes = await api<WrappedList<Product>>(`/product?${productQuery.toString()}`);
  let products = productRes.values ?? [];

  if (products.length !== 2) {
    productRes = await api<WrappedList<Product>>(`/product?ids=4430,7773&fields=*`);
    products = productRes.values ?? [];
  }

  if (products.length !== 2) {
    productRes = await api<WrappedList<Product>>("/product?count=1000&fields=*");
    products = productRes.values ?? [];
  }

  const product4430 = products.find(
    (p) =>
      String(p.productNumber) === "4430" ||
      p.id === 4430 ||
      p.name === "Informe de análisis" ||
      p.displayName === "Informe de análisis",
  );
  const product7773 = products.find(
    (p) =>
      String(p.productNumber) === "7773" ||
      p.id === 7773 ||
      p.name === "Sesión de formación" ||
      p.displayName === "Sesión de formación",
  );

  if (!product4430 || !product7773) {
    throw new Error(`product lookup failed: ${JSON.stringify(products, null, 2)}`);
  }

  const orderPayload = {
    customer: { id: customer.id },
    orderDate: TODAY,
    deliveryDate: TODAY,
    orderLines: [
      {
        product: { id: product4430.id },
        description: "Informe de análisis",
        count: 1,
        unitPriceExcludingVatCurrency: 20900,
      },
      {
        product: { id: product7773.id },
        description: "Sesión de formación",
        count: 1,
        unitPriceExcludingVatCurrency: 18350,
      },
    ],
  };

  const orderRes = await api<WrappedValue<{ id: number }>>("/order", {
    method: "POST",
    body: JSON.stringify(orderPayload),
  });
  const orderId = orderRes.value?.id;
  if (!orderId) {
    throw new Error(`order creation did not return id: ${JSON.stringify(orderRes, null, 2)}`);
  }

  const invoiceRes = await api<WrappedValue<Invoice>>(
    `/order/${orderId}/:invoice?invoiceDate=${encodeURIComponent(TODAY)}&sendToCustomer=false`,
    { method: "PUT" },
  );
  const invoice = invoiceRes.value;
  const outstanding = invoice.amountCurrencyOutstanding ?? invoice.amountOutstanding;

  if (!invoice?.id || typeof outstanding !== "number") {
    throw new Error(`invoice response missing id/outstanding: ${JSON.stringify(invoiceRes, null, 2)}`);
  }

  const paymentTypeRes = await api<WrappedList<PaymentType>>(
    "/invoice/paymentType?count=1000&fields=*,debitAccount(*),creditAccount(*)",
  );
  const paymentTypes = paymentTypeRes.values ?? [];

  const preferredPaymentType =
    paymentTypes.find((pt) => {
      const debit = accountPrefix(pt.debitAccount?.number);
      const credit = accountPrefix(pt.creditAccount?.number);
      return debit.startsWith("19") && credit.startsWith("15");
    }) ??
    paymentTypes.find((pt) => accountPrefix(pt.creditAccount?.number).startsWith("15"));

  if (!preferredPaymentType?.id) {
    throw new Error(`no usable payment type found: ${JSON.stringify(paymentTypes, null, 2)}`);
  }

  const paymentRes = await api<WrappedValue<Invoice>>(
    `/invoice/${invoice.id}/:payment?paymentDate=${encodeURIComponent(TODAY)}&paymentTypeId=${preferredPaymentType.id}&paidAmount=${encodeURIComponent(String(outstanding))}`,
    { method: "PUT" },
  );

  const paidInvoice = paymentRes.value;
  const remaining = paidInvoice.amountCurrencyOutstanding ?? paidInvoice.amountOutstanding;
  if (remaining !== 0) {
    throw new Error(`invoice still outstanding: ${JSON.stringify(paymentRes, null, 2)}`);
  }

  console.log(
    JSON.stringify(
      {
        customerId: customer.id,
        orderId,
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        paidAmount: outstanding,
        paymentTypeId: preferredPaymentType.id,
        remainingOutstanding: remaining,
      },
      null,
      2,
    ),
  );
}

await main();
