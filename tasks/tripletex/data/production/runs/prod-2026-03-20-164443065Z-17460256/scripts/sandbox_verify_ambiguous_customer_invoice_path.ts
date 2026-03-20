const BASE_URL = "https://kkpqfuj-amager.tripletex.dev/v2";
const SESSION_TOKEN =
  "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";

const RUN_TAG = "17460256";
const INVOICE_DATE = "2026-03-20";
const DUE_DATE = "2026-04-03";

const ANALOG_CUSTOMER = {
  name: `Lysgard Sandbox Analog ${RUN_TAG} AS`,
  organizationNumber: "851635875",
  email: `sandbox-${RUN_TAG}@example.com`,
};

const ANALOG_LINES = [
  {
    promptRef: "2934",
    storedNumber: "52934",
    name: `Analyserapport ${RUN_TAG}`,
    unitPriceExcludingVatCurrency: 29800,
  },
  {
    promptRef: "8699",
    storedNumber: "58699",
    name: `Dataradgivning ${RUN_TAG}`,
    unitPriceExcludingVatCurrency: 5200,
  },
  {
    promptRef: "1355",
    storedNumber: "51355",
    name: `Nettverkstjeneste ${RUN_TAG}`,
    unitPriceExcludingVatCurrency: 18050,
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
};

function authHeader(token: string): string {
  return `Basic ${Buffer.from(`0:${token}`).toString("base64")}`;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers ?? {});
  headers.set("Authorization", authHeader(SESSION_TOKEN));
  headers.set("Accept", "application/json");
  if (init.body !== undefined && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(`${BASE_URL}${path}`, { ...init, headers });
  const text = await response.text();
  let parsed: unknown = null;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text;
    }
  }

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${path}: ${text}`);
  }

  return parsed as T;
}

function one<T extends TxEntity>(
  values: T[] | undefined,
  label: string,
  predicate: (value: T) => boolean,
): T | undefined {
  const matches = (values ?? []).filter(predicate);
  if (matches.length > 1) {
    throw new Error(`${label}: expected <= 1 match, got ${matches.length}`);
  }
  return matches[0];
}

function requireOne<T extends TxEntity>(
  values: T[] | undefined,
  label: string,
  predicate: (value: T) => boolean,
): T {
  const match = one(values, label, predicate);
  if (!match) {
    throw new Error(`${label}: missing`);
  }
  return match;
}

function productNumberOf(product: TxEntity): string | undefined {
  if (typeof product.productNumber === "string") return product.productNumber;
  if (typeof product.number === "string") return product.number;
  return undefined;
}

async function ensureCustomer(): Promise<TxEntity> {
  const customerResp = await request<WrappedList<TxEntity>>(
    `/customer?organizationNumber=${ANALOG_CUSTOMER.organizationNumber}&fields=*`,
  );
  const existing = one(
    customerResp.values,
    "analog customer",
    (value) => value.organizationNumber === ANALOG_CUSTOMER.organizationNumber,
  );
  if (existing) return existing;

  const created = await request<WrappedValue<TxEntity>>("/customer", {
    method: "POST",
    body: JSON.stringify(ANALOG_CUSTOMER),
  });
  if (!created.value) throw new Error("Customer create returned no value");
  return created.value;
}

async function ensureProducts(zeroVatTypeId: number): Promise<TxEntity[]> {
  const catalogResp = await request<WrappedList<TxEntity>>("/product?count=1000&fields=*");
  const catalog = catalogResp.values ?? [];
  const ensured: TxEntity[] = [];

  for (const line of ANALOG_LINES) {
    const existing = one(
      catalog,
      `analog product ${line.storedNumber}`,
      (value) =>
        productNumberOf(value) === line.storedNumber && value.name === line.name,
    );
    if (existing) {
      ensured.push(existing);
      continue;
    }

    const created = await request<WrappedValue<TxEntity>>("/product", {
      method: "POST",
      body: JSON.stringify({
        name: line.name,
        number: line.storedNumber,
        priceExcludingVatCurrency: line.unitPriceExcludingVatCurrency,
        vatType: { id: zeroVatTypeId },
      }),
    });
    if (!created.value) throw new Error(`Product create returned no value for ${line.name}`);
    ensured.push(created.value);
  }

  return ensured;
}

async function main() {
  const vatResp = await request<WrappedList<TxEntity>>(
    `/ledger/vatType?typeOfVat=OUTGOING&vatDate=${INVOICE_DATE}&fields=*`,
  );
  const zeroVat = requireOne(vatResp.values, "0% vat", (value) => value.percentage === 0);

  await ensureCustomer();
  await ensureProducts(zeroVat.id);

  const proofCustomerResp = await request<WrappedList<TxEntity>>(
    `/customer?organizationNumber=${ANALOG_CUSTOMER.organizationNumber}&fields=*`,
  );
  const proofCustomer = requireOne(
    proofCustomerResp.values,
    "proof customer",
    (value) => value.organizationNumber === ANALOG_CUSTOMER.organizationNumber,
  );

  const proofCatalogResp = await request<WrappedList<TxEntity>>("/product?count=1000&fields=*");
  const proofCatalog = proofCatalogResp.values ?? [];
  const resolvedProducts = ANALOG_LINES.map((line) =>
    requireOne(
      proofCatalog,
      `proof product ${line.name}`,
      (value) => value.name === line.name,
    ),
  );

  for (let index = 0; index < ANALOG_LINES.length; index += 1) {
    const line = ANALOG_LINES[index];
    const resolved = resolvedProducts[index];
    const resolvedNumber = productNumberOf(resolved);
    if (!resolvedNumber || resolvedNumber === line.promptRef) {
      throw new Error(`Expected analog stored number to differ from prompt ref for ${line.name}`);
    }
  }

  const proofVatResp = await request<WrappedList<TxEntity>>(
    `/ledger/vatType?typeOfVat=OUTGOING&vatDate=${INVOICE_DATE}&fields=*`,
  );
  const proofZeroVat = requireOne(
    proofVatResp.values,
    "proof 0% vat",
    (value) => value.percentage === 0,
  );

  const invoiceResp = await request<WrappedValue<Record<string, unknown>>>(
    "/invoice?sendToCustomer=false",
    {
      method: "POST",
      body: JSON.stringify({
        invoiceDate: INVOICE_DATE,
        invoiceDueDate: DUE_DATE,
        customer: { id: proofCustomer.id },
        orders: [
          {
            customer: { id: proofCustomer.id },
            orderDate: INVOICE_DATE,
            deliveryDate: INVOICE_DATE,
            orderLines: resolvedProducts.map((product, index) => ({
              product: { id: product.id },
              description: ANALOG_LINES[index].name,
              count: 1,
              unitPriceExcludingVatCurrency:
                ANALOG_LINES[index].unitPriceExcludingVatCurrency,
              vatType: { id: proofZeroVat.id },
            })),
          },
        ],
      }),
    },
  );

  const invoice = invoiceResp.value ?? {};
  console.log(
    JSON.stringify(
      {
        setupOnly: {
          customerOrganizationNumber: ANALOG_CUSTOMER.organizationNumber,
          promptLikeRefs: ANALOG_LINES.map((line) => line.promptRef),
        },
        proofPath: [
          `GET /customer?organizationNumber=${ANALOG_CUSTOMER.organizationNumber}&fields=*`,
          "GET /product?count=1000&fields=*",
          `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=${INVOICE_DATE}&fields=*`,
          "POST /invoice?sendToCustomer=false",
        ],
        resolvedProducts: resolvedProducts.map((product, index) => ({
          name: ANALOG_LINES[index].name,
          promptRef: ANALOG_LINES[index].promptRef,
          storedNumber: productNumberOf(product),
        })),
        invoiceId: invoice["id"],
        invoiceNumber: invoice["invoiceNumber"],
        amountExcludingVatCurrency: invoice["amountExcludingVatCurrency"],
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
