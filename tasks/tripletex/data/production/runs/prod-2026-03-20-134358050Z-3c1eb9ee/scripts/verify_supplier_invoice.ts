const BASE_URL = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "fVzBrPwKsmKID5O94Fd8P4jwIQsy_z2WoeZ8VKzCdOc";

const INVOICE_NUMBER = "INV-2026-9187";
const ORGANIZATION_NUMBER = "884646979";
const SUPPLIER_NAME = "Montaña SL";
const DATE_FROM = "2026-03-20";
const DATE_TO = "2026-03-21";
const GROSS_AMOUNT = 19500;
const NET_AMOUNT = 15600;
const VAT_AMOUNT = 3900;

const headers = {
  Authorization: `Basic ${Buffer.from(`0:${TOKEN}`).toString("base64")}`,
  Accept: "application/json",
};

type SearchResponse<T> = { values?: T[] };

type Voucher = {
  id: number;
  number?: number;
  date?: string;
  voucherType?: { id: number; name?: string };
  postings?: Array<{
    row?: number;
    amount?: number;
    amountGross?: number;
    invoiceNumber?: string;
    termOfPayment?: string;
    systemGenerated?: boolean;
    account?: { id: number; number?: number | string; name?: string };
    vatType?: { id: number; number?: string; percentage?: number; displayName?: string };
    supplier?: { id: number; name?: string; organizationNumber?: string };
  }>;
};

async function main() {
  const response = await fetch(
    `${BASE_URL}/ledger/voucher?dateFrom=${DATE_FROM}&dateTo=${DATE_TO}&fields=*,voucherType(*),postings(*,account(*),vatType(*),supplier(*),currency(*))`,
    { headers },
  );

  if (!response.ok) {
    throw new Error(`GET /ledger/voucher -> ${response.status}\n${await response.text()}`);
  }

  const data = (await response.json()) as SearchResponse<Voucher>;
  const candidates = (data.values ?? []).filter((voucher) =>
    voucher.postings?.some((posting) => posting.invoiceNumber === INVOICE_NUMBER),
  );

  if (!candidates.length) {
    throw new Error(`No voucher found for invoice ${INVOICE_NUMBER}`);
  }

  const voucher = candidates[0];
  const postings = voucher.postings ?? [];

  console.log(
    JSON.stringify(
      {
        voucherId: voucher.id,
        voucherNumber: voucher.number,
        voucherType: voucher.voucherType,
        postings,
        checks: {
          hasSupplierPosting: postings.some(
            (posting) =>
              posting.account?.number === 2400 &&
              posting.invoiceNumber === INVOICE_NUMBER &&
              posting.amount === -GROSS_AMOUNT &&
              posting.amountGross === -GROSS_AMOUNT &&
              posting.supplier?.name === SUPPLIER_NAME &&
              posting.supplier?.organizationNumber === ORGANIZATION_NUMBER,
          ),
          hasExpensePosting: postings.some(
            (posting) =>
              posting.account?.number === 7300 &&
              posting.amount === NET_AMOUNT &&
              posting.amountGross === GROSS_AMOUNT &&
              posting.vatType?.percentage === 25,
          ),
          hasVatPosting: postings.some(
            (posting) => posting.systemGenerated === true && posting.amount === VAT_AMOUNT,
          ),
        },
      },
      null,
      2,
    ),
  );
}

await main();
