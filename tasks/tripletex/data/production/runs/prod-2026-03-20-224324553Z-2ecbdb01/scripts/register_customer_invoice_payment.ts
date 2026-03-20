const BASE_URL = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "v84eNixcWXHl5sHimASpKMLAt6IbxOsNxdsqyfNq-ks";

const RUN_DATE = "2026-03-20";
const TARGET_ORG = "891380690";
const TARGET_EX_VAT = 10100;
const TARGET_TEXT = "Konsulenttimer";

const baseUrl = BASE_URL.replace(/\/+$/, "");
const auth = Buffer.from(`0:${TOKEN}`).toString("base64");

type AnyObj = Record<string, any>;

function buildUrl(path: string, params?: Record<string, string>): string {
  const url = `${baseUrl}/${path.replace(/^\/+/, "")}`;
  if (!params) return url;
  const search = new URLSearchParams(params);
  return `${url}?${search.toString()}`;
}

async function tripletexFetch(path: string, init?: RequestInit, params?: Record<string, string>) {
  const response = await fetch(buildUrl(path, params), {
    ...init,
    headers: {
      Authorization: `Basic ${auth}`,
      Accept: "application/json",
      ...(init?.headers ?? {}),
    },
  });

  const text = await response.text();
  let data: any = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }

  if (!response.ok) {
    if (
      response.status === 403 &&
      typeof data === "object" &&
      data &&
      (data.error === "Invalid or expired token" ||
        data.error ===
          "Invalid or expired proxy token. Each submission receives a unique token - do not reuse tokens from previous submissions.")
    ) {
      throw new Error(`Blocked credentials: ${JSON.stringify(data)}`);
    }
    throw new Error(`HTTP ${response.status}: ${JSON.stringify(data)}`);
  }

  return data;
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function normalize(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

function invoiceLines(invoice: AnyObj): AnyObj[] {
  const top = Array.isArray(invoice.orderLines) ? invoice.orderLines : [];
  const nested = Array.isArray(invoice.orders)
    ? invoice.orders.flatMap((order: AnyObj) => (Array.isArray(order.orderLines) ? order.orderLines : []))
    : [];
  return [...top, ...nested];
}

function invoiceTexts(invoice: AnyObj): string[] {
  const texts = invoiceLines(invoice).flatMap((line) => [
    line?.description,
    line?.displayName,
    line?.productDescription,
  ]);
  if (Array.isArray(invoice.orders)) {
    for (const order of invoice.orders) {
      texts.push(order?.invoiceComment);
      texts.push(order?.comment);
      texts.push(order?.deliveryComment);
    }
  }
  texts.push(invoice?.invoiceComment);
  texts.push(invoice?.comment);
  return texts.filter((value): value is string => typeof value === "string" && value.trim() !== "");
}

function exactInvoiceMatch(invoice: AnyObj): boolean {
  const org = String(invoice?.customer?.organizationNumber ?? "");
  if (org !== TARGET_ORG) return false;

  const exVat =
    toNumber(invoice?.amountExcludingVatCurrency) ??
    toNumber(invoice?.amountExcludingVat) ??
    Number.NaN;
  if (exVat !== TARGET_EX_VAT) return false;

  const outstanding =
    toNumber(invoice?.amountCurrencyOutstanding) ??
    toNumber(invoice?.amountOutstanding) ??
    0;
  if (!(outstanding > 0)) return false;

  const target = normalize(TARGET_TEXT);
  return invoiceTexts(invoice).some((text) => normalize(text) === target);
}

function paymentTypeScore(type: AnyObj): number {
  const debit = String(type?.debitAccount?.number ?? "");
  const credit = String(type?.creditAccount?.number ?? "");
  let score = 0;
  if (debit.startsWith("192")) score += 100;
  else if (debit.startsWith("19")) score += 80;
  else if (debit.startsWith("190")) score += 40;
  if (type?.debitAccount?.isBankAccount === true) score += 20;
  if (type?.debitAccount?.isInvoiceAccount === true) score += 10;
  if (credit === "" || credit === "null" || credit === "undefined") score += 2;
  return score;
}

async function main() {
  const invoiceRes = await tripletexFetch("invoice", undefined, {
    invoiceDateFrom: "2020-01-01",
    invoiceDateTo: "2030-12-31",
    count: "1000",
    sorting: "-invoiceDate",
    fields: "*,customer(*),currency(*),orderLines(*),orders(*,orderLines(*))",
  });

  const invoices = Array.isArray(invoiceRes?.values) ? invoiceRes.values : [];
  const matches = invoices.filter(exactInvoiceMatch);
  if (matches.length !== 1) {
    throw new Error(`Expected 1 invoice match, got ${matches.length}`);
  }

  const invoice = matches[0];
  const invoiceId = invoice?.id;
  const paidAmount =
    toNumber(invoice?.amountCurrencyOutstanding) ??
    toNumber(invoice?.amountOutstanding);
  if (!invoiceId || !paidAmount || !(paidAmount > 0)) {
    throw new Error(`Invoice missing payable amount/id: ${JSON.stringify(invoice)}`);
  }

  const paymentTypeRes = await tripletexFetch("invoice/paymentType", undefined, {
    count: "1000",
    fields: "*,debitAccount(*),creditAccount(*)",
  });

  const paymentTypes = Array.isArray(paymentTypeRes?.values) ? paymentTypeRes.values : [];
  const ranked = paymentTypes
    .filter((type) => type?.id && String(type?.debitAccount?.number ?? "").startsWith("19"))
    .sort((a, b) => paymentTypeScore(b) - paymentTypeScore(a));
  if (ranked.length < 1) {
    throw new Error("No usable incoming payment type found");
  }

  const paymentTypeId = ranked[0].id;
  const paymentRes = await tripletexFetch(
    `invoice/${invoiceId}/:payment`,
    { method: "PUT" },
    {
      paymentDate: RUN_DATE,
      paymentTypeId: String(paymentTypeId),
      paidAmount: String(paidAmount),
    },
  );

  const value = paymentRes?.value ?? paymentRes;
  const remaining =
    toNumber(value?.amountCurrencyOutstanding) ??
    toNumber(value?.amountOutstanding) ??
    toNumber(value?.remainingOutstanding);

  if (remaining !== 0) {
    throw new Error(`Payment write did not settle invoice: remaining=${remaining}`);
  }

  console.log(
    JSON.stringify({
      invoiceId,
      paymentTypeId,
      paidAmount,
      remaining,
    }),
  );
}

await main();
