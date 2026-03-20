const baseUrl = "https://kkpqfuj-amager.tripletex.dev/v2";
const sessionToken =
  "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";

const runDate = "2026-03-20";
const supplierName = "Elvdal AS";
const organizationNumber = "889157917";
const invoiceNumber = `INV-PROBE-T11-${Date.now()}`;
const description = "kontortenester";
const expenseAccountNumber = "6500";
const vatPercentage = 25;
const grossAmount = 39750;

type IdRef = { id?: number; number?: number | string; name?: string };
type Supplier = {
  id?: number;
  name?: string;
  organizationNumber?: string;
  ledgerAccount?: IdRef | null;
};
type Account = { id?: number; number?: number | string; isApplicableForSupplierInvoice?: boolean };
type VatType = { id?: number; number?: string; percentage?: number; displayName?: string };
type VoucherType = { id?: number; name?: string };
type Posting = {
  id?: number;
  row?: number;
  account?: IdRef | null;
  supplier?: Supplier | IdRef | null;
  vatType?: IdRef | null;
  amount?: number;
  amountGross?: number;
  invoiceNumber?: string;
  termOfPayment?: string;
};
type Voucher = {
  id?: number;
  date?: string;
  description?: string;
  voucherType?: IdRef | null;
  vendorInvoiceNumber?: string | null;
  supplierVoucherType?: string | null;
  postings?: Posting[];
};
type SupplierInvoice = {
  id?: number;
  invoiceNumber?: string;
  invoiceDate?: string;
  invoiceDueDate?: string;
  supplier?: Supplier | null;
  voucher?: Voucher | null;
  amount?: number;
  amountCurrency?: number;
};
type IncomingInvoice = {
  invoiceHeader?: {
    invoiceNumber?: string;
    invoiceDate?: string;
    dueDate?: string;
    vendorId?: number;
    voucherId?: number;
    voucherTypeId?: number;
  } | null;
};

type ListResponse<T> = { values?: T[]; fullResultSize?: number };
type ValueResponse<T> = { value?: T };

function makeUrl(path: string, params?: Record<string, string>): string {
  const base = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  const url = new URL(path, base);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.append(key, value);
    }
  }
  return url.toString();
}

async function request<T>(
  method: string,
  path: string,
  opts: { params?: Record<string, string>; body?: unknown } = {},
): Promise<T> {
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
  if (matches.length === 0) throw new Error(`No VAT type for ${percentage}%`);
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
if (!supplier.id || !supplier.ledgerAccount?.id) throw new Error("Supplier missing id/ledgerAccount");

const accountSearch = await request<ListResponse<Account>>("GET", "ledger/account", {
  params: { number: expenseAccountNumber, isApplicableForSupplierInvoice: "true", fields: "*" },
});
const account = exactOne(accountSearch.values ?? [], "expense account");
if (!account.id) throw new Error("Account missing id");

const vatSearch = await request<ListResponse<VatType>>("GET", "ledger/vatType", {
  params: { typeOfVat: "INCOMING", vatDate: runDate, fields: "*" },
});
const vatType = chooseVatType(vatSearch.values ?? [], vatPercentage);
if (!vatType.id) throw new Error("VAT type missing id");

const voucherTypeSearch = await request<ListResponse<VoucherType>>("GET", "ledger/voucherType", {
  params: { name: "Leverandørfaktura", fields: "*" },
});
const voucherType = exactOne(
  (voucherTypeSearch.values ?? []).filter((x) => x.name === "Leverandørfaktura"),
  "voucherType",
);
if (!voucherType.id) throw new Error("Voucher type missing id");

const createdVoucher = await request<ValueResponse<Voucher>>("POST", "ledger/voucher", {
  body: {
    date: runDate,
    description,
    voucherType: { id: voucherType.id },
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

const voucher = createdVoucher.value;
if (!voucher?.id) throw new Error("Voucher create missing id");

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

let incomingInvoiceByVoucher:
  | { ok: true; value: IncomingInvoice | null }
  | { ok: false; statusText: string } = { ok: false, statusText: "not-run" };

try {
  const incoming = await request<ValueResponse<IncomingInvoice>>("GET", `incomingInvoice/${voucher.id}`, {
    params: { fields: "*" },
  });
  incomingInvoiceByVoucher = { ok: true, value: incoming.value ?? null };
} catch (error) {
  incomingInvoiceByVoucher = {
    ok: false,
    statusText: error instanceof Error ? error.message : String(error),
  };
}

console.log(
  JSON.stringify(
    {
      probeInvoiceNumber: invoiceNumber,
      supplier: {
        id: supplier.id,
        organizationNumber: supplier.organizationNumber ?? null,
        ledgerAccountId: supplier.ledgerAccount.id,
      },
      createdVoucher: {
        id: voucher.id,
        date: voucher.date ?? null,
        description: voucher.description ?? null,
        voucherTypeId: voucher.voucherType?.id ?? null,
        vendorInvoiceNumber: voucher.vendorInvoiceNumber ?? null,
        supplierVoucherType: voucher.supplierVoucherType ?? null,
        postings: (voucher.postings ?? []).map((posting) => ({
          row: posting.row ?? null,
          accountId: posting.account?.id ?? null,
          supplierId: posting.supplier && "id" in posting.supplier ? posting.supplier.id ?? null : null,
          vatTypeId: posting.vatType?.id ?? null,
          amount: posting.amount ?? null,
          amountGross: posting.amountGross ?? null,
          invoiceNumber: posting.invoiceNumber ?? null,
          termOfPayment: posting.termOfPayment ?? null,
        })),
      },
      supplierInvoiceSearch: {
        fullResultSize: supplierInvoiceSearch.fullResultSize ?? null,
        values: (supplierInvoiceSearch.values ?? []).map((invoice) => ({
          id: invoice.id ?? null,
          invoiceNumber: invoice.invoiceNumber ?? null,
          invoiceDate: invoice.invoiceDate ?? null,
          invoiceDueDate: invoice.invoiceDueDate ?? null,
          amount: invoice.amount ?? null,
          amountCurrency: invoice.amountCurrency ?? null,
          supplierId: invoice.supplier?.id ?? null,
          supplierOrganizationNumber: invoice.supplier?.organizationNumber ?? null,
          voucherId: invoice.voucher?.id ?? null,
          voucherTypeId: invoice.voucher?.voucherType?.id ?? null,
          vendorInvoiceNumber: invoice.voucher?.vendorInvoiceNumber ?? null,
          supplierVoucherType: invoice.voucher?.supplierVoucherType ?? null,
        })),
      },
      incomingInvoiceByVoucher,
    },
    null,
    2,
  ),
);
