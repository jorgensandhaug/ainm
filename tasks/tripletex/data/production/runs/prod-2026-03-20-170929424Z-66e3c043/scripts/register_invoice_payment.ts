const baseUrl = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const token = "WhmluFG8dtspO2kPPAfCA9zgAK6XR4ozvmCHfdyohWE";

const targetOrgNumber = "896571559";
const targetExVatAmount = 15200;
const targetText = "datarådgivning";
const paymentDate = "2026-03-20";

const auth = Buffer.from(`0:${token}`).toString("base64");

function endpoint(path: string, query?: Record<string, string>) {
  const url = new URL(path, baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      url.searchParams.set(key, value);
    }
  }
  return url.toString();
}

async function tripletexFetch(path: string, init?: RequestInit, query?: Record<string, string>) {
  const response = await fetch(endpoint(path, query), {
    ...init,
    headers: {
      Authorization: `Basic ${auth}`,
      Accept: "application/json",
      ...(init?.headers ?? {}),
    },
  });

  const text = await response.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${response.statusText}\n${typeof data === "string" ? data : JSON.stringify(data, null, 2)}`);
  }

  return data;
}

function asArray<T>(value: unknown): T[] {
  if (!value || typeof value !== "object") return [];
  const maybeValues = (value as { values?: unknown }).values;
  return Array.isArray(maybeValues) ? (maybeValues as T[]) : [];
}

function asValue<T>(value: unknown): T {
  if (!value || typeof value !== "object" || !("value" in value)) {
    return value as T;
  }
  return (value as { value: T }).value;
}

function getNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function normalize(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

function collectTexts(invoice: Record<string, unknown>) {
  const texts = new Set<string>();
  const push = (value: unknown) => {
    const normalized = normalize(value);
    if (normalized) texts.add(normalized);
  };

  for (const key of [
    "comment",
    "invoiceComment",
    "deliveryComment",
    "yourReference",
    "ourReference",
    "reference",
  ]) {
    push(invoice[key]);
  }

  const orderLines = Array.isArray(invoice.orderLines) ? invoice.orderLines : [];
  for (const line of orderLines) {
    if (!line || typeof line !== "object") continue;
    push((line as Record<string, unknown>).description);
    push((line as Record<string, unknown>).displayName);
    push((line as Record<string, unknown>).productName);
  }

  const orders = Array.isArray(invoice.orders) ? invoice.orders : [];
  for (const order of orders) {
    if (!order || typeof order !== "object") continue;
    const orderObj = order as Record<string, unknown>;
    push(orderObj.comment);
    push(orderObj.invoiceComment);
    const nestedLines = Array.isArray(orderObj.orderLines) ? orderObj.orderLines : [];
    for (const line of nestedLines) {
      if (!line || typeof line !== "object") continue;
      push((line as Record<string, unknown>).description);
      push((line as Record<string, unknown>).displayName);
      push((line as Record<string, unknown>).productName);
    }
  }

  return [...texts];
}

function hasTargetText(invoice: Record<string, unknown>) {
  return collectTexts(invoice).some((text) => text.includes(targetText));
}

function pickOutstanding(invoice: Record<string, unknown>) {
  return getNumber(invoice.amountCurrencyOutstanding) ?? getNumber(invoice.amountOutstanding);
}

function pickExVat(invoice: Record<string, unknown>) {
  return getNumber(invoice.amountExcludingVatCurrency) ?? getNumber(invoice.amountExcludingVat);
}

function matchesInvoice(invoice: Record<string, unknown>) {
  const customer = invoice.customer;
  const orgNumber =
    customer && typeof customer === "object"
      ? normalize((customer as Record<string, unknown>).organizationNumber)
      : "";
  const exVat = pickExVat(invoice);
  const outstanding = pickOutstanding(invoice);

  return (
    orgNumber === targetOrgNumber &&
    exVat === targetExVatAmount &&
    outstanding !== null &&
    outstanding > 0 &&
    hasTargetText(invoice)
  );
}

function pickPaymentType(paymentTypes: Array<Record<string, unknown>>) {
  const scored = paymentTypes
    .map((paymentType) => {
      const debitAccount =
        paymentType.debitAccount && typeof paymentType.debitAccount === "object"
          ? (paymentType.debitAccount as Record<string, unknown>)
          : null;
      const number = debitAccount ? String(debitAccount.number ?? "").replace(/\D/g, "") : "";
      const name = normalize(paymentType.name);
      const isBank = debitAccount ? debitAccount.isBankAccount === true : false;
      const isInvoice = debitAccount ? debitAccount.isInvoiceAccount === true : false;

      let score = 0;
      if (number.startsWith("19")) score += 10;
      if (isBank) score += 5;
      if (isInvoice) score += 3;
      if (name.includes("bank")) score += 2;
      if (name.includes("betalt")) score += 1;

      return { paymentType, score, number, name };
    })
    .sort((a, b) => b.score - a.score);

  if (!scored.length || scored[0].score <= 0) {
    throw new Error(`No usable incoming payment type found: ${JSON.stringify(paymentTypes, null, 2)}`);
  }

  return scored[0].paymentType;
}

async function main() {
  const invoiceResponse = await tripletexFetch("invoice", undefined, {
    invoiceDateFrom: "2024-01-01",
    invoiceDateTo: "2027-12-31",
    count: "1000",
    sorting: "-invoiceDate",
    fields: "*,customer(*),currency(*),orderLines(*),orders(*,orderLines(*))",
  });

  const invoices = asArray<Record<string, unknown>>(invoiceResponse);
  const matches = invoices.filter(matchesInvoice);

  if (matches.length !== 1) {
    throw new Error(`Expected exactly one matching invoice, found ${matches.length}\n${JSON.stringify(matches, null, 2)}`);
  }

  const invoice = matches[0];
  const invoiceId = getNumber(invoice.id);
  const outstanding = pickOutstanding(invoice);
  if (invoiceId === null || outstanding === null || outstanding <= 0) {
    throw new Error(`Invoice missing id/outstanding: ${JSON.stringify(invoice, null, 2)}`);
  }

  const paymentTypeResponse = await tripletexFetch("invoice/paymentType", undefined, {
    count: "1000",
    fields: "*,debitAccount(*),creditAccount(*)",
  });

  const paymentTypes = asArray<Record<string, unknown>>(paymentTypeResponse);
  const paymentType = pickPaymentType(paymentTypes);
  const paymentTypeId = getNumber(paymentType.id);
  if (paymentTypeId === null) {
    throw new Error(`Payment type missing id: ${JSON.stringify(paymentType, null, 2)}`);
  }

  const paymentResponse = await tripletexFetch(
    `invoice/${invoiceId}/:payment`,
    { method: "PUT" },
    {
      paymentDate,
      paymentTypeId: String(paymentTypeId),
      paidAmount: String(outstanding),
    },
  );

  const paidInvoice = asValue<Record<string, unknown>>(paymentResponse);
  const remainingOutstanding = pickOutstanding(paidInvoice) ?? getNumber((paidInvoice as Record<string, unknown>).remainingOutstanding);

  if (remainingOutstanding !== 0) {
    throw new Error(`Payment response did not settle invoice: ${JSON.stringify(paidInvoice, null, 2)}`);
  }

  console.log(
    JSON.stringify(
      {
        invoiceId,
        paymentTypeId,
        paidAmount: outstanding,
        remainingOutstanding,
      },
      null,
      2,
    ),
  );
}

await main();
