const baseUrl = "https://kkpqfuj-amager.tripletex.dev/v2";
const sessionToken =
  "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";

const runDate = "2026-03-20";
const supplierName = "Codex Reflection Supplier 321000002";
const organizationNumber = "321000002";
const expenseAccountNumber = "6500";
const vatPercentage = 25;
const grossAmount = 39750;
const invoiceNumber = `REFL-INV-6500-${Date.now()}`;
const description = "kontortenester";

type IdRef = { id: number };
type ListResponse<T> = { values?: T[] };
type ValueResponse<T> = { value?: T };
type Supplier = { id: number; name?: string; organizationNumber?: string; ledgerAccount?: IdRef | null };
type Account = { id: number; number?: string | number };
type VatType = { id: number; number?: string; percentage?: number };
type VoucherType = { id: number; name?: string };
type VoucherPosting = {
  account?: IdRef | null;
  vatType?: IdRef | null;
  supplier?: IdRef | null;
  amount?: number;
  amountGross?: number;
  invoiceNumber?: string;
  termOfPayment?: string;
};
type Voucher = { id: number; voucherType?: IdRef | null; postings?: VoucherPosting[] };

const calls: string[] = [];

function makeUrl(path: string, params?: Record<string, string>): string {
  const normalizedBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  const url = new URL(path, normalizedBase);
  for (const [key, value] of Object.entries(params ?? {})) {
    url.searchParams.append(key, value);
  }
  return url.toString();
}

async function request<T>(
  method: string,
  path: string,
  opts: { params?: Record<string, string>; body?: unknown } = {},
): Promise<T> {
  const url = makeUrl(path, opts.params);
  calls.push(`${method} ${url}`);
  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Basic ${Buffer.from(`0:${sessionToken}`).toString("base64")}`,
      Accept: "application/json",
      ...(opts.body ? { "Content-Type": "application/json" } : {}),
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const text = await response.text();
  const parsed = text ? JSON.parse(text) : undefined;
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${JSON.stringify(parsed ?? text)}`);
  }
  return parsed as T;
}

function only<T>(items: T[], label: string): T {
  if (items.length !== 1) throw new Error(`Expected one ${label}, got ${items.length}`);
  return items[0]!;
}

function chooseVat(vatTypes: VatType[]): VatType {
  const matches = vatTypes.filter((vatType) => Number(vatType.percentage) === vatPercentage);
  if (matches.length === 0) throw new Error("No 25% incoming VAT type");
  return matches.find((vatType) => /^\d+$/.test(vatType.number ?? "")) ?? matches[0]!;
}

async function main() {
  const supplierRes = await request<ListResponse<Supplier>>("GET", "supplier", {
    params: { organizationNumber, fields: "*" },
  });
  const supplier = only(
    (supplierRes.values ?? []).filter(
      (item) => item.organizationNumber === organizationNumber && item.name === supplierName,
    ),
    "exact sandbox supplier",
  );
  if (!supplier.ledgerAccount?.id) throw new Error("Supplier missing ledgerAccount.id");

  const accountRes = await request<ListResponse<Account>>("GET", "ledger/account", {
    params: {
      number: expenseAccountNumber,
      isApplicableForSupplierInvoice: "true",
      fields: "*",
    },
  });
  const account = only(accountRes.values ?? [], "expense account");

  const vatRes = await request<ListResponse<VatType>>("GET", "ledger/vatType", {
    params: { typeOfVat: "INCOMING", vatDate: runDate, fields: "*" },
  });
  const vatType = chooseVat(vatRes.values ?? []);

  const voucherTypeRes = await request<ListResponse<VoucherType>>("GET", "ledger/voucherType", {
    params: { name: "Leverandørfaktura", fields: "*" },
  });
  const voucherType = only(
    (voucherTypeRes.values ?? []).filter((item) => item.name === "Leverandørfaktura"),
    "voucher type",
  );

  const netAmount = Math.round((grossAmount * 100) / (100 + vatPercentage));
  const voucherRes = await request<ValueResponse<Voucher>>("POST", "ledger/voucher", {
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

  const voucher = voucherRes.value;
  if (!voucher?.id) throw new Error("Voucher missing id");
  const postings = voucher.postings ?? [];
  const expensePosting = postings.find(
    (posting) =>
      posting.account?.id === account.id &&
      posting.vatType?.id === vatType.id &&
      posting.amount === netAmount &&
      posting.amountGross === grossAmount,
  );
  const supplierPosting = postings.find(
    (posting) =>
      posting.account?.id === supplier.ledgerAccount?.id &&
      posting.supplier?.id === supplier.id &&
      posting.amount === -grossAmount &&
      posting.amountGross === -grossAmount &&
      posting.invoiceNumber === invoiceNumber &&
      posting.termOfPayment === runDate,
  );
  const extraPostingCount = postings.filter(
    (posting) =>
      posting.account?.id !== account.id && posting.account?.id !== supplier.ledgerAccount?.id,
  ).length;

  if (voucher.voucherType?.id !== voucherType.id) throw new Error("Voucher type mismatch");
  if (!expensePosting) throw new Error("Expense posting mismatch");
  if (!supplierPosting) throw new Error("Supplier posting mismatch");
  if (extraPostingCount < 1) throw new Error("Auto VAT posting missing");

  console.log(
    JSON.stringify({
      callCount: calls.length,
      calls,
      voucherId: voucher.id,
      supplierId: supplier.id,
      accountId: account.id,
      vatTypeId: vatType.id,
      voucherTypeId: voucherType.id,
    }),
  );
}

await main();
