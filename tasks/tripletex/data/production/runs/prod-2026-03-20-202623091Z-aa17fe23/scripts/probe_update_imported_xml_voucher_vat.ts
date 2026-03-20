const baseUrl = "https://kkpqfuj-amager.tripletex.dev/v2";
const sessionToken =
  "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";

const runDate = "2026-03-20";
const supplierName = "Elvdal AS";
const organizationNumber = "889157917";
const expenseAccountNumber = "6500";

type IdRef = { id?: number };
type Supplier = { id?: number; name?: string; organizationNumber?: string; ledgerAccount?: IdRef | null };
type Account = { id?: number };
type Voucher = { id?: number; version?: number };
type VatType = { id?: number; number?: string; percentage?: number };
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
if (!supplier.id || !supplier.ledgerAccount?.id) throw new Error("Missing supplier ids");

const account = exactOne(
  (await requestJson<ListResponse<Account>>("GET", "ledger/account", {
    params: { number: expenseAccountNumber, isApplicableForSupplierInvoice: "true", fields: "*" },
  })).body.values ?? [],
  "account",
);
if (!account.id) throw new Error("Missing account");

const vatCandidates = ((await requestJson<ListResponse<VatType>>("GET", "ledger/vatType", {
  params: { typeOfVat: "INCOMING", vatDate: runDate, fields: "*" },
})).body.values ?? []).filter((x: VatType) => Number(x.percentage ?? NaN) === 25);
const vatType = vatCandidates.find((x: VatType) => String(x.number ?? "") === "1") ?? vatCandidates[0];
if (!vatType?.id) throw new Error("Missing VAT type");

const xmlTemplate = await Bun.file(
  "/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-202623091Z-aa17fe23/scripts/minimal-invoice.xml",
).text();

const variants = [
  {
    name: "net_gross_with_vat",
    debit: {
      row: 1,
      date: runDate,
      description: "kontortenester",
      account: { id: account.id },
      vatType: { id: vatType.id },
      amount: 31800,
      amountCurrency: 31800,
      amountGross: 39750,
      amountGrossCurrency: 39750,
    },
  },
  {
    name: "gross_only_with_vat",
    debit: {
      row: 1,
      date: runDate,
      description: "kontortenester",
      account: { id: account.id },
      vatType: { id: vatType.id },
      amount: 39750,
      amountCurrency: 39750,
      amountGross: 39750,
      amountGrossCurrency: 39750,
    },
  },
  {
    name: "net_only_with_vat",
    debit: {
      row: 1,
      date: runDate,
      description: "kontortenester",
      account: { id: account.id },
      vatType: { id: vatType.id },
      amount: 31800,
      amountCurrency: 31800,
    },
  },
];

const results: unknown[] = [];
for (const [index, variant] of variants.entries()) {
  const invoiceNo = `INV-PROBE-VAT-${Date.now()}-${index}`;
  const xml = xmlTemplate.replaceAll("INV-PROBE-EHF-001", invoiceNo);
  const form = new FormData();
  form.append("description", `probe-${invoiceNo}`);
  form.append("file", new Blob([xml], { type: "application/xml" }), `${invoiceNo}.xml`);

  const imported = await requestJson<ListResponse<Voucher>>("POST", "ledger/voucher/importDocument", {
    body: form,
    isForm: true,
  });
  const importedVoucher = imported.body.values?.[0];
  if (!importedVoucher?.id) throw new Error("Missing voucher");

  const put = await requestJson<ValueResponse<unknown>>("PUT", `ledger/voucher/${importedVoucher.id}`, {
    params: { sendToLedger: "false" },
    body: {
      version: importedVoucher.version,
      postings: [
        variant.debit,
        {
          row: 2,
          date: runDate,
          description: "kontortenester",
          account: { id: supplier.ledgerAccount.id },
          supplier: { id: supplier.id },
          amount: -39750,
          amountCurrency: -39750,
          amountGross: -39750,
          amountGrossCurrency: -39750,
          invoiceNumber: invoiceNo,
          termOfPayment: runDate,
        },
      ],
    },
  });

  const voucherAfter = await requestJson<ValueResponse<unknown>>("GET", `ledger/voucher/${importedVoucher.id}`, {
    params: { fields: "*" },
  });

  results.push({
    variant: variant.name,
    invoiceNo,
    voucherId: importedVoucher.id,
    putStatus: put.status,
    putBody: put.body,
    voucherAfter: voucherAfter.body,
  });
}

console.log(JSON.stringify({ account, vatType, results }, null, 2));
