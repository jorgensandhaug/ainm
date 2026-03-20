const baseUrl = "https://kkpqfuj-amager.tripletex.dev/v2";
const sessionToken =
  "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";

const runDate = "2026-03-20";
const supplierName = "Elvdal AS";
const organizationNumber = "889157917";
const expenseAccountNumber = "6500";

type IdRef = { id?: number; number?: number | string };
type Supplier = { id?: number; name?: string; organizationNumber?: string };
type Account = { id?: number };
type Voucher = { id?: number; version?: number };
type SupplierInvoice = {
  id?: number;
  orderLines?: Array<{ id?: number }>;
  supplier?: Supplier | null;
  voucher?: Voucher | null;
};
type VatType = { id?: number; percentage?: number; number?: string };
type ListResponse<T> = { values?: T[] };
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
  return {
    ok: response.ok,
    status: response.status,
    body: data,
  };
}

function exactOne<T>(items: T[], label: string): T {
  if (items.length !== 1) throw new Error(`Expected one ${label}, got ${items.length}`);
  return items[0]!;
}

const supplier = exactOne(
  ((await jsonRequest<ListResponse<Supplier>>("GET", "supplier", {
    params: { organizationNumber, fields: "*" },
  })).body.values ?? []).filter(
    (x: Supplier) => String(x.organizationNumber ?? "") === organizationNumber && String(x.name ?? "") === supplierName,
  ),
  "supplier",
);

const account = exactOne(
  (await jsonRequest<ListResponse<Account>>("GET", "ledger/account", {
    params: { number: expenseAccountNumber, isApplicableForSupplierInvoice: "true", fields: "*" },
  })).body.values ?? [],
  "account",
);

const vatTypes = (await jsonRequest<ListResponse<VatType>>("GET", "ledger/vatType", {
  params: { typeOfVat: "INCOMING", vatDate: runDate, fields: "*" },
})).body.values ?? [];
const vatType25 = vatTypes.find((x: VatType) => Number(x.percentage ?? NaN) === 25 && /^\d+$/.test(String(x.number ?? "")));

const xmlTemplate = await Bun.file(
  "/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-202623091Z-aa17fe23/scripts/minimal-invoice.xml",
).text();

const candidates: Array<{ name: string; build: (orderLineId: number | null) => unknown[] }> = [
  {
    name: "account_only",
    build: () => [{ posting: { account: { id: account.id } } }],
  },
  {
    name: "account_orderLine",
    build: (orderLineId) => [{ orderLine: orderLineId ? { id: orderLineId } : undefined, posting: { account: { id: account.id } } }],
  },
  {
    name: "account_description",
    build: () => [{ posting: { account: { id: account.id }, description: "kontortenester" } }],
  },
  {
    name: "account_description_orderLine",
    build: (orderLineId) => [{ orderLine: orderLineId ? { id: orderLineId } : undefined, posting: { account: { id: account.id }, description: "kontortenester" } }],
  },
  {
    name: "account_vat_orderLine",
    build: (orderLineId) => [{ orderLine: orderLineId ? { id: orderLineId } : undefined, posting: { account: { id: account.id }, vatType: vatType25?.id ? { id: vatType25.id } : undefined } }],
  },
  {
    name: "account_amounts_orderLine",
    build: (orderLineId) => [{ orderLine: orderLineId ? { id: orderLineId } : undefined, posting: { account: { id: account.id }, amount: 31800, amountGross: 39750 } }],
  },
  {
    name: "account_amounts_description_orderLine",
    build: (orderLineId) => [{ orderLine: orderLineId ? { id: orderLineId } : undefined, posting: { account: { id: account.id }, description: "kontortenester", amount: 31800, amountGross: 39750 } }],
  },
];

const results: unknown[] = [];

for (let i = 0; i < candidates.length; i += 1) {
  const invoiceNo = `INV-PROBE-SHAPE-${Date.now()}-${i}`;
  const xml = xmlTemplate.replaceAll("INV-PROBE-EHF-001", invoiceNo);
  const form = new FormData();
  form.append("description", `probe-${invoiceNo}`);
  form.append("file", new Blob([xml], { type: "application/xml" }), `${invoiceNo}.xml`);

  const importResponse = await fetch(makeUrl("ledger/voucher/importDocument"), {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`0:${sessionToken}`).toString("base64")}`,
      Accept: "application/json",
    },
    body: form,
  });
  const importText = await importResponse.text();
  const importBody = importText ? JSON.parse(importText) : undefined;
  const importedVoucher = (importBody?.values ?? [])[0] as Voucher | undefined;
  const voucherId = importedVoucher?.id ?? null;

  let supplierInvoice: SupplierInvoice | null = null;
  let orderLineId: number | null = null;
  if (voucherId) {
    const search = await jsonRequest<ListResponse<SupplierInvoice>>("GET", "supplierInvoice", {
      params: {
        supplierId: String(supplier.id),
        voucherId: String(voucherId),
        invoiceNumber: invoiceNo,
        invoiceDateFrom: runDate,
        invoiceDateTo: "2026-03-21",
        fields: "*",
      },
    });
    supplierInvoice = ((search.body.values ?? [])[0] as SupplierInvoice | undefined) ?? null;
    orderLineId = supplierInvoice?.orderLines?.[0]?.id ?? null;
  }

  const candidate = candidates[i]!;
  let putStatus: number | null = null;
  let putBody: unknown = null;
  if (voucherId) {
    const put = await jsonRequest<ValueResponse<SupplierInvoice>>(
      "PUT",
      `supplierInvoice/voucher/${voucherId}/postings`,
      {
        params: { sendToLedger: "true", voucherDate: runDate },
        body: candidate.build(orderLineId),
      },
    );
    putStatus = put.status;
    putBody = put.body;
  }

  results.push({
    candidate: candidate.name,
    invoiceNo,
    voucherId,
    orderLineId,
    putStatus,
    putBody,
  });
}

console.log(JSON.stringify(results, null, 2));
