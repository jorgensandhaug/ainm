const baseUrl = "https://kkpqfuj-amager.tripletex.dev/v2";
const sessionToken =
  "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";

const runDate = "2026-03-20";
const promptLike = {
  supplierName: "Elvdal AS",
  organizationNumber: "889157917",
  invoiceNumber: "INV-2026-8662",
  description: "kontortenester",
  expenseAccountNumber: "6500",
  grossAmount: 39750,
  vatPercentage: 25,
};

type IdRef = { id: number; url?: string };
type ListResponse<T> = { values?: T[]; fullResultSize?: number };
type ValueResponse<T> = { value?: T };

type Supplier = {
  id: number;
  name?: string;
  organizationNumber?: string;
  ledgerAccount?: IdRef | null;
};

type Account = {
  id: number;
  number?: string | number;
  name?: string;
  isApplicableForSupplierInvoice?: boolean;
};

type VatType = {
  id: number;
  number?: string;
  displayName?: string;
  percentage?: number;
};

type VoucherType = {
  id: number;
  name?: string;
};

type VoucherPosting = {
  row?: number;
  account?: (IdRef & { number?: string | number; name?: string }) | null;
  vatType?: (IdRef & { number?: string; percentage?: number }) | null;
  supplier?: (IdRef & { name?: string; organizationNumber?: string }) | null;
  amount?: number;
  amountGross?: number;
  invoiceNumber?: string;
  termOfPayment?: string;
  description?: string;
};

type Voucher = {
  id: number;
  description?: string;
  date?: string;
  voucherType?: (IdRef & { name?: string }) | null;
  postings?: VoucherPosting[];
};

const calls: string[] = [];

