const BASE_URL = process.env.TRIPLETEX_BASE_URL;
const TOKEN = process.env.TRIPLETEX_SESSION_TOKEN;

if (!BASE_URL || !TOKEN) {
  throw new Error("Missing TRIPLETEX_BASE_URL or TRIPLETEX_SESSION_TOKEN");
}

const RUN_DATE = "2026-03-20";
const CUSTOMER_ORG = "962176127";
const CUSTOMER_NAME = "Forêt SARL";
const LINES = [
  { name: "Maintenance", ref: "2417", price: 32250 },
  { name: "Développement système", ref: "7053", price: 16900 },
] as const;

type ApiList<T> = { values?: T[]; fullResultSize?: number };
type ApiValue<T> = { value?: T };

type Customer = {
  id: number;
  name?: string;
  organizationNumber?: string | number;
};

type Product = {
  id: number;
  name?: string;
  number?: string | number;
  productNumber?: string | number;
};

type LedgerAccount = {
  id: number;
  name?: string;
  number?: string | number;
  isBankAccount?: boolean;
  isInvoiceAccount?: boolean;
  bankAccountNumber?: string | null;
};

type PaymentType = {
  id: number;
  name?: string;
  debitAccount?: LedgerAccount | null;
  creditAccount?: LedgerAccount | null;
};

type Invoice = {
  id: number;
  invoiceNumber?: number | string;
  amountCurrencyOutstanding?: number | null;
  amountOutstanding?: number | null;
};

function basicAuth(username: string, password: string) {
  return Buffer.from(`${username}:${password}`).toString("base64");
}

