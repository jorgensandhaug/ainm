const BASE_URL = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "ll7lRz2LYDOFPFWBcD-BoVnb8AlWAxo-YsJ30ir47g0";

const INVOICE_DATE = "2026-03-20";
const SUPPLIER_NAME = "Bergwerk GmbH";
const SUPPLIER_ORG = "968598546";
const INVOICE_NUMBER = "INV-2026-7058";
const DESCRIPTION = "Bürodienstleistungen";
const EXPENSE_ACCOUNT_NUMBER = "6300";
const GROSS_AMOUNT = 21100;
const NET_AMOUNT = 16880;
const VAT_AMOUNT = 4220;

const auth = `Basic ${Buffer.from(`0:${TOKEN}`).toString("base64")}`;

type ApiResponse<T> = {
  value?: T;
  values?: T[];
  fullResultSize?: number;
};

async function request<T>(
  path: string,
  init: RequestInit = {},
): Promise<{ status: number; data: T }> {
  const response = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      Authorization: auth,
      Accept: "application/json",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(init.headers ?? {}),
    },
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : {};

  if (!response.ok) {
    console.error(
      JSON.stringify(
        { path, status: response.status, body: data },
        null,
        2,
      ),
    );
    process.exit(1);
  }

  return { status: response.status, data };
}

function requireValue<T>(label: string, value: T | null | undefined): T {
  if (value === null || value === undefined) {
    throw new Error(`Missing ${label}`);
  }
  return value;
}

function pickVatType(values: any[]): any {
  const matches = values.filter(
    (vatType) => Number(vatType.percentage) === 25 && Number(vatType.deductionPercentage ?? 100) === 100,
  );
  if (matches.length === 0) {
    throw new Error("No 25% incoming VAT type found");
  }
  matches.sort((a, b) => {
    const aNumeric = /^\d+$/.test(String(a.number ?? "")) ? 0 : 1;
    const bNumeric = /^\d+$/.test(String(b.number ?? "")) ? 0 : 1;
    if (aNumeric !== bNumeric) return aNumeric - bNumeric;
    return String(a.number ?? "").localeCompare(String(b.number ?? ""));
  });
  return matches[0];
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

try {
  const supplierResp = await request<ApiResponse<any>>("/supplier", {
    method: "POST",
    body: JSON.stringify({
      name: SUPPLIER_NAME,
      organizationNumber: SUPPLIER_ORG,
    }),
  });
  const supplier = requireValue("supplier", supplierResp.data.value);
  const supplierId = requireValue("supplier.id", supplier.id);
  const supplierLedgerAccountId = requireValue(
    "supplier.ledgerAccount.id",
    supplier.ledgerAccount?.id,
  );

  const accountResp = await request<ApiResponse<any>>(
    `/ledger/account?number=${encodeURIComponent(EXPENSE_ACCOUNT_NUMBER)}&isApplicableForSupplierInvoice=true&fields=*`,
  );
  const expenseAccount = requireValue(
    "expense account",
    accountResp.data.values?.find((account) => String(account.number) === EXPENSE_ACCOUNT_NUMBER),
  );

  const vatResp = await request<ApiResponse<any>>(
    `/ledger/vatType?typeOfVat=INCOMING&vatDate=${INVOICE_DATE}&fields=*`,
  );
  const vatType = pickVatType(requireValue("vat types", vatResp.data.values));

  const voucherTypeResp = await request<ApiResponse<any>>(
    `/ledger/voucherType?name=${encodeURIComponent("Leverandørfaktura")}&fields=*`,
  );
  const voucherType = requireValue(
    "voucher type",
    voucherTypeResp.data.values?.find((item) => item.name === "Leverandørfaktura"),
  );

  const voucherResp = await request<ApiResponse<any>>("/ledger/voucher", {
    method: "POST",
    body: JSON.stringify({
      date: INVOICE_DATE,
      description: DESCRIPTION,
      voucherType: { id: voucherType.id },
      postings: [
        {
          row: 1,
          date: INVOICE_DATE,
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
          date: INVOICE_DATE,
          description: DESCRIPTION,
          account: { id: supplierLedgerAccountId },
          supplier: { id: supplierId },
          currency: { id: 1 },
          amount: -GROSS_AMOUNT,
          amountCurrency: -GROSS_AMOUNT,
          amountGross: -GROSS_AMOUNT,
          amountGrossCurrency: -GROSS_AMOUNT,
          invoiceNumber: INVOICE_NUMBER,
          termOfPayment: INVOICE_DATE,
        },
      ],
    }),
  });

  const voucher = requireValue("voucher", voucherResp.data.value);
  const postings = requireValue("voucher.postings", voucher.postings);
  const expensePosting = postings.find(
    (posting: any) =>
      posting.account?.id === expenseAccount.id &&
      posting.vatType?.id === vatType.id &&
      Number(posting.amount) === NET_AMOUNT &&
      Number(posting.amountGross) === GROSS_AMOUNT,
  );
  const supplierPosting = postings.find(
    (posting: any) =>
      posting.account?.id === supplierLedgerAccountId &&
      posting.supplier?.id === supplierId &&
      Number(posting.amount) === -GROSS_AMOUNT &&
      posting.invoiceNumber === INVOICE_NUMBER &&
      posting.termOfPayment === INVOICE_DATE,
  );
  const vatPosting = postings.find(
    (posting: any) =>
      posting.account?.id !== expenseAccount.id &&
      posting.account?.id !== supplierLedgerAccountId &&
      Number(posting.amount) === VAT_AMOUNT,
  );

  assert(voucher.voucherType?.id === voucherType.id, "Voucher type mismatch");
  assert(postings.length === 3, `Expected 3 postings, got ${postings.length}`);
  assert(expensePosting, "Expense posting missing or incorrect");
  assert(supplierPosting, "Supplier posting missing or incorrect");
  assert(vatPosting, "Auto-generated VAT posting missing or incorrect");

  console.log(
    JSON.stringify(
      {
        supplierId,
        supplierLedgerAccountId,
        expenseAccountId: expenseAccount.id,
        vatTypeId: vatType.id,
        voucherTypeId: voucherType.id,
        voucherId: voucher.id,
        voucherNumber: voucher.number,
        postings: postings.map((posting: any) => ({
          row: posting.row,
          accountId: posting.account?.id,
          supplierId: posting.supplier?.id ?? null,
          vatTypeId: posting.vatType?.id ?? null,
          amount: posting.amount,
          amountGross: posting.amountGross,
          invoiceNumber: posting.invoiceNumber ?? null,
          termOfPayment: posting.termOfPayment ?? null,
        })),
      },
      null,
      2,
    ),
  );
} catch (error) {
  console.error(
    JSON.stringify(
      {
        error: error instanceof Error ? error.message : String(error),
      },
      null,
      2,
    ),
  );
  process.exit(1);
}
