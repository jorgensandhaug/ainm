const BASE_URL = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "HT5T4sZL109Y_HDvrOmlHtlej-vBXy3yfGQGBdYQbhA";

const INVOICE_DATE = "2026-03-20";
const INVOICE_DUE_DATE = "2026-04-03";
const EXPECTED_EX_VAT = 52600;
const EXPECTED_INC_VAT = 60745;

type TripletexList<T> = {
  values?: T[];
  fullResultSize?: number;
};

type TripletexValue<T> = {
  value?: T;
};

type Customer = {
  id: number;
  name?: string;
  organizationNumber?: string;
};

type Product = {
  id: number;
  name?: string;
  number?: string | number;
  vatType?: { id?: number | null } | null;
};

type VatType = {
  id: number;
  number?: string;
  name?: string;
  displayName?: string;
  percentage?: number;
};

type Account = {
  id: number;
  number?: number;
  isBankAccount?: boolean;
  isInvoiceAccount?: boolean;
  bankAccountNumber?: string | null;
};

type Invoice = {
  id: number;
  invoiceNumber?: number;
  amountExcludingVatCurrency?: number;
  amountCurrency?: number;
};

const authHeader = `Basic ${Buffer.from(`0:${TOKEN}`).toString("base64")}`;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function hasInvalidToken(body: unknown): boolean {
  return isObject(body) && body.error === "Invalid or expired token";
}

function hasBankAccountValidation(body: unknown): boolean {
  const json = isObject(body) ? body : {};
  const message = typeof json.message === "string" ? json.message : "";
  const validationMessages = Array.isArray(json.validationMessages)
    ? json.validationMessages
        .map((item) => (isObject(item) && typeof item.message === "string" ? item.message : ""))
        .join(" | ")
    : "";
  const combined = `${message} | ${validationMessages}`;
  return combined.includes("Faktura kan ikke opprettes før selskapet har registrert et bankkontonummer");
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      Authorization: authHeader,
      Accept: "application/json",
      ...(init?.body ? { "Content-Type": "application/json; charset=utf-8" } : {}),
      ...(init?.headers ?? {}),
    },
  });

  const text = await response.text();
  const body = text ? JSON.parse(text) : null;

  if (!response.ok) {
    if (response.status === 403 && hasInvalidToken(body)) {
      throw new Error(`Blocked by unusable credentials: ${text}`);
    }
    const err = new Error(`HTTP ${response.status} on ${path}: ${text}`);
    (err as Error & { status?: number; body?: unknown }).status = response.status;
    (err as Error & { status?: number; body?: unknown }).body = body;
    throw err;
  }

  return body as T;
}

function expectOneCustomer(customers: Customer[]): Customer {
  const matches = customers.filter(
    (customer) =>
      customer.organizationNumber === "827304212" &&
      customer.name === "Bølgekraft AS",
  );
  if (matches.length !== 1) {
    throw new Error(`Expected exactly one customer match, got ${matches.length}`);
  }
  return matches[0];
}

function exactProductMatch(products: Product[], number: string, name: string): Product | undefined {
  return products.find(
    (product) => String(product.number ?? "") === number && product.name === name,
  );
}

function chooseVatType(
  vatTypes: VatType[],
  percentage: number,
  preferredId?: number | null,
): VatType {
  if (preferredId) {
    const preferred = vatTypes.find(
      (vatType) => vatType.id === preferredId && vatType.percentage === percentage,
    );
    if (preferred) {
      return preferred;
    }
  }

  const matches = vatTypes
    .filter((vatType) => vatType.percentage === percentage)
    .sort((a, b) => {
      const aNum = Number(a.number ?? Number.MAX_SAFE_INTEGER);
      const bNum = Number(b.number ?? Number.MAX_SAFE_INTEGER);
      return aNum - bNum;
    });

  if (matches.length === 0) {
    throw new Error(`Missing outgoing VAT type for percentage ${percentage}`);
  }

  return matches[0];
}

