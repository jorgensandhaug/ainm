const BASE_URL = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN =
  "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";

const DATE = "2026-03-20";
const DESCRIPTION = "kontortenester";
const AMOUNT_GROSS = 62850;
const AMOUNT_NET = 50280;

function authHeader() {
  return `Basic ${Buffer.from(`0:${TOKEN}`).toString("base64")}`;
}

function buildUrl(path: string, query?: Record<string, string | number | boolean | undefined>) {
  const url = new URL(`${BASE_URL}${path}`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

async function request<T>(
  method: string,
  path: string,
  opts?: { query?: Record<string, string | number | boolean | undefined>; body?: unknown },
): Promise<T> {
  const response = await fetch(buildUrl(path, opts?.query), {
    method,
    headers: {
      Authorization: authHeader(),
      Accept: "application/json",
      ...(opts?.body ? { "Content-Type": "application/json; charset=utf-8" } : {}),
    },
    body: opts?.body ? JSON.stringify(opts.body) : undefined,
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${method} ${path} failed: ${response.status} ${response.statusText}\n${text}`);
  }
  return (text ? JSON.parse(text) : undefined) as T;
}

const uniq = Date.now().toString().slice(-6);
const invoiceNumber = `INV-CODEX-VERIFY-${uniq}`;

const supplier = await request<{ value: any }>("POST", "/supplier", {
  body: {
    name: `Codex Verify Supplier ${uniq} AS`,
    organizationNumber: `997${uniq}`,
  },
});

const expenseAccountResp = await request<{ values?: any[] }>("GET", "/ledger/account", {
  query: {
    number: 7000,
    isApplicableForSupplierInvoice: true,
    fields: "*",
  },
});
const expenseAccount = (expenseAccountResp.values ?? []).find((v) => v.number === 7000);
if (!expenseAccount?.id || !expenseAccount?.vatType?.id) {
  throw new Error("Expense account 7000 with default VAT type not found.");
}

const voucherTypeResp = await request<{ values?: any[] }>("GET", "/ledger/voucherType", {
  query: {
    name: "Leverandørfaktura",
    fields: "*",
  },
});
const supplierVoucherType = (voucherTypeResp.values ?? []).find(
  (v) => v.name === "Leverandørfaktura",
);
if (!supplierVoucherType?.id) {
  throw new Error("Voucher type Leverandørfaktura not found.");
}

const createdVoucher = await request<{ value: any }>("POST", "/ledger/voucher", {
  body: {
    date: DATE,
    description: DESCRIPTION,
    voucherType: { id: supplierVoucherType.id },
    postings: [
      {
        row: 1,
        date: DATE,
        description: DESCRIPTION,
        account: { id: expenseAccount.id },
        vatType: { id: expenseAccount.vatType.id },
        currency: { id: 1 },
        amount: AMOUNT_NET,
        amountCurrency: AMOUNT_NET,
        amountGross: AMOUNT_GROSS,
        amountGrossCurrency: AMOUNT_GROSS,
      },
      {
        row: 2,
        date: DATE,
        description: DESCRIPTION,
        account: { id: supplier.value.ledgerAccount.id },
        supplier: { id: supplier.value.id },
        currency: { id: 1 },
        amount: -AMOUNT_GROSS,
        amountCurrency: -AMOUNT_GROSS,
        amountGross: -AMOUNT_GROSS,
        amountGrossCurrency: -AMOUNT_GROSS,
        invoiceNumber,
        termOfPayment: DATE,
      },
    ],
  },
});

const verifiedVoucher = await request<{ value: any }>(
  "GET",
  `/ledger/voucher/${createdVoucher.value.id}`,
  {
    query: {
      fields: "*,voucherType(*),postings(*,account(*),vatType(*),supplier(*),currency(*))",
    },
  },
);

console.log(
  JSON.stringify(
    {
      supplierId: supplier.value.id,
      voucherId: verifiedVoucher.value.id,
      voucherType: verifiedVoucher.value.voucherType?.name,
      postings: verifiedVoucher.value.postings.map((posting: any) => ({
        row: posting.row,
        description: posting.description,
        accountNumber: posting.account?.number ?? null,
        supplierId: posting.supplier?.id ?? null,
        vatTypeNumber: posting.vatType?.number ?? null,
        amount: posting.amount,
        amountGross: posting.amountGross,
        invoiceNumber: posting.invoiceNumber,
        termOfPayment: posting.termOfPayment,
        systemGenerated: posting.systemGenerated,
      })),
    },
    null,
    2,
  ),
);
