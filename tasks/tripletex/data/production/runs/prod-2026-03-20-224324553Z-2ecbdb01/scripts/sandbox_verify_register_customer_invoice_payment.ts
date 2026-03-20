const BASE_URL = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN =
  "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const RUN_DATE = "2026-03-20";

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
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) {
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

function collectTexts(invoice: AnyObj): string[] {
  const top = Array.isArray(invoice.orderLines) ? invoice.orderLines : [];
  const nested = Array.isArray(invoice.orders)
    ? invoice.orders.flatMap((order: AnyObj) => (Array.isArray(order.orderLines) ? order.orderLines : []))
    : [];
  const lines = [...top, ...nested];
  return lines
    .flatMap((line) => [line?.description, line?.displayName])
    .filter((text): text is string => typeof text === "string" && text.trim() !== "");
}

function paymentTypeScore(type: AnyObj): number {
  const debit = String(type?.debitAccount?.number ?? "");
  let score = 0;
  if (debit.startsWith("192")) score += 100;
  else if (debit.startsWith("19")) score += 80;
  else if (debit.startsWith("190")) score += 40;
  if (type?.debitAccount?.isBankAccount === true) score += 20;
  if (type?.debitAccount?.isInvoiceAccount === true) score += 10;
  if (type?.creditAccount == null) score += 2;
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
  const candidates = invoices
    .map((invoice: AnyObj) => {
      const outstanding =
        toNumber(invoice?.amountCurrencyOutstanding) ??
        toNumber(invoice?.amountOutstanding) ??
        0;
      const exVat =
        toNumber(invoice?.amountExcludingVatCurrency) ??
        toNumber(invoice?.amountExcludingVat);
      const org = String(invoice?.customer?.organizationNumber ?? "");
      const texts = collectTexts(invoice);
      return {
        invoice,
        outstanding,
        exVat,
        org,
        texts,
      };
    })
    .filter((entry) => entry.outstanding > 0 && entry.exVat != null && entry.org && entry.texts.length > 0);

  const groups = new Map<string, typeof candidates>();
  for (const entry of candidates) {
    for (const text of entry.texts) {
      const key = `${entry.org}|${entry.exVat}|${text.trim()}`;
      const group = groups.get(key) ?? [];
      group.push(entry);
      groups.set(key, group);
    }
  }

  const rankedGroups = [...groups.entries()].sort((a, b) => {
    const aText = a[0].split("|")[2].toLowerCase();
    const bText = b[0].split("|")[2].toLowerCase();
    const aBonus = aText === "konsulenttimer" ? 1 : 0;
    const bBonus = bText === "konsulenttimer" ? 1 : 0;
    if (bBonus !== aBonus) return bBonus - aBonus;
    return a[1][0].invoice.id - b[1][0].invoice.id;
  });

  if (rankedGroups.length < 1) {
    throw new Error("No unpaid invoice analog found in sandbox");
  }

  const [key, group] = rankedGroups[0];
  const selected = group[group.length - 1];
  const [org, exVat, text] = key.split("|");
  const invoice = selected.invoice;
  const invoiceId = invoice.id;
  const outstanding = selected.outstanding;

  const invoiceKeysWithPayment = Object.keys(invoice).filter((k) => /payment/i.test(k));

  const paymentTypeRes = await tripletexFetch("invoice/paymentType", undefined, {
    count: "1000",
    fields: "*,debitAccount(*),creditAccount(*)",
  });
  const paymentTypes = Array.isArray(paymentTypeRes?.values) ? paymentTypeRes.values : [];
  const ranked = paymentTypes
    .filter((type) => type?.id && String(type?.debitAccount?.number ?? "").startsWith("19"))
    .sort((a, b) => paymentTypeScore(b) - paymentTypeScore(a));
  if (ranked.length < 1) {
    throw new Error("No bank-style incoming payment type found");
  }
  const paymentType = ranked[0];

  const paymentRes = await tripletexFetch(
    `invoice/${invoiceId}/:payment`,
    { method: "PUT" },
    {
      paymentDate: RUN_DATE,
      paymentTypeId: String(paymentType.id),
      paidAmount: String(outstanding),
    },
  );

  const value = paymentRes?.value ?? paymentRes;
  const remaining =
    toNumber(value?.amountCurrencyOutstanding) ??
    toNumber(value?.amountOutstanding) ??
    toNumber(value?.remainingOutstanding);

  if (remaining !== 0) {
    throw new Error(`Sandbox payment did not settle invoice: remaining=${remaining}`);
  }

  console.log(
    JSON.stringify({
      analog: { invoiceId, org, exVat: Number(exVat), text, outstanding },
      sandboxPromptUniquenessCount: group.length,
      invoiceKeysWithPayment,
      chosenPaymentType: {
        id: paymentType.id,
        name: paymentType.name ?? null,
        debitAccountNumber: paymentType?.debitAccount?.number ?? null,
        debitIsBankAccount: paymentType?.debitAccount?.isBankAccount ?? null,
        debitIsInvoiceAccount: paymentType?.debitAccount?.isInvoiceAccount ?? null,
        creditAccountNumber: paymentType?.creditAccount?.number ?? null,
      },
      remaining,
    }),
  );
}

await main();
