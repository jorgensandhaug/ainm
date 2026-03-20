const BASE_URL = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const SESSION_TOKEN = "wigPQjdvaV7x7YGSZSHViwFDVVLkrPIXUEOY8bQMrlE";

const INVOICE_ID = 2147525978;
const CUSTOMER_ORG_NO = "850116091";
const PROJECT_NAME = "Infrastructure Upgrade";
const PROJECT_MANAGER_EMAIL = "charlotte.walker@example.org";
const FIXED_PRICE = 170500;
const MILESTONE_AMOUNT = 56265;

type Wrapper<T> = {
  value?: T;
};

type Invoice = {
  id: number;
  amountExcludingVatCurrency?: number;
  customer?: {
    id?: number;
    organizationNumber?: string;
    name?: string;
  };
  orders?: Array<{
    id?: number;
    project?: {
      id?: number;
      name?: string;
      isFixedPrice?: boolean;
      fixedprice?: number;
      customer?: {
        id?: number;
        organizationNumber?: string;
      };
      projectManager?: {
        id?: number;
        email?: string;
      };
    };
    orderLines?: Array<{
      id?: number;
      unitPriceExcludingVatCurrency?: number;
      amountExcludingVatCurrency?: number;
    }>;
  }>;
  orderLines?: Array<{
    id?: number;
    unitPriceExcludingVatCurrency?: number;
    amountExcludingVatCurrency?: number;
  }>;
};

function authHeader(): string {
  return `Basic ${Buffer.from(`0:${SESSION_TOKEN}`).toString("base64")}`;
}

async function request<T>(path: string): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`, {
    headers: {
      Authorization: authHeader(),
      Accept: "application/json",
    },
  });

  const text = await response.text();
  const body = text ? JSON.parse(text) : undefined;

  if (!response.ok) {
    throw new Error(
      JSON.stringify(
        {
          method: "GET",
          path,
          status: response.status,
          body,
        },
        null,
        2,
      ),
    );
  }

  return body as T;
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

async function main(): Promise<void> {
  const fields =
    "*,customer(*),orders(*,customer(*),project(*,customer(*),projectManager(*)),orderLines(*)),orderLines(*)";
  const invoiceRes = await request<Wrapper<Invoice>>(
    `/invoice/${INVOICE_ID}?fields=${encodeURIComponent(fields)}`,
  );

  const invoice = invoiceRes.value;
  assert(invoice?.id === INVOICE_ID, "Invoice id mismatch");
  assert(invoice.amountExcludingVatCurrency === MILESTONE_AMOUNT, "Invoice amount mismatch");
  assert(invoice.customer?.organizationNumber === CUSTOMER_ORG_NO, "Invoice customer mismatch");

  const order = invoice.orders?.[0];
  const project = order?.project;

  assert(project?.name === PROJECT_NAME, "Project name mismatch");
  assert(project.isFixedPrice === true, "Project isFixedPrice mismatch");
  assert(project.fixedprice === FIXED_PRICE, "Project fixed price mismatch");
  assert(project.customer?.organizationNumber === CUSTOMER_ORG_NO, "Project customer mismatch");
  assert(project.projectManager?.email === PROJECT_MANAGER_EMAIL, "Project manager mismatch");

  const line = order?.orderLines?.[0] ?? invoice.orderLines?.[0];
  assert(
    line?.unitPriceExcludingVatCurrency === MILESTONE_AMOUNT ||
      line?.amountExcludingVatCurrency === MILESTONE_AMOUNT,
    "Invoice line amount mismatch",
  );

  console.log(
    JSON.stringify(
      {
        invoiceId: invoice.id,
        invoiceAmountExcludingVatCurrency: invoice.amountExcludingVatCurrency,
        customerOrgNo: invoice.customer?.organizationNumber,
        projectId: project?.id,
        projectName: project?.name,
        projectIsFixedPrice: project?.isFixedPrice,
        projectFixedPrice: project?.fixedprice,
        projectManagerEmail: project?.projectManager?.email,
      },
      null,
      2,
    ),
  );
}

await main();
