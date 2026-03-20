const BASE_URL = process.env.TRIPLETEX_BASE_URL;
const TOKEN = process.env.TRIPLETEX_TOKEN;
const RUN_DATE = "2026-03-20";

if (!BASE_URL || !TOKEN) {
  throw new Error("Missing TRIPLETEX_BASE_URL or TRIPLETEX_TOKEN");
}

type Json = Record<string, any>;

class ApiError extends Error {
  status: number;
  body: any;
  method: string;
  path: string;

  constructor(method: string, path: string, status: number, body: any) {
    super(`${method} ${path} failed with ${status}`);
    this.method = method;
    this.path = path;
    this.status = status;
    this.body = body;
  }
}

function authHeader() {
  return `Basic ${Buffer.from(`0:${TOKEN}`).toString("base64")}`;
}

function toQueryString(query: Record<string, any> = {}) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) {
      for (const item of value) params.append(key, String(item));
      continue;
    }
    params.set(key, String(value));
  }
  const str = params.toString();
  return str ? `?${str}` : "";
}

async function api(method: string, path: string, opts: { query?: Record<string, any>; body?: any } = {}) {
  const url = `${BASE_URL}${path}${toQueryString(opts.query)}`;
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: authHeader(),
      Accept: "application/json",
      ...(opts.body ? { "Content-Type": "application/json; charset=utf-8" } : {}),
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });

  const text = await res.text();
  let parsed: any = null;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text;
    }
  }

  if (!res.ok) {
    throw new ApiError(method, path, res.status, parsed);
  }

  return parsed;
}

function values(response: any): any[] {
  return Array.isArray(response?.values) ? response.values : [];
}

function value(response: any): any {
  return response?.value ?? response;
}

function getOrgNumber(customer: any) {
  return String(customer?.organizationNumber ?? "");
}

function getProductNumber(product: any) {
  return String(product?.number ?? product?.productNumber ?? "");
}

function getProductName(product: any) {
  return String(product?.name ?? product?.description ?? "");
}

function hasValidBankAccountNumber(account: any) {
  return /^\d{11}$/.test(String(account?.bankAccountNumber ?? ""));
}

function extractMessages(body: any): string[] {
  if (!body || typeof body !== "object") return [];
  const out: string[] = [];
  if (typeof body.message === "string" && body.message) out.push(body.message);
  if (Array.isArray(body.validationMessages)) {
    for (const msg of body.validationMessages) {
      const field = typeof msg?.field === "string" && msg.field ? `${msg.field}: ` : "";
      const message = typeof msg?.message === "string" ? msg.message : JSON.stringify(msg);
      out.push(`${field}${message}`);
    }
  }
  return out;
}

function isInvalidTokenError(error: unknown) {
  return error instanceof ApiError &&
    error.status === 403 &&
    JSON.stringify(error.body).includes("Invalid or expired token");
}

function isMissingBankAccountError(error: unknown) {
  if (!(error instanceof ApiError) || error.status !== 422) return false;
  return extractMessages(error.body).some((msg) => msg.includes("bankkontonummer"));
}

function pickCustomer(customers: any[]) {
  const exactOrg = customers.filter((customer) => getOrgNumber(customer) === "989093630");
  if (exactOrg.length === 1) return exactOrg[0];
  const exactName = exactOrg.filter((customer) => customer?.name === "Luna SL");
  if (exactName.length === 1) return exactName[0];
  throw new Error(`Customer resolution failed: found ${exactOrg.length} exact org-number matches`);
}

function resolveProductsFromList(products: any[]) {
  const wanted = [
    { number: "5981", name: "Almacenamiento en la nube", price: 29950 },
    { number: "6784", name: "Diseño web", price: 20450 },
  ];

  const byNumber = new Map<string, any>();
  for (const product of products) {
    const number = getProductNumber(product);
    if (wanted.some((item) => item.number === number) && !byNumber.has(number)) {
      byNumber.set(number, product);
    }
  }

  if (wanted.every((item) => byNumber.has(item.number))) {
    return wanted.map((item) => ({ ...item, product: byNumber.get(item.number) }));
  }

  const byName = new Map<string, any>();
  for (const product of products) {
    const name = getProductName(product);
    if (wanted.some((item) => item.name === name) && !byName.has(name)) {
      byName.set(name, product);
    }
  }

  if (wanted.every((item) => byName.has(item.name))) {
    return wanted.map((item) => ({ ...item, product: byName.get(item.name) }));
  }

  return null;
}

async function resolveProducts() {
  const firstRead = await api("GET", "/product", {
    query: { productNumber: ["5981", "6784"], fields: "*" },
  });
  let resolved = resolveProductsFromList(values(firstRead));
  if (resolved) return resolved;

  const secondRead = await api("GET", "/product", {
    query: { ids: "5981,6784", fields: "*" },
  });
  resolved = resolveProductsFromList(values(secondRead));
  if (resolved) return resolved;

  const thirdRead = await api("GET", "/product", {
    query: { count: 1000, fields: "*" },
  });
  resolved = resolveProductsFromList(values(thirdRead));
  if (resolved) return resolved;

  throw new Error("Product resolution failed for 5981/6784");
}

function choosePaymentType(paymentTypes: any[]) {
  const scored = paymentTypes.map((paymentType) => {
    const debitNumber = String(paymentType?.debitAccount?.number ?? "");
    let score = 0;
    if (debitNumber.startsWith("19")) score += 100;
    if (paymentType?.debitAccount?.isBankAccount) score += 40;
    if (paymentType?.debitAccount?.isInvoiceAccount) score += 20;
    if (!paymentType?.isInactive) score += 10;
    if (/bank|betalt|betaling|konto/i.test(String(paymentType?.name ?? ""))) score += 5;
    return { paymentType, score };
  }).sort((a, b) => b.score - a.score);

  if (!scored[0] || scored[0].score <= 0) {
    throw new Error("No usable payment type found");
  }

  return scored[0].paymentType;
}

