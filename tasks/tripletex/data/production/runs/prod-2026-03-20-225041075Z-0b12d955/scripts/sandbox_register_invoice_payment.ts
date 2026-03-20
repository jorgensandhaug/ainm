const baseUrl = "https://kkpqfuj-amager.tripletex.dev/v2";
const sessionToken =
  "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";

const paymentDate = "2026-03-20";
const organizationNumber = "841254546";
const amountExcludingVat = 28500;
const descriptionNeedle = "System Development";

const authHeader = `Basic ${Buffer.from(`0:${sessionToken}`).toString("base64")}`;

type Wrapper<T> = { value?: T; values?: T[]; error?: string; source?: string };

function urlFor(path: string, params?: Record<string, string>): string {
  const url = new URL(`${baseUrl.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`);
  for (const [key, value] of Object.entries(params ?? {})) url.searchParams.set(key, value);
  return url.toString();
}

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function normalizeText(value: unknown): string {
  return typeof value === "string" ? value.trim().toLocaleLowerCase("en-US") : "";
}

function getOutstanding(invoice: Record<string, unknown>): number {
  if (typeof invoice.amountCurrencyOutstanding === "number") return invoice.amountCurrencyOutstanding;
  if (typeof invoice.amountOutstanding === "number") return invoice.amountOutstanding;
  throw new Error("Missing outstanding amount");
}

function getExVat(invoice: Record<string, unknown>): number | null {
  if (typeof invoice.amountExcludingVatCurrency === "number") return invoice.amountExcludingVatCurrency;
  if (typeof invoice.amountExcludingVat === "number") return invoice.amountExcludingVat;
  return null;
}

function collectInvoiceTexts(invoice: Record<string, unknown>): string[] {
  const texts: string[] = [];
  const push = (value: unknown) => {
    if (typeof value === "string" && value.trim()) texts.push(value);
  };

  for (const line of asArray<Record<string, unknown>>(invoice.orderLines)) {
    push(line.description);
    push(line.displayName);
  }

  for (const order of asArray<Record<string, unknown>>(invoice.orders)) {
    push(order.invoiceComment);
    for (const line of asArray<Record<string, unknown>>(order.orderLines)) {
      push(line.description);
      push(line.displayName);
    }
  }

  return texts;
}

function matchesDescription(invoice: Record<string, unknown>): boolean {
  const needle = normalizeText(descriptionNeedle);
  return collectInvoiceTexts(invoice).some((value) => {
    const normalized = normalizeText(value);
    return normalized === needle || normalized.includes(needle);
  });
}

function paymentTypeScore(paymentType: Record<string, unknown>): number {
  const debitAccount = paymentType.debitAccount as Record<string, unknown> | undefined;
  const creditAccount = paymentType.creditAccount as Record<string, unknown> | undefined;
  const debitNumber = String(debitAccount?.number ?? "");
  const creditNumber = String(creditAccount?.number ?? "");
  const name = normalizeText(paymentType.name);
  let score = 0;
  if (debitNumber.startsWith("19")) score += 100;
  if (debitAccount?.isBankAccount === true) score += 80;
  if (debitAccount?.isInvoiceAccount === true) score += 60;
  if (name.includes("bank")) score += 20;
  if (name.includes("betalt")) score += 15;
  if (creditNumber.startsWith("15")) score += 5;
  if (creditAccount == null) score += 3;
  return score;
}

async function tripletex<T>(path: string, init?: RequestInit, params?: Record<string, string>): Promise<Wrapper<T>> {
  const response = await fetch(urlFor(path, params), {
    ...init,
    headers: {
      Authorization: authHeader,
      Accept: "application/json",
      ...(init?.headers ?? {}),
    },
  });

  const text = await response.text();
  const body = text ? (JSON.parse(text) as Wrapper<T>) : {};

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${text}`);
  }

  return body;
}

async function main() {
  const invoiceSearch = await tripletex<Record<string, unknown>[]>("invoice", undefined, {
    invoiceDateFrom: "2020-01-01",
    invoiceDateTo: "2030-12-31",
    count: "1000",
    sorting: "-invoiceDate",
    fields: "*,customer(*),currency(*),orderLines(*),orders(*,orderLines(*))",
  });

  const candidates = asArray<Record<string, unknown>>(invoiceSearch.values).filter((invoice) => {
    const customer = invoice.customer as Record<string, unknown> | undefined;
    return (
      String(customer?.organizationNumber ?? "") === organizationNumber &&
      getExVat(invoice) === amountExcludingVat &&
      getOutstanding(invoice) > 0 &&
      matchesDescription(invoice)
    );
  });

  if (candidates.length !== 1) {
    throw new Error(`Expected exactly one invoice candidate, found ${candidates.length}`);
  }

  const invoice = candidates[0];
  const invoiceId = invoice.id;
  if (typeof invoiceId !== "number") throw new Error("Missing invoice id");
  const outstanding = getOutstanding(invoice);

  const paymentTypeSearch = await tripletex<Record<string, unknown>[]>("invoice/paymentType", undefined, {
    count: "1000",
    fields: "*,debitAccount(*),creditAccount(*)",
  });

  const paymentType = [...asArray<Record<string, unknown>>(paymentTypeSearch.values)]
    .filter((item) => typeof item.id === "number")
    .sort((a, b) => paymentTypeScore(b) - paymentTypeScore(a))[0];

  if (!paymentType || typeof paymentType.id !== "number") throw new Error("No usable payment type");

  const paymentResult = await tripletex<Record<string, unknown>>(
    `invoice/${invoiceId}/:payment`,
    { method: "PUT" },
    {
      paymentDate,
      paymentTypeId: String(paymentType.id),
      paidAmount: String(outstanding),
    },
  );

  const paidInvoice = paymentResult.value;
  if (!paidInvoice) throw new Error("Missing payment response invoice");
  const remainingOutstanding = getOutstanding(paidInvoice);
  if (remainingOutstanding !== 0) {
    throw new Error(`Remaining outstanding ${remainingOutstanding}`);
  }

  console.log(
    JSON.stringify({
      invoiceId,
      paymentTypeId: paymentType.id,
      paidAmount: outstanding,
      remainingOutstanding,
    }),
  );
}

await main();
