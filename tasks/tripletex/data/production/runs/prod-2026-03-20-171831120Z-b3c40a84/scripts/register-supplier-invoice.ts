const baseUrl = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const sessionToken = "Oqp49-feDyjS6u2_H8HIOW6NszoFjBGT7qbkbe_9_E8";

const runDate = "2026-03-20";
const grossAmount = 59800;
const netAmount = 47840;
const vatPercentage = 25;

const supplierPayload = {
  name: "Brightstone Ltd",
  organizationNumber: "890932991",
};

const invoiceNumber = "INV-2026-9075";
const description = "office services";
const expenseAccountNumber = 6300;

type ApiEnvelope<T> = {
  value?: T;
  values?: T[];
  validationMessages?: Array<{ field?: string; message?: string }>;
  message?: string;
  error?: string;
};

type Supplier = {
  id: number;
  name: string;
  organizationNumber: string;
  ledgerAccount?: { id: number };
};

type LedgerAccount = {
  id: number;
  number: number;
  isApplicableForSupplierInvoice?: boolean;
};

type VatType = {
  id: number;
  number?: string;
  percentage?: number;
};

type VoucherType = {
  id: number;
  name: string;
};

type Posting = {
  row?: number;
  amount?: number;
  amountGross?: number;
  invoiceNumber?: string;
  termOfPayment?: string;
  account?: { id?: number };
  supplier?: { id?: number };
  vatType?: { id?: number };
};

type Voucher = {
  id: number;
  voucherType?: { id?: number };
  postings?: Posting[];
};

const authHeader = `Basic ${Buffer.from(`0:${sessionToken}`).toString("base64")}`;

function buildUrl(path: string, params?: Record<string, string>): string {
  const url = new URL(path, `${baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`}`);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.append(key, value);
    }
  }
  return url.toString();
}

async function request<T>(
  method: string,
  path: string,
  options: { params?: Record<string, string>; body?: unknown } = {},
): Promise<ApiEnvelope<T>> {
  const response = await fetch(buildUrl(path, options.params), {
    method,
    headers: {
      Authorization: authHeader,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });

  const text = await response.text();
  const data = text ? (JSON.parse(text) as ApiEnvelope<T>) : {};

  if (!response.ok) {
    const details = JSON.stringify(data);
    throw new Error(`${method} ${path} -> ${response.status} ${details}`);
  }

  return data;
}

function requireValue<T>(label: string, envelope: ApiEnvelope<T>): T {
  if (!envelope.value) {
    throw new Error(`${label}: missing value`);
  }
  return envelope.value;
}

function requireSingle<T>(label: string, envelope: ApiEnvelope<T>): T {
  if (!envelope.values || envelope.values.length === 0) {
    throw new Error(`${label}: no matches`);
  }
  if (envelope.values.length > 1) {
    throw new Error(`${label}: expected 1 match, got ${envelope.values.length}`);
  }
  return envelope.values[0]!;
}

function selectVatType(vatTypes: VatType[]): VatType {
  const matches = vatTypes.filter((vatType) => vatType.percentage === vatPercentage);
  if (matches.length === 0) {
    throw new Error(`No INCOMING VAT type for ${vatPercentage}%`);
  }

  const plainNumeric = matches.find((vatType) => /^\d+$/.test(vatType.number ?? ""));
  return plainNumeric ?? matches[0]!;
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

async function main() {
  const supplier = requireValue(
    "supplier create",
    await request<Supplier>("POST", "supplier", { body: supplierPayload }),
  );
  assert(supplier.ledgerAccount?.id, "supplier ledger account id missing");

  const expenseAccount = requireSingle(
    "expense account lookup",
    await request<LedgerAccount>("GET", "ledger/account", {
      params: {
        number: String(expenseAccountNumber),
        isApplicableForSupplierInvoice: "true",
        fields: "*",
      },
    }),
  );

  const vatType = selectVatType(
    (await request<VatType>("GET", "ledger/vatType", {
      params: {
        typeOfVat: "INCOMING",
        vatDate: runDate,
        fields: "*",
      },
    })).values ?? [],
  );

  const voucherType = requireSingle(
    "voucher type lookup",
    await request<VoucherType>("GET", "ledger/voucherType", {
      params: {
        name: "Leverandørfaktura",
        fields: "*",
      },
    }),
  );
  assert(voucherType.name === "Leverandørfaktura", "wrong voucher type returned");

  const voucherPayload = {
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
  };

  const voucher = requireValue(
    "voucher create",
    await request<Voucher>("POST", "ledger/voucher", { body: voucherPayload }),
  );

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
      posting.account?.id === supplier.ledgerAccount?.id &&
      posting.supplier?.id === supplier.id &&
      posting.amount === -grossAmount &&
      posting.invoiceNumber === invoiceNumber &&
      posting.termOfPayment === runDate,
  );
  const autoVatPosting = postings.find(
    (posting) =>
      posting.account?.id !== expenseAccount.id &&
      posting.account?.id !== supplier.ledgerAccount?.id &&
      posting.amount === grossAmount - netAmount,
  );

  assert(voucher.voucherType?.id === voucherType.id, "voucher type mismatch");
  assert(postings.length >= 3, "expected auto VAT posting");
  assert(expensePosting, "expense posting verification failed");
  assert(supplierPosting, "supplier posting verification failed");
  assert(autoVatPosting, "auto VAT posting verification failed");

  console.log(
    JSON.stringify(
      {
        supplierId: supplier.id,
        expenseAccountId: expenseAccount.id,
        vatTypeId: vatType.id,
        voucherTypeId: voucherType.id,
        voucherId: voucher.id,
        postingCount: postings.length,
      },
      null,
      2,
    ),
  );
}

await main();