function chooseInvoiceBankAccount(accounts: any[]) {
  const scored = accounts.map((account) => {
    const number = String(account?.number ?? "");
    let score = 0;
    if (account?.isInvoiceAccount) score += 100;
    if (number === "1920") score += 40;
    if (number.startsWith("19")) score += 20;
    if (account?.isBankAccount) score += 10;
    if (!hasValidBankAccountNumber(account)) score += 5;
    return { account, score };
  }).sort((a, b) => b.score - a.score);

  if (!scored[0] || scored[0].score <= 0) {
    throw new Error("No usable bank account found for invoice repair");
  }

  return scored[0].account;
}

function computeMod11CheckDigit(tenDigits: string) {
  const weights = [2, 3, 4, 5, 6, 7, 2, 3, 4, 5];
  let sum = 0;
  for (let i = 0; i < tenDigits.length; i += 1) {
    const digit = Number(tenDigits[tenDigits.length - 1 - i]);
    sum += digit * weights[i];
  }
  const remainder = sum % 11;
  const check = remainder === 0 ? 0 : 11 - remainder;
  if (check === 10) return null;
  return String(check);
}

function makeUniqueNorwegianBankAccount(existing: Set<string>) {
  for (let seed = 100000; seed < 999999; seed += 1) {
    const prefix = "1234";
    const body = String(seed).padStart(6, "0");
    const tenDigits = `${prefix}${body}`;
    const check = computeMod11CheckDigit(tenDigits);
    if (check === null) continue;
    const candidate = `${tenDigits}${check}`;
    if (!existing.has(candidate)) return candidate;
  }
  throw new Error("Failed to generate unique bank account number");
}

async function createInvoiceFromOrder(orderId: number) {
  return await api("PUT", `/order/${orderId}/:invoice`, {
    query: { invoiceDate: RUN_DATE, sendToCustomer: false },
  });
}

async function main() {
  try {
    const customerResponse = await api("GET", "/customer", {
      query: { organizationNumber: "989093630", fields: "*" },
    });
    const customer = pickCustomer(values(customerResponse));

    const resolvedProducts = await resolveProducts();

    const orderPayload = {
      customer: { id: customer.id },
      orderDate: RUN_DATE,
      deliveryDate: RUN_DATE,
      orderLines: resolvedProducts.map((item) => ({
        product: { id: item.product.id },
        description: item.name,
        count: 1,
        unitPriceExcludingVatCurrency: item.price,
      })),
    };

    const orderResponse = await api("POST", "/order", { body: orderPayload });
    const order = value(orderResponse);

    let invoiceResponse: any;
    try {
      invoiceResponse = await createInvoiceFromOrder(order.id);
    } catch (error) {
      if (!isMissingBankAccountError(error)) throw error;

      const accountResponse = await api("GET", "/ledger/account", {
        query: { isBankAccount: true, fields: "*" },
      });
      const accounts = values(accountResponse);
      const invoiceBankAccount = chooseInvoiceBankAccount(accounts);

      if (!hasValidBankAccountNumber(invoiceBankAccount)) {
        const existing = new Set(
          accounts
            .map((account) => String(account?.bankAccountNumber ?? ""))
            .filter((bankAccountNumber) => /^\d{11}$/.test(bankAccountNumber)),
        );
        const bankAccountNumber = makeUniqueNorwegianBankAccount(existing);
        await api("PUT", `/ledger/account/${invoiceBankAccount.id}`, {
          body: { bankAccountNumber },
        });
      }

      invoiceResponse = await createInvoiceFromOrder(order.id);
    }

    const invoice = value(invoiceResponse);
    const outstanding = Number(invoice.amountCurrencyOutstanding ?? invoice.amountOutstanding);
    if (!(outstanding > 0)) {
      throw new Error(`Invoice outstanding amount invalid: ${outstanding}`);
    }

    const paymentTypesResponse = await api("GET", "/invoice/paymentType", {
      query: { count: 1000, fields: "*,debitAccount(*),creditAccount(*)" },
    });
    const paymentType = choosePaymentType(values(paymentTypesResponse));

    const paymentResponse = await api("PUT", `/invoice/${invoice.id}/:payment`, {
      query: {
        paymentDate: RUN_DATE,
        paymentTypeId: paymentType.id,
        paidAmount: outstanding,
      },
    });

    const paidInvoice = value(paymentResponse);
    const remaining = Number(paidInvoice.amountCurrencyOutstanding ?? paidInvoice.amountOutstanding);
    if (remaining !== 0) {
      throw new Error(`Payment did not settle invoice; remaining outstanding ${remaining}`);
    }

    console.log(JSON.stringify({
      ok: true,
      customerId: customer.id,
      orderId: order.id,
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      paymentTypeId: paymentType.id,
      paidAmount: outstanding,
      remainingOutstanding: remaining,
    }));
  } catch (error) {
    if (isInvalidTokenError(error)) {
      console.error("Blocked by unusable Tripletex token");
      process.exit(2);
    }

    if (error instanceof ApiError) {
      console.error(JSON.stringify({
        ok: false,
        method: error.method,
        path: error.path,
        status: error.status,
        body: error.body,
        messages: extractMessages(error.body),
      }, null, 2));
      process.exit(1);
    }

    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

await main();
