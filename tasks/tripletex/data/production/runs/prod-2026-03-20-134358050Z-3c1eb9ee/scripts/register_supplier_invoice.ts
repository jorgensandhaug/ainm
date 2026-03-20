const BASE_URL = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "fVzBrPwKsmKID5O94Fd8P4jwIQsy_z2WoeZ8VKzCdOc";

const VOUCHER_DATE = "2026-03-20";
const SUPPLIER_NAME = "Montaña SL";
const ORGANIZATION_NUMBER = "884646979";
const INVOICE_NUMBER = "INV-2026-9187";
const DESCRIPTION = "servicios de oficina";
const EXPENSE_ACCOUNT_NUMBER = "7300";
const GROSS_AMOUNT = 19500;
const NET_AMOUNT = 15600;
const VAT_PERCENTAGE = 25;

const headers = {
  Authorization: `Basic ${Buffer.from(`0:${TOKEN}`).toString("base64")}`,
  Accept: "application/json",
};

type ListResponse<T> = { values?: T[] };
type Wrapper<T> = { value?: T };

type IdRef = { id: number };

type Supplier = {
  id: number;
  name?: string;
  organizationNumber?: string;
  ledgerAccount?: { id: number; number?: number | string };
};

type Account = {
  id: number;
  number?: number | string;
};

type VatType = {
  id: number;
  number?: string;
  percentage?: number;
};

type VoucherType = {
  id: number;
  name?: string;
  displayName?: string;
};

type Posting = {
  row?: number;
  account?: Account;
  vatType?: VatType;
  supplier?: Supplier;
  amount?: number;
  amountGross?: number;
  invoiceNumber?: string;
  termOfPayment?: string;
  systemGenerated?: boolean;
};

type Voucher = {
  id: number;
  number?: number;
  voucherType?: VoucherType;
  postings?: Posting[];
};

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      ...headers,
      ...(init?.body ? { "Content-Type": "application/json; charset=utf-8" } : {}),
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`${init?.method ?? "GET"} ${path} -> ${response.status}\n${body}`);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

function pickSingle<T>(values: T[] | undefined, message: string): T {
  if (!values?.length) throw new Error(message);
  return values[0];
}

function pickVat(values: VatType[] | undefined): VatType {
  if (!values?.length) throw new Error("No VAT types returned");

  const matchingPercentage = values.filter((vat) => vat.percentage === VAT_PERCENTAGE);
  if (!matchingPercentage.length) {
    throw new Error(`No incoming VAT type found for ${VAT_PERCENTAGE}%`);
  }

  const numericBaseCodes = matchingPercentage
    .filter((vat) => vat.number && /^\d+$/.test(vat.number))
    .sort((a, b) => Number(a.number) - Number(b.number));

  return numericBaseCodes[0] ?? matchingPercentage[0];
}

function findPosting(postings: Posting[] | undefined, predicate: (posting: Posting) => boolean, message: string): Posting {
  const posting = postings?.find(predicate);
  if (!posting) throw new Error(message);
  return posting;
}

async function main() {
  const supplierCreate = await api<Wrapper<Supplier>>("/supplier", {
    method: "POST",
    body: JSON.stringify({
      name: SUPPLIER_NAME,
      organizationNumber: ORGANIZATION_NUMBER,
    }),
  });

  const supplier = supplierCreate.value;
  if (!supplier?.id) throw new Error("Supplier creation did not return an id");

  const expenseAccountRes = await api<ListResponse<Account>>(
    `/ledger/account?number=${encodeURIComponent(EXPENSE_ACCOUNT_NUMBER)}&isApplicableForSupplierInvoice=true&fields=*`,
  );
  const expenseAccount = pickSingle(
    expenseAccountRes.values?.filter((account) => String(account.number) === EXPENSE_ACCOUNT_NUMBER),
    `Expense account ${EXPENSE_ACCOUNT_NUMBER} not found`,
  );

  const vatTypeRes = await api<ListResponse<VatType>>(
    `/ledger/vatType?typeOfVat=INCOMING&vatDate=${VOUCHER_DATE}&fields=*`,
  );
  const vatType = pickVat(vatTypeRes.values);

  const voucherTypeRes = await api<ListResponse<VoucherType>>(
    `/ledger/voucherType?name=${encodeURIComponent("Leverandørfaktura")}&fields=*`,
  );
  const voucherType = pickSingle(
    voucherTypeRes.values?.filter((type) => type.name === "Leverandørfaktura"),
    'Voucher type "Leverandørfaktura" not found',
  );

  let supplierLedgerAccountId = supplier.ledgerAccount?.id;
  if (!supplierLedgerAccountId) {
    const supplierAccountRes = await api<ListResponse<Account>>("/ledger/account?number=2400&fields=*");
    supplierLedgerAccountId = pickSingle(
      supplierAccountRes.values?.filter((account) => String(account.number) === "2400"),
      "Supplier ledger account 2400 not found",
    ).id;
  }

  const voucherCreate = await api<Wrapper<Voucher>>("/ledger/voucher", {
    method: "POST",
    body: JSON.stringify({
      date: VOUCHER_DATE,
      description: DESCRIPTION,
      voucherType: { id: voucherType.id },
      postings: [
        {
          row: 1,
          date: VOUCHER_DATE,
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
          date: VOUCHER_DATE,
          description: DESCRIPTION,
          account: { id: supplierLedgerAccountId },
          supplier: { id: supplier.id },
          currency: { id: 1 },
          amount: -GROSS_AMOUNT,
          amountCurrency: -GROSS_AMOUNT,
          amountGross: -GROSS_AMOUNT,
          amountGrossCurrency: -GROSS_AMOUNT,
          invoiceNumber: INVOICE_NUMBER,
          termOfPayment: VOUCHER_DATE,
        },
      ],
    }),
  });

  const voucher = voucherCreate.value;
  if (!voucher?.id) throw new Error("Voucher creation did not return an id");

  const postings = voucher.postings ?? [];
  if (postings.length < 3) throw new Error(`Expected >=3 postings, got ${postings.length}`);

  const expensePosting = findPosting(
    postings,
    (posting) =>
      String(posting.account?.number) === EXPENSE_ACCOUNT_NUMBER &&
      posting.vatType?.id === vatType.id &&
      posting.amount === NET_AMOUNT &&
      posting.amountGross === GROSS_AMOUNT,
    "Expense posting verification failed",
  );

  const supplierPosting = findPosting(
    postings,
    (posting) =>
      String(posting.account?.number) === "2400" &&
      posting.supplier?.id === supplier.id &&
      posting.amount === -GROSS_AMOUNT &&
      posting.amountGross === -GROSS_AMOUNT &&
      posting.invoiceNumber === INVOICE_NUMBER &&
      posting.termOfPayment === VOUCHER_DATE,
    "Supplier posting verification failed",
  );

  const vatPosting = findPosting(
    postings,
    (posting) =>
      posting.systemGenerated === true &&
      posting.amount === GROSS_AMOUNT - NET_AMOUNT,
    "VAT posting verification failed",
  );

  console.log(
    JSON.stringify(
      {
        supplierId: supplier.id,
        voucherId: voucher.id,
        voucherNumber: voucher.number,
        expensePostingRow: expensePosting.row,
        supplierPostingRow: supplierPosting.row,
        vatPostingRow: vatPosting.row,
      },
      null,
      2,
    ),
  );
}

await main();
