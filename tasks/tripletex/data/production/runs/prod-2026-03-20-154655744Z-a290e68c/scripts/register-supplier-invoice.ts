const BASE_URL = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "VQcfBziyXwpztE4SthT5b7XviWidORsaLYnEVHf_mMM";

const RUN_DATE = "2026-03-20";
const SUPPLIER_NAME = "Brückentor GmbH";
const SUPPLIER_ORG_NO = "981448294";
const INVOICE_NUMBER = "INV-2026-2118";
const DESCRIPTION = "Bürodienstleistungen";
const ACCOUNT_NUMBER = 6590;
const GROSS_AMOUNT = 70400;
const VAT_PERCENTAGE = 25;
const NET_AMOUNT = GROSS_AMOUNT / (1 + VAT_PERCENTAGE / 100);

type ApiResponse<T> = {
  value?: T;
  values?: T[];
  fullResultSize?: number;
  [key: string]: unknown;
};

type RequestOptions = {
  method?: string;
  query?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
  allowStatuses?: number[];
};

function authHeader() {
  return `Basic ${Buffer.from(`0:${TOKEN}`).toString("base64")}`;
}

function buildUrl(
  path: string,
  query?: Record<string, string | number | boolean | undefined>,
) {
  const url = new URL(`${BASE_URL}${path}`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) {
        url.searchParams.set(key, String(value));
      }
    }
  }
  return url;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const url = buildUrl(path, options.query);
  const response = await fetch(url, {
    method: options.method ?? "GET",
    headers: {
      Authorization: authHeader(),
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const text = await response.text();
  const parsed = text ? JSON.parse(text) : undefined;
  const allowedStatuses = new Set([200, 201, 204, ...(options.allowStatuses ?? [])]);

  if (!allowedStatuses.has(response.status)) {
    const errorText =
      parsed && typeof parsed === "object"
        ? JSON.stringify(parsed)
        : text || response.statusText;
    throw new Error(`${response.status} ${response.statusText} for ${url}: ${errorText}`);
  }

  return parsed as T;
}

async function createOrResolveSupplier() {
  try {
    const created = await request<ApiResponse<any>>("/supplier", {
      method: "POST",
      body: {
        name: SUPPLIER_NAME,
        organizationNumber: SUPPLIER_ORG_NO,
      },
    });
    if (!created.value?.id || !created.value?.ledgerAccount?.id) {
      throw new Error(`Unexpected supplier create response: ${JSON.stringify(created)}`);
    }
    return created.value;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes("409") && !message.includes("422")) {
      throw error;
    }

    const existing = await request<ApiResponse<any>>("/supplier", {
      query: {
        organizationNumber: SUPPLIER_ORG_NO,
        fields: "*",
        count: 10,
      },
    });
    const supplier = (existing.values ?? []).find(
      (value) => value.organizationNumber === SUPPLIER_ORG_NO,
    );
    if (!supplier?.id || !supplier?.ledgerAccount?.id) {
      throw new Error(`Supplier recovery failed: ${JSON.stringify(existing)}`);
    }
    return supplier;
  }
}

function pickSingle<T>(
  values: T[] | undefined,
  predicate: (value: T) => boolean,
  label: string,
) {
  const matches = (values ?? []).filter(predicate);
  if (matches.length !== 1) {
    throw new Error(`Expected exactly one ${label}, got ${matches.length}: ${JSON.stringify(values)}`);
  }
  return matches[0];
}

async function main() {
  const supplier = await createOrResolveSupplier();

  const accountResponse = await request<ApiResponse<any>>("/ledger/account", {
    query: {
      number: ACCOUNT_NUMBER,
      isApplicableForSupplierInvoice: true,
      fields: "*",
    },
  });
  const expenseAccount = pickSingle(
    accountResponse.values,
    (value) => Number(value.number) === ACCOUNT_NUMBER,
    "expense account",
  );

  const vatResponse = await request<ApiResponse<any>>("/ledger/vatType", {
    query: {
      typeOfVat: "INCOMING",
      vatDate: RUN_DATE,
      fields: "*",
    },
  });
  const vatType = pickSingle(
    vatResponse.values,
    (value) => Number(value.percentage) === VAT_PERCENTAGE && /^\d+$/.test(String(value.number ?? "")),
    "incoming VAT type",
  );

  const voucherTypeResponse = await request<ApiResponse<any>>("/ledger/voucherType", {
    query: {
      name: "Leverandørfaktura",
      fields: "*",
    },
  });
  const voucherType = pickSingle(
    voucherTypeResponse.values,
    (value) => value.name === "Leverandørfaktura",
    "voucher type",
  );

  const voucherResponse = await request<ApiResponse<any>>("/ledger/voucher", {
    method: "POST",
    body: {
      date: RUN_DATE,
      description: DESCRIPTION,
      voucherType: { id: voucherType.id },
      postings: [
        {
          row: 1,
          date: RUN_DATE,
          description: DESCRIPTION,
          account: { id: expenseAccount.id },
          vatType: { id: vatType.id },
          currency: { id: 1 },
          amount: NET_AMOUNT,
          amountCurrency: NET_AMOUNT,
          amountGross: GROSS_AMOUNT,
          amountGrossCurrency: GROSS_AMOUNT,
        },
        {
          row: 2,
          date: RUN_DATE,
          description: DESCRIPTION,
          account: { id: supplier.ledgerAccount.id },
          supplier: { id: supplier.id },
          currency: { id: 1 },
          amount: -GROSS_AMOUNT,
          amountCurrency: -GROSS_AMOUNT,
          amountGross: -GROSS_AMOUNT,
          amountGrossCurrency: -GROSS_AMOUNT,
          invoiceNumber: INVOICE_NUMBER,
          termOfPayment: RUN_DATE,
        },
      ],
    },
  });

  const voucher = voucherResponse.value;
  if (!voucher?.id || !Array.isArray(voucher.postings) || voucher.postings.length < 3) {
    throw new Error(`Unexpected voucher response: ${JSON.stringify(voucherResponse)}`);
  }

  console.log(
    JSON.stringify(
      {
        supplierId: supplier.id,
        supplierLedgerAccountId: supplier.ledgerAccount.id,
        expenseAccountId: expenseAccount.id,
        vatTypeId: vatType.id,
        voucherTypeId: voucherType.id,
        voucherId: voucher.id,
        postingCount: voucher.postings.length,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
