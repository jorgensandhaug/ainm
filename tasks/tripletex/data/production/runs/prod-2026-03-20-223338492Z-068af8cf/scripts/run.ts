const BASE_URL = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const SESSION_TOKEN = "Pnj12sBpYpdKDLjoF4vplAlqHuouAEVkZ9NXGPDkp2I";
const RUN_DATE = "2026-03-20";

type Json = Record<string, unknown>;
type TripletexList<T> = { values?: T[]; fullResultSize?: number };
type TripletexValue<T> = { value?: T };

type Customer = {
  id: number;
  name?: string;
  organizationNumber?: string;
};

type Product = {
  id: number;
  name?: string;
  number?: string | number;
  productNumber?: string | number;
};

type Account = {
  id: number;
  number?: string | number;
  isBankAccount?: boolean;
  isInvoiceAccount?: boolean;
  bankAccountNumber?: string | null;
};

type PaymentType = {
  id: number;
  name?: string;
  debitAccount?: Account | null;
  creditAccount?: Account | null;
};

type Invoice = {
  id: number;
  invoiceNumber?: number | string;
  amountOutstanding?: number | null;
  amountCurrencyOutstanding?: number | null;
};

type ApiResult<T> = {
  status: number;
  data: T | null;
  text: string;
};

const authHeader = `Basic ${Buffer.from(`0:${SESSION_TOKEN}`).toString("base64")}`;

