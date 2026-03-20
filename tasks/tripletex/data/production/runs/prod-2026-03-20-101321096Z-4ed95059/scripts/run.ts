const BASE_URL = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "xurXcOgd-z9nUn-_UiMNakbwLTa4kYH9Fg-eZBliSRI";

const TODAY = "2026-03-20";
const PROJECT_NAME = "Datasikkerhet";
const CUSTOMER_NAME = "Snøhetta AS";
const ORG_NUMBER = "840786692";
const MANAGER_EMAIL = "jonas.larsen@example.org";
const FIXED_PRICE = 374900;
const PARTIAL_AMOUNT = 281175;

type QueryValue = string | number | boolean | null | undefined;

function authHeader() {
  return `Basic ${Buffer.from(`0:${TOKEN}`).toString("base64")}`;
}

function buildUrl(path: string, query?: Record<string, QueryValue>) {
  const url = new URL(path, BASE_URL.endsWith("/") ? BASE_URL : `${BASE_URL}/`);
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
  options: {
    query?: Record<string, QueryValue>;
    body?: unknown;
  } = {},
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
  const data = text ? JSON.parse(text) : null;

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

function exactOne<T>(values: T[], predicate: (value: T) => boolean, label: string) {
  const matches = values.filter(predicate);
  if (matches.length === 0) {
    return null;
  }
  if (matches.length > 1) {
    throw new Error(`Ambiguous ${label}: found ${matches.length} exact matches`);
  }
  return matches[0];
}

function asArray<T>(input: unknown): T[] {
  if (!input || typeof input !== "object" || !Array.isArray((input as { values?: unknown[] }).values)) {
    return [];
  }
  return (input as { values: T[] }).values;
}

function asValue<T>(input: unknown): T {
  if (!input || typeof input !== "object" || !("value" in input)) {
    throw new Error(`Expected response wrapper with value, got: ${JSON.stringify(input, null, 2)}`);
  }
  return (input as { value: T }).value;
}

async function main() {
  const [employeeRes, customerRes] = await Promise.all([
    request<unknown>("GET", "/employee", {
      query: {
        email: MANAGER_EMAIL,
        assignableProjectManagers: true,
        count: 10,
        fields: "*",
      },
    }),
    request<unknown>("GET", "/customer", {
      query: {
        organizationNumber: ORG_NUMBER,
        count: 10,
        fields: "*",
      },
    }),
  ]);

  const employees = asArray<any>(employeeRes);
  const manager = exactOne(
    employees,
    (employee) => employee?.email === MANAGER_EMAIL,
    "assignable project manager",
  );
  if (!manager) {
    throw new Error(`No assignable project manager found for ${MANAGER_EMAIL}`);
  }

  const customers = asArray<any>(customerRes);
  let customer =
    exactOne(
      customers,
      (entry) => entry?.organizationNumber === ORG_NUMBER && entry?.name === CUSTOMER_NAME,
      "customer by org number and name",
    ) ??
    exactOne(
      customers,
      (entry) => entry?.organizationNumber === ORG_NUMBER,
      "customer by org number",
    );

  if (!customer) {
    const createdCustomer = await request<unknown>("POST", "/customer", {
      body: {
        name: CUSTOMER_NAME,
        organizationNumber: ORG_NUMBER,
        invoiceSendMethod: "MANUAL",
      },
    });
    customer = asValue<any>(createdCustomer);
  }

  const projectRes = await request<unknown>("GET", "/project", {
    query: {
      name: PROJECT_NAME,
      customerId: customer.id,
      count: 50,
      fields: "*",
    },
  });
  const projects = asArray<any>(projectRes);
  const projectMatch =
    exactOne(
      projects,
      (project) => project?.name === PROJECT_NAME && project?.customer?.id === customer.id && project?.isClosed !== true,
      "open project",
    ) ??
    exactOne(
      projects,
      (project) => project?.name === PROJECT_NAME && project?.customer?.id === customer.id,
      "project",
    );

  let project: any;
  if (projectMatch) {
    const updatedProject = await request<unknown>("PUT", `/project/${projectMatch.id}`, {
      body: {
        id: projectMatch.id,
        version: projectMatch.version,
        name: PROJECT_NAME,
        startDate: projectMatch.startDate ?? TODAY,
        customer: { id: customer.id },
        projectManager: { id: manager.id },
        isFixedPrice: true,
        fixedprice: FIXED_PRICE,
        invoiceOnAccountVatHigh: false,
      },
    });
    project = asValue<any>(updatedProject);
  } else {
    const createdProject = await request<unknown>("POST", "/project", {
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
    project = asValue<any>(createdProject);
  }

  if (project.name !== PROJECT_NAME || project.customer?.id !== customer.id || project.projectManager?.id !== manager.id) {
    throw new Error(`Project verification failed: ${JSON.stringify(project, null, 2)}`);
  }
  if (project.isFixedPrice !== true || Number(project.fixedprice) !== FIXED_PRICE) {
    throw new Error(`Project fixed price verification failed: ${JSON.stringify(project, null, 2)}`);
  }

  const orderRes = await request<unknown>("POST", "/order", {
    body: {
      customer: { id: customer.id },
      project: { id: project.id },
      orderDate: TODAY,
      deliveryDate: TODAY,
      invoiceOnAccountVatHigh: false,
    },
  });
  const order = asValue<any>(orderRes);

  const invoiceRes = await request<unknown>("PUT", `/order/${order.id}/:invoice`, {
    query: {
      invoiceDate: TODAY,
      sendToCustomer: false,
      createOnAccount: "WITHOUT_VAT",
      amountOnAccount: PARTIAL_AMOUNT,
    },
  });
  const invoice = asValue<any>(invoiceRes);

  if (invoice.customer?.id !== customer.id) {
    throw new Error(`Invoice customer verification failed: ${JSON.stringify(invoice, null, 2)}`);
  }
  if (Number(invoice.amountExcludingVatCurrency) !== PARTIAL_AMOUNT) {
    throw new Error(`Invoice amount verification failed: ${JSON.stringify(invoice, null, 2)}`);
  }

  const projectInvoiceDetail = Array.isArray(invoice.projectInvoiceDetails)
    ? invoice.projectInvoiceDetails.find((detail: any) => detail?.project?.id === project.id)
    : null;

  console.log(
    JSON.stringify(
      {
        customerId: customer.id,
        managerId: manager.id,
        projectId: project.id,
        orderId: order.id,
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        amountExcludingVatCurrency: invoice.amountExcludingVatCurrency,
        amountCurrency: invoice.amountCurrency,
        projectInvoiceDetail: projectInvoiceDetail
          ? {
              projectId: projectInvoiceDetail.project?.id,
              onAccountBalanceAmountCurrency: projectInvoiceDetail.onAccountBalanceAmountCurrency,
            }
          : null,
      },
      null,
      2,
    ),
  );
}

await main();
