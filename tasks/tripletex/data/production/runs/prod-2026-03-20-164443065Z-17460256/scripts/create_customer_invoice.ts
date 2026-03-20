const BASE_URL = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const SESSION_TOKEN = "WXhQRGGHwnDi1djU6sEKsNLamrO5xV1x7BYBiI5KdnA";

const INVOICE_DATE = "2026-03-20";
const DUE_DATE = "2026-04-03";

const CUSTOMER = {
  name: "Lysgård AS",
  organizationNumber: "851635874",
};

const LINES = [
  {
    description: "Analyserapport",
    productNumber: "2934",
    unitPriceExcludingVatCurrency: 29800,
    vatPercentage: 25,
  },
  {
    description: "Datarådgivning",
    productNumber: "8699",
    unitPriceExcludingVatCurrency: 5200,
    vatPercentage: 15,
  },
  {
    description: "Nettverkstjeneste",
    productNumber: "1355",
    unitPriceExcludingVatCurrency: 18050,
    vatPercentage: 0,
  },
] as const;

type WrappedList<T> = { values?: T[]; fullResultSize?: number };
type WrappedValue<T> = { value?: T };

type TxEntity = Record<string, unknown> & {
  id: number;
  name?: string;
  number?: string;
  productNumber?: string;
  organizationNumber?: string;
  percentage?: number;
  bankAccountNumber?: string | null;
  isInvoiceAccount?: boolean;
  isBankAccount?: boolean;
};

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

function basicAuthHeader(token: string): string {
  return `Basic ${Buffer.from(`0:${token}`).toString("base64")}`;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers ?? {});
  headers.set("Authorization", basicAuthHeader(SESSION_TOKEN));
  headers.set("Accept", "application/json");
  if (init.body !== undefined && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers,
  });

  const bodyText = await response.text();
  let bodyJson: unknown = null;
  if (bodyText) {
    try {
      bodyJson = JSON.parse(bodyText);
    } catch {
      bodyJson = bodyText;
    }
  }

  if (response.status === 403) {
    const errorValue =
      bodyJson && typeof bodyJson === "object" && bodyJson !== null
        ? (bodyJson as Record<string, unknown>).error
        : undefined;
    if (errorValue === "Invalid or expired token") {
      throw new Error("Blocked: invalid or expired token");
    }
  }

  if (!response.ok) {
    throw new HttpError(response.status, bodyText, bodyJson);
  }

  return bodyJson as T;
}

function expectSingle<T extends TxEntity>(
  values: T[] | undefined,
  label: string,
  predicate: (value: T) => boolean,
): T {
  const matches = (values ?? []).filter(predicate);
  if (matches.length !== 1) {
    throw new Error(`${label}: expected exactly 1 match, got ${matches.length}`);
  }
  return matches[0];
}

function getValidationMessages(error: unknown): string[] {
  if (!(error instanceof HttpError)) return [];
  if (!error.bodyJson || typeof error.bodyJson !== "object") return [];
  const candidate = (error.bodyJson as Record<string, unknown>).validationMessages;
  if (!Array.isArray(candidate)) return [];
  return candidate
    .map((item) => {
      if (!item || typeof item !== "object") return "";
      const msg = (item as Record<string, unknown>).message;
      return typeof msg === "string" ? msg : "";
    })
    .filter(Boolean);
}

async function repairBankAccountIfNeeded(): Promise<void> {
  const accountResp = await request<WrappedList<TxEntity>>(
    "/ledger/account?isBankAccount=true&fields=*",
  );
  const accounts = accountResp.values ?? [];
  const account =
    accounts.find((item) => item.isInvoiceAccount === true) ??
    accounts.find((item) => item.isBankAccount === true) ??
    accounts[0];

  if (!account) {
    throw new Error("No bank account available for repair");
  }

  if (account.bankAccountNumber) {
    return;
  }

  await request<void>(`/ledger/account/${account.id}`, {
    method: "PUT",
    body: JSON.stringify({
      bankAccountNumber: "12345678903",
    }),
  });
}

