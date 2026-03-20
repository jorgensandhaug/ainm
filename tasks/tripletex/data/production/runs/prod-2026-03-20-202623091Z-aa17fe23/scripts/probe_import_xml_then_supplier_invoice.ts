const baseUrl = "https://kkpqfuj-amager.tripletex.dev/v2";
const sessionToken =
  "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const xmlPath =
  "/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-202623091Z-aa17fe23/scripts/minimal-invoice.xml";
const runDate = "2026-03-20";
const supplierName = "Elvdal AS";
const organizationNumber = "889157917";
const invoiceNumber = "INV-PROBE-EHF-001";
const expenseAccountNumber = "6500";
const vatPercentage = 25;
const grossAmount = 39750;

type IdRef = { id?: number; number?: number | string; name?: string };
type Supplier = { id?: number; name?: string; organizationNumber?: string; ledgerAccount?: IdRef | null };
type Account = { id?: number };
type VatType = { id?: number; percentage?: number; number?: string };
type Voucher = {
  id?: number;
  version?: number;
  date?: string | null;
  number?: number | null;
  tempNumber?: number | null;
  description?: string | null;
  voucherType?: IdRef | null;
  vendorInvoiceNumber?: string | null;
  supplierVoucherType?: string | null;
  postings?: unknown[];
};
type SupplierInvoice = {
  id?: number;
  invoiceNumber?: string;
  invoiceDate?: string;
  invoiceDueDate?: string;
  amount?: number;
  amountExcludingVat?: number;
  outstandingAmount?: number;
  supplier?: Supplier | null;
  voucher?: Voucher | null;
  orderLines?: unknown[];
};
type ListResponse<T> = { values?: T[]; fullResultSize?: number; from?: number; count?: number };
type ValueResponse<T> = { value?: T };

function makeUrl(path: string, params?: Record<string, string>) {
  const url = new URL(path, baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`);
  if (params) for (const [k, v] of Object.entries(params)) url.searchParams.append(k, v);
  return url.toString();
}

async function jsonRequest<T>(
  method: string,
  path: string,
  opts: { params?: Record<string, string>; body?: unknown } = {},
) {
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
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${JSON.stringify(data ?? text)}`);
  return data as T;
}

function exactOne<T>(items: T[], label: string): T {
  if (items.length !== 1) throw new Error(`Expected one ${label}, got ${items.length}`);
  return items[0]!;
}

function chooseVatType(vatTypes: VatType[], percentage: number) {
  const matches = vatTypes.filter((x) => Number(x.percentage ?? NaN) === percentage);
  if (!matches.length) throw new Error("No VAT type");
  return matches.find((x) => /^\d+$/.test(String(x.number ?? ""))) ?? matches[0]!;
}

const supplier = exactOne(
  ((await jsonRequest<ListResponse<Supplier>>("GET", "supplier", {
    params: { organizationNumber, fields: "*" },
  })).values ?? []).filter(
    (x) => String(x.organizationNumber ?? "") === organizationNumber && String(x.name ?? "") === supplierName,
  ),
  "supplier",
);

const account = exactOne(
  (await jsonRequest<ListResponse<Account>>("GET", "ledger/account", {
    params: { number: expenseAccountNumber, isApplicableForSupplierInvoice: "true", fields: "*" },
  })).values ?? [],
  "account",
);

const vatType = chooseVatType(
  (await jsonRequest<ListResponse<VatType>>("GET", "ledger/vatType", {
    params: { typeOfVat: "INCOMING", vatDate: runDate, fields: "*" },
  })).values ?? [],
  vatPercentage,
);

const xmlBytes = await Bun.file(xmlPath).arrayBuffer();
const form = new FormData();
form.append("description", "probe-xml-import-for-postings");
form.append("file", new Blob([xmlBytes], { type: "application/xml" }), "minimal-invoice.xml");

const importResponse = await fetch(makeUrl("ledger/voucher/importDocument"), {
  method: "POST",
  headers: {
    Authorization: `Basic ${Buffer.from(`0:${sessionToken}`).toString("base64")}`,
    Accept: "application/json",
  },
  body: form,
});
const importText = await importResponse.text();
const importData = importText ? JSON.parse(importText) : undefined;
if (!importResponse.ok) throw new Error(`Import failed HTTP ${importResponse.status}: ${JSON.stringify(importData ?? importText)}`);
const importedVoucher = exactOne((importData?.values ?? []) as Voucher[], "imported voucher");
if (!importedVoucher.id) throw new Error("imported voucher missing id");

const netAmount = Math.round((grossAmount * 100) / (100 + vatPercentage));

let putResult: unknown = null;
let putError: string | null = null;
try {
  putResult = await jsonRequest<ValueResponse<SupplierInvoice>>(
    "PUT",
    `supplierInvoice/voucher/${importedVoucher.id}/postings`,
    {
      params: { sendToLedger: "true", voucherDate: runDate },
      body: [
        {
          posting: {
            description: "kontortenester",
            account: { id: account.id },
            vatType: { id: vatType.id },
            amount: netAmount,
            amountGross: grossAmount,
          },
        },
      ],
    },
  );
} catch (error) {
  putError = error instanceof Error ? error.message : String(error);
}

const supplierInvoiceSearch = await jsonRequest<ListResponse<SupplierInvoice>>("GET", "supplierInvoice", {
  params: {
    supplierId: String(supplier.id),
    voucherId: String(importedVoucher.id),
    invoiceNumber,
    invoiceDateFrom: runDate,
    invoiceDateTo: "2026-03-21",
    fields: "*",
  },
});

console.log(
  JSON.stringify(
    {
      importedVoucher,
      putError,
      putResult,
      supplierInvoiceSearch,
    },
    null,
    2,
  ),
);
