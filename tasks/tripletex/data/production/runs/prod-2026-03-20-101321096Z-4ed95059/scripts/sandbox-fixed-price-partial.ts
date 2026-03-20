const BASE_URL = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN =
  "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";

const TODAY = "2026-03-20";
const FIXED_PRICE = 374900;
const PARTIAL_AMOUNT = 281175;
const RUN_TAG = `20260320-learning-fixed-price-partial-${Date.now()}`;
const CUSTOMER_NAME = `Codex Sandbox ${RUN_TAG} AS`;
const CUSTOMER_ORG = `999${String(Date.now()).slice(-6)}`;
const PROJECT_NAME = `Datasikkerhet ${RUN_TAG}`;

type QueryValue = string | number | boolean | null | undefined;

function authHeader() {
  return `Basic ${Buffer.from(`0:${TOKEN}`).toString("base64")}`;
}

function buildUrl(path: string, query?: Record<string, QueryValue>) {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const url = new URL(`${BASE_URL}${normalizedPath}`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null) continue;
      url.searchParams.append(key, String(value));
    }
  }
  return url;
}

async function request<T>(
  method: string,
  path: string,
  options: { query?: Record<string, QueryValue>; body?: unknown } = {},
): Promise<T> {
  const url = buildUrl(path, options.query);
  const response = await fetch(url, {
    method,
    headers: {
      Authorization: authHeader(),
      Accept: "application/json",
      ...(options.body !== undefined
        ? { "Content-Type": "application/json; charset=utf-8" }
        : {}),
    },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
  const text = await response.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }
  if (!response.ok) {
    throw new Error(
      `${method} ${url.pathname}${url.search} failed: ${response.status}\n${JSON.stringify(
        data ?? text,
        null,
        2,
      )}`,
    );
  }
  return data as T;
}

function values<T>(wrapper: any): T[] {
  return Array.isArray(wrapper?.values) ? wrapper.values : [];
}

function value<T>(wrapper: any): T {
  if (!wrapper || typeof wrapper !== "object" || !("value" in wrapper)) {
    throw new Error(`Expected value wrapper, got ${JSON.stringify(wrapper, null, 2)}`);
  }
  return wrapper.value as T;
}

async function main() {
  const managersRes = await request<any>("GET", "/employee", {
    query: {
      assignableProjectManagers: true,
      count: 50,
      fields: "*",
    },
  });
  const manager = values<any>(managersRes).find((employee) => employee?.email);
  if (!manager) {
    throw new Error("No assignable project manager with email found in sandbox");
  }

  const customerRes = await request<any>("POST", "/customer", {
    body: {
      name: CUSTOMER_NAME,
      organizationNumber: CUSTOMER_ORG,
      invoiceSendMethod: "MANUAL",
    },
  });
  const customer = value<any>(customerRes);

  const projectRes = await request<any>("POST", "/project", {
    body: {
      name: PROJECT_NAME,
      startDate: TODAY,
      customer: { id: customer.id },
      projectManager: { id: manager.id },
      isFixedPrice: true,
      fixedprice: FIXED_PRICE,
      invoiceOnAccountVatHigh: false,
    },
  });
  const project = value<any>(projectRes);

  const vatTypesRes = await request<any>("GET", "/ledger/vatType", {
    query: {
      typeOfVat: "OUTGOING",
      vatDate: TODAY,
      count: 1000,
      fields: "*",
    },
  });
  const vatTypes = values<any>(vatTypesRes);
  const vatType =
    [...vatTypes]
      .filter((entry) => typeof entry?.percentage === "number")
      .sort((left, right) => Number(right.percentage) - Number(left.percentage))[0] ??
    vatTypes[0];
  if (!vatType) {
    throw new Error("No outgoing VAT type available in sandbox");
  }

  const orderRes = await request<any>("POST", "/order", {
    body: {
      customer: { id: customer.id },
      project: { id: project.id },
      orderDate: TODAY,
      deliveryDate: TODAY,
      invoiceOnAccountVatHigh: false,
      orderLines: [
        {
          description: "Partial billing 75% of fixed price",
          count: 1,
          unitPriceExcludingVatCurrency: PARTIAL_AMOUNT,
          vatType: { id: vatType.id },
        },
      ],
    },
  });
  const order = value<any>(orderRes);

  const invoiceRes = await request<any>("PUT", `/order/${order.id}/:invoice`, {
    query: {
      invoiceDate: TODAY,
      sendToCustomer: false,
    },
  });
  const invoice = value<any>(invoiceRes);
  const invoiceGetRes = await request<any>("GET", `/invoice/${invoice.id}`, {
    query: {
      fields: "*,orders(*,project(*),customer(*),orderLines(*)),orderLines(*)",
    },
  });
  const verifiedInvoice = value<any>(invoiceGetRes);

  const projectDetail = Array.isArray(invoice.projectInvoiceDetails)
    ? invoice.projectInvoiceDetails.find((detail: any) => detail?.project?.id === project.id)
    : null;

  console.log(
    JSON.stringify(
      {
        manager: {
          id: manager.id,
          email: manager.email,
        },
        customer: {
          id: customer.id,
          name: customer.name,
          organizationNumber: customer.organizationNumber,
          invoiceSendMethod: customer.invoiceSendMethod,
        },
        project: {
          id: project.id,
          name: project.name,
          startDate: project.startDate,
          customerId: project.customer?.id,
          projectManagerId: project.projectManager?.id,
          isFixedPrice: project.isFixedPrice,
          fixedprice: project.fixedprice,
          invoiceOnAccountVatHigh: project.invoiceOnAccountVatHigh,
        },
        order: {
          id: order.id,
          customerId: order.customer?.id,
          projectId: order.project?.id,
          invoiceOnAccountVatHigh: order.invoiceOnAccountVatHigh,
          orderLinesCount: Array.isArray(order.orderLines) ? order.orderLines.length : null,
        },
        vatType: {
          id: vatType.id,
          number: vatType.number,
          percentage: vatType.percentage,
        },
        invoice: {
          id: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          customerId: invoice.customer?.id,
          amountExcludingVatCurrency: invoice.amountExcludingVatCurrency,
          amountCurrency: invoice.amountCurrency,
          amountCurrencyOutstanding: invoice.amountCurrencyOutstanding,
        },
        verifiedInvoice: {
          id: verifiedInvoice.id,
          customerId: verifiedInvoice.customer?.id,
          amountExcludingVatCurrency: verifiedInvoice.amountExcludingVatCurrency,
          orderCount: Array.isArray(verifiedInvoice.orders) ? verifiedInvoice.orders.length : null,
          firstOrderProjectId: Array.isArray(verifiedInvoice.orders)
            ? verifiedInvoice.orders[0]?.project?.id ?? null
            : null,
          firstOrderLineCount: Array.isArray(verifiedInvoice.orders)
            ? Array.isArray(verifiedInvoice.orders[0]?.orderLines)
              ? verifiedInvoice.orders[0].orderLines.length
              : null
            : null,
        },
        projectInvoiceDetail: projectDetail
          ? {
              projectId: projectDetail.project?.id,
              onAccountBalanceAmountCurrency: projectDetail.onAccountBalanceAmountCurrency,
            }
          : null,
      },
      null,
      2,
    ),
  );
}

await main();
