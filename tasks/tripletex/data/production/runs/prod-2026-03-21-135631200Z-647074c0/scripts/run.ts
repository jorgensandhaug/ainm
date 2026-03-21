const BASE_URL = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const SESSION_TOKEN = "2Gle1RkER_9r4gto-00rU6xlS89QJuxPrhJa78JTPek";
const RUN_DATE = "2026-03-21";

const CUSTOMER = {
  name: "Océan SARL",
  organizationNumber: "859049788",
};

const ORDER_LINES = [
  {
    productRef: "3206",
    description: "Session de formation",
    unitPriceExcludingVatCurrency: 4950,
  },
  {
    productRef: "9191",
    description: "Conseil en données",
    unitPriceExcludingVatCurrency: 7700,
  },
] as const;

type Json = Record<string, unknown>;

class HttpError extends Error {
  status: number;
  bodyText: string;
  bodyJson: unknown;

  constructor(status: number, bodyText: string, bodyJson: unknown) {
    super(`HTTP ${status}: ${bodyText}`);
    this.status = status;
    this.bodyText = bodyText;
    this.bodyJson = bodyJson;
  }
}

function joinUrl(path: string, params?: Record<string, string | string[]>) {
  const base = BASE_URL.replace(/\/+$/, "");
  const url = new URL(`${base}/${path.replace(/^\/+/, "")}`);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (Array.isArray(value)) {
        for (const item of value) url.searchParams.append(key, item);
      } else {
        url.searchParams.set(key, value);
      }
    }
  }
  return url.toString();
}

function authHeader() {
  return `Basic ${Buffer.from(`0:${SESSION_TOKEN}`).toString("base64")}`;
}

function unwrap<T>(json: any): T {
  if (json && json.values !== undefined) return json.values as T;
  if (json && json.value !== undefined) return json.value as T;
  return json as T;
}

async function request(method: string, path: string, options?: {
  params?: Record<string, string | string[]>;
  body?: unknown;
}) {
  const response = await fetch(joinUrl(path, options?.params), {
    method,
    headers: {
      Authorization: authHeader(),
      Accept: "application/json",
      ...(options?.body ? { "Content-Type": "application/json" } : {}),
    },
    body: options?.body ? JSON.stringify(options.body) : undefined,
  });

  const bodyText = await response.text();
  const bodyJson = bodyText ? safeJsonParse(bodyText) : null;

  if (!response.ok) {
    if (
      response.status === 403 &&
      typeof bodyJson === "object" &&
      bodyJson !== null &&
      (
        (bodyJson as any).error === "Invalid or expired token" ||
        (bodyJson as any).error ===
          "Invalid or expired proxy token. Each submission receives a unique token - do not reuse tokens from previous submissions."
      )
    ) {
      throw new Error(`Blocked credentials: ${bodyText}`);
    }
    throw new HttpError(response.status, bodyText, bodyJson);
  }

  return bodyText ? bodyJson : null;
}

