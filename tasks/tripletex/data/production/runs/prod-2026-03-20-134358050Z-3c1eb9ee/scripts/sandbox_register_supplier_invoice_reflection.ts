const BASE_URL = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN =
  "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";

const DATE = "2026-03-20";
const GROSS = 19500;
const NET = 15600;
const VAT = 3900;
const suffix = `${Date.now()}`.slice(-6);
const supplierName = `Codex Reflection ${suffix}`;
const organizationNumber = `990${suffix}`;
const invoiceNumber = `REFLECT-${suffix}`;

const headers = {
  Authorization: `Basic ${Buffer.from(`0:${TOKEN}`).toString("base64")}`,
  Accept: "application/json",
};

type Wrapper<T> = { value?: T };
type ListResponse<T> = { values?: T[] };

type Supplier = {
  id: number;
  name?: string;
  organizationNumber?: string;
  ledgerAccount?: { id: number; number?: number };
};

type Account = { id: number; number?: number };
type VatType = { id: number; number?: string; percentage?: number; displayName?: string };
type VoucherType = { id: number; name?: string };

type Posting = {
  row?: number;
  amount?: number;
  amountGross?: number;
  invoiceNumber?: string;
  termOfPayment?: string;
  systemGenerated?: boolean;
  account?: { id: number; number?: number };
  vatType?: { id: number; number?: string; percentage?: number };
  supplier?: { id: number; name?: string; organizationNumber?: string };
};

type Voucher = {
  id: number;
  number?: number;
  voucherType?: VoucherType;
  postings?: Posting[];
};

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      ...headers,
      ...(init?.body ? { "Content-Type": "application/json; charset=utf-8" } : {}),
      ...(init?.headers ?? {}),
    },
  });

  if (!res.ok) {
    throw new Error(`${init?.method ?? "GET"} ${path} -> ${res.status}\n${await res.text()}`);
  }
  return (await res.json()) as T;
}

function requireOne<T>(values: T[] | undefined, message: string): T {
  if (!values?.length) throw new Error(message);
  return values[0];
}

function pickIncoming25(values: VatType[] | undefined): VatType {
  const byPct = (values ?? []).filter((vat) => vat.percentage === 25);
  if (!byPct.length) throw new Error("No incoming 25% VAT found");
  const numeric = byPct
    .filter((vat) => vat.number && /^\d+$/.test(vat.number))
    .sort((a, b) => Number(a.number) - Number(b.number));
  return numeric[0] ?? byPct[0];
}

