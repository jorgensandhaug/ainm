const baseUrl = "https://kkpqfuj-amager.tripletex.dev/v2";
const sessionToken =
  "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";

const invoiceDate = "2026-03-20";
const invoiceDueDate = "2026-04-03";
const authHeader = `Basic ${Buffer.from(`0:${sessionToken}`).toString("base64")}`;

function endpointUrl(path: string): string {
  return new URL(path, baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`).toString();
}

async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("Authorization", authHeader);
  headers.set("Accept", "application/json");
  if (init.body !== undefined && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const response = await fetch(endpointUrl(path), { ...init, headers });
  const text = await response.text();
  const json = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${text}`);
  }
  return json as T;
}

function orgCheckDigit(firstEightDigits: string): string | null {
  const weights = [3, 2, 7, 6, 5, 4, 3, 2];
  const digits = firstEightDigits.split("").map(Number);
  const sum = digits.reduce((acc, digit, index) => acc + digit * weights[index], 0);
  const remainder = sum % 11;
  const check = 11 - remainder;
  if (check === 11) return "0";
  if (check === 10) return null;
  return String(check);
}

function uniqueOrg(seed: number): string {
  let n = 80000000 + (seed % 10000000);
  while (n <= 99999999) {
    const prefix = String(n).padStart(8, "0");
    const check = orgCheckDigit(prefix);
    if (check) return `${prefix}${check}`;
    n += 1;
  }
  throw new Error("Unable to generate organization number");
}

async function createCustomer(name: string, organizationNumber: string) {
  const res = await api<{ value: { id: number; name: string; organizationNumber: string } }>("customer", {
    method: "POST",
    body: JSON.stringify({
      name,
      organizationNumber,
      invoiceSendMethod: "MANUAL",
    }),
  });
  return res.value;
}

async function getVatTypes() {
  return api<{ values: Array<{ id: number; name?: string; percentage?: number; typeOfVat?: string }> }>(
    `ledger/vatType?typeOfVat=OUTGOING&vatDate=${invoiceDate}&fields=*`,
  );
}

async function createInvoice(customerId: number, includeVatType: boolean, vatTypeId?: number) {
  const orderLine: Record<string, unknown> = {
    description: "Webdesign",
    count: 1,
    unitPriceExcludingVatCurrency: 20100,
  };
  if (includeVatType) {
    orderLine.vatType = { id: vatTypeId };
  }

  return api<{
    value: {
      id: number;
      invoiceNumber?: number | string;
      amountExcludingVatCurrency?: number;
      amountVatCurrency?: number;
      amountCurrency?: number;
      orderLines?: Array<{ id: number }>;
    };
  }>("invoice", {
    method: "POST",
    body: JSON.stringify({
      invoiceDate,
      invoiceDueDate,
      customer: { id: customerId },
      orders: [
        {
          customer: { id: customerId },
          orderDate: invoiceDate,
          deliveryDate: invoiceDate,
          orderLines: [orderLine],
        },
      ],
    }),
  });
}

async function main() {
  const seed = Date.now() % 10000000;
  const vatRes = await getVatTypes();

  const customerB = await createCustomer(
    "Codex Sandbox VAT Omitted",
    uniqueOrg(seed + 1000),
  );
  const invoiceB = await createInvoice(customerB.id, false);

  const customerC = await createCustomer(
    "Codex Sandbox VAT Hardcoded3",
    uniqueOrg(seed + 2000),
  );
  let hardcoded3Error: string | null = null;
  try {
    await createInvoice(customerC.id, true, 3);
  } catch (error) {
    hardcoded3Error = error instanceof Error ? error.message : String(error);
  }

  console.log(
    JSON.stringify(
      {
        vatTypes: vatRes.values.map((row) => ({
          id: row.id,
          percentage: row.percentage ?? null,
          name: row.name ?? null,
        })),
        omittedVat: {
          customerId: customerB.id,
          invoiceId: invoiceB.value.id,
          invoiceNumber: invoiceB.value.invoiceNumber ?? null,
          amountExcludingVatCurrency: invoiceB.value.amountExcludingVatCurrency ?? null,
          amountVatCurrency: invoiceB.value.amountVatCurrency ?? null,
          amountCurrency: invoiceB.value.amountCurrency ?? null,
        },
        hardcodedVat3: {
          customerId: customerC.id,
          error: hardcoded3Error,
        },
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
