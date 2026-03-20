const baseUrl = "https://kkpqfuj-amager.tripletex.dev/v2";
const sessionToken =
  "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";

const runDate = "2026-03-20";
const supplierId = 108269769;
const expenseAccountNumber = "6500";

type Voucher = { id?: number };
type SupplierInvoice = { id?: number; approvalListElements?: Array<{ id?: number }>; orderLines?: Array<Record<string, unknown>> };
type Account = { id?: number };
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
const accountLookup = await requestJson<ListResponse<Account>>("GET", "ledger/account", {
  params: { number: expenseAccountNumber, isApplicableForSupplierInvoice: "true", fields: "*" },
});
const expenseAccountId = accountLookup.body.values?.[0]?.id;
const invoiceNo = `INV-PROBE-APP-${Date.now()}`;
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

const before = await requestJson<ValueResponse<SupplierInvoice>>("GET", `supplierInvoice/${supplierInvoiceId}`, {
  params: { fields: "*,approvalListElements(*),orderLines(*,currency(*),vatType(*))" },
});

const approvalId = before.body.value?.approvalListElements?.[0]?.id;
const approvalElement =
  approvalId == null
    ? null
    : await requestJson<ValueResponse<unknown>>("GET", `voucherApprovalListElement/${approvalId}`, {
        params: { fields: "*" },
      });

const forApproval = await requestJson<ListResponse<unknown>>("GET", "supplierInvoice/forApproval", {
  params: { fields: "*" },
});

const approve = await requestJson<ValueResponse<unknown>>("PUT", `supplierInvoice/${supplierInvoiceId}/:approve`, {
  params: { comment: "probe" },
});

const afterApprove = await requestJson<ValueResponse<SupplierInvoice>>("GET", `supplierInvoice/${supplierInvoiceId}`, {
  params: { fields: "*,approvalListElements(*),orderLines(*,currency(*),vatType(*))" },
});

const orderLine = afterApprove.body.value?.orderLines?.[0];
const put =
  orderLine == null
    ? null
    : await requestJson<ValueResponse<unknown>>("PUT", `supplierInvoice/voucher/${voucherId}/postings`, {
        params: { sendToLedger: "false", voucherDate: runDate },
        body: [
          {
            orderLine,
            posting: {
              account: { id: expenseAccountId },
              description: "kontortenester",
            },
          },
        ],
      });

const voucherAfter = await requestJson<ValueResponse<unknown>>("GET", `ledger/voucher/${voucherId}`, {
  params: { fields: "*" },
});

console.log(
  JSON.stringify(
    {
      invoiceNo,
      voucherId,
      supplierInvoiceId,
      before,
      approvalElement,
      forApproval,
      approve,
      afterApprove,
      put,
      voucherAfter,
    },
    null,
    2,
  ),
);
