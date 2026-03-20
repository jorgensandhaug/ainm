const baseUrl = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const token = "nvXE0AeQDmfYKG6xbBn3gw9u_fLLTmLylGoj-q4O47M";

const invoiceDate = "2026-03-20";
const invoiceDueDate = "2026-04-03";

const customerPayload = {
  name: "Lumière SARL",
  organizationNumber: "959714320",
  invoiceSendMethod: "MANUAL",
};

const lineDescription = "Stockage cloud";
const amountExcludingVatCurrency = 34100;

type ApiEnvelope<T> = {
  value?: T;
  values?: T[];
  message?: string;
  error?: string;
  source?: string;
  validationMessages?: Array<{ field?: string; message?: string }>;
};

type Customer = { id: number };
type VatType = { id: number; percentage?: number; code?: string | number };
type LedgerAccount = {
  id: number;
  number?: number;
  isInvoiceAccount?: boolean;
  bankAccountNumber?: string | null;
};

const authHeader = `Basic ${Buffer.from(`0:${token}`).toString("base64")}`;

function endpoint(path: string): string {
  return `${baseUrl}/${path}`;
}

async function api<T>(
  path: string,
  init: RequestInit = {},
): Promise<{ status: number; data: ApiEnvelope<T> | null; text: string }> {
  const headers = new Headers(init.headers);
  headers.set("Authorization", authHeader);
  headers.set("Accept", "application/json");
  if (init.body !== undefined) headers.set("Content-Type", "application/json");

  const response = await fetch(endpoint(path), { ...init, headers });
  const text = await response.text();
  let data: ApiEnvelope<T> | null = null;
  if (text) {
    try {
      data = JSON.parse(text) as ApiEnvelope<T>;
    } catch {
      data = null;
    }
  }
  return { status: response.status, data, text };
}

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

function invalidToken(body: ApiEnvelope<unknown> | null): boolean {
  return (
    body?.error === "Invalid or expired token" ||
    body?.error ===
      "Invalid or expired proxy token. Each submission receives a unique token - do not reuse tokens from previous submissions."
  );
}

function validationText(body: ApiEnvelope<unknown> | null): string {
  return (
    body?.validationMessages?.map((x) => x.message).filter(Boolean).join(" | ") ??
    ""
  );
}

async function createCustomer(): Promise<Customer> {
  const res = await api<Customer>("customer", {
    method: "POST",
    body: JSON.stringify(customerPayload),
  });

  if (res.status === 403 && invalidToken(res.data)) fail("blocked: invalid token");
  if (res.status < 200 || res.status >= 300 || !res.data?.value) {
    fail(`customer create failed: ${res.status} ${res.text}`);
  }
  return res.data.value;
}

async function getVatTypeId(): Promise<number> {
  const res = await api<VatType[]>(
    `ledger/vatType?typeOfVat=OUTGOING&vatDate=${invoiceDate}&fields=*`,
  );

  if (res.status === 403 && invalidToken(res.data)) fail("blocked: invalid token");
  if (res.status < 200 || res.status >= 300 || !res.data?.values) {
    fail(`vat lookup failed: ${res.status} ${res.text}`);
  }

  const vat25 = res.data.values.find((x) => Number(x.percentage) === 25);
  if (!vat25) fail("blocked: no outgoing 25% vat type");
  return vat25.id;
}

function invoicePayload(customerId: number, vatTypeId: number) {
  return {
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
            description: lineDescription,
            count: 1,
            unitPriceExcludingVatCurrency: amountExcludingVatCurrency,
            vatType: { id: vatTypeId },
          },
        ],
      },
    ],
  };
}

async function getBankAccount(): Promise<LedgerAccount> {
  const res = await api<LedgerAccount[]>("ledger/account?isBankAccount=true&fields=*");

  if (res.status < 200 || res.status >= 300 || !res.data?.values) {
    fail(`bank account lookup failed: ${res.status} ${res.text}`);
  }

  const invoiceAccount =
    res.data.values.find((x) => x.isInvoiceAccount) ??
    res.data.values.find((x) => x.number === 1920) ??
    res.data.values[0];

  if (!invoiceAccount?.id) fail("blocked: no bank ledger account");
  return invoiceAccount;
}

let generatedBankAccountNumber = 12345678903;

async function updateBankAccount(account: LedgerAccount): Promise<void> {
  const bankAccountNumber = String(generatedBankAccountNumber++);
  const res = await api<LedgerAccount>(`ledger/account/${account.id}`, {
    method: "PUT",
    body: JSON.stringify({
      bankAccountNumber,
    }),
  });

  if (res.status < 200 || res.status >= 300) {
    fail(`bank account update failed: ${res.status} ${res.text}`);
  }
}

async function createInvoice(customerId: number, vatTypeId: number): Promise<void> {
  const payload = invoicePayload(customerId, vatTypeId);
  const res = await api("invoice", {
    method: "POST",
    body: JSON.stringify(payload),
  });

  if (res.status === 403 && invalidToken(res.data)) fail("blocked: invalid token");
  if (res.status >= 200 && res.status < 300) return;

  const messages = validationText(res.data);
  if (
    res.status === 422 &&
    (messages.includes("bankkontonummer") || res.text.includes("bankkontonummer"))
  ) {
    const account = await getBankAccount();
    if (!account.bankAccountNumber) await updateBankAccount(account);
    const retry = await api("invoice", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    if (retry.status === 403 && invalidToken(retry.data)) fail("blocked: invalid token");
    if (retry.status >= 200 && retry.status < 300) return;
    fail(`invoice retry failed: ${retry.status} ${retry.text}`);
  }

  fail(`invoice create failed: ${res.status} ${res.text}`);
}

async function main() {
  const customer = await createCustomer();
  const vatTypeId = await getVatTypeId();
  await createInvoice(customer.id, vatTypeId);
  console.log("ok");
}

await main();
