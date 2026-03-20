const BASE_URL = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const SESSION_TOKEN = "7yrKlysCrzgz9R1w0qqvKS5pn-JJ3WIIXXbArdyLsgo";
const TODAY = "2026-03-20";

const auth = `Basic ${Buffer.from(`0:${SESSION_TOKEN}`).toString("base64")}`;

type TripletexList<T> = {
  values?: T[];
  fullResultSize?: number;
};

type TripletexValue<T> = {
  value?: T;
};

type Customer = {
  id?: number;
  name?: string;
  organizationNumber?: string;
};

type OrderLine = {
  id?: number;
  description?: string;
  amountExcludingVatCurrency?: number;
};

type Order = {
  id?: number;
  orderLines?: OrderLine[];
};

type Invoice = {
  id?: number;
  invoiceNumber?: number;
  invoiceDate?: string;
  customer?: Customer;
  amountExcludingVat?: number;
  amountExcludingVatCurrency?: number;
  amountOutstanding?: number;
  amountCurrencyOutstanding?: number;
  isCreditNote?: boolean;
  isCredited?: boolean;
  creditedInvoice?: number;
  orderLines?: OrderLine[];
  orders?: Order[];
};

async function tripletex<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      Authorization: auth,
      Accept: "application/json",
      ...(init?.headers ?? {}),
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status} ${res.statusText}\n${text}`);
  }

  return (await res.json()) as T;
}

function invoiceLineDescriptions(invoice: Invoice): string[] {
  const fromInvoice = invoice.orderLines ?? [];
  const fromOrders = (invoice.orders ?? []).flatMap((order) => order.orderLines ?? []);
  return [...fromInvoice, ...fromOrders]
    .map((line) => line.description?.trim())
    .filter((value): value is string => Boolean(value));
}

function hasTargetLine(invoice: Invoice): boolean {
  return invoiceLineDescriptions(invoice).includes("Consultoria de dados");
}

function hasTargetAmount(invoice: Invoice): boolean {
  return invoice.amountExcludingVat === 12000 || invoice.amountExcludingVatCurrency === 12000;
}

async function main() {
  const invoiceSearch = await tripletex<TripletexList<Invoice>>(
    `/invoice?invoiceDateFrom=2000-01-01&invoiceDateTo=2026-03-21&count=1000&sorting=-invoiceDate&fields=*,customer(*),orderLines(*),orders(*,orderLines(*))`,
  );

  const matches = (invoiceSearch.values ?? []).filter((invoice) => {
    return (
      invoice.customer?.organizationNumber === "890872492" &&
      !invoice.isCreditNote &&
      !invoice.isCredited &&
      hasTargetAmount(invoice) &&
      hasTargetLine(invoice)
    );
  });

  if (matches.length !== 1) {
    throw new Error(`Expected exactly one matching invoice, got ${matches.length}: ${JSON.stringify(matches, null, 2)}`);
  }

  const original = matches[0];
  if (!original.id) {
    throw new Error(`Matching invoice is missing id: ${JSON.stringify(original, null, 2)}`);
  }

  const creditNoteResp = await tripletex<TripletexValue<Invoice>>(
    `/invoice/${original.id}/:createCreditNote?date=${TODAY}&sendToCustomer=false`,
    { method: "PUT" },
  );

  const result = creditNoteResp.value;
  if (!result) {
    throw new Error("Missing response value from createCreditNote");
  }

  const verified =
    (result.isCreditNote === true && result.creditedInvoice === original.id) ||
    (result.id === original.id && result.isCredited === true);

  if (!verified) {
    throw new Error(
      `Credit note response did not prove success for invoice ${original.id}: ${JSON.stringify(result, null, 2)}`,
    );
  }

  console.log(
    JSON.stringify(
      {
        originalInvoiceId: original.id,
        originalInvoiceNumber: original.invoiceNumber,
        originalInvoiceDate: original.invoiceDate,
        creditNoteId: result.isCreditNote ? result.id : undefined,
        creditNoteInvoiceNumber: result.isCreditNote ? result.invoiceNumber : undefined,
        creditedInvoice: result.creditedInvoice,
        responseId: result.id,
        responseInvoiceNumber: result.invoiceNumber,
        responseIsCreditNote: result.isCreditNote,
        responseIsCredited: result.isCredited,
      },
      null,
      2,
    ),
  );
}

await main();
