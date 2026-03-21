const BASE_URL = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "Y2-TDhAD9SOTqA20rygZU9D5pP9Mef0O44az7Y_Ryt0";

const PROJECT_NAME = "Cloud-Migration Brückentor";
const CUSTOMER_ORG = "882854000";
const INVOICE_DATE = "2026-03-21";
const DELIVERY_DATE = "2026-03-25";
const PROJECT_BUDGET = 262850;
const BANK_ACCOUNT_NUMBER = "12345678903";

type AnyRecord = Record<string, any>;

function urlFor(path: string, query?: Record<string, string | number | boolean | undefined>) {
  const base = BASE_URL.replace(/\/+$/, "");
  const url = new URL(`${base}/${path}`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

function unwrap<T>(json: any): T {
  if (json?.values !== undefined) return json.values as T;
  if (json?.value !== undefined) return json.value as T;
  return json as T;
}

function authHeader() {
  return `Basic ${Buffer.from(`0:${TOKEN}`).toString("base64")}`;
}

async function request<T = any>(
  method: string,
  path: string,
  opts: { query?: Record<string, string | number | boolean | undefined>; body?: any } = {},
) {
  const res = await fetch(urlFor(path, opts.query), {
    method,
    headers: {
      Authorization: authHeader(),
      Accept: "application/json",
      ...(opts.body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  const text = await res.text();
  const parsed = text ? safeJson(text) : null;
  if (!res.ok) {
    const msg = typeof parsed === "string" ? parsed : JSON.stringify(parsed);
    const err = new Error(`${method} ${path} failed (${res.status}): ${msg}`) as Error & { status?: number; body?: any };
    err.status = res.status;
    err.body = parsed;
    throw err;
  }
  if (!text) return null as T;
  return unwrap<T>(parsed);
}

function safeJson(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function chooseVatType(vats: AnyRecord[]) {
  const vat25 = vats.find((vat) => Number(vat?.percentage) === 25);
  if (!vat25) throw new Error(`No outgoing 25% VAT row available: ${JSON.stringify(vats)}`);
  return vat25;
}

async function main() {
  const projects = await request<AnyRecord[]>("GET", "project", {
    query: { name: PROJECT_NAME, count: 50, fields: "*,customer(*)" },
  });
  const project =
    projects.find(
      (item) =>
        item?.name === PROJECT_NAME &&
        String(item?.customer?.organizationNumber ?? "") === CUSTOMER_ORG,
    ) ?? null;
  if (!project?.customer?.id) {
    throw new Error(`Project not found for ${PROJECT_NAME} / ${CUSTOMER_ORG}`);
  }

  const vatTypes = await request<AnyRecord[]>("GET", "ledger/vatType", {
    query: { typeOfVat: "OUTGOING", vatDate: INVOICE_DATE, fields: "*" },
  });
  const vatType = chooseVatType(vatTypes);

  const order = await request<AnyRecord>("POST", "order", {
    body: {
      customer: { id: project.customer.id },
      project: { id: project.id },
      orderDate: INVOICE_DATE,
      deliveryDate: DELIVERY_DATE,
      orderLines: [
        {
          description: PROJECT_NAME,
          count: 1,
          unitPriceExcludingVatCurrency: PROJECT_BUDGET,
          vatType: { id: vatType.id },
        },
      ],
    },
  });

  let invoice: AnyRecord;
  try {
    invoice = await request<AnyRecord>("PUT", `order/${order.id}/:invoice`, {
      query: { invoiceDate: INVOICE_DATE, sendToCustomer: false },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes("Faktura kan ikke opprettes før selskapet har registrert et bankkontonummer")) {
      throw error;
    }
    const bankAccounts = await request<AnyRecord[]>("GET", "ledger/account", {
      query: { isBankAccount: true, fields: "*" },
    });
    const account =
      bankAccounts.find((item) => item?.isInvoiceAccount) ??
      bankAccounts.find((item) => Number(item?.number) === 1920) ??
      bankAccounts[0];
    if (!account?.id) throw new Error("No bank account found for repair.");
    await request<AnyRecord>("PUT", `ledger/account/${account.id}`, {
      body: { bankAccountNumber: BANK_ACCOUNT_NUMBER },
    });
    invoice = await request<AnyRecord>("PUT", `order/${order.id}/:invoice`, {
      query: { invoiceDate: INVOICE_DATE, sendToCustomer: false },
    });
  }

  console.log(
    JSON.stringify(
      {
        projectId: project.id,
        customerId: project.customer.id,
        orderId: order.id,
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        amountExcludingVatCurrency: invoice.amountExcludingVatCurrency,
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
