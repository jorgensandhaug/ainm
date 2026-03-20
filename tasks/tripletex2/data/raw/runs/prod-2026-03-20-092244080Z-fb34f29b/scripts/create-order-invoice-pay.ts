const BASE_URL = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const SESSION_TOKEN = "REDACTED";
const TODAY = "2026-03-20";
const CUSTOMER_NAME = "Viento SL";
const CUSTOMER_ORG = "924480505";
const BANK_ACCOUNT_NUMBER = "12345678903";

const PRODUCT_SPECS = [
  { label: "Sesión de formación", ref: "8488", unitPriceExcludingVatCurrency: 5700 },
  { label: "Horas de consultoría", ref: "3787", unitPriceExcludingVatCurrency: 14750 },
] as const;

type ListResponse<T> = {
  values?: T[];
  fullResultSize?: number;
};

type Wrapper<T> = {
  value?: T;
};

type Customer = {
  id: number;
  name?: string;
  displayName?: string;
  organizationNumber?: string;
};

type Product = {
  id: number;
  name?: string;
  displayName?: string;
  number?: string | number;
  vatType?: { id?: number };
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
  description?: string;
  debitAccount?: { number?: string | number };
  creditAccount?: { number?: string | number };
  currencyCode?: string;
};

type OrderLine = {
  description?: string;
  count?: number;
  unitPriceExcludingVatCurrency?: number;
  product?: { id?: number; number?: string | number; name?: string; displayName?: string };
};

type Order = {
  id: number;
  number?: string;
  customer?: { id?: number; name?: string; displayName?: string };
  orderLines?: OrderLine[];
  isClosed?: boolean;
  orderDate?: string;
  deliveryDate?: string;
};

type Currency = {
  code?: string;
  displayName?: string;
};

type Invoice = {
  id: number;
  invoiceNumber?: number;
  amountExcludingVatCurrency?: number;
  amountOutstanding?: number;
  amountCurrencyOutstanding?: number;
  isCharged?: boolean;
  currency?: Currency;
  customer?: { id?: number; organizationNumber?: string; name?: string; displayName?: string };
  orderLines?: OrderLine[];
  orders?: Array<{ id?: number; number?: string }>;
};

function authHeader() {
  return `Basic ${Buffer.from(`0:${SESSION_TOKEN}`).toString("base64")}`;
}

function toNumberString(value: unknown): string {
  if (value === undefined || value === null) {
    return "";
  }
  return String(value);
}

