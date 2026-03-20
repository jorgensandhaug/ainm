const BASE_URL = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN =
  "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";

const INVOICE_DATE = "2026-03-20";
const INVOICE_DUE_DATE = "2026-04-03";
const EXPECTED_EX_VAT = 52600;
const EXPECTED_INC_VAT_EXACT = 60745;
const EXPECTED_INC_VAT_ZERO_ANALOG = 52600;

const CUSTOMER_NAME = "Bølgekraft AS";
const CUSTOMER_ORG = "827304212";
const CUSTOMER_EMAIL = "sandbox-bolgekraft-827304212@example.com";

const WANTED_PRODUCTS = [
  { number: "6744", name: "Webdesign", price: 27000, percentage: 25 },
  { number: "2584", name: "Programvarelisens", price: 9300, percentage: 15 },
  { number: "3739", name: "Opplæring", price: 16300, percentage: 0 },
] as const;

type ListResponse<T> = { values?: T[] };
type ValueResponse<T> = { value?: T };

type Customer = {
  id: number;
  name?: string;
  organizationNumber?: string;
};

type VatType = {
  id: number;
  number?: string;
  percentage?: number;
};

type Product = {
  id: number;
  number?: string | number;
  name?: string;
  vatType?: { id?: number | null } | null;
};

type Account = {
  id: number;
  number?: number;
  isInvoiceAccount?: boolean;
  bankAccountNumber?: string | null;
};

type Invoice = {
  id: number;
  invoiceNumber?: number;
  amountExcludingVatCurrency?: number;
  amountCurrency?: number;
  orderLines?: Array<{ id?: number; url?: string }>;
};

const authHeader = `Basic ${Buffer.from(`0:${TOKEN}`).toString("base64")}`;

type CallLog = {
  method: string;
  path: string;
  status: number;
};

const setupCalls: CallLog[] = [];
const proofCalls: CallLog[] = [];
let mode: "setup" | "proof" = "setup";

