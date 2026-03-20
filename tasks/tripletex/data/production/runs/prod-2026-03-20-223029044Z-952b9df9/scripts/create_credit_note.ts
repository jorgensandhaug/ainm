const BASE_URL = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const SESSION_TOKEN = "W_LHi2usM1uEPAmgILeZ3geRYiQP8p0HyPP4uJ4Mckk";
const ORG_NO = "882988155";
const DESCRIPTION = "Heures de conseil";
const AMOUNT_EX_VAT = 40900;
const CREDIT_DATE = "2026-03-20";
const INVOICE_DATE_TO = "2026-03-21";

type Invoice = {
  id: number;
  invoiceNumber?: string | number;
  invoiceDate?: string;
  isCreditNote?: boolean;
  isCredited?: boolean;
  amountExcludingVatCurrency?: number;
  amountExcludingVat?: number;
  customer?: { organizationNumber?: string | number | null } | null;
  orderLines?: Array<{ description?: string | null }> | null;
  orders?: Array<{
    orderLines?: Array<{ description?: string | null }> | null;
  }> | null;
};

type ResponseWrapper<T> = {
  value?: T;
  values?: T[];
  error?: string;
  message?: string;
  source?: string;
  validationMessages?: unknown;
};

function endpoint(path: string): URL {
  return new URL(path, BASE_URL.endsWith("/") ? BASE_URL : `${BASE_URL}/`);
}

function authHeader(): string {
  return `Basic ${Buffer.from(`0:${SESSION_TOKEN}`).toString("base64")}`;
}

async function api<T>(url: URL, init?: RequestInit): Promise<ResponseWrapper<T>> {
  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: authHeader(),
      Accept: "application/json",
      ...(init?.headers ?? {}),
    },
  });

  const text = await response.text();
  const body = text ? JSON.parse(text) : {};

  if (!response.ok) {
    const error = new Error(`HTTP ${response.status}`);
    (error as Error & { status?: number; body?: unknown }).status = response.status;
    (error as Error & { status?: number; body?: unknown }).body = body;
    throw error;
  }

  return body;
}

function invoiceMatches(invoice: Invoice): boolean {
  if (invoice.isCreditNote || invoice.isCredited) return false;

  const orgNo = String(invoice.customer?.organizationNumber ?? "");
  if (orgNo !== ORG_NO) return false;

  const amount = invoice.amountExcludingVatCurrency ?? invoice.amountExcludingVat;
  if (amount !== AMOUNT_EX_VAT) return false;

  const descriptions = new Set<string>();
  for (const line of invoice.orderLines ?? []) {
    if (line?.description) descriptions.add(line.description);
  }
  for (const order of invoice.orders ?? []) {
    for (const line of order.orderLines ?? []) {
      if (line?.description) descriptions.add(line.description);
    }
  }

  return descriptions.has(DESCRIPTION);
}

function isInvalidToken(body: unknown): boolean {
  const error = typeof body === "object" && body !== null ? String((body as { error?: unknown }).error ?? "") : "";
  return (
    error === "Invalid or expired token" ||
    error === "Invalid or expired proxy token. Each submission receives a unique token - do not reuse tokens from previous submissions."
  );
}

async function main() {
  try {
    const searchUrl = endpoint("invoice");
    searchUrl.searchParams.set("invoiceDateFrom", "2000-01-01");
    searchUrl.searchParams.set("invoiceDateTo", INVOICE_DATE_TO);
    searchUrl.searchParams.set("count", "1000");
    searchUrl.searchParams.set("sorting", "-invoiceDate");
    searchUrl.searchParams.set("fields", "*,customer(*),orderLines(*),orders(*,orderLines(*))");

    const search = await api<Invoice>(searchUrl);
    const matches = (search.values ?? []).filter(invoiceMatches);

    if (matches.length !== 1) {
      throw new Error(`Expected exactly 1 invoice match, got ${matches.length}`);
    }

    const original = matches[0];
    const creditUrl = endpoint(`invoice/${original.id}/:createCreditNote`);
    creditUrl.searchParams.set("date", CREDIT_DATE);
    creditUrl.searchParams.set("sendToCustomer", "false");

    const credit = await api<Invoice & { creditedInvoice?: number | { id?: number } | null }>(creditUrl, {
      method: "PUT",
    });

    const created = credit.value;
    const creditedInvoiceId =
      typeof created?.creditedInvoice === "object" && created.creditedInvoice !== null
        ? created.creditedInvoice.id
        : created?.creditedInvoice;

    if (!created?.isCreditNote || creditedInvoiceId !== original.id) {
      throw new Error("Credit note verification failed");
    }

    console.log(
      JSON.stringify({
        ok: true,
        originalInvoiceId: original.id,
        originalInvoiceNumber: original.invoiceNumber ?? null,
        creditNoteId: created.id,
        creditNoteNumber: created.invoiceNumber ?? null,
      }),
    );
  } catch (error) {
    const status = (error as Error & { status?: number }).status;
    const body = (error as Error & { body?: unknown }).body;

    if (status === 403 && isInvalidToken(body)) {
      console.log(JSON.stringify({ blocked: true, reason: "invalid_token", body }));
      process.exit(2);
    }

    console.error(
      JSON.stringify({
        ok: false,
        message: error instanceof Error ? error.message : String(error),
        status: status ?? null,
        body: body ?? null,
      }),
    );
    process.exit(1);
  }
}

await main();
