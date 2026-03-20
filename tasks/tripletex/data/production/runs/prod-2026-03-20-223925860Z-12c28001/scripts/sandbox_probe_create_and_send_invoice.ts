const baseUrl = "https://kkpqfuj-amager.tripletex.dev/v2";
const sessionToken =
  "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";

const invoiceDate = "2026-03-20";
const customerName = "Nordhav Reflection 12c28001 AS";
const organizationNumber = "999280012";

type JsonRecord = Record<string, any>;

function buildUrl(path: string, query?: Record<string, string>) {
  const url = new URL(path, baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      url.searchParams.append(key, value);
    }
  }
  return url.toString();
}

async function request<T = any>(
  method: string,
  path: string,
  options?: { query?: Record<string, string>; body?: JsonRecord }
): Promise<{ status: number; bodyText: string; data: T | null }> {
  const response = await fetch(buildUrl(path, options?.query), {
    method,
    headers: {
      Authorization: `Basic ${Buffer.from(`0:${sessionToken}`).toString("base64")}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: options?.body ? JSON.stringify(options.body) : undefined,
  });

  const bodyText = await response.text();
  let data: T | null = null;
  if (bodyText) {
    try {
      data = JSON.parse(bodyText);
    } catch {
      data = null;
    }
  }

  return { status: response.status, bodyText, data };
}

function assertOk(response: { status: number; bodyText: string }, label: string) {
  if (response.status >= 200 && response.status < 300) return;
  throw new Error(`${label} failed (${response.status}): ${response.bodyText}`);
}

async function main() {
  const customerResponse = await request<{ value?: { id?: number } }>("POST", "customer", {
    body: {
      name: customerName,
      organizationNumber,
      invoiceSendMethod: "MANUAL",
    },
  });
  assertOk(customerResponse, "Create customer");

  const vatResponse = await request("GET", "ledger/vatType", {
    query: {
      typeOfVat: "OUTGOING",
      vatDate: invoiceDate,
      fields: "*",
    },
  });
  assertOk(vatResponse, "Resolve VAT");

  const vatValues = Array.isArray(vatResponse.data?.values) ? vatResponse.data.values : [];
  const vat25 = vatValues.find((item: any) => Number(item?.percentage) === 25) ?? null;

  console.log(
    JSON.stringify(
      {
        customerId: customerResponse.data?.value?.id ?? null,
        customerName,
        organizationNumber,
        invoiceDate,
        vatTypes: vatValues.map((item: any) => ({
          id: item?.id ?? null,
          percentage: item?.percentage ?? null,
          name: item?.name ?? null,
        })),
        exact25Available: Boolean(vat25),
        blockedForTaxedCreateAndSend: !vat25,
      },
      null,
      2
    )
  );
}

await main();
