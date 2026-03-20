const baseUrl = "https://kkpqfuj-amager.tripletex.dev/v2";
const sessionToken =
  "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";

const invoiceDate = "2026-03-20";
const invoiceDueDate = addDays(invoiceDate, 14);
const customerName = "Colline SARL Sandbox Probe";
const organizationNumber = "944164341";
const description = "Service reseau";
const amountExcludingVat = 44750;

type ApiErrorPayload = {
  error?: string;
  message?: string;
  validationMessages?: Array<{ field?: string; message?: string }>;
};

type Customer = {
  id: number;
};

type VatType = {
  id: number;
  percentage?: number;
  number?: string;
  displayName?: string;
};

const authHeader = `Basic ${Buffer.from(`0:${sessionToken}`).toString("base64")}`;

async function main() {
  const customer = await createCustomer();
  const vatResponse = await api(
    `ledger/vatType?typeOfVat=OUTGOING&vatDate=${invoiceDate}&fields=*`,
  );
  const vatTypes: VatType[] = vatResponse.values ?? [];
  const vat25 = vatTypes.find((value) => Number(value.percentage) === 25) ?? null;
  const vat0 = vatTypes.find((value) => Number(value.percentage) === 0) ?? null;

  const noVatAttempt = await attemptInvoice(customer.id, undefined);
  const hardcoded3Attempt = await attemptInvoice(customer.id, 3);
  const resolved0Attempt = vat0 ? await attemptInvoice(customer.id, vat0.id) : null;

  console.log(
    JSON.stringify(
      {
        customerId: customer.id,
        vatTypes: vatTypes.map((value) => ({
          id: value.id,
          percentage: value.percentage,
          number: value.number,
          displayName: value.displayName,
        })),
        vat25Found: Boolean(vat25),
        noVatAttempt,
        hardcoded3Attempt,
        resolved0Attempt,
      },
      null,
      2,
    ),
  );
}

async function createCustomer(): Promise<Customer> {
  const response = await api("customer", {
    method: "POST",
    body: {
      name: customerName,
      organizationNumber,
      invoiceSendMethod: "MANUAL",
    },
  });
  return response.value;
}

async function attemptInvoice(customerId: number, vatTypeId?: number) {
  try {
    const response = await api("invoice", {
      method: "POST",
      body: buildInvoicePayload(customerId, vatTypeId),
    });
    return {
      ok: true,
      invoiceId: response.value?.id,
      invoiceNumber: response.value?.invoiceNumber,
      amountExcludingVatCurrency: response.value?.amountExcludingVatCurrency,
      amountCurrency: response.value?.amountCurrency,
      vatTypeId: vatTypeId ?? null,
    };
  } catch (error) {
    const payload = (error as Error & { payload?: ApiErrorPayload }).payload;
    return {
      ok: false,
      vatTypeId: vatTypeId ?? null,
      error: payload?.error ?? null,
      message: payload?.message ?? null,
      validationMessages: payload?.validationMessages?.map((entry) => entry.message) ?? [],
    };
  }
}

function buildInvoicePayload(customerId: number, vatTypeId?: number) {
  return {
    invoiceDate,
    invoiceDueDate,
    customer: { id: customerId },
    orders: [
      {
        customer: { id: customerId },
        orderDate: invoiceDate,
        deliveryDate: invoiceDate,
        orderLines: [
          {
            description,
            count: 1,
            unitPriceExcludingVatCurrency: amountExcludingVat,
            ...(vatTypeId ? { vatType: { id: vatTypeId } } : {}),
          },
        ],
      },
    ],
  };
}

async function api(
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<any> {
  const response = await fetch(new URL(path, `${baseUrl}/`), {
    method: init.method ?? "GET",
    headers: {
      Authorization: authHeader,
      Accept: "application/json",
      ...(init.body ? { "Content-Type": "application/json; charset=utf-8" } : {}),
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
  });

  const text = await response.text();
  const payload = text ? safeJsonParse(text) : undefined;
  if (!response.ok) {
    const error = new Error(`${response.status} ${response.statusText}`);
    (error as Error & { status?: number; payload?: ApiErrorPayload }).status = response.status;
    (error as Error & { status?: number; payload?: ApiErrorPayload }).payload =
      payload ?? { message: text };
    throw error;
  }

  return payload;
}

function safeJsonParse(text: string): any {
  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
  }
}

function addDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

await main();
