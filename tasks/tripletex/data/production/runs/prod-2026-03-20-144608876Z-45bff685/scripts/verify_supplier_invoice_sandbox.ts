const BASE_URL = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN =
  "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";

const VOUCHER_DATE = "2026-03-20";
const SUPPLIER_NAME = "Bergwerk GmbH Reflection 970123458";
const SUPPLIER_ORG = "970123458";
const INVOICE_NUMBER = "REFLECT-INV-2026-03-20-01";
const DESCRIPTION = "Buerodienstleistungen";
const EXPENSE_ACCOUNT_NUMBER = "6300";
const GROSS = 21100;
const NET = 16880;
const VAT = 4220;

const auth = `Basic ${Buffer.from(`0:${TOKEN}`).toString("base64")}`;
let callCount = 0;

type Wrapped<T> = { value?: T; values?: T[] };

async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  callCount += 1;
  const response = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      Authorization: auth,
      Accept: "application/json",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
    },
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : {};
  if (!response.ok) {
    console.error(JSON.stringify({ callCount, path, status: response.status, data }, null, 2));
    process.exit(1);
  }
  return data;
}

function req<T>(value: T | undefined | null, label: string): T {
  if (value === undefined || value === null) throw new Error(`Missing ${label}`);
  return value;
}

function selectVatType(values: any[]): any {
  const ranked = values
    .filter((item) => Number(item.percentage) === 25 && Number(item.deductionPercentage ?? 100) === 100)
    .sort((a, b) => {
      const aBase = /^\d+$/.test(String(a.number ?? "")) ? 0 : 1;
      const bBase = /^\d+$/.test(String(b.number ?? "")) ? 0 : 1;
      if (aBase !== bBase) return aBase - bBase;
      return String(a.number ?? "").localeCompare(String(b.number ?? ""));
    });
  return req(ranked[0], "25% incoming VAT type");
}

const supplierResp = await api<Wrapped<any>>("/supplier", {
  method: "POST",
  body: JSON.stringify({
    name: SUPPLIER_NAME,
    organizationNumber: SUPPLIER_ORG,
  }),
});
const supplier = req(supplierResp.value, "supplier");

const accountResp = await api<Wrapped<any>>(
  `/ledger/account?number=${EXPENSE_ACCOUNT_NUMBER}&isApplicableForSupplierInvoice=true&fields=*`,
);
const expenseAccount = req(
  accountResp.values?.find((item) => String(item.number) === EXPENSE_ACCOUNT_NUMBER),
  "expense account",
);

const vatResp = await api<Wrapped<any>>(
  `/ledger/vatType?typeOfVat=INCOMING&vatDate=${VOUCHER_DATE}&fields=*`,
);
const vatType = selectVatType(req(vatResp.values, "vat values"));

const voucherTypeResp = await api<Wrapped<any>>(
  `/ledger/voucherType?name=${encodeURIComponent("Leverandørfaktura")}&fields=*`,
);
const voucherType = req(
  voucherTypeResp.values?.find((item) => item.name === "Leverandørfaktura"),
  "voucher type",
);

const voucherResp = await api<Wrapped<any>>("/ledger/voucher", {
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
        amount: NET,
        amountCurrency: NET,
        amountGross: GROSS,
        amountGrossCurrency: GROSS,
      },
      {
        row: 2,
        date: VOUCHER_DATE,
        description: DESCRIPTION,
        account: { id: supplier.ledgerAccount.id },
        supplier: { id: supplier.id },
        currency: { id: 1 },
        amount: -GROSS,
        amountCurrency: -GROSS,
        amountGross: -GROSS,
        amountGrossCurrency: -GROSS,
        invoiceNumber: INVOICE_NUMBER,
        termOfPayment: VOUCHER_DATE,
      },
    ],
  }),
});

const voucher = req(voucherResp.value, "voucher");
const postings = req(voucher.postings, "voucher postings");
const expensePosting = postings.find(
  (posting: any) =>
    posting.account?.id === expenseAccount.id &&
    posting.vatType?.id === vatType.id &&
    Number(posting.amount) === NET &&
    Number(posting.amountGross) === GROSS,
);
const supplierPosting = postings.find(
  (posting: any) =>
    posting.account?.id === supplier.ledgerAccount.id &&
    posting.supplier?.id === supplier.id &&
    Number(posting.amount) === -GROSS &&
    posting.invoiceNumber === INVOICE_NUMBER &&
    posting.termOfPayment === VOUCHER_DATE,
);
const vatPosting = postings.find(
  (posting: any) =>
    posting.row === 0 &&
    posting.account?.id !== expenseAccount.id &&
    posting.account?.id !== supplier.ledgerAccount.id &&
    Number(posting.amount) === VAT,
  );

if (voucher.voucherType?.id !== voucherType.id) throw new Error("Voucher type mismatch");
if (postings.length !== 3) throw new Error(`Expected 3 postings, got ${postings.length}`);
if (!expensePosting) throw new Error("Expense posting verification failed");
if (!supplierPosting) throw new Error("Supplier posting verification failed");
if (!vatPosting) throw new Error("Auto VAT posting verification failed");

console.log(
  JSON.stringify(
    {
      verified: true,
      callCount,
      supplierId: supplier.id,
      supplierLedgerAccountId: supplier.ledgerAccount.id,
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