function currentLog(): CallLog[] {
  return mode === "setup" ? setupCalls : proofCalls;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function hasBankAccountValidation(body: unknown): boolean {
  if (!isObject(body)) return false;
  const message = typeof body.message === "string" ? body.message : "";
  const validationMessages = Array.isArray(body.validationMessages)
    ? body.validationMessages
        .map((item) => (isObject(item) && typeof item.message === "string" ? item.message : ""))
        .join(" | ")
    : "";
  return `${message} | ${validationMessages}`.includes(
    "Faktura kan ikke opprettes før selskapet har registrert et bankkontonummer",
  );
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

  currentLog().push({
    method: init?.method ?? "GET",
    path,
    status: response.status,
  });

  const text = await response.text();
  const body = text ? JSON.parse(text) : null;

  if (!response.ok) {
    const error = new Error(`HTTP ${response.status} on ${path}: ${text}`);
    (error as Error & { status?: number; body?: unknown }).status = response.status;
    (error as Error & { status?: number; body?: unknown }).body = body;
    throw error;
  }

  return body as T;
}

function chooseVatType(vatTypes: VatType[], percentage: number, preferredId?: number | null): VatType {
  if (preferredId) {
    const preferred = vatTypes.find(
      (vatType) => vatType.id === preferredId && vatType.percentage === percentage,
    );
    if (preferred) return preferred;
  }

  const exact = vatTypes
    .filter((vatType) => vatType.percentage === percentage)
    .sort((a, b) => Number(a.number ?? Number.MAX_SAFE_INTEGER) - Number(b.number ?? Number.MAX_SAFE_INTEGER));

  if (exact.length === 0) {
    throw new Error(`No outgoing VAT type for ${percentage}%`);
  }

  return exact[0];
}

function exactProductMatch(products: Product[], wanted: (typeof WANTED_PRODUCTS)[number]): Product | undefined {
  return products.find(
    (product) => String(product.number ?? "") === wanted.number && product.name === wanted.name,
  );
}

async function ensureCustomer(): Promise<void> {
  const existing =
    (
      await api<ListResponse<Customer>>(
        `/customer?organizationNumber=${CUSTOMER_ORG}&count=10&fields=*`,
      )
    ).values ?? [];
  const exact = existing.find(
    (customer) => customer.organizationNumber === CUSTOMER_ORG && customer.name === CUSTOMER_NAME,
  );
  if (exact) return;

  await api<ValueResponse<Customer>>("/customer", {
    method: "POST",
    body: JSON.stringify({
      name: CUSTOMER_NAME,
      email: CUSTOMER_EMAIL,
      organizationNumber: CUSTOMER_ORG,
    }),
  });
}

async function ensureProducts(vatTypes: VatType[]): Promise<void> {
  const params = new URLSearchParams();
  for (const wanted of WANTED_PRODUCTS) params.append("productNumber", wanted.number);
  params.append("fields", "*");

  const products = (await api<ListResponse<Product>>(`/product?${params.toString()}`)).values ?? [];
  const availablePercentages = new Set(vatTypes.map((vatType) => vatType.percentage));
  const canCreateExactMixedVat = availablePercentages.has(25) && availablePercentages.has(15) && availablePercentages.has(0);

  for (const wanted of WANTED_PRODUCTS) {
    if (exactProductMatch(products, wanted)) continue;
    const vatType = chooseVatType(vatTypes, canCreateExactMixedVat ? wanted.percentage : 0);
    await api<ValueResponse<Product>>("/product", {
      method: "POST",
      body: JSON.stringify({
        name: wanted.name,
        number: wanted.number,
        priceExcludingVatCurrency: wanted.price,
        vatType: { id: vatType.id },
      }),
    });
  }
}

async function ensureInvoiceBankAccount(): Promise<void> {
  const accounts =
    (await api<ListResponse<Account>>("/ledger/account?isBankAccount=true&fields=*")).values ?? [];
  const account =
    accounts.find((item) => item.isInvoiceAccount) ??
    accounts.find((item) => item.number === 1920) ??
    accounts[0];

  if (!account?.id) {
    throw new Error("Sandbox has no bank account to repair");
  }

  if (account.bankAccountNumber) return;

  await api<ValueResponse<Account>>(`/ledger/account/${account.id}`, {
    method: "PUT",
    body: JSON.stringify({
      bankAccountNumber: "12345678903",
    }),
  });
}

async function runProofPath(): Promise<void> {
  mode = "proof";

  const customerRes =
    (
      await api<ListResponse<Customer>>(
        `/customer?organizationNumber=${CUSTOMER_ORG}&count=10&fields=*`,
      )
    ).values ?? [];
  const customer = customerRes.find(
    (item) => item.organizationNumber === CUSTOMER_ORG && item.name === CUSTOMER_NAME,
  );
  if (!customer?.id) throw new Error("Proof path could not resolve customer");

  const productParams = new URLSearchParams();
  for (const wanted of WANTED_PRODUCTS) productParams.append("productNumber", wanted.number);
  productParams.append("fields", "*");

  const productRes = (await api<ListResponse<Product>>(`/product?${productParams.toString()}`)).values ?? [];
  const products = WANTED_PRODUCTS.map((wanted) => {
    const product = exactProductMatch(productRes, wanted);
    if (!product?.id) {
      throw new Error(`Proof path could not resolve ${wanted.name} (${wanted.number})`);
    }
    return product;
  });

  const vatTypes =
    (
      await api<ListResponse<VatType>>(
        `/ledger/vatType?typeOfVat=OUTGOING&vatDate=${INVOICE_DATE}&fields=*`,
      )
    ).values ?? [];
  const availablePercentages = new Set(vatTypes.map((vatType) => vatType.percentage));
  const canProveExactMixedVat = availablePercentages.has(25) && availablePercentages.has(15) && availablePercentages.has(0);

  const orderLines = WANTED_PRODUCTS.map((wanted, index) => {
    const product = products[index];
    const percentage = canProveExactMixedVat ? wanted.percentage : 0;
    const vatType = chooseVatType(vatTypes, percentage, product.vatType?.id ?? null);
    return {
      product: { id: product.id },
      description: wanted.name,
      count: 1,
      unitPriceExcludingVatCurrency: wanted.price,
      vatType: { id: vatType.id },
    };
  });

  let invoice: Invoice | undefined;
  try {
    invoice = (
      await api<ValueResponse<Invoice>>("/invoice?sendToCustomer=false", {
        method: "POST",
        body: JSON.stringify({
          invoiceDate: INVOICE_DATE,
          invoiceDueDate: INVOICE_DUE_DATE,
          customer: { id: customer.id },
          orders: [
            {
              customer: { id: customer.id },
              orderDate: INVOICE_DATE,
              deliveryDate: INVOICE_DATE,
              orderLines,
            },
          ],
        }),
      })
    ).value;
  } catch (error) {
    const detailed = error as Error & { status?: number; body?: unknown };
    if (detailed.status === 422 && hasBankAccountValidation(detailed.body)) {
      throw new Error("Proof path hit unexpected missing-bank-account branch; setup should have prevented this");
    }
    throw error;
  }

  if (!invoice) throw new Error("Proof path invoice create returned no value");
  if (invoice.amountExcludingVatCurrency !== EXPECTED_EX_VAT) {
    throw new Error(
      `Proof invoice ex VAT mismatch: ${invoice.amountExcludingVatCurrency} vs ${EXPECTED_EX_VAT}`,
    );
  }
  const expectedGross = canProveExactMixedVat ? EXPECTED_INC_VAT_EXACT : EXPECTED_INC_VAT_ZERO_ANALOG;
  if (invoice.amountCurrency !== expectedGross) {
    throw new Error(`Proof invoice gross mismatch: ${invoice.amountCurrency} vs ${expectedGross}`);
  }

  console.log(
    JSON.stringify(
      {
        setupCalls,
        proofCalls,
        sandboxAssessment: {
          canProveExactMixedVat,
          availableOutgoingVatPercentages: [...availablePercentages].sort((a, b) => Number(a) - Number(b)),
          note: canProveExactMixedVat
            ? "Exact mixed-VAT proof succeeded"
            : "Exact mixed-VAT proof blocked in this sandbox account; 0%-only analog proof used for resolver and create-path verification",
        },
        proofInvoice: {
          id: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          amountExcludingVatCurrency: invoice.amountExcludingVatCurrency,
          amountCurrency: invoice.amountCurrency,
          sparseOrderLines: invoice.orderLines,
        },
        proofProducts: products.map((product) => ({
          id: product.id,
          number: product.number,
          name: product.name,
          vatTypeId: product.vatType?.id ?? null,
        })),
        proofVatTypes: vatTypes
          .filter((vatType) => [25, 15, 0].includes(vatType.percentage ?? -1))
          .map((vatType) => ({
            id: vatType.id,
            number: vatType.number,
            percentage: vatType.percentage,
          })),
      },
      null,
      2,
    ),
  );
}

async function main(): Promise<void> {
  const vatTypes =
    (
      await api<ListResponse<VatType>>(
        `/ledger/vatType?typeOfVat=OUTGOING&vatDate=${INVOICE_DATE}&fields=*`,
      )
    ).values ?? [];

  await ensureCustomer();
  await ensureProducts(vatTypes);
  await ensureInvoiceBankAccount();
  await runProofPath();
}

await main();
