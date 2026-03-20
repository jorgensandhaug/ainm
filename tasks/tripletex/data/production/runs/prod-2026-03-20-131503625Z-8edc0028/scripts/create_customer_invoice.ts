const BASE_URL = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const SESSION_TOKEN = "WX91iLwjlEOLe9shlY4oZRAP_us-syvD3jdsnR3T4z0";

const INVOICE_DATE = "2026-03-20";
const INVOICE_DUE_DATE = "2026-04-03";
const CUSTOMER_ORG_NO = "944182802";
const CUSTOMER_NAME = "Floresta Lda";

type EntityRef = { id: number; url?: string };
type VatType = {
  id: number;
  name?: string;
  displayName?: string;
  number?: string;
  percentage?: number;
};
type Customer = {
  id: number;
  customerName?: string;
  name?: string;
  organizationNumber?: string;
};
type Product = {
  id: number;
  name?: string;
  number?: string;
  vatType?: VatType | null;
};
type Account = {
  id: number;
  number?: number;
  name?: string;
  isBankAccount?: boolean;
  isInvoiceAccount?: boolean;
  bankAccountNumber?: string;
};
type OrderLine = {
  id?: number;
  product?: Product | EntityRef | null;
  description?: string;
  count?: number;
  unitPriceExcludingVatCurrency?: number;
  amountExcludingVatCurrency?: number;
  vatType?: VatType | null;
};
type Order = {
  id?: number;
  orderLines?: OrderLine[];
};
type Invoice = {
  id: number;
  invoiceNumber?: number | string;
  customer?: Customer | EntityRef | null;
  amount?: number;
  amountCurrency?: number;
  amountExcludingVat?: number;
  amountExcludingVatCurrency?: number;
  orderLines?: OrderLine[];
  orders?: Order[];
};
type ListResponse<T> = { values?: T[]; fullResultSize?: number };
type Wrapper<T> = { value?: T };
type Maybe<T> = T | undefined;

const desiredLines = [
  {
    productNumber: "2039",
    description: "Relatório de análise",
    unitPriceExcludingVatCurrency: 19600,
    vatPercentage: 25,
  },
  {
    productNumber: "3304",
    description: "Design web",
    unitPriceExcludingVatCurrency: 12450,
    vatPercentage: 15,
  },
  {
    productNumber: "1599",
    description: "Licença de software",
    unitPriceExcludingVatCurrency: 9150,
    vatPercentage: 0,
  },
] as const;

const expectedAmountExVat = desiredLines.reduce(
  (sum, line) => sum + line.unitPriceExcludingVatCurrency,
  0,
);
const expectedAmountIncVat = desiredLines.reduce(
  (sum, line) =>
    sum +
    line.unitPriceExcludingVatCurrency * (1 + line.vatPercentage / 100),
  0,
);

function authHeader() {
  return `Basic ${Buffer.from(`0:${SESSION_TOKEN}`).toString("base64")}`;
}

async function tripletex<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      Authorization: authHeader(),
      Accept: "application/json",
      ...(init?.body ? { "Content-Type": "application/json; charset=utf-8" } : {}),
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`HTTP ${response.status} ${response.statusText} for ${path}\n${body}`);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function getProductNumber(product: Product | EntityRef | null | undefined): string | undefined {
  if (!product || typeof product !== "object") return undefined;
  return "number" in product && typeof product.number === "string" ? product.number : undefined;
}

function getCustomerName(customer: Customer | EntityRef | null | undefined): string | undefined {
  if (!customer || typeof customer !== "object") return undefined;
  if ("customerName" in customer && typeof customer.customerName === "string") return customer.customerName;
  if ("name" in customer && typeof customer.name === "string") return customer.name;
  return undefined;
}

function almostEqual(a: number | undefined, b: number, epsilon = 0.001): boolean {
  return typeof a === "number" && Math.abs(a - b) <= epsilon;
}

function flattenInvoiceLines(invoice: Invoice): OrderLine[] {
  const top = Array.isArray(invoice.orderLines) ? invoice.orderLines : [];
  if (top.length > 0) return top;
  return (invoice.orders ?? []).flatMap((order) => order.orderLines ?? []);
}

function linesHaveDetail(lines: OrderLine[]): boolean {
  return lines.every(
    (line) =>
      !!getProductNumber(line.product) &&
      typeof line.description === "string" &&
      typeof line.unitPriceExcludingVatCurrency === "number" &&
      typeof line.vatType?.percentage === "number",
  );
}

function invoiceHasDesiredLines(invoice: Invoice): boolean {
  const lines = flattenInvoiceLines(invoice);
  if (lines.length !== desiredLines.length || !linesHaveDetail(lines)) return false;

  return desiredLines.every((expected) =>
    lines.some((line) => {
      const productNumber = getProductNumber(line.product);
      const vatPercentage = line.vatType?.percentage;
      return (
        productNumber === expected.productNumber &&
        line.description === expected.description &&
        almostEqual(line.unitPriceExcludingVatCurrency, expected.unitPriceExcludingVatCurrency) &&
        vatPercentage === expected.vatPercentage
      );
    }),
  );
}

