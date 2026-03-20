const baseUrl = "https://kkpqfuj-amager.tripletex.dev/v2";
const sessionToken =
  "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";

const runDate = "2026-03-20";
const supplierName = "Elvdal AS";
const organizationNumber = "889157917";
const expenseAccountNumber = "6500";

type Supplier = { id?: number; name?: string; organizationNumber?: string };
type Account = { id?: number };
type VatType = { id?: number; percentage?: number; number?: string };
type Voucher = { id?: number; version?: number; postings?: Array<{ id?: number }> };
type SupplierInvoice = {
  id?: number;
  orderLines?: Array<{ id?: number }>;
  voucher?: Voucher | null;
};
type ListResponse<T> = { values?: T[] };
type ValueResponse<T> = { value?: T };

function makeUrl(path: string, params?: Record<string, string>) {
  const url = new URL(path, baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`);
  if (params) {
    for (const [k, v] of Object.entries(params)) url.searchParams.append(k, v);
  }
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

const vatTypes = (await requestJson<ListResponse<VatType>>("GET", "ledger/vatType", {
  params: { typeOfVat: "INCOMING", vatDate: runDate, fields: "*" },
})).body.values ?? [];
const vatType25 =
  vatTypes.find((x: VatType) => Number(x.percentage ?? NaN) === 25 && /^\d+$/.test(String(x.number ?? ""))) ??
  vatTypes.find((x: VatType) => Number(x.percentage ?? NaN) === 25) ??
  null;

const xmlTemplate = await Bun.file(
  "/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-202623091Z-aa17fe23/scripts/minimal-invoice.xml",
).text();

const cases = [
  {
    name: "desc_account_orderline_send_false",
    params: { sendToLedger: "false", voucherDate: runDate },
    build: (orderLineId: number | null) => [
      {
        orderLine: orderLineId ? { id: orderLineId } : undefined,
        posting: { account: { id: account.id }, description: "kontortenester" },
      },
    ],
  },
  {
    name: "desc_account_send_false",
    params: { sendToLedger: "false", voucherDate: runDate },
    build: () => [{ posting: { account: { id: account.id }, description: "kontortenester" } }],
  },
  {
    name: "desc_account_orderline_send_true",
    params: { sendToLedger: "true", voucherDate: runDate },
    build: (orderLineId: number | null) => [
      {
        orderLine: orderLineId ? { id: orderLineId } : undefined,
        posting: { account: { id: account.id }, description: "kontortenester" },
      },
    ],
  },
  {
    name: "desc_account_orderline_no_date_false",
    params: { sendToLedger: "false" },
    build: (orderLineId: number | null) => [
      {
        orderLine: orderLineId ? { id: orderLineId } : undefined,
        posting: { account: { id: account.id }, description: "kontortenester" },
      },
    ],
  },
  {
    name: "desc_account_orderline_vat_false",
    params: { sendToLedger: "false", voucherDate: runDate },
    build: (orderLineId: number | null) => [
      {
        orderLine: orderLineId ? { id: orderLineId } : undefined,
        posting: {
          account: { id: account.id },
          description: "kontortenester",
          ...(vatType25?.id ? { vatType: { id: vatType25.id } } : {}),
        },
      },
    ],
  },
];

const results: unknown[] = [];

for (const [index, probe] of cases.entries()) {
  const invoiceNo = `INV-PROBE-MATRIX-${Date.now()}-${index}`;
  const xml = xmlTemplate.replaceAll("INV-PROBE-EHF-001", invoiceNo);
  const form = new FormData();
  form.append("description", `probe-${invoiceNo}`);
  form.append("file", new Blob([xml], { type: "application/xml" }), `${invoiceNo}.xml`);

  const imported = await requestJson<ListResponse<Voucher>>("POST", "ledger/voucher/importDocument", {
    body: form,
    isForm: true,
  });
  const voucher = (imported.body.values ?? [])[0] as Voucher | undefined;
  const voucherId = voucher?.id ?? null;

  let invoice: SupplierInvoice | null = null;
  let orderLineId: number | null = null;
  if (voucherId) {
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
    invoice = ((search.body.values ?? [])[0] as SupplierInvoice | undefined) ?? null;
    orderLineId = invoice?.orderLines?.[0]?.id ?? null;
  }

  const put =
    voucherId === null
      ? { status: null, body: null }
      : await requestJson<ValueResponse<SupplierInvoice>>("PUT", `supplierInvoice/voucher/${voucherId}/postings`, {
          params: probe.params,
          body: probe.build(orderLineId),
        });

  const voucherAfter =
    voucherId === null
      ? null
      : await requestJson<ValueResponse<Voucher>>("GET", `ledger/voucher/${voucherId}`, {
          params: { fields: "*" },
        });

  const invoiceAfter =
    invoice?.id == null
      ? null
      : await requestJson<ValueResponse<SupplierInvoice>>("GET", `supplierInvoice/${invoice.id}`, {
          params: { fields: "*" },
        });

  const postingsAfter =
    voucherId === null
      ? null
      : await requestJson<ListResponse<unknown>>("GET", "ledger/posting", {
          params: { voucherId: String(voucherId), fields: "*" },
        });

  results.push({
    probe: probe.name,
    invoiceNo,
    voucherId,
    supplierInvoiceId: invoice?.id ?? null,
    orderLineId,
    putStatus: put.status,
    putBody: put.body,
    voucherAfter: voucherAfter?.body ?? null,
    invoiceAfter: invoiceAfter?.body ?? null,
    postingsAfter: postingsAfter?.body ?? null,
  });
}

console.log(JSON.stringify(results, null, 2));
