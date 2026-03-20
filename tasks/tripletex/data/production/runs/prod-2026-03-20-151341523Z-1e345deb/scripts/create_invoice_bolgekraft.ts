const BASE_URL = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const SESSION_TOKEN = "bVvjt_kyupTc5u2Db0hdNepF7r7biVDw0Wv7BnTsvHs";
const AUTH_HEADER = `Basic ${Buffer.from(`0:${SESSION_TOKEN}`).toString("base64")}`;

const INVOICE_DATE = "2026-03-20";
const INVOICE_DUE_DATE = "2026-04-03";
const DELIVERY_DATE = "2026-03-20";
const VERIFY_FIELDS =
  "*,customer(*),orders(*,orderLines(*,product(*),vatType(*))),orderLines(*,product(*),vatType(*))";

type ApiResponse<T> = {
  value?: T;
  values?: T[];
  fullResultSize?: number;
  [key: string]: unknown;
};

type Customer = {
  id: number;
  name?: string;
  organizationNumber?: string;
};

type VatType = {
  id: number;
  name?: string;
  number?: string;
  percentage?: number;
};

type Product = {
  id: number;
  name?: string;
  number?: string | number;
  productNumber?: string | number;
  vatType?: VatType | null;
};

type LedgerAccount = {
  id: number;
  number?: string | number;
  name?: string;
  isBankAccount?: boolean;
  isInvoiceAccount?: boolean;
  bankAccountNumber?: string | null;
};

type OrderLine = {
  id?: number;
  description?: string;
  count?: number;
  unitPriceExcludingVatCurrency?: number;
  vatType?: VatType | null;
  product?: Product | null;
};

type Order = {
  id?: number;
  orderLines?: OrderLine[];
};

type Invoice = {
  id: number;
  invoiceNumber?: number;
  amount?: number;
  amountCurrency?: number;
  amountExcludingVat?: number;
  amountExcludingVatCurrency?: number;
  customer?: Customer | null;
  orderLines?: OrderLine[];
  orders?: Order[];
};

type LineSpec = {
  ref: string;
  name: string;
  unitPriceExcludingVatCurrency: number;
  vatPercentage: number;
};

const lineSpecs: LineSpec[] = [
  {
    ref: "6744",
    name: "Webdesign",
    unitPriceExcludingVatCurrency: 27000,
    vatPercentage: 25,
  },
  {
    ref: "2584",
    name: "Programvarelisens",
    unitPriceExcludingVatCurrency: 9300,
    vatPercentage: 15,
  },
  {
    ref: "3739",
    name: "Opplæring",
    unitPriceExcludingVatCurrency: 16300,
    vatPercentage: 0,
  },
];

let apiCalls = 0;

function normalize(value: unknown): string {
  return String(value ?? "").trim();
}

function normalizeNumberString(value: unknown): string {
  return normalize(value);
}

function encodeQuery(params: Record<string, string | number | boolean | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) {
      search.append(key, String(value));
    }
  }
  const query = search.toString();
  return query ? `?${query}` : "";
}

async function request<T>(
  method: string,
  path: string,
  options: {
    query?: URLSearchParams | Record<string, string | number | boolean | undefined>;
    body?: unknown;
    expectedStatus?: number | number[];
  } = {},
): Promise<T> {
  const url = new URL(`${BASE_URL}${path}`);
  if (options.query instanceof URLSearchParams) {
    url.search = options.query.toString();
  } else if (options.query) {
    url.search = encodeQuery(options.query);
  }

  const headers: Record<string, string> = {
    Authorization: AUTH_HEADER,
    Accept: "application/json",
  };

  let body: string | undefined;
  if (options.body !== undefined) {
    headers["Content-Type"] = "application/json; charset=utf-8";
    body = JSON.stringify(options.body);
  }

  apiCalls += 1;
  const response = await fetch(url, { method, headers, body });
  const rawText = await response.text();
  let parsed: unknown = undefined;
  if (rawText) {
    try {
      parsed = JSON.parse(rawText);
    } catch {
      parsed = rawText;
    }
  }

  const expected = Array.isArray(options.expectedStatus)
    ? options.expectedStatus
    : options.expectedStatus !== undefined
      ? [options.expectedStatus]
      : [200];

  if (!expected.includes(response.status)) {
    const error = new Error(`HTTP ${response.status} for ${method} ${url.pathname}${url.search}`);
    (error as Error & { status?: number; data?: unknown }).status = response.status;
    (error as Error & { status?: number; data?: unknown }).data = parsed;
    throw error;
  }

  return parsed as T;
}

function getValues<T>(response: ApiResponse<T>): T[] {
  return Array.isArray(response.values) ? response.values : [];
}

async function resolveCustomer(): Promise<Customer> {
  const response = await request<ApiResponse<Customer>>("GET", "/customer", {
    query: {
      organizationNumber: "827304212",
      fields: "*",
    },
    expectedStatus: 200,
  });

  const matches = getValues(response).filter(
    (customer) => normalize(customer.organizationNumber) === "827304212",
  );
  if (matches.length !== 1) {
    throw new Error(`Expected 1 customer for organizationNumber 827304212, got ${matches.length}`);
  }
  return matches[0];
}