function chooseVatTypeByPercentage(vatTypes: VatType[], percentage: number): VatType | undefined {
  const matches = vatTypes.filter((vatType) => vatType.percentage === percentage);
  if (matches.length === 1) return matches[0];

  const patterns =
    percentage === 25
      ? [/h[oø]y/i, /high/i, /25/]
      : percentage === 15
        ? [/mid/i, /mellom/i, /n[æa]rings/i, /food/i, /15/]
        : [/frit/i, /unnt/i, /ingen/i, /0/];

  return matches.find((vatType) =>
    patterns.some((pattern) =>
      pattern.test(
        `${vatType.displayName ?? ""} ${vatType.name ?? ""} ${vatType.number ?? ""}`.trim(),
      ),
    ),
  );
}

function verifyInvoice(invoice: Invoice) {
  assert(invoice.id, "Missing invoice id");
  assert(
    almostEqual(invoice.amountExcludingVatCurrency ?? invoice.amountExcludingVat, expectedAmountExVat),
    `Unexpected ex VAT total: ${invoice.amountExcludingVatCurrency ?? invoice.amountExcludingVat}`,
  );
  assert(
    almostEqual(invoice.amountCurrency ?? invoice.amount, expectedAmountIncVat),
    `Unexpected inc VAT total: ${invoice.amountCurrency ?? invoice.amount}`,
  );

  const customerName = getCustomerName(invoice.customer);
  if (customerName) {
    assert(customerName === CUSTOMER_NAME, `Unexpected customer name: ${customerName}`);
  }

  const lines = flattenInvoiceLines(invoice);
  if (lines.length > 0 && linesHaveDetail(lines)) {
    assert(invoiceHasDesiredLines(invoice), "Invoice line details do not match request");
  }
}

async function repairMissingCompanyBankAccount() {
  const accountResp = await tripletex<ListResponse<Account>>(
    "/ledger/account?isBankAccount=true&fields=*",
  );
  const accounts = (accountResp.values ?? []).filter((account) => account.isBankAccount);
  assert(accounts.length >= 1, "No bank account found for repair");

  const account =
    accounts.find((entry) => entry.isInvoiceAccount) ??
    accounts.find((entry) => entry.number === 1920) ??
    accounts[0];
  assert(account?.id, "No suitable bank account found for repair");

  await tripletex<Wrapper<Account>>(`/ledger/account/${account.id}`, {
    method: "PUT",
    body: JSON.stringify({
      bankAccountNumber: "12345678903",
    }),
  });
}

async function fetchDetailedInvoice(invoiceId: number): Promise<Invoice> {
  const verifyResp = await tripletex<Wrapper<Invoice>>(
    `/invoice/${invoiceId}?fields=${encodeURIComponent(
      "*,customer(*),orders(*,orderLines(*,product(*),vatType(*))),orderLines(*,product(*),vatType(*))",
    )}`,
  );
  assert(verifyResp.value, "Invoice verification returned no value");
  return verifyResp.value;
}

async function findExistingMatchingInvoice(customerId: number): Promise<Maybe<Invoice>> {
  const invoiceResp = await tripletex<ListResponse<Invoice>>(
    `/invoice?invoiceDateFrom=${INVOICE_DATE}&invoiceDateTo=2026-03-21&customerId=${customerId}&fields=${encodeURIComponent(
      "*,customer(*),orders(*,orderLines(*,product(*),vatType(*))),orderLines(*,product(*),vatType(*))",
    )}`,
  );
  const invoices = invoiceResp.values ?? [];

  const matches = invoices.filter(
    (invoice) =>
      almostEqual(invoice.amountExcludingVatCurrency ?? invoice.amountExcludingVat, expectedAmountExVat) &&
      almostEqual(invoice.amountCurrency ?? invoice.amount, expectedAmountIncVat) &&
      invoiceHasDesiredLines(invoice),
  );

  return matches.sort((a, b) => b.id - a.id)[0];
}