async function api<T>(
  path: string,
  init: RequestInit = {},
  query?: Record<string, string | number | boolean | Array<string | number | boolean>>,
): Promise<ApiResult<T>> {
  const url = new URL(path, BASE_URL.endsWith("/") ? BASE_URL : `${BASE_URL}/`);
  if (query) {
    for (const [key, raw] of Object.entries(query)) {
      const values = Array.isArray(raw) ? raw : [raw];
      for (const value of values) {
        url.searchParams.append(key, String(value));
      }
    }
  }

  const headers = new Headers(init.headers ?? {});
  headers.set("Authorization", authHeader);
  headers.set("Accept", "application/json");
  if (init.body !== undefined) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(url, { ...init, headers });
  const text = await response.text();
  let data: T | null = null;
  if (text) {
    try {
      data = JSON.parse(text) as T;
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

function isInvalidToken(status: number, text: string): boolean {
  return (
    status === 403 &&
    (text.includes("Invalid or expired token") ||
      text.includes("Invalid or expired proxy token"))
  );
}

function requireOk<T>(result: ApiResult<T>, context: string): T {
  if (isInvalidToken(result.status, result.text)) {
    fail(`Blocked by unusable credentials at ${context}: ${result.text}`);
  }
  if (result.status < 200 || result.status >= 300 || result.data === null) {
    fail(`${context} failed with ${result.status}: ${result.text}`);
  }
  return result.data;
}

function asList<T>(value: unknown): T[] {
  if (!value || typeof value !== "object") return [];
  const values = (value as TripletexList<T>).values;
  return Array.isArray(values) ? values : [];
}

function asValue<T>(value: unknown): T {
  if (!value || typeof value !== "object" || !("value" in (value as object))) {
    fail(`Missing value wrapper: ${JSON.stringify(value)}`);
  }
  return (value as TripletexValue<T>).value as T;
}

function normRef(value: unknown): string {
  return value === null || value === undefined ? "" : String(value).trim();
}

function validationMessages(result: ApiResult<unknown>): string[] {
  if (!result.data || typeof result.data !== "object") return [];
  const raw = (result.data as Json).validationMessages;
  if (!Array.isArray(raw)) return [];
  return raw
    .map((entry) => {
      if (!entry || typeof entry !== "object") return "";
      const message = (entry as Json).message;
      return typeof message === "string" ? message : "";
    })
    .filter(Boolean);
}

function hasMissingCompanyBankAccount(result: ApiResult<unknown>): boolean {
  if (result.status !== 422) return false;
  if (result.text.includes("Faktura kan ikke opprettes før selskapet har registrert et bankkontonummer.")) {
    return true;
  }
  return validationMessages(result).some((message) =>
    message.includes("Faktura kan ikke opprettes før selskapet har registrert et bankkontonummer."),
  );
}

function choosePaymentType(paymentTypes: PaymentType[]): PaymentType {
  const scored = paymentTypes
    .map((paymentType) => {
      const debit = paymentType.debitAccount;
      const debitNumber = normRef(debit?.number);
      let score = 0;
      if (debitNumber.startsWith("19")) score += 50;
      if (debit?.isInvoiceAccount) score += 20;
      if (debit?.isBankAccount) score += 15;
      if ((paymentType.name ?? "").toLowerCase().includes("bank")) score += 5;
      return { paymentType, score };
    })
    .sort((a, b) => b.score - a.score);

  if (!scored.length || scored[0].score < 50) {
    fail(`No usable incoming payment type found: ${JSON.stringify(paymentTypes)}`);
  }
  return scored[0].paymentType;
}

function chooseInvoiceBankAccount(accounts: Account[]): Account {
  const sorted = [...accounts].sort((a, b) => {
    const score = (account: Account) => {
      let value = 0;
      const number = normRef(account.number);
      if (account.isInvoiceAccount) value += 100;
      if (number === "1920") value += 50;
      if (account.isBankAccount) value += 20;
      if (number.startsWith("19")) value += 10;
      return value;
    };
    return score(b) - score(a);
  });
  if (!sorted.length) {
    fail("No bank ledger account found for repair branch.");
  }
  return sorted[0];
}

function norwegianBankChecksum(first10: string): string | null {
  const weights = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  const sum = first10
    .split("")
    .reduce((acc, digit, index) => acc + Number(digit) * weights[index], 0);
  const remainder = sum % 11;
  const checksum = 11 - remainder;
  if (checksum === 11) return "0";
  if (checksum === 10) return null;
  return String(checksum);
}

function generateBankAccountNumber(seed: number, existing: string[]): string {
  const seen = new Set(existing.filter(Boolean));
  for (let i = 0; i < 1000; i += 1) {
    const first10 = `1234${String((seed + i) % 1_000_000).padStart(6, "0")}`;
    const checksum = norwegianBankChecksum(first10);
    if (!checksum) continue;
    const candidate = `${first10}${checksum}`;
    if (!seen.has(candidate)) return candidate;
  }
  fail("Unable to generate checksum-valid unique bank account number.");
}

async function resolveCustomer(): Promise<Customer> {
  const result = await api<TripletexList<Customer>>("customer", {}, {
    organizationNumber: "975687821",
    fields: "*",
  });
  const customers = asList<Customer>(requireOk(result, "GET customer"));
  const exact = customers.filter(
    (customer) => normRef(customer.organizationNumber) === "975687821",
  );
  if (exact.length !== 1) {
    fail(`Customer resolution failed: ${JSON.stringify(customers)}`);
  }
  return exact[0];
}

async function resolveProducts(): Promise<Record<string, Product>> {
  const refs = ["4366", "3402"];
  const names: Record<string, string> = {
    "4366": "Netzwerkdienst",
    "3402": "Beratungsstunden",
  };

  const resolveFrom = (products: Product[]) => {
    const byRef: Record<string, Product> = {};
    for (const product of products) {
      const number = normRef(product.number);
      const productNumber = normRef(product.productNumber);
      for (const ref of refs) {
        if (number === ref || productNumber === ref) {
          byRef[ref] = product;
        }
      }
    }
    return byRef;
  };

  const first = await api<TripletexList<Product>>("product", {}, {
    productNumber: refs,
    fields: "*",
  });
  let byRef = resolveFrom(asList<Product>(requireOk(first, "GET product by productNumber")));
  if (refs.every((ref) => byRef[ref])) return byRef;

  const second = await api<TripletexList<Product>>("product", {}, {
    ids: refs.join(","),
    fields: "*",
  });
  byRef = { ...byRef, ...resolveFrom(asList<Product>(requireOk(second, "GET product by ids"))) };
  if (refs.every((ref) => byRef[ref])) return byRef;

  const third = await api<TripletexList<Product>>("product", {}, {
    count: 1000,
    fields: "*",
  });
  const all = asList<Product>(requireOk(third, "GET product catalog"));
  for (const ref of refs) {
    if (byRef[ref]) continue;
    const match = all.find((product) => product.name === names[ref]);
    if (match) byRef[ref] = match;
  }
  if (!refs.every((ref) => byRef[ref])) {
    fail(`Product resolution failed: ${JSON.stringify(all)}`);
  }
  return byRef;
}

async function resolvePaymentType(): Promise<PaymentType> {
  const result = await api<TripletexList<PaymentType>>("invoice/paymentType", {}, {
    count: 1000,
    fields: "*,debitAccount(*),creditAccount(*)",
  });
  return choosePaymentType(asList<PaymentType>(requireOk(result, "GET invoice/paymentType")));
}

async function createOrder(customer: Customer, products: Record<string, Product>): Promise<number> {
  const payload = {
    customer: { id: customer.id },
    orderDate: RUN_DATE,
    deliveryDate: RUN_DATE,
    orderLines: [
      {
        product: { id: products["4366"].id },
        description: "Netzwerkdienst",
        count: 1,
        unitPriceExcludingVatCurrency: 32750,
      },
      {
        product: { id: products["3402"].id },
        description: "Beratungsstunden",
        count: 1,
        unitPriceExcludingVatCurrency: 17450,
      },
    ],
  };
  const result = await api<TripletexValue<{ id: number }>>("order", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  const order = asValue<{ id: number }>(requireOk(result, "POST order"));
  if (!order?.id) fail(`Order create missing id: ${JSON.stringify(order)}`);
  return order.id;
}

async function repairBankAccountAndRetry(orderId: number, paymentTypeId: number): Promise<Invoice> {
  const accountsResult = await api<TripletexList<Account>>("ledger/account", {}, {
    isBankAccount: true,
    fields: "*",
  });
  const accounts = asList<Account>(requireOk(accountsResult, "GET ledger/account"));
  const account = chooseInvoiceBankAccount(accounts);
  const bankAccountNumber =
    normRef(account.bankAccountNumber) ||
    generateBankAccountNumber(
      account.id,
      accounts.map((item) => normRef(item.bankAccountNumber)),
    );

  const updateResult = await api<TripletexValue<Account>>(`ledger/account/${account.id}`, {
    method: "PUT",
    body: JSON.stringify({ bankAccountNumber }),
  });
  requireOk(updateResult, "PUT ledger/account/{id}");

  const retried = await invoiceOrder(orderId, paymentTypeId);
  return retried;
}

async function invoiceOrder(orderId: number, paymentTypeId: number): Promise<Invoice> {
  const result = await api<TripletexValue<Invoice>>(
    `order/${orderId}/:invoice`,
    { method: "PUT" },
    {
      invoiceDate: RUN_DATE,
      sendToCustomer: false,
      paymentTypeId,
      paidAmount: 0.01,
      paymentTypeIdRestAmount: paymentTypeId,
    },
  );

  if (hasMissingCompanyBankAccount(result)) {
    return repairBankAccountAndRetry(orderId, paymentTypeId);
  }

  const invoice = asValue<Invoice>(requireOk(result, "PUT order/{id}/:invoice"));
  const outstanding =
    invoice.amountCurrencyOutstanding ?? invoice.amountOutstanding ?? Number.NaN;
  if (Number.isNaN(Number(outstanding)) || Number(outstanding) !== 0) {
    fail(`Invoice not fully paid: ${JSON.stringify(invoice)}`);
  }
  return invoice;
}

async function main(): Promise<void> {
  const customer = await resolveCustomer();
  const products = await resolveProducts();
  const paymentType = await resolvePaymentType();
  const orderId = await createOrder(customer, products);
  const invoice = await invoiceOrder(orderId, paymentType.id);
  console.log(
    JSON.stringify({
      ok: true,
      customerId: customer.id,
      orderId,
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber ?? null,
      amountCurrencyOutstanding: invoice.amountCurrencyOutstanding ?? null,
      amountOutstanding: invoice.amountOutstanding ?? null,
      paymentTypeId: paymentType.id,
    }),
  );
}

await main();
