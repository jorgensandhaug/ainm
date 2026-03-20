const BASE_URL = "https://kkpqfuj-amager.tripletex.dev/v2";
const SESSION_TOKEN =
  "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH_HEADER = `Basic ${Buffer.from(`0:${SESSION_TOKEN}`).toString("base64")}`;
const DATE = "2026-03-20";
const DUE_DATE = "2026-04-03";
const VERIFY_FIELDS =
  "*,customer(*),orders(*,orderLines(*,product(*),vatType(*))),orderLines(*,product(*),vatType(*))";

let apiCalls = 0;

type ApiResponse<T> = {
  value?: T;
  values?: T[];
  [key: string]: unknown;
};

type VatType = {
  id: number;
  percentage?: number;
  number?: string;
  name?: string;
};

type Customer = {
  id: number;
  name?: string;
  organizationNumber?: string;
};

type Product = {
  id: number;
  number?: string | number;
  name?: string;
  vatType?: VatType | null;
};

type LedgerAccount = {
  id: number;
  number?: string | number;
  isInvoiceAccount?: boolean;
  isBankAccount?: boolean;
};

type OrderLine = {
  id?: number;
  url?: string;
  description?: string;
  unitPriceExcludingVatCurrency?: number;
  count?: number;
  product?: Product | null;
  vatType?: VatType | null;
};

type Invoice = {
  id: number;
  invoiceNumber?: number;
  amount?: number;
  amountExcludingVat?: number;
  orderLines?: OrderLine[];
  orders?: { orderLines?: OrderLine[] }[];
};

function norm(value: unknown): string {
  return String(value ?? "").trim();
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
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(options.query)) {
      if (value !== undefined) {
        params.append(key, String(value));
      }
    }
    url.search = params.toString();
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
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  const expected = Array.isArray(options.expectedStatus)
    ? options.expectedStatus
    : options.expectedStatus !== undefined
      ? [options.expectedStatus]
      : [200];

  if (!expected.includes(response.status)) {
    const error = new Error(`HTTP ${response.status} for ${method} ${url.pathname}${url.search}`);
    (error as Error & { status?: number; data?: unknown }).status = response.status;
    (error as Error & { data?: unknown }).data = data;
    throw error;
  }

  return data as T;
}

function getValues<T>(response: ApiResponse<T>): T[] {
  return Array.isArray(response.values) ? response.values : [];
}

function getInvoiceLines(invoice: Invoice): OrderLine[] {
  if (Array.isArray(invoice.orderLines) && invoice.orderLines.length > 0) {
    return invoice.orderLines;
  }
  return (invoice.orders ?? []).flatMap((order) => order.orderLines ?? []);
}

function chooseInvoiceBankAccount(accounts: LedgerAccount[]): LedgerAccount | undefined {
  return (
    accounts.find((account) => account.isInvoiceAccount) ??
    accounts.find((account) => norm(account.number) === "1920") ??
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
    throw new Error("No bank account found for repair");
  }
  await request("PUT", `/ledger/account/${account.id}`, {
    body: { bankAccountNumber: "12345678903" },
    expectedStatus: [200, 201, 204],
  });
}

