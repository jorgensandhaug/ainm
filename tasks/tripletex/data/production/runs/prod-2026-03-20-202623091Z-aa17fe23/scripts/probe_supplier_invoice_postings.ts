const baseUrl = "https://kkpqfuj-amager.tripletex.dev/v2";
const sessionToken =
  "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";

const runDate = "2026-03-20";
const supplierName = "Elvdal AS";
const organizationNumber = "889157917";
const invoiceNumber = `INV-PROBE-SP-${Date.now()}`;
const description = "kontortenester";
const expenseAccountNumber = "6500";
const vatPercentage = 25;
const grossAmount = 39750;

type IdRef = { id?: number; number?: number | string; name?: string };
type Supplier = { id?: number; name?: string; organizationNumber?: string; ledgerAccount?: IdRef | null };
type Account = { id?: number };
type VatType = { id?: number; number?: string; percentage?: number };
type VoucherType = { id?: number; name?: string };
type Voucher = { id?: number; postings?: unknown[] };
type SupplierInvoice = {
  id?: number;
  invoiceNumber?: string;
  invoiceDate?: string;
  invoiceDueDate?: string;
  amount?: number;
  amountExcludingVat?: number;
  supplier?: Supplier | null;
  voucher?: Voucher | null;
};
type ListResponse<T> = { values?: T[]; fullResultSize?: number };
type ValueResponse<T> = { value?: T };

function makeUrl(path: string, params?: Record<string, string>): string {
  const base = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  const url = new URL(path, base);
  if (params) for (const [k, v] of Object.entries(params)) url.searchParams.append(k, v);
  return url.toString();
}

async function request<T>(method: string, path: string, opts: { params?: Record<string, string>; body?: unknown } = {}) {
  const response = await fetch(makeUrl(path, opts.params), {
    method,
    headers: {
      Authorization: `Basic ${Buffer.from(`0:${sessionToken}`).toString("base64")}`,
      Accept: "application/json",
      ...(opts.body ? { "Content-Type": "application/json" } : {}),
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : undefined;
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${JSON.stringify(data ?? text)}`);
  }
  return data as T;
}

function exactOne<T>(items: T[], label: string): T {
  if (items.length !== 1) throw new Error(`Expected one ${label}, got ${items.length}`);
  return items[0]!;
}

function chooseVatType(vatTypes: VatType[], percentage: number): VatType {
  const matches = vatTypes.filter((x) => Number(x.percentage ?? NaN) === percentage);
  if (!matches.length) throw new Error("No VAT type");
  return matches.find((x) => /^\d+$/.test(String(x.number ?? ""))) ?? matches[0]!;
}

const netAmount = Math.round((grossAmount * 100) / (100 + vatPercentage));

const supplierSearch = await request<ListResponse<Supplier>>("GET", "supplier", {
  params: { organizationNumber, fields: "*" },
});
const supplier = exactOne(
  (supplierSearch.values ?? []).filter(
    (x) => String(x.organizationNumber ?? "") === organizationNumber && String(x.name ?? "") === supplierName,
  ),
  "supplier",
);
if (!supplier.id || !supplier.ledgerAccount?.id) throw new Error("supplier ids missing");

const account = exactOne(
  (await request<ListResponse<Account>>("GET", "ledger/account", {
    params: { number: expenseAccountNumber, isApplicableForSupplierInvoice: "true", fields: "*" },
  })).values ?? [],
  "account",
);
if (!account.id) throw new Error("account id missing");

const vatType = chooseVatType(
  (await request<ListResponse<VatType>>("GET", "ledger/vatType", {
    params: { typeOfVat: "INCOMING", vatDate: runDate, fields: "*" },
  })).values ?? [],
  vatPercentage,
);
if (!vatType.id) throw new Error("vatType id missing");

const voucherType = exactOne(
  ((await request<ListResponse<VoucherType>>("GET", "ledger/voucherType", {
    params: { name: "Leverandørfaktura", fields: "*" },
  })).values ?? []).filter((x) => x.name === "Leverandørfaktura"),
  "voucherType",
);
if (!voucherType.id) throw new Error("voucherType id missing");

const voucherCreate = await request<ValueResponse<Voucher>>("POST", "ledger/voucher", {
  body: {
    date: runDate,
    description,
    voucherType: { id: voucherType.id },
    vendorInvoiceNumber: invoiceNumber,
    postings: [
      {
        row: 1,
        date: runDate,
        description,
        account: { id: account.id },
        vatType: { id: vatType.id },
        currency: { id: 1 },
        amount: netAmount,
        amountCurrency: netAmount,
        amountGross: grossAmount,
        amountGrossCurrency: grossAmount,
      },
      {
        row: 2,
        date: runDate,
        description,
        account: { id: supplier.ledgerAccount.id },
        supplier: { id: supplier.id },
        currency: { id: 1 },
        amount: -grossAmount,
        amountCurrency: -grossAmount,
        amountGross: -grossAmount,
        amountGrossCurrency: -grossAmount,
        invoiceNumber,
        termOfPayment: runDate,
      },
    ],
  },
});
const voucher = voucherCreate.value;
if (!voucher?.id) throw new Error("voucher id missing");

let postingsResult: unknown;
let postingsError: string | null = null;
try {
  postingsResult = await request<ValueResponse<SupplierInvoice>>(
    "PUT",
    `supplierInvoice/voucher/${voucher.id}/postings`,
    {
      body: [
        {
          posting: {
            date: runDate,
            description,
            account: { id: account.id },
            vatType: { id: vatType.id },
            currency: { id: 1 },
            amount: netAmount,
            amountCurrency: netAmount,
            amountGross: grossAmount,
            amountGrossCurrency: grossAmount,
          },
        },
      ],
    },
  );
} catch (error) {
  postingsError = error instanceof Error ? error.message : String(error);
}

const supplierInvoiceSearch = await request<ListResponse<SupplierInvoice>>("GET", "supplierInvoice", {
  params: {
    supplierId: String(supplier.id),
    voucherId: String(voucher.id),
    invoiceNumber,
    invoiceDateFrom: runDate,
    invoiceDateTo: "2026-03-21",
    fields: "*",
  },
});

console.log(
  JSON.stringify(
    {
      probeInvoiceNumber: invoiceNumber,
      voucherId: voucher.id,
      postingsError,
      postingsResult,
      supplierInvoiceSearch,
    },
    null,
    2,
  ),
);
