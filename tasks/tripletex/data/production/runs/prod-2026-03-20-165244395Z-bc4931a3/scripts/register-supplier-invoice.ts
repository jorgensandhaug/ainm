const baseUrl = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const sessionToken = "REDACTED_TRIPLETEX_SESSION_TOKEN";

const bookingDate = "2026-03-20";
const description = "kontortenester";
const supplierPayload = {
  name: "Fossekraft AS",
  organizationNumber: "848657514",
};
const invoiceNumber = "INV-2026-8735";
const expenseAccountNumber = "7300";
const grossAmount = 61150;
const vatPercentage = 25;
const netAmount = Number((grossAmount / (1 + vatPercentage / 100)).toFixed(2));
const vatAmount = Number((grossAmount - netAmount).toFixed(2));

type ListResponse<T> = { values?: T[]; fullResultSize?: number };
type WrappedResponse<T> = { value?: T };

type Supplier = {
  id: number;
  name?: string;
  organizationNumber?: string;
  isInactive?: boolean;
  ledgerAccount?: { id: number };
};

type Account = {
  id: number;
  number?: number | string;
  name?: string;
};

type VatType = {
  id: number;
  number?: string;
  percentage?: number;
  displayName?: string;
};

type VoucherType = {
  id: number;
  name?: string;
};

type Posting = {
  row?: number;
  amount?: number;
  amountGross?: number;
  account?: { id?: number };
  vatType?: { id?: number };
  supplier?: { id?: number };
  invoiceNumber?: string;
  termOfPayment?: string;
};

type Voucher = {
  id: number;
  voucherType?: { id?: number };
  postings?: Posting[];
};

const authHeader = `Basic ${Buffer.from(`0:${sessionToken}`).toString("base64")}`;

async function request<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("Authorization", authHeader);
  headers.set("Accept", "application/json");
  if (init.body) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers,
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : null;

  if (!response.ok) {
    throw new Error(
      JSON.stringify({
        path,
        status: response.status,
        body: data,
      }),
    );
  }

  return data as T;
}

function requireValue<T>(value: T | undefined | null, message: string): T {
  if (value === undefined || value === null) {
    throw new Error(message);
  }
  return value;
}

function findOne<T>(
  values: T[] | undefined,
  predicate: (value: T) => boolean,
  message: string,
): T {
  const matches = (values ?? []).filter(predicate);
  if (matches.length !== 1) {
    throw new Error(`${message}: found ${matches.length}`);
  }
  return matches[0]!;
}

const supplierSearchResponse = await request<ListResponse<Supplier>>(
  `/supplier?organizationNumber=${encodeURIComponent(supplierPayload.organizationNumber)}&fields=*`,
);
const supplierCandidates = (supplierSearchResponse.values ?? []).filter(
  (value) => value.organizationNumber === supplierPayload.organizationNumber,
);
const supplier =
  supplierCandidates
    .filter(
      (value) =>
        value.name === supplierPayload.name &&
        value.isInactive !== true &&
        value.ledgerAccount?.id,
    )
    .sort((left, right) => right.id - left.id)[0] ??
  supplierCandidates
    .filter((value) => value.isInactive !== true && value.ledgerAccount?.id)
    .sort((left, right) => right.id - left.id)[0] ??
  supplierCandidates.sort((left, right) => right.id - left.id)[0];
if (!supplier) {
  throw new Error(`Supplier ${supplierPayload.organizationNumber} not found`);
}
const supplierId = requireValue(supplier.id, "Missing supplier id");
const supplierLedgerAccountId = requireValue(
  supplier.ledgerAccount?.id,
  "Missing supplier ledger account id",
);

const accountResponse = await request<ListResponse<Account>>(
  `/ledger/account?number=${encodeURIComponent(expenseAccountNumber)}&isApplicableForSupplierInvoice=true&fields=*`,
);
const expenseAccount = findOne(
  accountResponse.values,
  (account) => String(account.number) === expenseAccountNumber,
  `Expense account ${expenseAccountNumber} not resolved uniquely`,
);

const vatTypeResponse = await request<ListResponse<VatType>>(
  `/ledger/vatType?typeOfVat=INCOMING&vatDate=${bookingDate}&fields=*`,
);
const vatMatches = (vatTypeResponse.values ?? []).filter(
  (value) => value.percentage === vatPercentage,
);
const vatType =
  vatMatches.find(
    (value) =>
      /^\d+$/.test(value.number ?? "") &&
      !String(value.displayName ?? "").includes("TAP"),
  ) ??
  findOne(
    vatMatches,
    () => true,
    `Incoming VAT ${vatPercentage}% not resolved uniquely`,
  );

const voucherTypeResponse = await request<ListResponse<VoucherType>>(
  `/ledger/voucherType?name=${encodeURIComponent("Leverandørfaktura")}&fields=*`,
);
const voucherType = findOne(
  voucherTypeResponse.values,
  (value) => value.name === "Leverandørfaktura",
  "Voucher type Leverandørfaktura not resolved uniquely",
);

const voucherPayload = {
  date: bookingDate,
  description,
  voucherType: { id: voucherType.id },
  postings: [
    {
      row: 1,
      date: bookingDate,
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
      date: bookingDate,
      description,
      account: { id: supplierLedgerAccountId },
      supplier: { id: supplierId },
      currency: { id: 1 },
      amount: -grossAmount,
      amountCurrency: -grossAmount,
      amountGross: -grossAmount,
      amountGrossCurrency: -grossAmount,
      invoiceNumber,
      termOfPayment: bookingDate,
    },
  ],
};

const voucherResponse = await request<WrappedResponse<Voucher>>("/ledger/voucher", {
  method: "POST",
  body: JSON.stringify(voucherPayload),
});
const voucher = requireValue(voucherResponse.value, "Missing voucher response.value");
const postings = voucher.postings ?? [];

if (voucher.voucherType?.id !== voucherType.id) {
  throw new Error("Voucher type id mismatch in write response");
}

if (postings.length < 3) {
  throw new Error(`Expected auto-generated VAT posting, got ${postings.length} postings`);
}

const expensePosting = postings.find((posting) => posting.row === 1);
if (
  expensePosting?.account?.id !== expenseAccount.id ||
  expensePosting.vatType?.id !== vatType.id ||
  expensePosting.amount !== netAmount ||
  expensePosting.amountGross !== grossAmount
) {
  throw new Error("Expense posting verification failed");
}

const supplierPosting = postings.find((posting) => posting.row === 2);
if (
  supplierPosting?.account?.id !== supplierLedgerAccountId ||
  supplierPosting.supplier?.id !== supplierId ||
  supplierPosting.amount !== -grossAmount ||
  supplierPosting.amountGross !== -grossAmount ||
  supplierPosting.invoiceNumber !== invoiceNumber ||
  supplierPosting.termOfPayment !== bookingDate
) {
  throw new Error("Supplier posting verification failed");
}

const vatPosting = postings.find(
  (posting) =>
    posting.row !== 1 &&
    posting.row !== 2 &&
    posting.amount === vatAmount,
);
if (!vatPosting) {
  throw new Error(`Auto-generated VAT posting ${vatAmount} not found`);
}

console.log(
  JSON.stringify(
    {
      supplierId,
      supplierLedgerAccountId,
      expenseAccountId: expenseAccount.id,
      vatTypeId: vatType.id,
      voucherTypeId: voucherType.id,
      voucherId: voucher.id,
      netAmount,
      vatAmount,
      grossAmount,
      postingCount: postings.length,
    },
    null,
    2,
  ),
);