async function createInvoice(customerId: number, products: TxEntity[], vatTypes: TxEntity[]) {
  const vatTypeByPercentage = new Map<number, TxEntity>();
  for (const vatType of vatTypes) {
    if (typeof vatType.percentage === "number" && !vatTypeByPercentage.has(vatType.percentage)) {
      vatTypeByPercentage.set(vatType.percentage, vatType);
    }
  }

  const productByNumber = new Map<string, TxEntity>();
  for (const product of products) {
    const key =
      typeof product.productNumber === "string"
        ? product.productNumber
        : typeof product.number === "string"
          ? product.number
          : undefined;
    if (key) {
      productByNumber.set(key, product);
    }
  }

  const orderLines = LINES.map((line) => {
    const product = productByNumber.get(line.productNumber);
    if (!product) {
      throw new Error(`Missing product ${line.productNumber}`);
    }
    const vatType = vatTypeByPercentage.get(line.vatPercentage);
    if (!vatType) {
      throw new Error(`Missing outgoing VAT ${line.vatPercentage}%`);
    }

    return {
      product: { id: product.id },
      description: line.description,
      count: 1,
      unitPriceExcludingVatCurrency: line.unitPriceExcludingVatCurrency,
      vatType: { id: vatType.id },
    };
  });

  const payload = {
    invoiceDate: INVOICE_DATE,
    invoiceDueDate: DUE_DATE,
    customer: { id: customerId },
    orders: [
      {
        customer: { id: customerId },
        orderDate: INVOICE_DATE,
        deliveryDate: INVOICE_DATE,
        orderLines,
      },
    ],
  };

  try {
    return await request<WrappedValue<Record<string, unknown>>>("/invoice?sendToCustomer=false", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  } catch (error) {
    const validations = getValidationMessages(error);
    const missingBankAccount = validations.some((msg) =>
      msg.includes("Faktura kan ikke opprettes før selskapet har registrert et bankkontonummer."),
    );

    if (!missingBankAccount) {
      throw error;
    }

    await repairBankAccountIfNeeded();

    return await request<WrappedValue<Record<string, unknown>>>("/invoice?sendToCustomer=false", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }
}

function productKey(product: TxEntity): string | undefined {
  if (typeof product.productNumber === "string") return product.productNumber;
  if (typeof product.number === "string") return product.number;
  return undefined;
}

function resolveProductsFromCatalog(products: TxEntity[]): TxEntity[] {
  return LINES.map((line) => {
    const exactByNumber = products.filter(
      (product) => productKey(product) === line.productNumber,
    );
    if (exactByNumber.length === 1) {
      return exactByNumber[0];
    }

    const exactByName = products.filter((product) => product.name === line.description);
    if (exactByName.length === 1) {
      return exactByName[0];
    }

    const combined = products.filter(
      (product) =>
        productKey(product) === line.productNumber || product.name === line.description,
    );
    throw new Error(
      `Unable to resolve product ${line.productNumber}/${line.description}; candidates=${combined.length}`,
    );
  });
}

async function main() {
  const customerResp = await request<WrappedList<TxEntity>>(
    `/customer?organizationNumber=${encodeURIComponent(CUSTOMER.organizationNumber)}&fields=*`,
  );
  const customer = expectSingle(
    customerResp.values,
    "customer",
    (value) => value.organizationNumber === CUSTOMER.organizationNumber,
  );

  const productParams = new URLSearchParams();
  for (const line of LINES) {
    productParams.append("productNumber", line.productNumber);
  }
  productParams.set("fields", "*");

  const productResp = await request<WrappedList<TxEntity>>(`/product?${productParams.toString()}`);
  const products = productResp.values ?? [];
  for (const line of LINES) {
    const matches = products.filter(
      (product) =>
        product.productNumber === line.productNumber || product.number === line.productNumber,
    );
    if (matches.length === 1) {
      continue;
    }
    const catalogResp = await request<WrappedList<TxEntity>>("/product?count=1000&fields=*");
    const resolvedProducts = resolveProductsFromCatalog(catalogResp.values ?? []);

    const vatResp = await request<WrappedList<TxEntity>>(
      `/ledger/vatType?typeOfVat=OUTGOING&vatDate=${INVOICE_DATE}&fields=*`,
    );
    const vatTypes = vatResp.values ?? [];
    for (const percentage of [25, 15, 0]) {
      const vatMatches = vatTypes.filter((vatType) => vatType.percentage === percentage);
      if (vatMatches.length < 1) {
        throw new Error(`Missing outgoing VAT ${percentage}% in account`);
      }
    }

    const invoiceResp = await createInvoice(customer.id, resolvedProducts, vatTypes);
    const invoice = invoiceResp.value ?? {};
    console.log(
      JSON.stringify(
        {
          customerId: customer.id,
          invoiceId: invoice["id"],
          invoiceNumber: invoice["invoiceNumber"],
          amountExcludingVatCurrency: invoice["amountExcludingVatCurrency"],
          amountVatCurrency: invoice["amountVatCurrency"],
          amountCurrency: invoice["amountCurrency"],
        },
        null,
        2,
      ),
    );
    return;
  }

  const vatResp = await request<WrappedList<TxEntity>>(
    `/ledger/vatType?typeOfVat=OUTGOING&vatDate=${INVOICE_DATE}&fields=*`,
  );
  const vatTypes = vatResp.values ?? [];
  for (const percentage of [25, 15, 0]) {
    const matches = vatTypes.filter((vatType) => vatType.percentage === percentage);
    if (matches.length < 1) {
      throw new Error(`Missing outgoing VAT ${percentage}% in account`);
    }
  }

  const invoiceResp = await createInvoice(customer.id, products, vatTypes);
  const invoice = invoiceResp.value ?? {};
  console.log(
    JSON.stringify(
      {
        customerId: customer.id,
        invoiceId: invoice["id"],
        invoiceNumber: invoice["invoiceNumber"],
        amountExcludingVatCurrency: invoice["amountExcludingVatCurrency"],
        amountVatCurrency: invoice["amountVatCurrency"],
        amountCurrency: invoice["amountCurrency"],
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  if (error instanceof Error) {
    console.error(error.message);
  } else {
    console.error(String(error));
  }
  process.exit(1);
});