function authHeader(): string {
  return `Basic ${Buffer.from(`0:${sessionToken}`).toString("base64")}`;
}

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
      Authorization: authHeader(),
      Accept: "application/json",
      ...(opts.body ? { "Content-Type": "application/json" } : {}),
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const text = await response.text();
  const parsed = text ? JSON.parse(text) : undefined;
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${response.statusText}: ${JSON.stringify(parsed ?? text)}`);
  }
  return parsed as T;
}

function exactOne<T>(items: T[], label: string): T {
  if (items.length !== 1) {
    throw new Error(`Expected exactly one ${label}, got ${items.length}`);
  }
  return items[0]!;
}

function chooseIncomingVat(vatTypes: VatType[], percentage: number): VatType {
  const matches = vatTypes.filter((vatType) => Number(vatType.percentage) === percentage);
  if (matches.length === 0) {
    throw new Error(`No incoming VAT type found for ${percentage}%`);
  }
  return matches.find((vatType) => /^\d+$/.test(vatType.number ?? "")) ?? matches[0]!;
}

async function resolveOrCreateIsolatedSupplier(): Promise<{
  supplierId: number;
  supplierLedgerAccountId: number;
  supplierName: string;
  organizationNumber: string;
  mode: "reused-exact" | "created-exact" | "created-isolated";
}> {
  const existing = await request<ListResponse<Supplier>>("GET", "supplier", {
    params: {
      organizationNumber: promptLike.organizationNumber,
      fields: "*",
    },
  });
  const exact = (existing.values ?? []).filter(
    (supplier) =>
      supplier.organizationNumber === promptLike.organizationNumber &&
      supplier.name === promptLike.supplierName,
  );

  if (exact.length === 1) {
    const supplier = exact[0]!;
    if (!supplier.ledgerAccount?.id) {
      throw new Error("Existing exact supplier missing ledgerAccount.id");
    }
    return {
      supplierId: supplier.id,
      supplierLedgerAccountId: supplier.ledgerAccount.id,
      supplierName: promptLike.supplierName,
      organizationNumber: promptLike.organizationNumber,
      mode: "reused-exact",
    };
  }

  if (exact.length === 0 && (existing.values ?? []).length === 0) {
    const created = await request<ValueResponse<Supplier>>("POST", "supplier", {
      body: {
        name: promptLike.supplierName,
        organizationNumber: promptLike.organizationNumber,
      },
    });
    const supplier = created.value;
    if (!supplier?.id || !supplier.ledgerAccount?.id) {
      throw new Error("Created exact supplier missing id or ledgerAccount.id");
    }
    return {
      supplierId: supplier.id,
      supplierLedgerAccountId: supplier.ledgerAccount.id,
      supplierName: promptLike.supplierName,
      organizationNumber: promptLike.organizationNumber,
      mode: "created-exact",
    };
  }

  const uniqueOrg = `32${Date.now().toString().slice(-7)}`;
  const uniqueName = `${promptLike.supplierName} Sandbox Reflection`;
  const created = await request<ValueResponse<Supplier>>("POST", "supplier", {
    body: {
      name: uniqueName,
      organizationNumber: uniqueOrg,
    },
  });
  const supplier = created.value;
  if (!supplier?.id || !supplier.ledgerAccount?.id) {
    throw new Error("Created isolated supplier missing id or ledgerAccount.id");
  }
  return {
    supplierId: supplier.id,
    supplierLedgerAccountId: supplier.ledgerAccount.id,
    supplierName: uniqueName,
    organizationNumber: uniqueOrg,
    mode: "created-isolated",
  };
}

async function main() {
  const supplier = await resolveOrCreateIsolatedSupplier();
  const netAmount = Math.round((promptLike.grossAmount * 100) / (100 + promptLike.vatPercentage));

  const expenseAccountList = await request<ListResponse<Account>>("GET", "ledger/account", {
    params: {
      number: promptLike.expenseAccountNumber,
      isApplicableForSupplierInvoice: "true",
      fields: "*",
    },
  });
  const expenseAccount = exactOne(expenseAccountList.values ?? [], `expense account ${promptLike.expenseAccountNumber}`);

  const vatTypeList = await request<ListResponse<VatType>>("GET", "ledger/vatType", {
    params: {
      typeOfVat: "INCOMING",
      vatDate: runDate,
      fields: "*",
    },
  });
  const vatType = chooseIncomingVat(vatTypeList.values ?? [], promptLike.vatPercentage);

  const voucherTypeList = await request<ListResponse<VoucherType>>("GET", "ledger/voucherType", {
    params: {
      name: "Leverandørfaktura",
      fields: "*",
    },
  });
  const voucherType = exactOne(
    (voucherTypeList.values ?? []).filter((row) => row.name === "Leverandørfaktura"),
    "voucher type Leverandørfaktura",
  );

  const createdVoucher = await request<ValueResponse<Voucher>>("POST", "ledger/voucher", {
    body: {
      date: runDate,
      description: promptLike.description,
      voucherType: { id: voucherType.id },
      postings: [
        {
          row: 1,
          date: runDate,
          description: promptLike.description,
          account: { id: expenseAccount.id },
          vatType: { id: vatType.id },
          currency: { id: 1 },
          amount: netAmount,
          amountCurrency: netAmount,
          amountGross: promptLike.grossAmount,
          amountGrossCurrency: promptLike.grossAmount,
        },
        {
          row: 2,
          date: runDate,
          description: promptLike.description,
          account: { id: supplier.supplierLedgerAccountId },
          supplier: { id: supplier.supplierId },
          currency: { id: 1 },
          amount: -promptLike.grossAmount,
          amountCurrency: -promptLike.grossAmount,
          amountGross: -promptLike.grossAmount,
          amountGrossCurrency: -promptLike.grossAmount,
          invoiceNumber: promptLike.invoiceNumber,
          termOfPayment: runDate,
        },
      ],
    },
  });
  const created = createdVoucher.value;
  if (!created?.id) {
    throw new Error("Voucher create response missing id");
  }

  const readBack = await request<ValueResponse<Voucher>>("GET", `ledger/voucher/${created.id}`, {
    params: {
      fields: "*,voucherType(*),postings(*,account(*),vatType(*),supplier(*),currency(*))",
    },
  });
  const voucher = readBack.value;
  if (!voucher?.id) {
    throw new Error("Voucher readback missing id");
  }

  const postings = voucher.postings ?? [];
  const expensePosting = postings.find(
    (posting) =>
      Number(posting.account?.number) === Number(promptLike.expenseAccountNumber) &&
      Number(posting.vatType?.percentage) === promptLike.vatPercentage &&
      posting.amount === netAmount &&
      posting.amountGross === promptLike.grossAmount &&
      posting.description === promptLike.description,
  );
  const supplierPosting = postings.find(
    (posting) =>
      posting.supplier?.id === supplier.supplierId &&
      posting.supplier?.name === supplier.supplierName &&
      posting.supplier?.organizationNumber === supplier.organizationNumber &&
      posting.amount === -promptLike.grossAmount &&
      posting.amountGross === -promptLike.grossAmount &&
      posting.invoiceNumber === promptLike.invoiceNumber &&
      posting.termOfPayment === runDate &&
      posting.description === promptLike.description,
  );
  const autoVatPosting = postings.find(
    (posting) =>
      posting.vatType?.id == null &&
      posting.supplier?.id == null &&
      Number(posting.account?.number) !== Number(promptLike.expenseAccountNumber) &&
      posting.amount === promptLike.grossAmount - netAmount,
  );

  if (voucher.description !== promptLike.description) {
    throw new Error(`Voucher description mismatch: ${voucher.description}`);
  }
  if (voucher.date !== runDate) {
    throw new Error(`Voucher date mismatch: ${voucher.date}`);
  }
  if (voucher.voucherType?.name !== "Leverandørfaktura") {
    throw new Error(`Voucher type mismatch: ${voucher.voucherType?.name}`);
  }
  if (!expensePosting) {
    throw new Error("Verified expense posting not found on readback");
  }
  if (!supplierPosting) {
    throw new Error("Verified supplier posting not found on readback");
  }
  if (!autoVatPosting) {
    throw new Error("Verified auto VAT posting not found on readback");
  }

  console.log(
    JSON.stringify(
      {
        supplierMode: supplier.mode,
        supplierName: supplier.supplierName,
        organizationNumber: supplier.organizationNumber,
        voucherId: voucher.id,
        callCount: calls.length,
        calls,
        verified: {
          voucherType: voucher.voucherType?.name,
          description: voucher.description,
          date: voucher.date,
          expenseAccountNumber: expensePosting.account?.number,
          expenseVatPercentage: expensePosting.vatType?.percentage,
          expenseNet: expensePosting.amount,
          expenseGross: expensePosting.amountGross,
          supplierInvoiceNumber: supplierPosting.invoiceNumber,
          supplierTermOfPayment: supplierPosting.termOfPayment,
          autoVatAmount: autoVatPosting.amount,
          autoVatAccountNumber: autoVatPosting.account?.number,
        },
      },
      null,
      2,
    ),
  );
}

await main();
