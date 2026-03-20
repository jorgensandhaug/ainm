const baseUrl = "https://kkpqfuj-amager.tripletex.dev/v2";
const sessionToken =
  "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";

const runDate = "2026-03-20";
const supplierName = "Elvdal AS";
const organizationNumber = "889157917";
const expenseAccountNumber = "6500";

type Supplier = { id?: number; name?: string; organizationNumber?: string };
type Account = { id?: number };
type Voucher = { id?: number };
type OrderLine = Record<string, unknown> & { id?: number };
type SupplierInvoice = { id?: number; orderLines?: OrderLine[] };
type ListResponse<T> = { values?: T[] };
type ValueResponse<T> = { value?: T };

function makeUrl(path: string, params?: Record<string, string>) {
  const url = new URL(path, baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`);
  if (params) for (const [k, v] of Object.entries(params)) url.searchParams.append(k, v);
  return url.toString();
}

async function requestJson<T>(
  method: string,
  path: string,
  opts: { params?: Record<string, string>; body?: unknown; isForm?: boolean } = {},
) {
  const response = await fetch(makeUrl(path, opts.params), {
    method,
    headers: {
      Authorization: `Basic ${Buffer.from(`0:${sessionToken}`).toString("base64")}`,
      Accept: "application/json",
      ...(opts.body && !opts.isForm ? { "Content-Type": "application/json" } : {}),
    },
    body: opts.isForm ? (opts.body as FormData) : opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : undefined;
  return { status: response.status, ok: response.ok, body: data };
}

function exactOne<T>(items: T[], label: string): T {
  if (items.length !== 1) throw new Error(`Expected one ${label}, got ${items.length}`);
  return items[0]!;
}

const supplier = exactOne(
  ((await requestJson<ListResponse<Supplier>>("GET", "supplier", {
    params: { organizationNumber, fields: "*" },
  })).body.values ?? []).filter(
    (x: Supplier) => String(x.organizationNumber ?? "") === organizationNumber && String(x.name ?? "") === supplierName,
  ),
  "supplier",
);
const account = exactOne(
  (await requestJson<ListResponse<Account>>("GET", "ledger/account", {
    params: { number: expenseAccountNumber, isApplicableForSupplierInvoice: "true", fields: "*" },
  })).body.values ?? [],
  "account",
);

const xmlTemplate = await Bun.file(
  "/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-202623091Z-aa17fe23/scripts/minimal-invoice.xml",
).text();
const invoiceNo = `INV-PROBE-FULL-OL-${Date.now()}`;
const xml = xmlTemplate.replaceAll("INV-PROBE-EHF-001", invoiceNo);
const form = new FormData();
form.append("description", `probe-${invoiceNo}`);
form.append("file", new Blob([xml], { type: "application/xml" }), `${invoiceNo}.xml`);

const imported = await requestJson<ListResponse<Voucher>>("POST", "ledger/voucher/importDocument", {
  body: form,
  isForm: true,
});
const voucherId = imported.body.values?.[0]?.id;

const search = await requestJson<ListResponse<SupplierInvoice>>("GET", "supplierInvoice", {
  params: {
    supplierId: String(supplier.id),
    voucherId: String(voucherId),
    invoiceNumber: invoiceNo,
    invoiceDateFrom: runDate,
    invoiceDateTo: "2026-03-21",
    fields: "*",
  },
});
const supplierInvoiceId = search.body.values?.[0]?.id;

const expanded = await requestJson<ValueResponse<SupplierInvoice>>("GET", `supplierInvoice/${supplierInvoiceId}`, {
  params: {
    fields: "*,orderLines(*,currency(*),vatType(*),product(*),vendor(*),order(*))",
  },
});
const orderLine = expanded.body.value?.orderLines?.[0];
if (!orderLine) throw new Error("Missing orderLine");

const orderLineIdOnly = { id: orderLine.id };
const orderLineCore = {
  id: orderLine.id,
  version: orderLine.version,
  description: orderLine.description,
  count: orderLine.count,
  unitCostCurrency: orderLine.unitCostCurrency,
  unitPriceExcludingVatCurrency: orderLine.unitPriceExcludingVatCurrency,
  currency: orderLine.currency,
  vatType: orderLine.vatType,
  unitPriceIncludingVatCurrency: orderLine.unitPriceIncludingVatCurrency,
};

const variants = [
  { name: "id_only_false", params: { sendToLedger: "false", voucherDate: runDate }, orderLine: orderLineIdOnly },
  { name: "core_false", params: { sendToLedger: "false", voucherDate: runDate }, orderLine: orderLineCore },
  { name: "full_false", params: { sendToLedger: "false", voucherDate: runDate }, orderLine },
  { name: "core_true", params: { sendToLedger: "true", voucherDate: runDate }, orderLine: orderLineCore },
  { name: "full_true", params: { sendToLedger: "true", voucherDate: runDate }, orderLine },
];

const results: unknown[] = [];
for (const variant of variants) {
  const put = await requestJson<ValueResponse<unknown>>("PUT", `supplierInvoice/voucher/${voucherId}/postings`, {
    params: variant.params,
    body: [
      {
        orderLine: variant.orderLine,
        posting: {
          account: { id: account.id },
          description: "kontortenester",
        },
      },
    ],
  });
  const voucherAfter = await requestJson<ValueResponse<unknown>>("GET", `ledger/voucher/${voucherId}`, {
    params: { fields: "*" },
  });
  const invoiceAfter = await requestJson<ValueResponse<unknown>>("GET", `supplierInvoice/${supplierInvoiceId}`, {
    params: { fields: "*,orderLines(*,currency(*),vatType(*),product(*),vendor(*),order(*)),voucher(*)" },
  });
  results.push({
    variant: variant.name,
    putStatus: put.status,
    putBody: put.body,
    voucherAfter: voucherAfter.body,
    invoiceAfter: invoiceAfter.body,
  });
}

console.log(JSON.stringify({ invoiceNo, voucherId, supplierInvoiceId, orderLineCore, results }, null, 2));
