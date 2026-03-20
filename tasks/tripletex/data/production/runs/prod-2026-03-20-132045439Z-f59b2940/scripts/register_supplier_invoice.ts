const BASE_URL = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "4VfN5H4b6EP8_8f6tOZSxCGO1L4rz-B4lSXkSkA4CVg";

const TODAY = "2026-03-20";
const SUPPLIER_NAME = "Fossekraft AS";
const ORGANIZATION_NUMBER = "949805727";
const ACCOUNT_NUMBER = 7000;
const INVOICE_NUMBER = "INV-2026-4995";
const DESCRIPTION = "kontortenester";
const AMOUNT_INCL_VAT = 62850;

type VatType = {
  id: number;
  name?: string;
  number?: string;
  displayName?: string;
  percentage?: number;
  deductionPercentage?: number;
};

type Supplier = {
  id: number;
  name?: string;
  organizationNumber?: string;
  ledgerAccount?: { id: number };
  currency?: { id: number };
};

type Account = {
  id: number;
  number?: number;
  name?: string;
  vatType?: VatType;
  legalVatTypes?: VatType[];
  requiresDepartment?: boolean;
  requiresProject?: boolean;
  currency?: { id: number };
};

type IncomingInvoiceSaveResult = {
  voucherId: number;
  version: number;
  voucherNumber?: number;
  voucherTempNumber?: number;
  voucherYear?: number;
  invoiceLifeCycle?: string;
};

type VoucherPosting = {
  account?: { id?: number; number?: number };
  supplier?: { id?: number };
  vatType?: { id?: number };
  amount?: number;
  amountGross?: number;
  invoiceNumber?: string;
  termOfPayment?: string;
};

type Voucher = {
  id: number;
  number?: number;
  year?: number;
  vendorInvoiceNumber?: string;
  externalVoucherNumber?: string;
  postings?: VoucherPosting[];
};

function authHeader() {
  return `Basic ${Buffer.from(`0:${TOKEN}`).toString("base64")}`;
}

function buildUrl(path: string, query?: Record<string, string | number | boolean | undefined>) {
  const url = new URL(`${BASE_URL}${path}`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) {
        url.searchParams.set(key, String(value));
      }
    }
  }
  return url.toString();
}