async function main() {
  const supplierCreate = await api<Wrapper<Supplier>>("/supplier", {
    method: "POST",
    body: JSON.stringify({
      name: supplierName,
      organizationNumber,
    }),
  });
  const supplier = supplierCreate.value!;

  const expenseAccount = requireOne(
    (
      await api<ListResponse<Account>>(
        "/ledger/account?number=7300&isApplicableForSupplierInvoice=true&fields=*",
      )
    ).values?.filter((account) => account.number === 7300),
    "7300 not found",
  );

  const vatType = pickIncoming25(
    (
      await api<ListResponse<VatType>>(
        `/ledger/vatType?typeOfVat=INCOMING&vatDate=${DATE}&fields=*`,
      )
    ).values,
  );

  const voucherType = requireOne(
    (
      await api<ListResponse<VoucherType>>(
        "/ledger/voucherType?name=Leverand%C3%B8rfaktura&fields=*",
      )
    ).values?.filter((type) => type.name === "Leverandørfaktura"),
    "Leverandørfaktura not found",
  );

  const voucherCreate = await api<Wrapper<Voucher>>("/ledger/voucher", {
    method: "POST",
    body: JSON.stringify({
      date: DATE,
      description: "reflection office services",
      voucherType: { id: voucherType.id },
      postings: [
        {
          row: 1,
          date: DATE,
          description: "reflection office services",
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
          date: DATE,
          description: "reflection office services",
          account: { id: supplier.ledgerAccount!.id },
          supplier: { id: supplier.id },
          currency: { id: 1 },
          amount: -GROSS,
          amountCurrency: -GROSS,
          amountGross: -GROSS,
          amountGrossCurrency: -GROSS,
          invoiceNumber,
          termOfPayment: DATE,
        },
      ],
    }),
  });
  const voucher = voucherCreate.value!;

  const voucherRead = await api<Wrapper<Voucher>>(
    `/ledger/voucher/${voucher.id}?fields=*,voucherType(*),postings(*,account(*),vatType(*),supplier(*),currency(*))`,
  );

  const postRows = (voucher.postings ?? []).map((posting) => ({
    row: posting.row,
    accountId: posting.account?.id,
    accountNumber: posting.account?.number ?? null,
    vatTypeId: posting.vatType?.id ?? null,
    vatTypeNumber: posting.vatType?.number ?? null,
    supplierId: posting.supplier?.id ?? null,
    supplierOrg: posting.supplier?.organizationNumber ?? null,
    amount: posting.amount ?? null,
    amountGross: posting.amountGross ?? null,
    invoiceNumber: posting.invoiceNumber ?? null,
    termOfPayment: posting.termOfPayment ?? null,
    systemGenerated: posting.systemGenerated ?? false,
  }));

  const readRows = (voucherRead.value?.postings ?? []).map((posting) => ({
    row: posting.row,
    accountId: posting.account?.id,
    accountNumber: posting.account?.number ?? null,
    vatTypeId: posting.vatType?.id ?? null,
    vatTypeNumber: posting.vatType?.number ?? null,
    supplierId: posting.supplier?.id ?? null,
    supplierOrg: posting.supplier?.organizationNumber ?? null,
    amount: posting.amount ?? null,
    amountGross: posting.amountGross ?? null,
    invoiceNumber: posting.invoiceNumber ?? null,
    termOfPayment: posting.termOfPayment ?? null,
    systemGenerated: posting.systemGenerated ?? false,
  }));

  console.log(
    JSON.stringify(
      {
        created: {
          supplier: {
            id: supplier.id,
            organizationNumber: supplier.organizationNumber,
            ledgerAccountId: supplier.ledgerAccount?.id ?? null,
            ledgerAccountNumber: supplier.ledgerAccount?.number ?? null,
          },
          expenseAccountId: expenseAccount.id,
          vatTypeId: vatType.id,
          vatTypeNumber: vatType.number,
          voucherTypeId: voucherType.id,
          voucherId: voucher.id,
          voucherNumber: voucher.number ?? null,
        },
        postResponseRows: postRows,
        fullReadRows: readRows,
        proof: {
          supplierCreateReturnedLedgerAccountId: Boolean(supplier.ledgerAccount?.id),
          postResponseEnoughByIds: postRows.some(
            (posting) =>
              posting.accountId === expenseAccount.id &&
              posting.vatTypeId === vatType.id &&
              posting.amount === NET &&
              posting.amountGross === GROSS,
          ) &&
            postRows.some(
              (posting) =>
                posting.accountId === supplier.ledgerAccount?.id &&
                posting.supplierId === supplier.id &&
                posting.amount === -GROSS &&
                posting.invoiceNumber === invoiceNumber &&
                posting.termOfPayment === DATE,
            ) &&
            postRows.some(
              (posting) => posting.systemGenerated === true && posting.amount === VAT,
            ),
          postResponseEnoughByHumanFields: postRows.some(
            (posting) =>
              posting.accountNumber === 7300 &&
              posting.vatTypeNumber === "1" &&
              posting.amount === NET &&
              posting.amountGross === GROSS,
          ) &&
            postRows.some(
              (posting) =>
                posting.accountNumber === 2400 &&
                posting.supplierOrg === organizationNumber &&
                posting.amount === -GROSS &&
                posting.invoiceNumber === invoiceNumber,
            ),
        },
      },
      null,
      2,
    ),
  );
}

await main();
