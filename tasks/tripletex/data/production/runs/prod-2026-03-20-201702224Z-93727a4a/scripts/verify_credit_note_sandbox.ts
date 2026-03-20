const baseUrl = "https://kkpqfuj-amager.tripletex.dev/v2/";
const token =
  "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";

const runDate = "2026-03-20";
const invoiceDateTo = "2026-03-21";
const description = "Analysebericht";
const amountExcludingVat = 30200;

const auth = `Basic ${Buffer.from(`0:${token}`).toString("base64")}`;

type JsonObject = Record<string, unknown>;

function endpoint(pathWithQuery: string): URL {
  return new URL(pathWithQuery, baseUrl);
}

async function tripletex<T>(pathWithQuery: string, init?: RequestInit): Promise<T> {
  const response = await fetch(endpoint(pathWithQuery), {
    ...init,
    headers: {
      Accept: "application/json",
      Authorization: auth,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`${response.status} ${response.statusText}: ${text}`);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

function randomDigits(length: number): string {
  let out = "";
  while (out.length < length) {
    out += Math.floor(Math.random() * 10).toString();
  }
  return out.slice(0, length);
}

function checksum(weights: number[], digits: number[]): number {
  const sum = digits.reduce((acc, digit, index) => acc + digit * weights[index], 0);
  const remainder = 11 - (sum % 11);
  return remainder === 11 ? 0 : remainder;
}

function generateOrgNumber(): string {
  while (true) {
    const digits = Array.from(randomDigits(7), Number);
    const k1 = checksum([3, 2, 7, 6, 5, 4, 3], digits);
    if (k1 === 10) continue;
    const withK1 = [...digits, k1];
    const k2 = checksum([5, 4, 3, 2, 7, 6, 5, 4], withK1);
    if (k2 === 10) continue;
    return [...withK1, k2].join("");
  }
}

function lineMatches(line: unknown): boolean {
  return !!line && typeof line === "object" && (line as JsonObject).description === description;
}

function invoiceMatches(invoice: unknown, organizationNumber: string): boolean {
  if (!invoice || typeof invoice !== "object") {
    return false;
  }

  const value = invoice as JsonObject;
  const customer = value.customer as JsonObject | undefined;
  if (customer?.organizationNumber !== organizationNumber) {
    return false;
  }

  if (value.isCreditNote === true || value.isCredited === true) {
    return false;
  }

  const amount = value.amountExcludingVatCurrency ?? value.amountExcludingVat;
  if (amount !== amountExcludingVat) {
    return false;
  }

  const topLevelLines = Array.isArray(value.orderLines) ? value.orderLines : [];
  const nestedLines = (Array.isArray(value.orders) ? value.orders : []).flatMap((order) => {
    if (!order || typeof order !== "object") return [];
    const orderLines = (order as JsonObject).orderLines;
    return Array.isArray(orderLines) ? orderLines : [];
  });

  return [...topLevelLines, ...nestedLines].some(lineMatches);
}

async function main() {
  const organizationNumber = generateOrgNumber();
  const slug = organizationNumber.slice(-6);

  const customer = await tripletex<{ value?: JsonObject }>("customer", {
    method: "POST",
    body: JSON.stringify({
      name: `Sandbox Analysebericht ${slug} GmbH`,
      email: `sandbox-analysebericht-${slug}@example.com`,
      organizationNumber,
    }),
  });

  const customerId = customer.value?.id;
  if (typeof customerId !== "number") {
    throw new Error("Customer create did not return numeric id");
  }

  const vatTypes = await tripletex<{ values?: JsonObject[] }>(
    `ledger/vatType?typeOfVat=OUTGOING&vatDate=${runDate}&fields=*`,
  );
  const vatType = (vatTypes.values ?? []).find((item) => item.percentage === 0);
  if (!vatType || typeof vatType.id !== "number") {
    throw new Error("Sandbox did not expose outgoing 0% VAT");
  }

  const invoice = await tripletex<{ value?: JsonObject }>("invoice?sendToCustomer=false", {
    method: "POST",
    body: JSON.stringify({
      invoiceDate: runDate,
      invoiceDueDate: runDate,
      customer: { id: customerId },
      orders: [
        {
          customer: { id: customerId },
          orderDate: runDate,
          deliveryDate: runDate,
          orderLines: [
            {
              description,
              count: 1,
              unitPriceExcludingVatCurrency: amountExcludingVat,
              vatType: { id: vatType.id },
            },
          ],
        },
      ],
    }),
  });

  const originalInvoiceId = invoice.value?.id;
  if (typeof originalInvoiceId !== "number") {
    throw new Error("Invoice create did not return numeric id");
  }

  const located = await tripletex<{ values?: JsonObject[] }>(
    `invoice?invoiceDateFrom=2000-01-01&invoiceDateTo=${invoiceDateTo}&count=1000&sorting=-invoiceDate&fields=*,customer(*),orderLines(*),orders(*,orderLines(*))`,
  );

  const matches = (located.values ?? []).filter((item) => invoiceMatches(item, organizationNumber));
  const unique = Array.from(new Map(matches.map((item) => [item.id, item])).values());
  if (unique.length !== 1) {
    throw new Error(`Expected exactly one located invoice, found ${unique.length}`);
  }

  const matchedId = unique[0].id;
  if (matchedId !== originalInvoiceId) {
    throw new Error(`Locate step matched ${matchedId}, expected ${originalInvoiceId}`);
  }

  const credit = await tripletex<{ value?: JsonObject }>(
    `invoice/${originalInvoiceId}/:createCreditNote?date=${runDate}&sendToCustomer=false`,
    { method: "PUT" },
  );

  const created = credit.value;
  if (!created || created.isCreditNote !== true || created.creditedInvoice !== originalInvoiceId) {
    throw new Error("Credit note response did not prove success");
  }

  console.log(
    JSON.stringify({
      organizationNumber,
      customerId,
      originalInvoiceId,
      creditNoteId: created.id,
      creditNoteNumber: created.invoiceNumber,
      vatTypeId: vatType.id,
    }),
  );
}

await main();