async function main() {
  const customerResp = await tripletex<ListResponse<Customer>>(
    `/customer?organizationNumber=${encodeURIComponent(CUSTOMER_ORG_NO)}&fields=*`,
  );
  const customers = customerResp.values ?? [];
  assert(customers.length >= 1, "Customer not found");
  const customer =
    customers.find(
      (entry) =>
        entry.organizationNumber === CUSTOMER_ORG_NO &&
        getCustomerName(entry) === CUSTOMER_NAME,
    ) ?? customers.find((entry) => entry.organizationNumber === CUSTOMER_ORG_NO);
  assert(customer, "Exact customer not found");

  const existingInvoice = await findExistingMatchingInvoice(customer.id);
  if (existingInvoice) {
    verifyInvoice(existingInvoice);
    console.log(
      JSON.stringify(
        {
          invoiceId: existingInvoice.id,
          invoiceNumber: existingInvoice.invoiceNumber,
          customerId: customer.id,
          amountExcludingVatCurrency:
            existingInvoice.amountExcludingVatCurrency ?? existingInvoice.amountExcludingVat,
          amountCurrency: existingInvoice.amountCurrency ?? existingInvoice.amount,
        },
        null,
        2,
      ),
    );
    return;
  }

  const desiredProductNumbers = desiredLines.map((line) => line.productNumber);
  const productQuery = desiredProductNumbers
    .map((productNumber) => `productNumber=${encodeURIComponent(productNumber)}`)
    .join("&");

  let products = (await tripletex<ListResponse<Product>>(`/product?${productQuery}&fields=*`)).values ?? [];
  if (products.length !== desiredLines.length) {
    products =
      (await tripletex<ListResponse<Product>>(
        `/product?ids=${encodeURIComponent(desiredProductNumbers.join(","))}&fields=*`,
      )).values ?? [];
  }
  if (products.length !== desiredLines.length) {
    const allProducts =
      (await tripletex<ListResponse<Product>>(`/product?count=1000&fields=*`)).values ?? [];
    products = allProducts.filter((product) => desiredProductNumbers.includes(product.number ?? ""));
  }
  assert(products.length === desiredLines.length, `Expected 3 products, got ${products.length}`);

  const productMap = new Map(products.map((product) => [product.number, product]));
  const linesNeedingVatFallback = desiredLines.filter((line) => {
    const product = productMap.get(line.productNumber);
    return !product || product.vatType?.percentage !== line.vatPercentage;
  });

  let vatTypeByPercentage = new Map<number, VatType>();
  if (linesNeedingVatFallback.length > 0) {
    const vatResp = await tripletex<ListResponse<VatType>>(
      `/ledger/vatType?typeOfVat=OUTGOING&vatDate=${INVOICE_DATE}&fields=*`,
    );
    const vatTypes = vatResp.values ?? [];
    for (const line of desiredLines) {
      const vatType = chooseVatTypeByPercentage(vatTypes, line.vatPercentage);
      assert(vatType, `Could not resolve VAT ${line.vatPercentage}%`);
      vatTypeByPercentage.set(line.vatPercentage, vatType);
    }
  }

  const payload = {
    invoiceDate: INVOICE_DATE,
    invoiceDueDate: INVOICE_DUE_DATE,
    customer: { id: customer.id },
    orders: [
      {
        customer: { id: customer.id },
        orderDate: INVOICE_DATE,
        deliveryDate: INVOICE_DATE,
        orderLines: desiredLines.map((line) => {
          const product = productMap.get(line.productNumber);
          assert(product, `Product ${line.productNumber} not found`);

          const vatType =
            product.vatType?.percentage === line.vatPercentage
              ? product.vatType
              : vatTypeByPercentage.get(line.vatPercentage);
          assert(vatType?.id, `VAT missing for product ${line.productNumber}`);

          return {
            product: { id: product.id },
            description: line.description,
            count: 1,
            unitPriceExcludingVatCurrency: line.unitPriceExcludingVatCurrency,
            vatType: { id: vatType.id },
          };
        }),
      },
    ],
  };

  let createResp: Wrapper<Invoice>;
  try {
    createResp = await tripletex<Wrapper<Invoice>>("/invoice?sendToCustomer=false", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes("bankkontonummer")) throw error;
    await repairMissingCompanyBankAccount();
    createResp = await tripletex<Wrapper<Invoice>>("/invoice?sendToCustomer=false", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }
  const created = createResp.value;
  assert(created, "Invoice create returned no value");

  const createdLines = flattenInvoiceLines(created);
  const sparseLineCount = createdLines.length;
  const hasTotals =
    typeof (created.amountExcludingVatCurrency ?? created.amountExcludingVat) === "number" &&
    typeof (created.amountCurrency ?? created.amount) === "number";
  const hasDetailedLines = sparseLineCount === desiredLines.length && linesHaveDetail(createdLines);

  let verifiedInvoice = created;
  if (!hasTotals || !hasDetailedLines) {
    verifiedInvoice = await fetchDetailedInvoice(created.id);
  }

  verifyInvoice(verifiedInvoice);

  console.log(
    JSON.stringify(
      {
        invoiceId: verifiedInvoice.id,
        invoiceNumber: verifiedInvoice.invoiceNumber,
        customerId: customer.id,
        amountExcludingVatCurrency:
          verifiedInvoice.amountExcludingVatCurrency ?? verifiedInvoice.amountExcludingVat,
        amountCurrency: verifiedInvoice.amountCurrency ?? verifiedInvoice.amount,
      },
      null,
      2,
    ),
  );
}

await main();