async function request<T>(method: string, path: string, opts?: {
  query?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
}): Promise<T> {
  const response = await fetch(buildUrl(path, opts?.query), {
    method,
    headers: {
      Authorization: authHeader(),
      Accept: "application/json",
      ...(opts?.body ? { "Content-Type": "application/json; charset=utf-8" } : {}),
    },
    body: opts?.body ? JSON.stringify(opts.body) : undefined,
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : undefined;

  if (!response.ok) {
    throw new Error(
      `${method} ${path} failed: ${response.status} ${response.statusText}\n${text}`,
    );
  }

  return data as T;
}

function pickVatTypeFromAccount(account: Account): number | undefined {
  const defaultVat = account.vatType;
  if (
    defaultVat?.id &&
    Number(defaultVat.percentage) === 25 &&
    (defaultVat.deductionPercentage === undefined || Number(defaultVat.deductionPercentage) === 100)
  ) {
    return defaultVat.id;
  }

  const legal = (account.legalVatTypes ?? []).filter(
    (vat) =>
      vat.id &&
      Number(vat.percentage) === 25 &&
      (vat.deductionPercentage === undefined || Number(vat.deductionPercentage) === 100),
  );

  if (legal.length === 1) {
    return legal[0].id;
  }

  const textMatched = legal.filter((vat) =>
    `${vat.name ?? ""} ${vat.displayName ?? ""}`.toLowerCase().match(/inng|fradrag|kjo|kjøp/),
  );

  if (textMatched.length === 1) {
    return textMatched[0].id;
  }

  return undefined;
}

async function main() {
  const supplierSearch = await request<{ values?: Supplier[] }>("GET", "/supplier", {
    query: {
      organizationNumber: ORGANIZATION_NUMBER,
      fields: "*",
    },
  });

  let supplier = (supplierSearch.values ?? []).find(
    (entry) => entry.organizationNumber === ORGANIZATION_NUMBER,
  );

  if (!supplier) {
    const created = await request<{ value: Supplier }>("POST", "/supplier", {
      body: {
        name: SUPPLIER_NAME,
        organizationNumber: ORGANIZATION_NUMBER,
      },
    });
    supplier = created.value;
  }

  if (!supplier?.id) {
    throw new Error("Supplier ID missing after lookup/create.");
  }

  const accountSearch = await request<{ values?: Account[] }>("GET", "/ledger/account", {
    query: {
      number: ACCOUNT_NUMBER,
      isApplicableForSupplierInvoice: true,
      fields: "*",
    },
  });

  const account = (accountSearch.values ?? []).find((entry) => entry.number === ACCOUNT_NUMBER);
  if (!account?.id) {
    throw new Error(`Account ${ACCOUNT_NUMBER} not found.`);
  }
  if (account.requiresDepartment || account.requiresProject) {
    throw new Error(`Account ${ACCOUNT_NUMBER} requires unsupported dimensions.`);
  }

  let vatTypeId = pickVatTypeFromAccount(account);

  if (!vatTypeId) {
    const vatSearch = await request<{ values?: VatType[] }>("GET", "/ledger/vatType", {
      query: {
        typeOfVat: "INCOMING_INVOICE",
        vatDate: TODAY,
        fields: "*",
      },
    });

    const legalIds = new Set((account.legalVatTypes ?? []).map((vat) => vat.id));
    const vatCandidates = (vatSearch.values ?? []).filter(
      (vat) =>
        vat.id &&
        Number(vat.percentage) === 25 &&
        (vat.deductionPercentage === undefined || Number(vat.deductionPercentage) === 100) &&
        (legalIds.size === 0 || legalIds.has(vat.id)),
    );

    if (account.vatType?.id && vatCandidates.some((vat) => vat.id === account.vatType?.id)) {
      vatTypeId = account.vatType.id;
    } else if (vatCandidates.length === 1) {
      vatTypeId = vatCandidates[0].id;
    }
  }

  if (!vatTypeId) {
    throw new Error("Unable to resolve a 25% incoming invoice VAT type.");
  }

  let supplierLedgerAccountId = supplier.ledgerAccount?.id;
  if (!supplierLedgerAccountId) {
    const supplierLedgerAccountSearch = await request<{ values?: Account[] }>(
      "GET",
      "/ledger/account",
      {
        query: {
          number: 2400,
          ledgerType: "VENDOR",
          fields: "*",
        },
      },
    );
    supplierLedgerAccountId = supplierLedgerAccountSearch.values?.find(
      (entry) => entry.number === 2400,
    )?.id;
  }

  if (!supplierLedgerAccountId) {
    throw new Error("Unable to resolve supplier ledger account.");
  }

  const currencyId = supplier.currency?.id ?? account.currency?.id ?? 1;

  const createdVoucher = await request<{ value: Voucher }>("POST", "/ledger/voucher", {
    query: {
      sendToLedger: true,
    },
    body: {
      date: TODAY,
      description: DESCRIPTION,
      externalVoucherNumber: INVOICE_NUMBER,
      vendorInvoiceNumber: INVOICE_NUMBER,
      postings: [
        {
          date: TODAY,
          description: DESCRIPTION,
          account: { id: account.id },
          vatType: { id: vatTypeId },
          amount: AMOUNT_INCL_VAT,
          amountCurrency: AMOUNT_INCL_VAT,
          amountGross: AMOUNT_INCL_VAT,
          amountGrossCurrency: AMOUNT_INCL_VAT,
          currency: { id: currencyId },
          invoiceNumber: INVOICE_NUMBER,
          termOfPayment: TODAY,
          row: 1,
        },
        {
          date: TODAY,
          description: DESCRIPTION,
          account: { id: supplierLedgerAccountId },
          supplier: { id: supplier.id },
          amount: -AMOUNT_INCL_VAT,
          amountCurrency: -AMOUNT_INCL_VAT,
          amountGross: -AMOUNT_INCL_VAT,
          amountGrossCurrency: -AMOUNT_INCL_VAT,
          currency: { id: currencyId },
          invoiceNumber: INVOICE_NUMBER,
          termOfPayment: TODAY,
          row: 2,
        },
      ],
    },
  });

  const voucher = createdVoucher.value;
  const postings = voucher.postings ?? [];
  const hasExpensePosting = postings.some(
    (posting) =>
      posting.account?.id === account.id &&
      posting.vatType?.id === vatTypeId &&
      posting.amountGross === AMOUNT_INCL_VAT,
  );
  const hasSupplierPosting = postings.some(
    (posting) =>
      posting.account?.id === supplierLedgerAccountId &&
      posting.supplier?.id === supplier.id &&
      posting.amountGross === -AMOUNT_INCL_VAT,
  );

  if (!voucher.id || voucher.vendorInvoiceNumber !== INVOICE_NUMBER || !hasExpensePosting || !hasSupplierPosting) {
    throw new Error("Voucher response missing expected supplier invoice state.");
  }

  console.log(
    JSON.stringify(
      {
        supplierId: supplier.id,
        accountId: account.id,
        supplierLedgerAccountId,
        vatTypeId,
        voucherId: voucher.id,
        voucherNumber: voucher.number,
        voucherYear: voucher.year,
        vendorInvoiceNumber: voucher.vendorInvoiceNumber,
        externalVoucherNumber: voucher.externalVoucherNumber,
        postingCount: postings.length,
      },
      null,
      2,
    ),
  );
}

await main();
