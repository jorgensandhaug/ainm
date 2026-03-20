const baseUrl = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const sessionToken = "jeZ6JHtJ-N5iOLklqaWcZwHkXyaEfLcNcdWRT8xhXDU";

const runDate = "2026-03-20";
const supplierName = "Elvdal AS";
const organizationNumber = "889157917";
const invoiceNumber = "INV-2026-8662";
const description = "kontortenester";
const expenseAccountNumber = "6500";
const vatPercentage = 25;
const grossAmount = 39750;

type ListResponse<T> = { values?: T[]; fullResultSize?: number };
type ValueResponse<T> = { value?: T };

type IdRef = { id: number };
type Supplier = {
  id: number;
  name?: string;
  organizationNumber?: string;
  ledgerAccount?: IdRef | null;
};
type Account = {
  id: number;
  number?: string;
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
  account?: IdRef | null;
  vatType?: IdRef | null;
  supplier?: IdRef | null;
  amount?: number;
  amountGross?: number;
  invoiceNumber?: string;
  termOfPayment?: string;
};
type Voucher = {
  id: number;
  voucherType?: IdRef | null;
  postings?: VoucherPosting[];
};

function makeUrl(path: string, params?: Record<string, string>): string {
  const normalizedBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  const url = new URL(path, normalizedBase);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.append(key, value);
    }
  }
  return url.toString();
}

function authHeader(): string {
  return `Basic ${Buffer.from(`0:${sessionToken}`).toString("base64")}`;
}

async function request<T>(
  method: string,
  path: string,
  opts: { params?: Record<string, string>; body?: unknown } = {},
): Promise<T> {
  const response = await fetch(makeUrl(path, opts.params), {
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
    const error = parsed ?? text;
    if (
      response.status === 403 &&
      (
        error?.error === "Invalid or expired token" ||
        error?.error === "Invalid or expired proxy token. Each submission receives a unique token - do not reuse tokens from previous submissions."
      )
    ) {
      throw new Error(`Blocked by unusable credentials: ${JSON.stringify(error)}`);
    }
    throw new Error(`HTTP ${response.status} ${response.statusText}: ${JSON.stringify(error)}`);
  }

  return parsed as T;
}

function exactOne<T>(items: T[], label: string): T {
  if (items.length !== 1) {
    throw new Error(`Expected exactly one ${label}, got ${items.length}`);
  }
  return items[0]!;
}

function normalizePercentage(value: number | undefined): number | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  return Number(value);
}

function chooseVatType(vatTypes: VatType[], percentage: number): VatType {
  const matches = vatTypes.filter((vatType) => normalizePercentage(vatType.percentage) === percentage);
  if (matches.length === 0) {
    throw new Error(`No incoming VAT type found for ${percentage}%`);
  }
  const baseCode = matches.find((vatType) => /^\d+$/.test(vatType.number ?? ""));
  return baseCode ?? matches[0]!;
}

async function resolveSupplier(): Promise<{ supplierId: number; supplierLedgerAccountId: number }> {
  const supplierSearch = await request<ListResponse<Supplier>>("GET", "supplier", {
    params: {
      organizationNumber,
      fields: "*",
    },
  });
  const suppliers = supplierSearch.values ?? [];

  if (suppliers.length === 1) {
    const supplier = suppliers[0]!;
    if (!supplier.ledgerAccount?.id) {
      throw new Error("Existing supplier missing ledgerAccount.id");
    }
    return {
      supplierId: supplier.id,
      supplierLedgerAccountId: supplier.ledgerAccount.id,
    };
  }

  if (suppliers.length > 1) {
    const exactMatches = suppliers.filter(
      (supplier) =>
        supplier.organizationNumber === organizationNumber &&
        supplier.name === supplierName,
    );
    const supplier = exactOne(exactMatches, "exact supplier match");
    if (!supplier.ledgerAccount?.id) {
      throw new Error("Exact supplier match missing ledgerAccount.id");
    }
    return {
      supplierId: supplier.id,
      supplierLedgerAccountId: supplier.ledgerAccount.id,
    };
  }

  const created = await request<ValueResponse<Supplier>>("POST", "supplier", {
    body: {
      name: supplierName,
      organizationNumber,
    },
  });
  const supplier = created.value;
  if (!supplier?.id || !supplier.ledgerAccount?.id) {
    throw new Error("Created supplier missing id or ledgerAccount.id");
  }
  return {
    supplierId: supplier.id,
    supplierLedgerAccountId: supplier.ledgerAccount.id,
  };
}

async function main() {
  const netAmount = Math.round((grossAmount * 100) / (100 + vatPercentage));

  const { supplierId, supplierLedgerAccountId } = await resolveSupplier();

  const accountList = await request<ListResponse<Account>>("GET", "ledger/account", {
    params: {
      number: expenseAccountNumber,
      isApplicableForSupplierInvoice: "true",
      fields: "*",
    },
  });
  const expenseAccount = exactOne(accountList.values ?? [], `expense account ${expenseAccountNumber}`);

  const vatTypeList = await request<ListResponse<VatType>>("GET", "ledger/vatType", {
    params: {
      typeOfVat: "INCOMING",
      vatDate: runDate,
      fields: "*",
    },
  });
  const vatType = chooseVatType(vatTypeList.values ?? [], vatPercentage);

  const voucherTypeList = await request<ListResponse<VoucherType>>("GET", "ledger/voucherType", {
    params: {
      name: "Leverandørfaktura",
      fields: "*",
    },
  });
  const voucherType = exactOne(
    (voucherTypeList.values ?? []).filter((item) => item.name === "Leverandørfaktura"),
    "voucher type Leverandørfaktura",
  );

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
          account: { id: supplierLedgerAccountId },
          supplier: { id: supplierId },
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
  if (!voucher?.id) {
    throw new Error("Voucher creation response missing id");
  }

  const postings = voucher.postings ?? [];
  const expensePosting = postings.find(
    (posting) =>
      posting.account?.id === expenseAccount.id &&
      posting.vatType?.id === vatType.id &&
      posting.amount === netAmount &&
      posting.amountGross === grossAmount,
  );
  const supplierPosting = postings.find(
    (posting) =>
      posting.account?.id === supplierLedgerAccountId &&
      posting.supplier?.id === supplierId &&
      posting.amount === -grossAmount &&
      posting.amountGross === -grossAmount &&
      posting.invoiceNumber === invoiceNumber &&
      posting.termOfPayment === runDate,
  );
  const vatPostingCount = postings.filter(
    (posting) =>
      posting.account?.id !== expenseAccount.id &&
      posting.account?.id !== supplierLedgerAccountId,
  ).length;

  if (voucher.voucherType?.id !== voucherType.id) {
    throw new Error("Voucher type verification failed");
  }
  if (!expensePosting) {
    throw new Error("Expense posting verification failed");
  }
  if (!supplierPosting) {
    throw new Error("Supplier posting verification failed");
  }
  if (vatPostingCount < 1) {
    throw new Error("Auto-generated VAT posting missing");
  }

  console.log(JSON.stringify({ voucherId: voucher.id }));
}

await main();
