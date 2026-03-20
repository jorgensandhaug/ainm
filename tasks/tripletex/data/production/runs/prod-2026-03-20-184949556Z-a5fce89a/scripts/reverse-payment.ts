const baseUrl = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const token = "DoQCx4rXx-cM4aoo5V63uEAYVC2ouq0M6Q_HAZBppxc";
const taskDate = "2026-03-20";
const customerOrgNumber = "818838018";
const targetDescription = "Horas de consultoria";
const targetAmountExVat = 8300;

const auth = `Basic ${Buffer.from(`0:${token}`).toString("base64")}`;

function buildUrl(path: string, params?: Record<string, string>) {
  const url = new URL(path, baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }
  }
  return url.toString();
}

async function tripletex(path: string, init?: RequestInit, params?: Record<string, string>) {
  const response = await fetch(buildUrl(path, params), {
    ...init,
    headers: {
      Authorization: auth,
      Accept: "application/json",
      ...(init?.headers ?? {}),
    },
  });

  const text = await response.text();
  const body = text ? JSON.parse(text) : null;

  if (response.status === 403 && body?.error === "Invalid or expired token") {
    throw new Error("Blocked: invalid or expired token");
  }

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${text}`);
  }

  return body;
}

type Posting = {
  type?: string | null;
  amountCurrency?: number | null;
  amount?: number | null;
  description?: string | null;
  account?: { number?: number | string | null } | null;
  voucher?: { id?: number | null } | null;
};

type Invoice = {
  id: number;
  invoiceDate?: string | null;
  amountOutstanding?: number | null;
  amountCurrencyOutstanding?: number | null;
  amountExcludingVat?: number | null;
  amountExcludingVatCurrency?: number | null;
  customer?: { organizationNumber?: string | null; name?: string | null } | null;
  orderLines?: Array<{ description?: string | null; displayName?: string | null }> | null;
  orders?: Array<{ invoiceComment?: string | null }> | null;
  postings?: Posting[] | null;
};

function includesTargetText(invoice: Invoice) {
  const needle = targetDescription.toLocaleLowerCase("pt-PT");
  const texts = [
    ...(invoice.orderLines ?? []).flatMap((line) => [line.description, line.displayName]),
    ...(invoice.orders ?? []).map((order) => order.invoiceComment),
  ]
    .filter((value): value is string => Boolean(value))
    .map((value) => value.toLocaleLowerCase("pt-PT"));
  return texts.some((value) => value.includes(needle));
}

function exVatMatches(invoice: Invoice) {
  return (
    invoice.amountExcludingVatCurrency === targetAmountExVat ||
    invoice.amountExcludingVat === targetAmountExVat
  );
}

function isFullyPaid(invoice: Invoice) {
  return invoice.amountCurrencyOutstanding === 0 || invoice.amountOutstanding === 0;
}

function getPaymentVoucherId(invoice: Invoice) {
  const postings = invoice.postings ?? [];

  const typed = postings.filter((posting) => {
    const type = posting.type ?? "";
    return type === "INCOMING_PAYMENT" || type === "INCOMING_PAYMENT_OPPOSITE";
  });
  const typedIds = [...new Set(typed.map((posting) => posting.voucher?.id).filter((id): id is number => typeof id === "number"))];
  if (typedIds.length === 1) return typedIds[0];
  if (typedIds.length > 1) {
    throw new Error(`Ambiguous typed payment vouchers for invoice ${invoice.id}: ${typedIds.join(", ")}`);
  }

  const fallback = postings.filter((posting) => {
    const amount = posting.amountCurrency ?? posting.amount ?? 0;
    const accountNumber = String(posting.account?.number ?? "");
    const description = posting.description ?? "";
    return amount < 0 && accountNumber === "1500" && description.includes("Betaling:");
  });
  const fallbackIds = [...new Set(fallback.map((posting) => posting.voucher?.id).filter((id): id is number => typeof id === "number"))];
  if (fallbackIds.length === 1) return fallbackIds[0];
  if (fallbackIds.length > 1) {
    throw new Error(`Ambiguous fallback payment vouchers for invoice ${invoice.id}: ${fallbackIds.join(", ")}`);
  }

  throw new Error(`No payment voucher found for invoice ${invoice.id}`);
}

async function main() {
  const invoiceList = await tripletex("invoice", undefined, {
    invoiceDateFrom: "2000-01-01",
    invoiceDateTo: taskDate,
    count: "1000",
    sorting: "-invoiceDate",
    fields:
      "*,customer(*),orderLines(*),orders(*),postings(*,voucher(*),account(*),customer(*),closeGroup(*))",
  });

  const invoices: Invoice[] = invoiceList?.values ?? [];
  const matches = invoices.filter((invoice) => {
    return (
      invoice.customer?.organizationNumber === customerOrgNumber &&
      exVatMatches(invoice) &&
      includesTargetText(invoice) &&
      isFullyPaid(invoice)
    );
  });

  if (matches.length !== 1) {
    throw new Error(
      `Expected exactly 1 matching paid invoice, found ${matches.length}: ${matches
        .map((invoice) => invoice.id)
        .join(", ")}`
    );
  }

  const invoice = matches[0];
  const paymentVoucherId = getPaymentVoucherId(invoice);

  const reversed = await tripletex(`ledger/voucher/${paymentVoucherId}/:reverse`, { method: "PUT" }, { date: taskDate });

  console.log(
    JSON.stringify(
      {
        invoiceId: invoice.id,
        paymentVoucherId,
        reverseVoucherId: reversed?.value?.id ?? null,
      },
      null,
      2
    )
  );
}

await main();
