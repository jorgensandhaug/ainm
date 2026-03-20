const baseUrl = "https://kkpqfuj-amager.tripletex.dev/v2";
const token =
  "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";

const invoiceDate = "2026-03-20";
const invoiceDueDate = "2026-04-03";

type Envelope<T> = {
  value?: T;
  values?: T[];
  error?: string;
  source?: string;
  validationMessages?: Array<{ field?: string; message?: string }>;
};

type Customer = { id: number; name?: string; organizationNumber?: string };
type VatType = { id: number; percentage?: number; code?: string | number };
type Invoice = {
  id: number;
  invoiceNumber?: number | string;
  amountExcludingVatCurrency?: number;
  amountCurrency?: number;
};
type LedgerAccount = {
  id: number;
  number?: number;
  isInvoiceAccount?: boolean;
  bankAccountNumber?: string | null;
};

const authHeader = `Basic ${Buffer.from(`0:${token}`).toString("base64")}`;

function buildUrl(path: string): string {
  return `${baseUrl}/${path}`;
}

async function api<T>(
  path: string,
  init: RequestInit = {},
): Promise<{ status: number; data: Envelope<T> | null; text: string }> {
  const headers = new Headers(init.headers);
  headers.set("Authorization", authHeader);
  headers.set("Accept", "application/json");
  if (init.body !== undefined) headers.set("Content-Type", "application/json");

  const res = await fetch(buildUrl(path), { ...init, headers });
  const text = await res.text();
  let data: Envelope<T> | null = null;
  if (text) {
    try {
      data = JSON.parse(text) as Envelope<T>;
    } catch {
      data = null;
    }
  }
  return { status: res.status, data, text };
}

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

function orgFromSeed(seed: string): string {
  const digits = seed.replace(/\D/g, "");
  for (let start = 0; start + 8 <= digits.length; start += 1) {
    const eight = digits.slice(start, start + 8);
    const nums = eight.split("").map(Number);
    const weights = [3, 2, 7, 6, 5, 4, 3, 2];
    const sum = nums.reduce((acc, n, idx) => acc + n * weights[idx], 0);
    const remainder = sum % 11;
    const check = remainder === 0 ? 0 : 11 - remainder;
    if (check < 10) return `${eight}${check}`;
  }
  fail("could not derive valid org number");
}

async function createCustomer(orgNumber: string): Promise<Customer> {
  const res = await api<Customer>("customer", {
    method: "POST",
    body: JSON.stringify({
      name: "Lumière Reflection b9572091 SARL",
      organizationNumber: orgNumber,
      invoiceSendMethod: "MANUAL",
    }),
  });

  if (res.status < 200 || res.status >= 300 || !res.data?.value) {
    fail(`customer create failed: ${res.status} ${res.text}`);
  }
  return res.data.value;
}

async function getVat25(): Promise<VatType> {
  const res = await api<VatType[]>(
    `ledger/vatType?typeOfVat=OUTGOING&vatDate=${invoiceDate}&fields=*`,
  );
  if (res.status < 200 || res.status >= 300 || !res.data?.values) {
    fail(`vat lookup failed: ${res.status} ${res.text}`);
  }
  const vat25 = res.data.values.find((x) => Number(x.percentage) === 25);
  if (!vat25) fail(`blocked: no outgoing 25% vat type in sandbox: ${res.text}`);
  return vat25;
}

async function getBankAccount(): Promise<LedgerAccount> {
  const res = await api<LedgerAccount[]>("ledger/account?isBankAccount=true&fields=*");
  if (res.status < 200 || res.status >= 300 || !res.data?.values?.length) {
    fail(`bank account lookup failed: ${res.status} ${res.text}`);
  }
  return (
    res.data.values.find((x) => x.isInvoiceAccount) ??
    res.data.values.find((x) => x.number === 1920) ??
    res.data.values[0]
  );
}

async function ensureBankAccount(account: LedgerAccount): Promise<void> {
  if (account.bankAccountNumber) return;
  const res = await api<LedgerAccount>(`ledger/account/${account.id}`, {
    method: "PUT",
    body: JSON.stringify({ bankAccountNumber: "12345678903" }),
  });
  if (res.status < 200 || res.status >= 300) {
    fail(`bank account update failed: ${res.status} ${res.text}`);
  }
}

async function createInvoice(customerId: number, vatTypeId: number): Promise<Invoice> {
  const payload = {
    invoiceDate,
    invoiceDueDate,
    customer: { id: customerId },
    orders: [
      {
        customer: { id: customerId },
        orderDate: invoiceDate,
        deliveryDate: invoiceDate,
        orderLines: [
          {
            description: "Stockage cloud",
            count: 1,
            unitPriceExcludingVatCurrency: 34100,
            vatType: { id: vatTypeId },
          },
        ],
      },
    ],
  };

  const first = await api<Invoice>("invoice", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  if (first.status >= 200 && first.status < 300 && first.data?.value) return first.data.value;

  const validation =
    first.data?.validationMessages?.map((x) => x.message).filter(Boolean).join(" | ") ?? "";
  if (
    first.status === 422 &&
    (validation.includes("bankkontonummer") || first.text.includes("bankkontonummer"))
  ) {
    const account = await getBankAccount();
    await ensureBankAccount(account);
    const retry = await api<Invoice>("invoice", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    if (retry.status >= 200 && retry.status < 300 && retry.data?.value) return retry.data.value;
    fail(`invoice retry failed: ${retry.status} ${retry.text}`);
  }

  fail(`invoice create failed: ${first.status} ${first.text}`);
}

async function main() {
  const orgNumber = orgFromSeed("957223723539");
  console.log(`orgNumber=${orgNumber}`);
  const customer = await createCustomer(orgNumber);
  console.log(`customerId=${customer.id}`);
  const vat25 = await getVat25();
  console.log(`vatTypeId=${vat25.id} percentage=${vat25.percentage}`);
  const invoice = await createInvoice(customer.id, vat25.id);
  console.log(
    JSON.stringify(
      {
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        amountExcludingVatCurrency: invoice.amountExcludingVatCurrency,
        amountCurrency: invoice.amountCurrency,
      },
      null,
      2,
    ),
  );
}

await main();
