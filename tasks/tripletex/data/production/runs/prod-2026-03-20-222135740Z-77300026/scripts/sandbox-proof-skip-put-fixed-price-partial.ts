const BASE_URL = "https://kkpqfuj-amager.tripletex.dev/v2/";
const SESSION_TOKEN =
  "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";

const TODAY = "2026-03-20";
const PROJECT_NAME = "Desarrollo e-commerce";
const CUSTOMER_ORG = "816896770";
const PROJECT_MANAGER_EMAIL = "simen.sandhaug@gmail.com";
const FIXED_PRICE = 375250;
const PARTIAL_AMOUNT = Number((FIXED_PRICE * 0.33).toFixed(2));
const ORDER_LINE_DESCRIPTION = "Partial billing 33 % of fixed price";

const authHeader = `Basic ${Buffer.from(`0:${SESSION_TOKEN}`).toString("base64")}`;
let callCount = 0;

function buildUrl(path: string, query?: Record<string, string | number | boolean | undefined>) {
  const url = new URL(path, BASE_URL);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined) url.searchParams.append(key, String(value));
  }
  return url;
}

async function request(
  method: string,
  path: string,
  options: { query?: Record<string, string | number | boolean | undefined>; body?: unknown } = {},
) {
  callCount += 1;
  const response = await fetch(buildUrl(path, options.query), {
    method,
    headers: {
      Authorization: authHeader,
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json; charset=utf-8" } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(JSON.stringify({ method, path, status: response.status, body }, null, 2));
  }
  return body;
}

function valuesOf<T>(body: any): T[] {
  return Array.isArray(body?.values) ? body.values : [];
}

async function main() {
  const projectBody = await request("GET", "project", {
    query: {
      name: PROJECT_NAME,
      count: 50,
      fields: "*,customer(*),projectManager(*)",
    },
  });
  const project = valuesOf<any>(projectBody).find(
    (candidate) =>
      candidate?.name === PROJECT_NAME &&
      candidate?.customer?.organizationNumber === CUSTOMER_ORG &&
      candidate?.projectManager?.email === PROJECT_MANAGER_EMAIL &&
      Number(candidate?.fixedprice) === FIXED_PRICE,
  );
  if (!project?.id || !project?.customer?.id) {
    throw new Error("Skip-put fixture not found");
  }

  const vatBody = await request("GET", "ledger/vatType", {
    query: { typeOfVat: "OUTGOING", vatDate: TODAY, fields: "*" },
  });
  const vatType = valuesOf<any>(vatBody).find((candidate) => Number(candidate?.percentage) === 25) ??
    (valuesOf<any>(vatBody).length === 1 ? valuesOf<any>(vatBody)[0] : null);
  if (!vatType?.id) {
    throw new Error("No safe VAT type");
  }

  const orderBody = await request("POST", "order", {
    body: {
      customer: { id: project.customer.id },
      project: { id: project.id },
      orderDate: TODAY,
      deliveryDate: TODAY,
      orderLines: [
        {
          description: ORDER_LINE_DESCRIPTION,
          count: 1,
          unitPriceExcludingVatCurrency: PARTIAL_AMOUNT,
          vatType: { id: vatType.id },
        },
      ],
    },
  });
  const orderId = orderBody?.value?.id;
  if (!orderId) {
    throw new Error("Order creation failed");
  }

  const invoiceBody = await request("PUT", `order/${orderId}/:invoice`, {
    query: { invoiceDate: TODAY, sendToCustomer: false },
  });

  console.log(
    JSON.stringify(
      {
        ok: true,
        callCount,
        projectId: project.id,
        customerId: project.customer.id,
        vatTypeId: vatType.id,
        orderId,
        invoiceId: invoiceBody?.value?.id,
        amountExcludingVatCurrency: invoiceBody?.value?.amountExcludingVatCurrency,
        amountCurrencyOutstanding: invoiceBody?.value?.amountCurrencyOutstanding,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
