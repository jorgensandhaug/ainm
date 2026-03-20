const baseUrl = "https://kkpqfuj-amager.tripletex.dev/v2";
const sessionToken =
  "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";

const authHeader = `Basic ${Buffer.from(`0:${sessionToken}`).toString("base64")}`;

const runDate = "2026-03-20";
const grossAmount = 59800;
const netAmount = 47840;
const vatPercentage = 25;
const expenseAccountNumber = 6300;
const description = "office services";

type Envelope<T> = {
  value?: T;
  values?: T[];
  message?: string;
  error?: string;
  validationMessages?: Array<{ field?: string; message?: string }>;
};

type Supplier = {
  id: number;
  name?: string;
  organizationNumber?: string;
  ledgerAccount?: { id?: number };
};

type Account = { id: number; number?: number };
type VatType = { id: number; number?: string; percentage?: number };
type VoucherType = { id: number; name?: string };
type Posting = {
  amount?: number;
  amountGross?: number;
  invoiceNumber?: string;
  termOfPayment?: string;
  account?: { id?: number };
  supplier?: { id?: number };
  vatType?: { id?: number };
};
type Voucher = { id: number; postings?: Posting[]; voucherType?: { id?: number } };

const investigationOrg = "321000002";
const investigationName = "Codex Reflection Supplier 321000002";

let callCount = 0;

function url(path: string, params?: Record<string, string>) {
  const u = new URL(path, `${baseUrl}/`);
  for (const [k, v] of Object.entries(params ?? {})) {
    u.searchParams.append(k, v);
  }
  return u.toString();
}

async function api<T>(
  method: string,
  path: string,
  options: { params?: Record<string, string>; body?: unknown } = {},
): Promise<Envelope<T>> {
  callCount += 1;
  const response = await fetch(url(path, options.params), {
    method,
    headers: {
      Authorization: authHeader,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const text = await response.text();
  const data = text ? (JSON.parse(text) as Envelope<T>) : {};
  if (!response.ok) {
    throw new Error(`${method} ${path} -> ${response.status} ${JSON.stringify(data)}`);
  }
  return data;
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function pickVatType(vats: VatType[]) {
  const matches = vats.filter((vat) => vat.percentage === vatPercentage);
  assert(matches.length > 0, `No ${vatPercentage}% incoming VAT type`);
  return matches.find((vat) => /^\d+$/.test(vat.number ?? "")) ?? matches[0]!;
}

async function resolveSupplier(): Promise<{
  supplier: Supplier;
  resolutionMode: "existing-search" | "setup-create-then-search";
  duplicateCount: number;
}> {
  const searched = (await api<Supplier>("GET", "supplier", {
    params: { organizationNumber: investigationOrg, fields: "*" },
  })).values ?? [];

  if (searched.length === 1 && searched[0]?.ledgerAccount?.id) {
    return {
      supplier: searched[0],
      resolutionMode: "existing-search",
      duplicateCount: 1,
    };
  }

  if (searched.length > 1) {
    const exactName = searched.filter((supplier) => supplier.name === investigationName);
    assert(exactName.length === 1 && exactName[0]?.ledgerAccount?.id, "Ambiguous duplicate suppliers");
    return {
      supplier: exactName[0],
      resolutionMode: "existing-search",
      duplicateCount: searched.length,
    };
  }

  const setupOrg = `3219${Date.now().toString().slice(-5)}`;
  const setupName = `Codex Reflection Supplier ${setupOrg}`;
  await api<Supplier>("POST", "supplier", {
    body: {
      name: setupName,
      organizationNumber: setupOrg,
    },
  });

  const setupSearch = (await api<Supplier>("GET", "supplier", {
    params: { organizationNumber: setupOrg, fields: "*" },
  })).values ?? [];
  assert(setupSearch.length === 1 && setupSearch[0]?.ledgerAccount?.id, "Setup supplier search did not resolve uniquely");

  return {
    supplier: setupSearch[0],
    resolutionMode: "setup-create-then-search",
    duplicateCount: 1,
  };
}

async function main() {
  const { supplier, resolutionMode, duplicateCount } = await resolveSupplier();
  assert(supplier.ledgerAccount?.id, "Missing supplier ledgerAccount.id");

  const accountList = (await api<Account>("GET", "ledger/account", {
    params: {
      number: String(expenseAccountNumber),
      isApplicableForSupplierInvoice: "true",
      fields: "*",
    },
  })).values ?? [];
  assert(accountList.length === 1, `Expected one expense account, got ${accountList.length}`);
  const expenseAccount = accountList[0]!;

  const vatType = pickVatType(
    (await api<VatType>("GET", "ledger/vatType", {
      params: { typeOfVat: "INCOMING", vatDate: runDate, fields: "*" },
    })).values ?? [],
  );

  const voucherTypes = (await api<VoucherType>("GET", "ledger/voucherType", {
    params: { name: "Leverandørfaktura", fields: "*" },
  })).values ?? [];
  const voucherType = voucherTypes.find((item) => item.name === "Leverandørfaktura");
  assert(voucherType?.id, "Missing supplier-invoice voucher type");

  const invoiceNumber = `INV-REFLECT-${Date.now()}`;
  const voucher = (await api<Voucher>("POST", "ledger/voucher", {
    body: {
      date: runDate,
      description,
      voucherType: { id: voucherType.id },
      postings: [
        {
          row: 1,
          date: runDate,
          description,
          account: { id: expenseAccount.id },
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
  })).value;

  assert(voucher?.id, "Voucher creation failed");
  const postings = voucher.postings ?? [];
  assert(
    postings.some(
      (posting) =>
        posting.account?.id === expenseAccount.id &&
        posting.vatType?.id === vatType.id &&
        posting.amount === netAmount &&
        posting.amountGross === grossAmount,
    ),
    "Expense posting missing",
  );
  assert(
    postings.some(
      (posting) =>
        posting.account?.id === supplier.ledgerAccount?.id &&
        posting.supplier?.id === supplier.id &&
        posting.amount === -grossAmount &&
        posting.invoiceNumber === invoiceNumber,
    ),
    "Supplier posting missing",
  );

  console.log(
    JSON.stringify(
      {
        resolutionMode,
        duplicateCount,
        supplierId: supplier.id,
        supplierOrg: supplier.organizationNumber,
        voucherId: voucher.id,
        callCount,
      },
      null,
      2,
    ),
  );
}

await main();
