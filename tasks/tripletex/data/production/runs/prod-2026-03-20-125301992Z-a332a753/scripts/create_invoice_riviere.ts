const BASE_URL = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "axg4go_eGi3slEZ94Bzw6QEViXbvOazTCy_Sb92zVOc";
const INVOICE_DATE = "2026-03-20";

const CUSTOMER_NAME = "Rivière SARL";
const ORGANIZATION_NUMBER = "909579791";

const LINE_SPECS = [
  {
    description: "Maintenance",
    productNumber: "6481",
    unitPriceExcludingVatCurrency: 28100,
    vatPercentage: 25,
    vatHint: "standard",
  },
  {
    description: "Design web",
    productNumber: "2618",
    unitPriceExcludingVatCurrency: 12600,
    vatPercentage: 15,
    vatHint: "food",
  },
  {
    description: "Développement système",
    productNumber: "8754",
    unitPriceExcludingVatCurrency: 1800,
    vatPercentage: 0,
    vatHint: "exempt",
  },
] as const;

const authHeader = `Basic ${Buffer.from(`0:${TOKEN}`).toString("base64")}`;

class ApiError extends Error {
  status: number;
  body: any;

  constructor(status: number, body: any, message: string) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

function addDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function normalize(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

async function api<T = any>(
  method: string,
  path: string,
  options: {
    query?: Array<[string, string]>;
    body?: any;
  } = {},
): Promise<T> {
  const url = new URL(`${BASE_URL}${path}`);
  for (const [key, value] of options.query ?? []) {
    url.searchParams.append(key, value);
  }

  const response = await fetch(url, {
    method,
    headers: {
      Authorization: authHeader,
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json; charset=utf-8" } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const text = await response.text();
  const body = text ? safeJsonParse(text) : null;

  if (!response.ok) {
    throw new ApiError(
      response.status,
      body,
      `${method} ${url.pathname}${url.search} failed with ${response.status}`,
    );
  }

  return body as T;
}

function safeJsonParse(text: string): any {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function getValues<T>(payload: any): T[] {
  return Array.isArray(payload?.values) ? (payload.values as T[]) : [];
}

function getValue<T>(payload: any): T {
  return payload?.value as T;
}

function selectCustomer(customers: any[]): any | null {
  const exact = customers.find(
    (customer) =>
      String(customer?.organizationNumber ?? "") === ORGANIZATION_NUMBER &&
      normalize(customer?.name) === normalize(CUSTOMER_NAME),
  );
  return exact ?? customers.find((customer) => String(customer?.organizationNumber ?? "") === ORGANIZATION_NUMBER) ?? null;
}

function selectProduct(products: any[], productNumber: string, description: string): any | null {
  const sameNumber = products.filter((product) => String(product?.number ?? "") === productNumber);
  if (sameNumber.length === 0) return null;

  const byName = sameNumber.find((product) => normalize(product?.name) === normalize(description));
  if (byName) return byName;

  const byDisplayName = sameNumber.find((product) => normalize(product?.displayName).includes(normalize(description)));
  return byDisplayName ?? sameNumber[0] ?? null;
}

function chooseVatType(candidates: any[], vatPercentage: number, vatHint: string): any | null {
  const matching = candidates.filter(
    (candidate) => Number(candidate?.percentage ?? NaN) === vatPercentage,
  );
  if (matching.length === 0) return null;
  if (matching.length === 1) return matching[0];

  const hintsByKind: Record<string, string[]> = {
    standard: ["hoy", "høy", "standard", "25", "utgaende", "utgående"],
    food: ["middels", "mat", "naerings", "nærings", "food", "15"],
    exempt: ["fritatt", "ingen utgaende", "ingen utgående", "unntatt", "exempt", "0"],
  };
  const hintWords = hintsByKind[vatHint] ?? [];

  const scored = matching
    .map((candidate) => {
      const haystack = normalize(
        `${candidate?.name ?? ""} ${candidate?.displayName ?? ""} ${candidate?.number ?? ""}`,
      );
      let score = 0;
      for (const word of hintWords) {
        if (haystack.includes(normalize(word))) score += 10;
      }
      if (haystack.includes(String(vatPercentage))) score += 2;
      if (String(candidate?.number ?? "") === "3" && vatPercentage === 25) score += 1;
      return { candidate, score };
    })
    .sort((a, b) => b.score - a.score || Number(a.candidate?.id ?? 0) - Number(b.candidate?.id ?? 0));

  return scored[0]?.candidate ?? null;
}

function norwegianBankChecksum(firstTenDigits: string): string | null {
  const digits = firstTenDigits.split("").map((digit) => Number(digit));
  if (digits.length !== 10 || digits.some((digit) => Number.isNaN(digit))) return null;

  const weights = [2, 3, 4, 5, 6, 7, 2, 3, 4, 5];
  let sum = 0;
  for (let i = 0; i < digits.length; i += 1) {
    sum += digits[digits.length - 1 - i] * weights[i];
  }

  const remainder = sum % 11;
  const checksum = 11 - remainder;
  if (checksum === 11) return "0";
  if (checksum === 10) return null;
  return String(checksum);
}

function generateUniqueBankAccountNumber(existingNumbers: Set<string>): string {
  for (let seed = 2000000000; seed < 2000999999; seed += 1) {
    const firstTenDigits = String(seed).padStart(10, "0");
    const checksum = norwegianBankChecksum(firstTenDigits);
    if (!checksum) continue;
    const candidate = `${firstTenDigits}${checksum}`;
    if (!existingNumbers.has(candidate)) return candidate;
  }
  throw new Error("Unable to generate a unique valid bank account number");
}

function extractInvoiceLines(invoice: any): any[] {
  if (Array.isArray(invoice?.orderLines) && invoice.orderLines.length > 0) return invoice.orderLines;
  if (Array.isArray(invoice?.orders?.[0]?.orderLines) && invoice.orders[0].orderLines.length > 0) {
    return invoice.orders[0].orderLines;
  }
  return [];
}

async function main() {
  const invoiceDueDate = addDays(INVOICE_DATE, 14);

  const [customerPayload, productPayload, accountPayload] = await Promise.all([
    api("GET", "/customer", {
      query: [
        ["organizationNumber", ORGANIZATION_NUMBER],
        ["fields", "*"],
      ],
    }),
    api("GET", "/product", {
      query: [
        ...LINE_SPECS.map((line) => ["productNumber", line.productNumber] as [string, string]),
        ["fields", "*"],
      ],
    }),
    api("GET", "/ledger/account", {
      query: [
        ["isBankAccount", "true"],
        ["fields", "*"],
      ],
    }),
  ]);

  let customer = selectCustomer(getValues<any>(customerPayload));
  if (!customer) {
    const createdCustomerPayload = await api("POST", "/customer", {
      body: {
        name: CUSTOMER_NAME,
        organizationNumber: ORGANIZATION_NUMBER,
        invoiceSendMethod: "MANUAL",
      },
    });
    customer = getValue<any>(createdCustomerPayload);
  }

  if (!customer?.id) {
    throw new Error("Customer resolution failed");
  }

  const products = getValues<any>(productPayload);
  const productByNumber = new Map(
    LINE_SPECS.map((line) => [
      line.productNumber,
      selectProduct(products, line.productNumber, line.description),
    ]),
  );

  const bankAccounts = getValues<any>(accountPayload);
  const invoiceAccount =
    bankAccounts.find((account) => account?.isInvoiceAccount) ??
    bankAccounts.find((account) => String(account?.number ?? "") === "1920") ??
    bankAccounts[0] ??
    null;

  if (invoiceAccount?.id && !invoiceAccount?.bankAccountNumber) {
    const existingNumbers = new Set(
      bankAccounts
        .map((account) => String(account?.bankAccountNumber ?? "").trim())
        .filter(Boolean),
    );
    const bankAccountNumber = generateUniqueBankAccountNumber(existingNumbers);
    await api("PUT", `/ledger/account/${invoiceAccount.id}`, {
      body: { bankAccountNumber },
    });
  }

  const needsVatLookup = LINE_SPECS.some((line) => {
    const product = productByNumber.get(line.productNumber);
    return Number(product?.vatType?.percentage ?? NaN) !== line.vatPercentage;
  });

  let vatByKey = new Map<string, any>();
  if (needsVatLookup) {
    const vatPayload = await api("GET", "/ledger/vatType", {
      query: [
        ["typeOfVat", "OUTGOING"],
        ["vatDate", INVOICE_DATE],
        ["fields", "*"],
      ],
    });
    const vatTypes = getValues<any>(vatPayload);
    vatByKey = new Map(
      LINE_SPECS.map((line) => {
        const chosen = chooseVatType(vatTypes, line.vatPercentage, line.vatHint);
        if (!chosen?.id) {
          throw new Error(
            `Unable to resolve VAT type for ${line.description} at ${line.vatPercentage}%`,
          );
        }
        return [`${line.vatPercentage}:${line.vatHint}`, chosen];
      }),
    );
  }

  const orderLines = LINE_SPECS.map((line) => {
    const product = productByNumber.get(line.productNumber);
    const productVat = product?.vatType;
    const vatType =
      Number(productVat?.percentage ?? NaN) === line.vatPercentage
        ? { id: productVat.id }
        : { id: vatByKey.get(`${line.vatPercentage}:${line.vatHint}`)?.id };

    if (!vatType.id) {
      throw new Error(`Missing VAT type id for ${line.description}`);
    }

    return {
      ...(product?.id ? { product: { id: product.id } } : {}),
      description: line.description,
      count: 1,
      unitPriceExcludingVatCurrency: line.unitPriceExcludingVatCurrency,
      vatType,
    };
  });

  const invoicePayload = {
    invoiceDate: INVOICE_DATE,
    invoiceDueDate,
    customer: { id: customer.id },
    orders: [
      {
        customer: { id: customer.id },
        orderDate: INVOICE_DATE,
        deliveryDate: INVOICE_DATE,
        orderLines,
      },
    ],
  };

  const createdInvoicePayload = await api("POST", "/invoice", {
    query: [["sendToCustomer", "false"]],
    body: invoicePayload,
  });

  const invoice = getValue<any>(createdInvoicePayload);
  const invoiceLines = extractInvoiceLines(invoice);

  const summary = {
    customerId: customer.id,
    invoiceId: invoice?.id ?? null,
    invoiceNumber: invoice?.invoiceNumber ?? null,
    amountExcludingVatCurrency: invoice?.amountExcludingVatCurrency ?? null,
    amountCurrency: invoice?.amountCurrency ?? null,
    lineCount: invoiceLines.length,
    lines: invoiceLines.map((line: any) => ({
      productNumber: line?.product?.number ?? null,
      description: line?.description ?? null,
      unitPriceExcludingVatCurrency: line?.unitPriceExcludingVatCurrency ?? null,
      amountExcludingVatCurrency: line?.amountExcludingVatCurrency ?? null,
      vatPercentage: line?.vatType?.percentage ?? null,
      vatNumber: line?.vatType?.number ?? null,
    })),
  };

  if (!invoice?.id) {
    throw new Error("Invoice creation did not return an invoice id");
  }
  if (Number(invoice?.amountExcludingVatCurrency ?? NaN) !== 42500) {
    throw new Error(
      `Unexpected ex VAT total: ${invoice?.amountExcludingVatCurrency ?? "null"}`,
    );
  }
  if (invoiceLines.length > 0 && invoiceLines.length !== 3) {
    throw new Error(`Unexpected line count in response: ${invoiceLines.length}`);
  }

  console.log(JSON.stringify(summary, null, 2));
}

await main().catch((error) => {
  const payload =
    error instanceof ApiError
      ? {
          error: error.message,
          status: error.status,
          body: error.body,
        }
      : {
          error: error instanceof Error ? error.message : String(error),
        };
  console.error(JSON.stringify(payload, null, 2));
  process.exit(1);
});