async function resolveProducts(): Promise<Map<string, Product>> {
  const resolved = new Map<string, Product>();

  const byProductNumberQuery = new URLSearchParams();
  for (const line of lineSpecs) {
    byProductNumberQuery.append("productNumber", line.ref);
  }
  byProductNumberQuery.append("fields", "*");

  const byProductNumber = await request<ApiResponse<Product>>("GET", "/product", {
    query: byProductNumberQuery,
    expectedStatus: 200,
  });

  for (const product of getValues(byProductNumber)) {
    const productNumber = normalizeNumberString(product.number || product.productNumber);
    if (productNumber) {
      resolved.set(productNumber, product);
    }
  }

  const missingAfterProductNumber = lineSpecs.filter((line) => !resolved.has(line.ref));
  if (missingAfterProductNumber.length > 0) {
    const byIds = await request<ApiResponse<Product>>("GET", "/product", {
      query: {
        ids: missingAfterProductNumber.map((line) => line.ref).join(","),
        fields: "*",
      },
      expectedStatus: 200,
    });

    for (const product of getValues(byIds)) {
      const id = normalizeNumberString(product.id);
      const target = missingAfterProductNumber.find((line) => line.ref === id);
      if (target) {
        resolved.set(target.ref, product);
      }
    }
  }

  const stillMissing = lineSpecs.filter((line) => !resolved.has(line.ref));
  if (stillMissing.length > 0) {
    const allProducts = await request<ApiResponse<Product>>("GET", "/product", {
      query: {
        count: 1000,
        fields: "*",
      },
      expectedStatus: 200,
    });

    const values = getValues(allProducts);
    for (const target of stillMissing) {
      const numberMatch = values.find(
        (product) =>
          normalizeNumberString(product.number || product.productNumber) === target.ref,
      );
      if (numberMatch) {
        resolved.set(target.ref, numberMatch);
        continue;
      }

      const nameMatches = values.filter((product) => normalize(product.name) === target.name);
      if (nameMatches.length === 1) {
        resolved.set(target.ref, nameMatches[0]);
      }
    }
  }

  const unresolved = lineSpecs.filter((line) => !resolved.has(line.ref));
  if (unresolved.length > 0) {
    throw new Error(
      `Failed to resolve products: ${unresolved.map((line) => `${line.name} (${line.ref})`).join(", ")}`,
    );
  }

  return resolved;
}

async function resolveVatTypesByPercentage(): Promise<Map<number, VatType>> {
  const response = await request<ApiResponse<VatType>>("GET", "/ledger/vatType", {
    query: {
      typeOfVat: "OUTGOING",
      vatDate: INVOICE_DATE,
      fields: "*",
    },
    expectedStatus: 200,
  });

  const vatTypes = new Map<number, VatType>();
  for (const vatType of getValues(response)) {
    if (typeof vatType.percentage === "number" && !vatTypes.has(vatType.percentage)) {
      vatTypes.set(vatType.percentage, vatType);
    }
  }
  return vatTypes;
}

function chooseInvoiceBankAccount(accounts: LedgerAccount[]): LedgerAccount | undefined {
  return (
    accounts.find((account) => account.isInvoiceAccount) ??
    accounts.find((account) => normalizeNumberString(account.number) === "1920") ??
    accounts.find((account) => account.isBankAccount)
  );
}

async function repairBankAccount(): Promise<void> {
  const response = await request<ApiResponse<LedgerAccount>>("GET", "/ledger/account", {
    query: {
      isBankAccount: true,
      fields: "*",
    },
    expectedStatus: 200,
  });

  const account = chooseInvoiceBankAccount(getValues(response));
  if (!account) {
    throw new Error("Unable to find a bank account to repair for invoice creation");
  }

  await request<ApiResponse<LedgerAccount>>("PUT", `/ledger/account/${account.id}`, {
    body: {
      bankAccountNumber: "12345678903",
    },
    expectedStatus: [200, 201, 204],
  });
}

function getEffectiveOrderLines(invoice: Invoice): OrderLine[] {
  if (Array.isArray(invoice.orderLines) && invoice.orderLines.length > 0) {
    return invoice.orderLines;
  }
  if (Array.isArray(invoice.orders) && invoice.orders.length > 0) {
    return invoice.orders.flatMap((order) => order.orderLines ?? []);
  }
  return [];
}

