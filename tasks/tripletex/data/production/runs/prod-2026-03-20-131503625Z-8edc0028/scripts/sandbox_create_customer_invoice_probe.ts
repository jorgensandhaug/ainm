const BASE_URL = "https://kkpqfuj-amager.tripletex.dev/v2";
const SESSION_TOKEN =
  "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";

type VatType = { id: number; percentage?: number; name?: string; displayName?: string };
type Customer = {
  id: number;
  customerName?: string;
  name?: string;
  organizationNumber?: string;
  isInactive?: boolean;
};
type Product = {
  id: number;
  number?: string;
  name?: string;
  isInactive?: boolean;
  vatType?: VatType | null;
  priceExcludingVatCurrency?: number;
};
type Account = {
  id: number;
  number?: number;
  isBankAccount?: boolean;
  isInvoiceAccount?: boolean;
  bankAccountNumber?: string;
};
type OrderLine = {
  id?: number;
  url?: string;
  description?: string;
  unitPriceExcludingVatCurrency?: number;
  vatType?: VatType | null;
  product?: Product | { id: number };
};
type Order = { orderLines?: OrderLine[] };
type Invoice = {
  id: number;
  invoiceNumber?: number;
  amountCurrency?: number;
  amountExcludingVatCurrency?: number;
  orderLines?: OrderLine[];
  orders?: Order[];
};
type ListResponse<T> = { values?: T[] };
type Wrapper<T> = { value?: T };

function authHeader() {
  return `Basic ${Buffer.from(`0:${SESSION_TOKEN}`).toString("base64")}`;
}

async function tx<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      Authorization: authHeader(),
      Accept: "application/json",
      ...(init?.body ? { "Content-Type": "application/json; charset=utf-8" } : {}),
      ...(init?.headers ?? {}),
    },
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`HTTP ${response.status} ${response.statusText} ${path}\n${body}`);
  }
  return (await response.json()) as T;
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function lines(invoice: Invoice): OrderLine[] {
  const top = invoice.orderLines ?? [];
  if (top.length > 0) return top;
  return (invoice.orders ?? []).flatMap((order) => order.orderLines ?? []);
}

async function repairBankAccountIfNeeded(errorMessage: string) {
  if (!errorMessage.includes("bankkontonummer")) throw new Error(errorMessage);
  const accounts = (
    await tx<ListResponse<Account>>("/ledger/account?isBankAccount=true&fields=*")
  ).values ?? [];
  const account =
    accounts.find((entry) => entry.isInvoiceAccount) ??
    accounts.find((entry) => entry.number === 1920) ??
    accounts[0];
  assert(account?.id, "No bank account found for sandbox repair");
  await tx<Wrapper<Account>>(`/ledger/account/${account.id}`, {
    method: "PUT",
    body: JSON.stringify({ bankAccountNumber: "12345678903" }),
  });
  return account.id;
}

async function main() {
  const customers =
    (await tx<ListResponse<Customer>>("/customer?count=20&fields=*")).values ?? [];
  const customer = customers.find((entry) => !entry.isInactive);
  assert(customer?.id, "No usable sandbox customer found");

  const allProducts =
    (await tx<ListResponse<Product>>("/product?count=100&fields=*")).values ?? [];
  const chosenProducts = allProducts
    .filter((entry) => !entry.isInactive && entry.number && entry.vatType?.id)
    .slice(0, 3);
  assert(chosenProducts.length === 3, "Need 3 usable sandbox products");

  const repeatedProductQuery = chosenProducts
    .map((product) => `productNumber=${encodeURIComponent(product.number!)}`)
    .join("&");
  const repeatedLookup =
    (await tx<ListResponse<Product>>(`/product?${repeatedProductQuery}&fields=*`)).values ?? [];
  const idsLookup =
    (await tx<ListResponse<Product>>(
      `/product?ids=${encodeURIComponent(chosenProducts.map((product) => product.id).join(","))}&fields=*`,
    )).values ?? [];

  const invoiceDate = "2026-03-20";
  const payload = {
    invoiceDate,
    invoiceDueDate: "2026-04-03",
    customer: { id: customer.id },
    orders: [
      {
        customer: { id: customer.id },
        orderDate: invoiceDate,
        deliveryDate: invoiceDate,
        orderLines: chosenProducts.map((product, index) => ({
          product: { id: product.id },
          description: `Sandbox probe line ${index + 1}`,
          count: 1,
          unitPriceExcludingVatCurrency: product.priceExcludingVatCurrency ?? index + 1,
        })),
      },
    ],
  };

  let createResp: Wrapper<Invoice>;
  let repairedAccountId: number | undefined;
  try {
    createResp = await tx<Wrapper<Invoice>>("/invoice?sendToCustomer=false", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    repairedAccountId = await repairBankAccountIfNeeded(message);
    createResp = await tx<Wrapper<Invoice>>("/invoice?sendToCustomer=false", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  const created = createResp.value;
  assert(created?.id, "Sandbox invoice create returned no invoice");

  const createdLines = lines(created);
  const createdLinesSparse = createdLines.every(
    (line) =>
      typeof line.id === "number" &&
      typeof line.url === "string" &&
      !line.product &&
      !line.vatType &&
      !line.description,
  );

  const detailed = (
    await tx<Wrapper<Invoice>>(
      `/invoice/${created.id}?fields=${encodeURIComponent(
        "*,orders(*,orderLines(*,product(*),vatType(*))),orderLines(*,product(*),vatType(*))",
      )}`,
    )
  ).value;
  assert(detailed?.id, "Sandbox invoice detail read returned no invoice");
  const detailedLines = lines(detailed);

  const summary = {
    customer: {
      id: customer.id,
      name: customer.customerName ?? customer.name,
      organizationNumber: customer.organizationNumber,
    },
    chosenProducts: chosenProducts.map((product) => ({
      id: product.id,
      number: product.number,
      name: product.name,
      vatPercentage: product.vatType?.percentage,
    })),
    lookupCounts: {
      repeatedProductNumber: repeatedLookup.length,
      ids: idsLookup.length,
    },
    repairedAccountId,
    createdInvoice: {
      id: created.id,
      invoiceNumber: created.invoiceNumber,
      amountExcludingVatCurrency: created.amountExcludingVatCurrency,
      amountCurrency: created.amountCurrency,
      sparseOrderLineCount: createdLines.length,
      createdLinesSparse,
    },
    detailedInvoice: {
      id: detailed.id,
      detailedOrderLineCount: detailedLines.length,
      lines: detailedLines.map((line) => ({
        id: line.id,
        description: line.description,
        productNumber:
          line.product && "number" in line.product ? line.product.number : undefined,
        vatPercentage: line.vatType?.percentage,
        unitPriceExcludingVatCurrency: line.unitPriceExcludingVatCurrency,
      })),
    },
  };

  console.log(JSON.stringify(summary, null, 2));
}

await main();
