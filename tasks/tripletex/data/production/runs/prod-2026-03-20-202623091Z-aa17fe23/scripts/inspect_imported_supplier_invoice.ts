const baseUrl = "https://kkpqfuj-amager.tripletex.dev/v2";
const sessionToken =
  "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";

const runDate = "2026-03-20";
const supplierId = 108269769;

type Voucher = { id?: number };
type SupplierInvoice = { id?: number };
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
  return { status: response.status, body: data };
}

const xmlTemplate = await Bun.file(
  "/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-202623091Z-aa17fe23/scripts/minimal-invoice.xml",
).text();
const invoiceNo = `INV-PROBE-INSPECT-${Date.now()}`;
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
    supplierId: String(supplierId),
    voucherId: String(voucherId),
    invoiceNumber: invoiceNo,
    invoiceDateFrom: runDate,
    invoiceDateTo: "2026-03-21",
    fields: "*",
  },
});
const supplierInvoiceId = search.body.values?.[0]?.id;

const invoiceExpanded = await requestJson<ValueResponse<unknown>>("GET", `supplierInvoice/${supplierInvoiceId}`, {
  params: {
    fields: "*,supplier(*),voucher(*),orderLines(*,currency(*),vatType(*),product(*),vendor(*),order(*))",
  },
});

console.log(JSON.stringify({ invoiceNo, voucherId, supplierInvoiceId, invoiceExpanded }, null, 2));
