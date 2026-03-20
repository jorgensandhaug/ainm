const baseUrl = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2/";
const token = "XInqo-GBrBO3H7df2aARPiAgSetzGAx71BqwCAsxCos";

const target = {
  organizationNumber: "962075754",
  description: "Analysebericht",
  amountExcludingVat: 30200,
  creditDate: "2026-03-20",
  invoiceDateTo: "2026-03-21",
};

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

function lineMatches(line: unknown): boolean {
  if (!line || typeof line !== "object") {
    return false;
  }

  return (line as JsonObject).description === target.description;
}

function invoiceMatches(invoice: unknown): boolean {
  if (!invoice || typeof invoice !== "object") {
    return false;
  }

  const value = invoice as JsonObject;
  const customer = value.customer as JsonObject | undefined;
  if (customer?.organizationNumber !== target.organizationNumber) {
    return false;
  }

  if (value.isCreditNote === true || value.isCredited === true) {
    return false;
  }

  const amount = value.amountExcludingVatCurrency ?? value.amountExcludingVat;
  if (amount !== target.amountExcludingVat) {
    return false;
  }

  const topLevelLines = Array.isArray(value.orderLines) ? value.orderLines : [];
  const nestedOrders = Array.isArray(value.orders) ? value.orders : [];
  const nestedLines = nestedOrders.flatMap((order) => {
    if (!order || typeof order !== "object") {
      return [];
    }

    const orderLines = (order as JsonObject).orderLines;
    return Array.isArray(orderLines) ? orderLines : [];
  });

  return [...topLevelLines, ...nestedLines].some(lineMatches);
}

async function main() {
  const search = await tripletex<{ values?: unknown[] }>(
    "invoice?invoiceDateFrom=2000-01-01&invoiceDateTo=2026-03-21&count=1000&sorting=-invoiceDate&fields=*,customer(*),orderLines(*),orders(*,orderLines(*))",
  );

  const matches = (search.values ?? []).filter(invoiceMatches) as JsonObject[];
  const unique = Array.from(new Map(matches.map((invoice) => [invoice.id, invoice])).values());

  if (unique.length !== 1) {
    throw new Error(`Expected exactly one matching invoice, found ${unique.length}`);
  }

  const original = unique[0];
  const originalId = original.id;
  if (typeof originalId !== "number") {
    throw new Error("Matched invoice missing numeric id");
  }

  const credit = await tripletex<{ value?: JsonObject }>(
    `invoice/${originalId}/:createCreditNote?date=${target.creditDate}&sendToCustomer=false`,
    { method: "PUT" },
  );

  const created = credit.value;
  if (!created || created.isCreditNote !== true || created.creditedInvoice !== originalId) {
    throw new Error("Credit note response did not prove success");
  }

  console.log(
    JSON.stringify({
      originalInvoiceId: originalId,
      creditNoteId: created.id,
      creditNoteNumber: created.invoiceNumber,
    }),
  );
}

await main();