async function createInvoice(
  customer: Customer,
  productsByRef: Map<string, Product>,
): Promise<Invoice> {
  const mismatchedVatLines = lineSpecs.filter((line) => {
    const product = productsByRef.get(line.ref);
    return product?.vatType?.percentage !== line.vatPercentage;
  });

  let vatTypesByPercentage = new Map<number, VatType>();
  if (mismatchedVatLines.length > 0) {
    vatTypesByPercentage = await resolveVatTypesByPercentage();
    for (const line of mismatchedVatLines) {
      if (!vatTypesByPercentage.has(line.vatPercentage)) {
        throw new Error(`Unable to resolve outgoing VAT type for ${line.vatPercentage}%`);
      }
    }
  }

  const orderLines = lineSpecs.map((line) => {
    const product = productsByRef.get(line.ref);
    if (!product) {
      throw new Error(`Missing resolved product for ${line.ref}`);
    }

    const payload: Record<string, unknown> = {
      product: { id: product.id },
      description: line.name,
      count: 1,
      unitPriceExcludingVatCurrency: line.unitPriceExcludingVatCurrency,
    };

    if (product.vatType?.percentage !== line.vatPercentage) {
      payload.vatType = { id: vatTypesByPercentage.get(line.vatPercentage)!.id };
    }

    return payload;
  });

  const body = {
    invoiceDate: INVOICE_DATE,
    invoiceDueDate: INVOICE_DUE_DATE,
    customer: { id: customer.id },
    orders: [
      {
        customer: { id: customer.id },
        orderDate: INVOICE_DATE,
        deliveryDate: DELIVERY_DATE,
        orderLines,
      },
    ],
  };

  try {
    const response = await request<ApiResponse<Invoice>>("POST", "/invoice", {
      query: {
        sendToCustomer: false,
      },
      body,
      expectedStatus: 201,
    });
    if (!response.value) {
      throw new Error("Invoice creation response missing value");
    }
    return response.value;
  } catch (error) {
    const status = (error as Error & { status?: number }).status;
    const data = (error as Error & { data?: unknown }).data;
    const text = JSON.stringify(data);
    const isBankAccountError =
      status === 422 &&
      text.includes("Faktura kan ikke opprettes før selskapet har registrert et bankkontonummer.");

    if (!isBankAccountError) {
      throw error;
    }

    await repairBankAccount();
    const retry = await request<ApiResponse<Invoice>>("POST", "/invoice", {
      query: {
        sendToCustomer: false,
      },
      body,
      expectedStatus: 201,
    });
    if (!retry.value) {
      throw new Error("Invoice creation retry response missing value");
    }
    return retry.value;
  }
}

async function verifyInvoice(invoiceId: number): Promise<Invoice> {
  const response = await request<ApiResponse<Invoice>>("GET", `/invoice/${invoiceId}`, {
    query: {
      fields: VERIFY_FIELDS,
    },
    expectedStatus: 200,
  });

  if (!response.value) {
    throw new Error(`Invoice verification response missing value for id ${invoiceId}`);
  }
  return response.value;
}

function verifyInvoiceMatches(invoice: Invoice): void {
  const lines = getEffectiveOrderLines(invoice);
  if (lines.length !== lineSpecs.length) {
    throw new Error(`Expected ${lineSpecs.length} invoice lines, got ${lines.length}`);
  }

  for (const expected of lineSpecs) {
    const matching = lines.find(
      (line) =>
        normalize(line.description) === expected.name ||
        normalizeNumberString(line.product?.number || line.product?.productNumber) === expected.ref,
    );

    if (!matching) {
      throw new Error(`Missing verified line for ${expected.name} (${expected.ref})`);
    }

    const actualRef = normalizeNumberString(matching.product?.number || matching.product?.productNumber);
    if (actualRef !== expected.ref) {
      throw new Error(
        `Wrong product on ${expected.name}: expected ${expected.ref}, got ${actualRef || "<empty>"}`,
      );
    }

    if (normalize(matching.description) !== expected.name) {
      throw new Error(
        `Wrong description on ${expected.ref}: expected ${expected.name}, got ${normalize(matching.description)}`,
      );
    }

    if (matching.count !== 1) {
      throw new Error(`Wrong count on ${expected.ref}: expected 1, got ${matching.count}`);
    }

    if (matching.unitPriceExcludingVatCurrency !== expected.unitPriceExcludingVatCurrency) {
      throw new Error(
        `Wrong unit price on ${expected.ref}: expected ${expected.unitPriceExcludingVatCurrency}, got ${matching.unitPriceExcludingVatCurrency}`,
      );
    }

    if (matching.vatType?.percentage !== expected.vatPercentage) {
      throw new Error(
        `Wrong VAT on ${expected.ref}: expected ${expected.vatPercentage}, got ${matching.vatType?.percentage}`,
      );
    }
  }
}

async function main(): Promise<void> {
  const customer = await resolveCustomer();
  const productsByRef = await resolveProducts();
  const created = await createInvoice(customer, productsByRef);
  const verified = await verifyInvoice(created.id);
  verifyInvoiceMatches(verified);

  const summary = {
    apiCalls,
    invoiceId: verified.id,
    invoiceNumber: verified.invoiceNumber,
    customerId: verified.customer?.id,
    customerName: verified.customer?.name,
    amountExcludingVat: verified.amountExcludingVat,
    amount: verified.amount,
    lines: getEffectiveOrderLines(verified).map((line) => ({
      productId: line.product?.id,
      productNumber: line.product?.number ?? line.product?.productNumber,
      description: line.description,
      count: line.count,
      unitPriceExcludingVatCurrency: line.unitPriceExcludingVatCurrency,
      vatPercentage: line.vatType?.percentage,
    })),
  };

  console.log(JSON.stringify(summary, null, 2));
}

await main();