function normalizeText(value: string | undefined): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function exactName(entity: { name?: string; displayName?: string } | undefined, expected: string): boolean {
  if (!entity) return false;
  return entity.name === expected || entity.displayName === expected;
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

async function api<T>(
  method: string,
  path: string,
  options: {
    query?: Record<string, string | number | boolean | Array<string | number | boolean> | undefined>;
    body?: unknown;
  } = {},
): Promise<T> {
  const base = BASE_URL.endsWith("/") ? BASE_URL : `${BASE_URL}/`;
  const url = new URL(path.replace(/^\//, ""), base);

  for (const [key, rawValue] of Object.entries(options.query ?? {})) {
    if (rawValue === undefined) continue;
    if (Array.isArray(rawValue)) {
      for (const value of rawValue) {
        url.searchParams.append(key, String(value));
      }
      continue;
    }
    url.searchParams.set(key, String(rawValue));
  }

  const response = await fetch(url, {
    method,
    headers: {
      Authorization: authHeader(),
      Accept: "application/json",
      ...(options.body === undefined ? {} : { "Content-Type": "application/json; charset=utf-8" }),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });

  const text = await response.text();
  const payload = text ? JSON.parse(text) : undefined;

  if (!response.ok) {
    throw new Error(`${method} ${url.toString()} -> ${response.status} ${response.statusText}\n${text}`);
  }

  return payload as T;
}

async function ensureInvoiceBankAccount() {
  const accounts = await api<ListResponse<Account>>("GET", "/ledger/account", {
    query: { isBankAccount: true, fields: "*" },
  });
  const values = accounts.values ?? [];
  const target =
    values.find((account) => account.isInvoiceAccount && Number(account.number) === 1920) ??
    values.find((account) => account.isInvoiceAccount) ??
    values.find((account) => Number(account.number) === 1920 && account.isBankAccount) ??
    null;

  if (!target) {
    return { checked: values.length, updated: false, accountId: null as number | null };
  }

  if ((target.bankAccountNumber ?? "").trim()) {
    return { checked: values.length, updated: false, accountId: target.id };
  }

  const updated = await api<Wrapper<Account>>("PUT", `/ledger/account/${target.id}`, {
    body: { bankAccountNumber: BANK_ACCOUNT_NUMBER },
  });

  return {
    checked: values.length,
    updated: true,
    accountId: updated.value?.id ?? target.id,
    bankAccountNumber: updated.value?.bankAccountNumber ?? BANK_ACCOUNT_NUMBER,
  };
}

async function findCustomer(): Promise<Customer> {
  const response = await api<ListResponse<Customer>>("GET", "/customer", {
    query: { organizationNumber: CUSTOMER_ORG, fields: "*" },
  });

  const matches = (response.values ?? []).filter((customer) => customer.organizationNumber === CUSTOMER_ORG);
  const exact = matches.find((customer) => exactName(customer, CUSTOMER_NAME));
  const selected = exact ?? matches[0];

  assert(selected?.id, `Customer not found for org ${CUSTOMER_ORG}`);
  return selected;
}

function chooseProducts(products: Product[], mode: "number" | "id"): Product[] | null {
  const chosen = PRODUCT_SPECS.map((spec) => {
    const matches = products.filter((product) => {
      const refMatches =
        mode === "number" ? toNumberString(product.number) === spec.ref : toNumberString(product.id) === spec.ref;
      if (!refMatches) return false;
      return exactName(product, spec.label) || products.filter((candidate) => {
        const candidateRefMatches =
          mode === "number"
            ? toNumberString(candidate.number) === spec.ref
            : toNumberString(candidate.id) === spec.ref;
        return candidateRefMatches;
      }).length === 1;
    });
    return matches[0];
  });

  return chosen.every(Boolean) ? (chosen as Product[]) : null;
}

async function findProducts(): Promise<Product[]> {
  const byNumber = await api<ListResponse<Product>>("GET", "/product", {
    query: { productNumber: PRODUCT_SPECS.map((spec) => spec.ref), fields: "*" },
  });
  const selectedByNumber = chooseProducts(byNumber.values ?? [], "number");
  if (selectedByNumber) {
    return selectedByNumber;
  }

  const byId = await api<ListResponse<Product>>("GET", "/product", {
    query: { ids: PRODUCT_SPECS.map((spec) => spec.ref).join(","), fields: "*" },
  });
  const selectedById = chooseProducts(byId.values ?? [], "id");
  if (selectedById) {
    return selectedById;
  }

  const allProducts = await api<ListResponse<Product>>("GET", "/product", {
    query: { count: 1000, fields: "*" },
  });
  const values = allProducts.values ?? [];

  const selectedByHeuristic = PRODUCT_SPECS.map((spec) => {
    const normalizedLabel = normalizeText(spec.label);
    const ranked = values
      .map((product) => {
        const productId = toNumberString(product.id);
        const productNumber = toNumberString(product.number);
        const names = [product.name, product.displayName].map((value) => normalizeText(value));
        const exactNormalizedName = names.some((name) => name === normalizedLabel);
        const partialName = names.some((name) => name.includes(normalizedLabel) || normalizedLabel.includes(name));
        const score =
          (productId === spec.ref ? 100 : 0) +
          (productNumber === spec.ref ? 80 : 0) +
          (exactNormalizedName ? 40 : 0) +
          (partialName ? 20 : 0);
        return { product, score };
      })
      .filter((candidate) => candidate.score > 0)
      .sort((left, right) => right.score - left.score);

    return ranked[0]?.product;
  });

  const uniqueIds = new Set(selectedByHeuristic.map((product) => product?.id).filter(Boolean));
  assert(
    selectedByHeuristic.every(Boolean) && uniqueIds.size === PRODUCT_SPECS.length,
    `Products not found for refs ${PRODUCT_SPECS.map((spec) => spec.ref).join(", ")}`,
  );
  return selectedByHeuristic as Product[];
}

function verifyOrder(order: Order, customer: Customer, products: Product[]) {
  assert(order.id, "Order response missing id");
  if (order.customer?.id !== undefined) {
    assert(order.customer.id === customer.id, `Order customer mismatch: expected ${customer.id}, got ${order.customer.id}`);
  }
}

function verifyInvoice(invoice: Invoice, order: Order) {
  assert(invoice.id, "Invoice response missing id");
  if (invoice.orders !== undefined) {
    assert(invoice.orders.some((candidate) => candidate.id === order.id), `Invoice not linked to order ${order.id}`);
  }
  if (invoice.amountExcludingVatCurrency !== undefined) {
    const expected = PRODUCT_SPECS.reduce((sum, spec) => sum + spec.unitPriceExcludingVatCurrency, 0);
    assert(
      invoice.amountExcludingVatCurrency === expected,
      `Invoice ex-VAT amount mismatch: expected ${expected}, got ${invoice.amountExcludingVatCurrency}`,
    );
  }
}

function verifyCreatedLines(
  response: ListResponse<OrderLine>,
  order: Order,
  products: Product[],
) {
  const lines = response.values ?? [];
  assert(lines.length === PRODUCT_SPECS.length, `Created order line count mismatch: expected ${PRODUCT_SPECS.length}, got ${lines.length}`);

  for (const spec of PRODUCT_SPECS) {
    const product = products.find((item) => exactName(item, spec.label) || toNumberString(item.number) === spec.ref);
    assert(product?.id, `Resolved product missing for ${spec.ref}`);
    const line = lines.find(
      (candidate) =>
        candidate.product?.id === product.id ||
        (candidate.description === spec.label && candidate.count === 1),
    );
    assert(line, `Missing created line for ${spec.label}`);
    if (line.product?.id !== undefined) {
      assert(line.product.id === product.id, `Created line product mismatch for ${spec.label}`);
    }
    if (line.description !== undefined) {
      assert(line.description === spec.label, `Created line description mismatch for ${spec.label}`);
    }
    if (line.count !== undefined) {
      assert(line.count === 1, `Created line count mismatch for ${spec.label}`);
    }
    if (line.unitPriceExcludingVatCurrency !== undefined) {
      assert(
        line.unitPriceExcludingVatCurrency === spec.unitPriceExcludingVatCurrency,
        `Created line price mismatch for ${spec.label}`,
      );
    }
  }
}

async function findReusableEmptyOrder(customerId: number): Promise<Order | null> {
  const dateTo = new Date(`${TODAY}T00:00:00Z`);
  dateTo.setUTCDate(dateTo.getUTCDate() + 1);
  const tomorrow = dateTo.toISOString().slice(0, 10);

  const response = await api<ListResponse<Order>>("GET", "/order", {
    query: {
      customerId,
      orderDateFrom: TODAY,
      orderDateTo: tomorrow,
      fields: "*,customer(*),orderLines(*)",
      sorting: "-id",
      count: 100,
    },
  });

  return (
    (response.values ?? []).find(
      (order) =>
        order.customer?.id === customerId &&
        !order.isClosed &&
        (order.orderLines?.length ?? 0) === 0,
    ) ?? null
  );
}

async function getPaymentType(invoice: Invoice): Promise<PaymentType> {
  const response = await api<ListResponse<PaymentType>>("GET", "/invoice/paymentType", {
    query: { count: 1000, fields: "*,debitAccount(*),creditAccount(*)" },
  });

  const values = response.values ?? [];
  assert(values.length > 0, "No payment types available");

  const invoiceCurrency = invoice.currency?.code ?? invoice.currency?.displayName;
  const matchesCurrency = (paymentType: PaymentType) =>
    !invoiceCurrency || !paymentType.currencyCode || paymentType.currencyCode === invoiceCurrency;
  const debit = (paymentType: PaymentType) => toNumberString(paymentType.debitAccount?.number);
  const credit = (paymentType: PaymentType) => toNumberString(paymentType.creditAccount?.number);

  return (
    values.find((paymentType) => matchesCurrency(paymentType) && /^19/.test(debit(paymentType)) && /^15/.test(credit(paymentType))) ??
    values.find((paymentType) => matchesCurrency(paymentType) && /^19/.test(debit(paymentType))) ??
    values.find((paymentType) => matchesCurrency(paymentType) && /^15/.test(credit(paymentType))) ??
    values.find((paymentType) => matchesCurrency(paymentType)) ??
    values[0]
  );
}

async function main() {
  const bankAccount = await ensureInvoiceBankAccount();
  const customer = await findCustomer();
  const products = await findProducts();

  const reusableOrder = await findReusableEmptyOrder(customer.id);
  const order =
    reusableOrder ??
    (await api<Wrapper<Order>>("POST", "/order", {
      body: {
        customer: { id: customer.id },
        orderDate: TODAY,
        deliveryDate: TODAY,
      },
    })).value;
  assert(order, "Order response missing value");
  verifyOrder(order, customer, products);

  const createdLines = await api<ListResponse<OrderLine>>("POST", "/order/orderline/list", {
    body: PRODUCT_SPECS.map((spec, index) => ({
      order: { id: order.id },
      product: { id: products[index].id },
      description: spec.label,
      count: 1,
      unitPriceExcludingVatCurrency: spec.unitPriceExcludingVatCurrency,
      ...(products[index].vatType?.id ? { vatType: { id: products[index].vatType?.id } } : {}),
    })),
  });
  verifyCreatedLines(createdLines, order, products);

  const invoiceResponse = await api<Wrapper<Invoice>>("PUT", `/order/${order.id}/:invoice`, {
    query: { invoiceDate: TODAY, sendToCustomer: false },
  });
  const invoice = invoiceResponse.value;
  assert(invoice, "Invoice response missing value");
  verifyInvoice(invoice, order);

  const outstanding = invoice.amountCurrencyOutstanding ?? invoice.amountOutstanding;
  assert(typeof outstanding === "number" && outstanding > 0, `Invoice outstanding amount invalid: ${outstanding}`);

  const paymentType = await getPaymentType(invoice);
  assert(paymentType.id, "Selected payment type missing id");

  const paidResponse = await api<Wrapper<Invoice>>("PUT", `/invoice/${invoice.id}/:payment`, {
    query: {
      paymentDate: TODAY,
      paymentTypeId: paymentType.id,
      paidAmount: outstanding,
    },
  });
  const paidInvoice = paidResponse.value;
  assert(paidInvoice, "Payment response missing invoice value");

  const remainingOutstanding = paidInvoice.amountCurrencyOutstanding ?? paidInvoice.amountOutstanding;
  assert(remainingOutstanding === 0, `Invoice still outstanding after payment: ${remainingOutstanding}`);

  console.log(
    JSON.stringify(
      {
        customer: {
          id: customer.id,
          name: customer.name ?? customer.displayName ?? CUSTOMER_NAME,
          organizationNumber: customer.organizationNumber ?? CUSTOMER_ORG,
        },
        products: products.map((product, index) => ({
          id: product.id,
          number: product.number,
          name: product.name ?? product.displayName ?? PRODUCT_SPECS[index].label,
          unitPriceExcludingVatCurrency: PRODUCT_SPECS[index].unitPriceExcludingVatCurrency,
        })),
        bankAccount,
        order: {
          id: order.id,
          number: order.number,
        },
        invoice: {
          id: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          amountExcludingVatCurrency: invoice.amountExcludingVatCurrency,
          amountOutstandingBeforePayment: outstanding,
          amountOutstandingAfterPayment: remainingOutstanding,
        },
        payment: {
          paymentTypeId: paymentType.id,
          paymentTypeDescription: paymentType.description,
          paidAmount: outstanding,
          paymentDate: TODAY,
        },
      },
      null,
      2,
    ),
  );
}

await main();