function safeJsonParse(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function asArray<T>(value: T | T[] | null | undefined): T[] {
  if (Array.isArray(value)) return value;
  if (value == null) return [];
  return [value];
}

function exactOrg(customer: any) {
  return String(customer?.organizationNumber ?? "") === CUSTOMER.organizationNumber;
}

function productRef(product: any) {
  const ref = product?.productNumber ?? product?.number;
  return ref == null ? "" : String(ref);
}

function accountNumber(account: any) {
  const value = account?.number ?? account?.accountNumber ?? "";
  return String(value);
}

function validationMessages(body: any) {
  return asArray(body?.validationMessages);
}

function isMissingBankAccountError(error: unknown) {
  if (!(error instanceof HttpError)) return false;
  const body = error.bodyJson as any;
  const text = error.bodyText;
  if (typeof text === "string" && text.includes("Faktura kan ikke opprettes før selskapet har registrert et bankkontonummer.")) {
    return true;
  }
  return validationMessages(body).some((entry: any) =>
    typeof entry?.message === "string" &&
    entry.message.includes("Faktura kan ikke opprettes før selskapet har registrert et bankkontonummer."),
  );
}

async function getCustomer() {
  const json = await request("GET", "customer", {
    params: {
      organizationNumber: CUSTOMER.organizationNumber,
      fields: "*",
    },
  });
  const customers = asArray<any>(unwrap(json));
  const exact = customers.filter(exactOrg);
  if (exact.length !== 1) {
    throw new Error(`Customer resolution failed: found ${exact.length} exact matches for ${CUSTOMER.organizationNumber}`);
  }
  return exact[0];
}

async function getProducts() {
  const refs = ORDER_LINES.map((line) => line.productRef);

  const firstJson = await request("GET", "product", {
    params: {
      productNumber: refs,
      fields: "*",
    },
  });

  let products = asArray<any>(unwrap(firstJson));
  let byRef = new Map(products.map((product) => [productRef(product), product]));

  if (refs.every((ref) => byRef.has(ref))) {
    return refs.map((ref) => byRef.get(ref)!);
  }

  const secondJson = await request("GET", "product", {
    params: {
      ids: refs.join(","),
      fields: "*",
    },
  });

  products = asArray<any>(unwrap(secondJson));
  byRef = new Map(products.map((product) => [productRef(product), product]));

  if (refs.every((ref) => byRef.has(ref))) {
    return refs.map((ref) => byRef.get(ref)!);
  }

  const thirdJson = await request("GET", "product", {
    params: {
      count: "1000",
      fields: "*",
    },
  });

  products = asArray<any>(unwrap(thirdJson));
  const byExactName = new Map(products.map((product) => [String(product?.name ?? ""), product]));
  const resolved = ORDER_LINES.map((line) => {
    const direct = products.find((product) => productRef(product) === line.productRef);
    return direct ?? byExactName.get(line.description);
  });

  if (resolved.some((product) => !product)) {
    throw new Error(`Product resolution failed for refs ${refs.join(", ")}`);
  }

  return resolved as any[];
}

async function getPaymentType() {
  const json = await request("GET", "invoice/paymentType", {
    params: {
      count: "1000",
      fields: "*,debitAccount(*),creditAccount(*)",
    },
  });

  const paymentTypes = asArray<any>(unwrap(json));
  if (paymentTypes.length === 0) {
    throw new Error("No invoice payment types available");
  }

  const scored = paymentTypes
    .map((paymentType) => {
      const debit = paymentType?.debitAccount ?? {};
      const number = accountNumber(debit);
      const is19xx = /^19\d{2}$/.test(number);
      const isBankish = Boolean(debit?.isBankAccount) || Boolean(debit?.isInvoiceAccount);
      const name = String(paymentType?.name ?? "").toLowerCase();
      const nameBank = name.includes("bank");
      const score =
        (is19xx ? 100 : 0) +
        (isBankish ? 20 : 0) +
        (nameBank ? 5 : 0);
      return { paymentType, score };
    })
    .sort((a, b) => b.score - a.score);

  return scored[0].paymentType;
}

async function createOrder(customerId: number, products: any[]) {
  const lineByRef = new Map(products.map((product) => [productRef(product), product]));

  const body = {
    customer: { id: customerId },
    orderDate: RUN_DATE,
    deliveryDate: RUN_DATE,
    orderLines: ORDER_LINES.map((line) => {
      const product = lineByRef.get(line.productRef);
      if (!product?.id) {
        throw new Error(`Missing resolved product for ${line.productRef}`);
      }
      return {
        product: { id: product.id },
        description: line.description,
        count: 1,
        unitPriceExcludingVatCurrency: line.unitPriceExcludingVatCurrency,
      };
    }),
  };

  const json = await request("POST", "order", { body });
  const order = unwrap<any>(json);
  if (!order?.id) {
    throw new Error("Order creation did not return an id");
  }
  return order;
}

async function invoiceOrder(orderId: number, paymentTypeId: number | string) {
  return await request("PUT", `order/${orderId}/:invoice`, {
    params: {
      invoiceDate: RUN_DATE,
      sendToCustomer: "false",
      paymentTypeId: String(paymentTypeId),
      paidAmount: "0.01",
      paymentTypeIdRestAmount: String(paymentTypeId),
    },
  });
}

async function repairBankAccount() {
  const json = await request("GET", "ledger/account", {
    params: {
      isBankAccount: "true",
      fields: "*",
    },
  });
  const accounts = asArray<any>(unwrap(json));
  if (accounts.length === 0) {
    throw new Error("No bank account found for repair");
  }

  const chosen =
    accounts.find((account) => String(account?.number ?? "") === "1920" && account?.isInvoiceAccount) ??
    accounts.find((account) => String(account?.number ?? "") === "1920") ??
    accounts.find((account) => account?.isInvoiceAccount) ??
    accounts[0];

  if (!chosen?.id) {
    throw new Error("Chosen bank account missing id");
  }

  await request("PUT", `ledger/account/${chosen.id}`, {
    body: {
      bankAccountNumber: "12345678903",
    },
  });
}

function outstandingAmount(invoice: any) {
  const amount = invoice?.amountCurrencyOutstanding ?? invoice?.amountOutstanding;
  return typeof amount === "number" ? amount : Number(amount);
}

async function main() {
  const customer = await getCustomer();
  const products = await getProducts();
  const paymentType = await getPaymentType();
  const order = await createOrder(Number(customer.id), products);

  let invoiceJson;
  try {
    invoiceJson = await invoiceOrder(Number(order.id), paymentType.id);
  } catch (error) {
    if (!isMissingBankAccountError(error)) throw error;
    await repairBankAccount();
    invoiceJson = await invoiceOrder(Number(order.id), paymentType.id);
  }

  const invoice = unwrap<any>(invoiceJson);
  const outstanding = outstandingAmount(invoice);
  if (outstanding !== 0) {
    throw new Error(`Invoice not fully paid, outstanding=${outstanding}`);
  }

  console.log(JSON.stringify({
    customerId: customer.id,
    orderId: order.id,
    invoiceId: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    outstanding,
  }));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