async function main(): Promise<void> {
  const vatTypes = await request<ApiResponse<VatType>>("GET", "/ledger/vatType", {
    query: {
      typeOfVat: "OUTGOING",
      vatDate: DATE,
      fields: "*",
    },
    expectedStatus: 200,
  });
  const vat0 = getValues(vatTypes).find((vatType) => vatType.percentage === 0);
  if (!vat0) {
    throw new Error("Sandbox did not expose a 0% outgoing VAT type");
  }

  const suffix = `${Date.now()}`.slice(-6);
  const customerOrg = `999${suffix}`;
  const customerName = `Invoice Flow Proof ${suffix} AS`;
  const email = `invoice-proof-${suffix}@example.no`;
  const productNumbers = [`67${suffix}`, `25${suffix}`, `37${suffix}`];

  const createdCustomer = await request<ApiResponse<Customer>>("POST", "/customer", {
    body: {
      name: customerName,
      email,
      organizationNumber: customerOrg,
    },
    expectedStatus: 201,
  });
  if (!createdCustomer.value) {
    throw new Error("Customer create missing value");
  }

  const createdProducts: Product[] = [];
  for (const [index, spec] of [
    { name: "Webdesign", price: 27000 },
    { name: "Programvarelisens", price: 9300 },
    { name: "Opplæring", price: 16300 },
  ].entries()) {
    const createdProduct = await request<ApiResponse<Product>>("POST", "/product", {
      body: {
        name: `${spec.name} Sandbox Proof ${suffix}`,
        number: productNumbers[index],
        priceExcludingVatCurrency: spec.price,
        vatType: { id: vat0.id },
      },
      expectedStatus: 201,
    });
    if (!createdProduct.value) {
      throw new Error(`Product create missing value for ${spec.name}`);
    }
    createdProducts.push(createdProduct.value);
  }

  const resolvedCustomer = await request<ApiResponse<Customer>>("GET", "/customer", {
    query: {
      organizationNumber: customerOrg,
      fields: "*",
    },
    expectedStatus: 200,
  });
  if (getValues(resolvedCustomer).length !== 1) {
    throw new Error("Expected exactly one resolved sandbox customer");
  }

  const productQuery = new URLSearchParams();
  for (const number of productNumbers) {
    productQuery.append("productNumber", number);
  }
  productQuery.append("fields", "*");

  const resolvedProducts = await request<ApiResponse<Product>>("GET", "/product", {
    query: productQuery,
    expectedStatus: 200,
  });
  const resolvedProductValues = getValues(resolvedProducts);
  if (resolvedProductValues.length !== 3) {
    throw new Error(`Expected 3 resolved sandbox products, got ${resolvedProductValues.length}`);
  }

  const productByNumber = new Map<string, Product>();
  for (const product of resolvedProductValues) {
    productByNumber.set(norm(product.number), product);
  }

  const orderLines = [
    { ref: productNumbers[0], description: "Webdesign", price: 27000 },
    { ref: productNumbers[1], description: "Programvarelisens", price: 9300 },
    { ref: productNumbers[2], description: "Opplæring", price: 16300 },
  ].map((spec) => ({
    product: { id: productByNumber.get(spec.ref)!.id },
    description: spec.description,
    count: 1,
    unitPriceExcludingVatCurrency: spec.price,
  }));

  const invoiceBody = {
    invoiceDate: DATE,
    invoiceDueDate: DUE_DATE,
    customer: { id: getValues(resolvedCustomer)[0].id },
    orders: [
      {
        customer: { id: getValues(resolvedCustomer)[0].id },
        orderDate: DATE,
        deliveryDate: DATE,
        orderLines,
      },
    ],
  };

  let invoiceWrite: ApiResponse<Invoice>;
  try {
    invoiceWrite = await request<ApiResponse<Invoice>>("POST", "/invoice", {
      query: { sendToCustomer: false },
      body: invoiceBody,
      expectedStatus: 201,
    });
  } catch (error) {
    const status = (error as Error & { status?: number }).status;
    const data = (error as Error & { data?: unknown }).data;
    if (
      status === 422 &&
      JSON.stringify(data).includes(
        "Faktura kan ikke opprettes før selskapet har registrert et bankkontonummer.",
      )
    ) {
      await repairBankAccount();
      invoiceWrite = await request<ApiResponse<Invoice>>("POST", "/invoice", {
        query: { sendToCustomer: false },
        body: invoiceBody,
        expectedStatus: 201,
      });
    } else {
      throw error;
    }
  }

  if (!invoiceWrite.value) {
    throw new Error("Invoice write missing value");
  }

  const verifiedInvoice = await request<ApiResponse<Invoice>>("GET", `/invoice/${invoiceWrite.value.id}`, {
    query: {
      fields: VERIFY_FIELDS,
    },
    expectedStatus: 200,
  });
  if (!verifiedInvoice.value) {
    throw new Error("Verified invoice missing value");
  }

  const writeOrderLines = invoiceWrite.value.orderLines ?? [];
  const verifiedLines = getInvoiceLines(verifiedInvoice.value);

  console.log(
    JSON.stringify(
      {
        apiCalls,
        sandboxLimit: {
          outgoingVatPercentages: getValues(vatTypes).map((vatType) => vatType.percentage),
          mixed25150ReplayPossible: false,
        },
        createdCustomer: createdCustomer.value,
        createdProducts,
        invoiceWrite: {
          id: invoiceWrite.value.id,
          invoiceNumber: invoiceWrite.value.invoiceNumber,
          amountExcludingVat: invoiceWrite.value.amountExcludingVat,
          amount: invoiceWrite.value.amount,
          orderLinesLength: writeOrderLines.length,
          sparseOrderLines: writeOrderLines.every((line) => !!line.id && !line.description && !line.product),
        },
        verifiedInvoice: {
          id: verifiedInvoice.value.id,
          invoiceNumber: verifiedInvoice.value.invoiceNumber,
          amountExcludingVat: verifiedInvoice.value.amountExcludingVat,
          amount: verifiedInvoice.value.amount,
          lines: verifiedLines.map((line) => ({
            productNumber: line.product?.number,
            description: line.description,
            count: line.count,
            unitPriceExcludingVatCurrency: line.unitPriceExcludingVatCurrency,
            vatPercentage: line.vatType?.percentage,
          })),
        },
      },
      null,
      2,
    ),
  );
}

await main();