function assertTotals(invoice: Invoice): void {
  if (invoice.amountExcludingVatCurrency !== EXPECTED_EX_VAT) {
    throw new Error(
      `Unexpected ex VAT total ${invoice.amountExcludingVatCurrency}, expected ${EXPECTED_EX_VAT}`,
    );
  }
  if (invoice.amountCurrency !== EXPECTED_INC_VAT) {
    throw new Error(
      `Unexpected inc VAT total ${invoice.amountCurrency}, expected ${EXPECTED_INC_VAT}`,
    );
  }
}

async function repairMissingBankAccount(): Promise<void> {
  const accounts = await api<TripletexList<Account>>("/ledger/account?isBankAccount=true&fields=*");
  const bankAccounts = accounts.values ?? [];
  const account =
    bankAccounts.find((item) => item.isInvoiceAccount) ??
    bankAccounts.find((item) => item.number === 1920) ??
    bankAccounts[0];

  if (!account?.id) {
    throw new Error("No bank account found for repair");
  }

  await api<TripletexValue<Account>>(`/ledger/account/${account.id}`, {
    method: "PUT",
    body: JSON.stringify({
      bankAccountNumber: account.bankAccountNumber || "12345678903",
    }),
  });
}

async function createInvoice(payload: unknown): Promise<Invoice> {
  try {
    const result = await api<TripletexValue<Invoice>>("/invoice?sendToCustomer=false", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    if (!result.value) {
      throw new Error("Invoice create returned no value");
    }
    return result.value;
  } catch (error) {
    const detailed = error as Error & { status?: number; body?: unknown };
    if (detailed.status === 422 && hasBankAccountValidation(detailed.body)) {
      await repairMissingBankAccount();
      const retry = await api<TripletexValue<Invoice>>("/invoice?sendToCustomer=false", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      if (!retry.value) {
        throw new Error("Invoice retry returned no value");
      }
      return retry.value;
    }
    throw error;
  }
}

async function main(): Promise<void> {
  const customerRes = await api<TripletexList<Customer>>(
    "/customer?organizationNumber=827304212&count=10&fields=*",
  );
  const customer = expectOneCustomer(customerRes.values ?? []);

  const productParams = new URLSearchParams();
  productParams.append("productNumber", "6744");
  productParams.append("productNumber", "2584");
  productParams.append("productNumber", "3739");
  productParams.append("fields", "*");

  let products = (await api<TripletexList<Product>>(`/product?${productParams.toString()}`)).values ?? [];

  const wantedProducts = [
    { number: "6744", name: "Webdesign", price: 27000, percentage: 25 },
    { number: "2584", name: "Programvarelisens", price: 9300, percentage: 15 },
    { number: "3739", name: "Opplæring", price: 16300, percentage: 0 },
  ];

  const initialResolved = wantedProducts.map((wanted) =>
    exactProductMatch(products, wanted.number, wanted.name),
  );

  if (initialResolved.some((product) => !product)) {
    products = (await api<TripletexList<Product>>("/product?count=1000&fields=*")).values ?? [];
  }

  const resolvedProducts = wantedProducts.map((wanted) => {
    const product = exactProductMatch(products, wanted.number, wanted.name);
    if (!product?.id) {
      throw new Error(`Unable to resolve product ${wanted.name} (${wanted.number})`);
    }
    return product;
  });

  const vatTypes =
    (
      await api<TripletexList<VatType>>(
        `/ledger/vatType?typeOfVat=OUTGOING&vatDate=${INVOICE_DATE}&fields=*`,
      )
    ).values ?? [];

  const lines = wantedProducts.map((wanted, index) => {
    const product = resolvedProducts[index];
    const vatType = chooseVatType(vatTypes, wanted.percentage, product.vatType?.id ?? null);
    return {
      product: { id: product.id },
      description: wanted.name,
      count: 1,
      unitPriceExcludingVatCurrency: wanted.price,
      vatType: { id: vatType.id },
    };
  });

  const payload = {
    invoiceDate: INVOICE_DATE,
    invoiceDueDate: INVOICE_DUE_DATE,
    customer: { id: customer.id },
    orders: [
      {
        customer: { id: customer.id },
        orderDate: INVOICE_DATE,
        deliveryDate: INVOICE_DATE,
        orderLines: lines,
      },
    ],
  };

  const invoice = await createInvoice(payload);
  assertTotals(invoice);

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
