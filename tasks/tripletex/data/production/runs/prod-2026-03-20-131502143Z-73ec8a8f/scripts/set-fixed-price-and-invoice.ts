import { Buffer } from "node:buffer";

const BASE_URL = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "fYqFTMm2cJ3OOAMyx3JRqVhc7OxN0KPdwlMXsP8yO04";

const TODAY = "2026-03-20";
const CUSTOMER_NAME = "Ironbridge Ltd";
const CUSTOMER_ORG_NO = "832020141";
const PROJECT_NAME = "CRM Integration";
const PM_EMAIL = "ella.williams@example.org";
const PM_FIRST_NAME = "Ella";
const PM_LAST_NAME = "Williams";
const FIXED_PRICE = 428550;
const PARTIAL_AMOUNT = FIXED_PRICE * 0.25;

const auth = `Basic ${Buffer.from(`0:${TOKEN}`).toString("base64")}`;

type Json = Record<string, any>;

async function api<T = any>(
  method: string,
  path: string,
  options: {
    query?: Record<string, string | number | boolean | undefined>;
    body?: unknown;
  } = {},
): Promise<T> {
  const url = new URL(`${BASE_URL}${path}`);
  for (const [key, value] of Object.entries(options.query ?? {})) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }

  const response = await fetch(url, {
    method,
    headers: {
      Authorization: auth,
      Accept: "application/json",
      ...(options.body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : null;

  if (!response.ok) {
    const error = new Error(`${method} ${url.pathname}${url.search} -> ${response.status}`);
    (error as any).details = data;
    throw error;
  }

  return data as T;
}

function exactEmailMatch(employee: any): boolean {
  return String(employee?.email ?? "").toLowerCase() === PM_EMAIL.toLowerCase();
}

function exactPmNameMatch(employee: any): boolean {
  return (
    String(employee?.firstName ?? "") === PM_FIRST_NAME &&
    String(employee?.lastName ?? "") === PM_LAST_NAME
  );
}

function pickExactProjectManager(values: any[]): any | undefined {
  const exactEmail = values.filter(exactEmailMatch);
  const exactEmailAndName = exactEmail.find(exactPmNameMatch);
  return exactEmailAndName ?? exactEmail[0];
}

function pickVatType(values: any[]): any {
  const withPercent = values
    .filter((v) => typeof v?.percentage === "number")
    .sort((a, b) => b.percentage - a.percentage);
  const exactly25 = withPercent.find((v) => v.percentage === 25);
  if (exactly25) return exactly25;
  const positive = withPercent.find((v) => v.percentage > 0);
  return positive ?? values[0];
}

function exactCustomerMatch(customer: any): boolean {
  return (
    String(customer?.organizationNumber ?? "") === CUSTOMER_ORG_NO &&
    String(customer?.name ?? "") === CUSTOMER_NAME
  );
}

function exactProjectMatch(project: any, customerId: number): boolean {
  return (
    String(project?.name ?? "") === PROJECT_NAME &&
    Number(project?.customer?.id) === customerId
  );
}

async function main() {
  const employeeSearch = await api<Json>("GET", "/employee", {
    query: {
      email: PM_EMAIL,
      assignableProjectManagers: true,
      count: 10,
      fields: "*",
    },
  });
  let projectManager = pickExactProjectManager(employeeSearch.values ?? []);

  if (!projectManager) {
    const employeeFallback = await api<Json>("GET", "/employee", {
      query: {
        email: PM_EMAIL,
        count: 10,
        fields: "*",
      },
    });
    projectManager = pickExactProjectManager(employeeFallback.values ?? []);
  }

  if (!projectManager) {
    throw new Error(`Project manager not found: ${PM_EMAIL}`);
  }

  const customerSearch = await api<Json>("GET", "/customer", {
    query: {
      organizationNumber: CUSTOMER_ORG_NO,
      count: 10,
      fields: "*",
    },
  });

  let customer =
    (customerSearch.values ?? []).find(exactCustomerMatch) ??
    (customerSearch.values ?? [])[0];

  if (!customer) {
    const customerCreate = await api<Json>("POST", "/customer", {
      body: {
        name: CUSTOMER_NAME,
        organizationNumber: CUSTOMER_ORG_NO,
        invoiceSendMethod: "MANUAL",
      },
    });
    customer = customerCreate.value;
  }

  const projectSearch = await api<Json>("GET", "/project", {
    query: {
      name: PROJECT_NAME,
      customerId: customer.id,
      count: 50,
      fields: "*",
    },
  });

  const existingProject =
    (projectSearch.values ?? []).find((project: any) => exactProjectMatch(project, customer.id) && !project?.isClosed) ??
    (projectSearch.values ?? []).find((project: any) => exactProjectMatch(project, customer.id));

  const projectPayload = {
    name: PROJECT_NAME,
    startDate: existingProject?.startDate || TODAY,
    customer: { id: customer.id },
    projectManager: { id: projectManager.id },
    isFixedPrice: true,
    fixedprice: FIXED_PRICE,
    invoiceOnAccountVatHigh: false,
  };

  const projectResponse = existingProject
    ? await api<Json>("PUT", `/project/${existingProject.id}`, { body: projectPayload })
    : await api<Json>("POST", "/project", { body: projectPayload });
  const project = projectResponse.value;

  const vatTypeSearch = await api<Json>("GET", "/ledger/vatType", {
    query: {
      typeOfVat: "OUTGOING",
      vatDate: TODAY,
      fields: "*",
    },
  });
  const vatType = pickVatType(vatTypeSearch.values ?? []);
  if (!vatType?.id) {
    throw new Error("No valid outgoing VAT type found");
  }

  const orderCreate = await api<Json>("POST", "/order", {
    body: {
      customer: { id: customer.id },
      project: { id: project.id },
      orderDate: TODAY,
      deliveryDate: TODAY,
      invoiceOnAccountVatHigh: false,
      orderLines: [
        {
          description: `Milestone payment 25% of fixed price for ${PROJECT_NAME}`,
          count: 1,
          unitPriceExcludingVatCurrency: PARTIAL_AMOUNT,
          vatType: { id: vatType.id },
        },
      ],
    },
  });
  const order = orderCreate.value;

  const invoiceCreate = await api<Json>("PUT", `/order/${order.id}/:invoice`, {
    query: {
      invoiceDate: TODAY,
      sendToCustomer: false,
    },
  });

  let invoice = invoiceCreate.value;
  const linkedProjectId = invoice?.orders?.[0]?.project?.id;
  if (linkedProjectId !== project.id) {
    const invoiceVerify = await api<Json>("GET", `/invoice/${invoice.id}`, {
      query: {
        fields: "*,orders(*,project(*),orderLines(*)),orderLines(*)",
      },
    });
    invoice = invoiceVerify.value;
  }

  if (invoice?.orders?.[0]?.project?.id !== project.id) {
    throw new Error("Invoice verification failed: project link missing");
  }

  console.log(
    JSON.stringify(
      {
        customerId: customer.id,
        projectId: project.id,
        projectFixedPrice: project.fixedprice,
        projectManagerId: project.projectManager?.id,
        vatTypeId: vatType.id,
        vatTypePercentage: vatType.percentage,
        orderId: order.id,
        invoiceId: invoice.id,
        invoiceAmountExcludingVatCurrency: invoice.amountExcludingVatCurrency,
        invoiceAmountCurrencyOutstanding: invoice.amountCurrencyOutstanding,
        linkedProjectId: invoice.orders?.[0]?.project?.id,
      },
      null,
      2,
    ),
  );
}

await main().catch((error: any) => {
  console.error(error?.message ?? error);
  if (error?.details) {
    console.error(JSON.stringify(error.details, null, 2));
  }
  process.exit(1);
});