async function api<T>(method: string, path: string, opts?: { query?: Record<string, string | number | boolean | Array<string | number>>; body?: unknown; expected?: number[] }) {
  const url = new URL(path.replace(/^\//, ""), BASE_URL.endsWith("/") ? BASE_URL : `${BASE_URL}/`);
  if (opts?.query) {
    for (const [key, raw] of Object.entries(opts.query)) {
      if (Array.isArray(raw)) {
        for (const value of raw) url.searchParams.append(key, String(value));
      } else {
        url.searchParams.set(key, String(raw));
      }
    }
  }

  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Basic ${basicAuth("0", TOKEN)}`,
      Accept: "application/json",
      ...(opts?.body === undefined ? {} : { "Content-Type": "application/json; charset=utf-8" }),
    },
    body: opts?.body === undefined ? undefined : JSON.stringify(opts.body),
  });

  const text = await res.text();
  let json: unknown;
  if (text) {
    const contentType = res.headers.get("content-type") || "";
    json = contentType.includes("json") ? JSON.parse(text) : text;
  }
  const expected = opts?.expected ?? [200];
  if (!expected.includes(res.status)) {
    const err = new Error(`HTTP ${res.status} ${method} ${url.pathname}${url.search}: ${text}`);
    (err as Error & { status?: number; body?: unknown }).status = res.status;
    (err as Error & { status?: number; body?: unknown }).body = json;
    throw err;
  }
  return json as T;
}

function normalize(value: unknown) {
  return String(value ?? "").trim();
}

function exactOne<T>(items: T[], label: string) {
  if (items.length !== 1) {
    throw new Error(`Expected exactly one ${label}, got ${items.length}`);
  }
  return items[0]!;
}

function pickCustomer(values: Customer[]) {
  const exactOrg = values.filter((v) => normalize(v.organizationNumber) === CUSTOMER_ORG);
  if (exactOrg.length === 1) return exactOrg[0]!;
  const exactName = exactOrg.filter((v) => normalize(v.name) === CUSTOMER_NAME);
  return exactOne(exactName.length ? exactName : exactOrg, "customer");
}

function productRef(p: Product) {
  return normalize(p.productNumber || p.number);
}

function pickProducts(values: Product[]) {
  const byRef = new Map<string, Product>();
  for (const value of values) {
    const ref = productRef(value);
    if (!ref) continue;
    if (!byRef.has(ref)) byRef.set(ref, value);
  }
  return byRef;
}

function pickPaymentType(values: PaymentType[]) {
  const scored = values
    .map((value) => {
      const debitNumber = normalize(value.debitAccount?.number);
      let score = 0;
      if (debitNumber.startsWith("19")) score += 10;
      if (value.debitAccount?.isBankAccount) score += 5;
      if (value.debitAccount?.isInvoiceAccount) score += 4;
      if ((value.name || "").toLowerCase().includes("bank")) score += 2;
      if ((value.name || "").toLowerCase().includes("betalt")) score += 1;
      return { value, score };
    })
    .filter(({ value, score }) => value.debitAccount && score > 0)
    .sort((a, b) => b.score - a.score || a.value.id - b.value.id);

  if (!scored.length) {
    throw new Error("No usable invoice payment type found");
  }
  return scored[0]!.value;
}

function pickBankLedgerAccount(values: LedgerAccount[]) {
  const preferred = values
    .filter((value) => value.isBankAccount)
    .sort((a, b) => {
      const aScore = (a.isInvoiceAccount ? 10 : 0) + (normalize(a.number) === "1920" ? 5 : 0);
      const bScore = (b.isInvoiceAccount ? 10 : 0) + (normalize(b.number) === "1920" ? 5 : 0);
      return bScore - aScore || a.id - b.id;
    });
  if (!preferred.length) {
    throw new Error("No bank ledger account found");
  }
  return preferred[0]!;
}

function generateBankAccountNumber() {
  const weights = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  const seed = `${Date.now()}`.replace(/\D/g, "").slice(-10).padStart(10, "1");
  let prefix = BigInt(seed);
  for (let i = 0n; i < 100000n; i++) {
    const first10 = (prefix + i).toString().padStart(10, "1").slice(-10);
    const sum = first10
      .split("")
      .reduce((acc, digit, idx) => acc + Number(digit) * weights[idx]!, 0);
    const mod = sum % 11;
    const check = mod === 0 ? 0 : 11 - mod;
    if (check !== 10) return `${first10}${check}`;
  }
  throw new Error("Unable to generate valid bank account number");
}

async function ensureInvoiceBankAccount() {
  const ledgerResp = await api<ApiList<LedgerAccount>>("GET", "/ledger/account", {
    query: { isBankAccount: true, fields: "*" },
  });
  const account = pickBankLedgerAccount(ledgerResp.values ?? []);
  if (normalize(account.bankAccountNumber)) return account;
  const bankAccountNumber = generateBankAccountNumber();
  await api<ApiValue<LedgerAccount>>("PUT", `/ledger/account/${account.id}`, {
    body: { bankAccountNumber },
    expected: [200],
  });
  return { ...account, bankAccountNumber };
}

async function resolveCustomer() {
  const resp = await api<ApiList<Customer>>("GET", "/customer", {
    query: { organizationNumber: CUSTOMER_ORG, fields: "*" },
  });
  return pickCustomer(resp.values ?? []);
}

async function resolveProducts() {
  const first = await api<ApiList<Product>>("GET", "/product", {
    query: { productNumber: LINES.map((line) => line.ref), fields: "*" },
  });
  let map = pickProducts(first.values ?? []);
  if (LINES.every((line) => map.has(line.ref))) return map;

  const second = await api<ApiList<Product>>("GET", "/product", {
    query: { ids: LINES.map((line) => line.ref).join(","), fields: "*" },
  });
  map = pickProducts(second.values ?? []);
  if (LINES.every((line) => map.has(line.ref))) return map;

  const third = await api<ApiList<Product>>("GET", "/product", {
    query: { count: 1000, fields: "*" },
  });
  const byName = new Map<string, Product>();
  for (const value of third.values ?? []) {
    if (!value.name) continue;
    if (!byName.has(value.name)) byName.set(value.name, value);
  }
  const resolved = new Map<string, Product>();
  for (const line of LINES) {
    const product = byName.get(line.name);
    if (!product) throw new Error(`Unable to resolve product ${line.name}`);
    resolved.set(line.ref, product);
  }
  return resolved;
}

async function main() {
  const customer = await resolveCustomer();
  const products = await resolveProducts();
  await ensureInvoiceBankAccount();

  const orderResp = await api<ApiValue<{ id: number }>>("POST", "/order", {
    body: {
      customer: { id: customer.id },
      orderDate: RUN_DATE,
      deliveryDate: RUN_DATE,
      orderLines: LINES.map((line) => {
        const product = products.get(line.ref);
        if (!product) throw new Error(`Product missing for ref ${line.ref}`);
        return {
          product: { id: product.id },
          description: line.name,
          count: 1,
          unitPriceExcludingVatCurrency: line.price,
        };
      }),
    },
    expected: [200, 201],
  });
  const orderId = orderResp.value?.id;
  if (!orderId) throw new Error("Order id missing from create response");

  let invoiceResp: ApiValue<Invoice>;
  try {
    invoiceResp = await api<ApiValue<Invoice>>("PUT", `/order/${orderId}/:invoice`, {
      query: { invoiceDate: RUN_DATE, sendToCustomer: false },
      expected: [200],
    });
  } catch (error) {
    const body = (error as Error & { body?: any }).body;
    const text = JSON.stringify(body ?? {});
    if (!text.includes("bankkontonummer")) throw error;
    await ensureInvoiceBankAccount();
    invoiceResp = await api<ApiValue<Invoice>>("PUT", `/order/${orderId}/:invoice`, {
      query: { invoiceDate: RUN_DATE, sendToCustomer: false },
      expected: [200],
    });
  }

  const invoice = invoiceResp.value;
  if (!invoice?.id) throw new Error("Invoice id missing from invoice response");
  const outstanding = invoice.amountCurrencyOutstanding ?? invoice.amountOutstanding;
  if (outstanding == null) throw new Error("Outstanding amount missing from invoice response");

  const paymentTypesResp = await api<ApiList<PaymentType>>("GET", "/invoice/paymentType", {
    query: { count: 1000, fields: "*,debitAccount(*),creditAccount(*)" },
  });
  const paymentType = pickPaymentType(paymentTypesResp.values ?? []);

  const paymentResp = await api<ApiValue<Invoice>>("PUT", `/invoice/${invoice.id}/:payment`, {
    query: {
      paymentDate: RUN_DATE,
      paymentTypeId: paymentType.id,
      paidAmount: outstanding,
    },
    expected: [200],
  });
  const paidInvoice = paymentResp.value;
  const remaining = paidInvoice?.amountCurrencyOutstanding ?? paidInvoice?.amountOutstanding;
  if (remaining !== 0) {
    throw new Error(`Invoice not fully paid, remaining outstanding: ${remaining}`);
  }

  console.log(
    JSON.stringify(
      {
        customerId: customer.id,
        orderId,
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        paymentTypeId: paymentType.id,
        remainingOutstanding: remaining,
      },
      null,
      2,
    ),
  );
}

await main();
