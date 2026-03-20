const baseUrl = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const sessionToken = "2CVxRJK0qsjzTqL24_yMfCOXduc1JqKqaJpZ2AF8ncM";

const target = {
  customerOrganizationNumber: "928351904",
  lineText: "Opplæring",
  amountExcludingVat: 25950,
  reverseDate: "2026-03-20",
};

type TripletexResponse<T> = {
  value?: T;
  values?: T[];
  error?: unknown;
  message?: string;
  validationMessages?: Array<{ field?: string; message?: string }>;
};

type Posting = {
  type?: string | null;
  description?: string | null;
  amountCurrency?: number | null;
  amount?: number | null;
  voucher?: { id?: number | null } | null;
  voucherId?: number | null;
  account?: { number?: string | number | null } | null;
};

type Invoice = {
  id: number;
  invoiceNumber?: number | string | null;
  amountCurrency?: number | null;
  amount?: number | null;
  amountExcludingVatCurrency?: number | null;
  amountExcludingVat?: number | null;
  amountCurrencyOutstanding?: number | null;
  amountOutstanding?: number | null;
  customer?: {
    organizationNumber?: string | null;
    name?: string | null;
  } | null;
  orderLines?: Array<{
    description?: string | null;
    displayName?: string | null;
    productName?: string | null;
  }> | null;
  orders?: Array<{
    invoiceComment?: string | null;
    comment?: string | null;
    description?: string | null;
  }> | null;
  postings?: Posting[] | null;
};

function buildUrl(path: string, params?: Record<string, string>) {
  const url = new URL(path, baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }
  }
  return url;
}

async function tripletex<T>(method: string, path: string, params?: Record<string, string>) {
  const response = await fetch(buildUrl(path, params), {
    method,
    headers: {
      Authorization: `Basic ${Buffer.from(`0:${sessionToken}`).toString("base64")}`,
      Accept: "application/json",
    },
  });

  const text = await response.text();
  const data = text ? (JSON.parse(text) as TripletexResponse<T>) : undefined;

  if (!response.ok) {
    const invalidToken =
      response.status === 403 &&
      typeof data?.error === "string" &&
      data.error === "Invalid or expired token";
    if (invalidToken) {
      throw new Error("Blocked: invalid or expired token");
    }
    throw new Error(
      `HTTP ${response.status}: ${text || response.statusText}`,
    );
  }

  return data;
}

function numberValue(...values: Array<number | null | undefined>) {
  for (const value of values) {
    if (typeof value === "number") return value;
  }
  return undefined;
}

function textMatches(invoice: Invoice) {
  const haystacks = [
    ...(invoice.orderLines ?? []).flatMap((line) => [
      line.description,
      line.displayName,
      line.productName,
    ]),
    ...(invoice.orders ?? []).flatMap((order) => [
      order.invoiceComment,
      order.comment,
      order.description,
    ]),
  ]
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.trim());

  return haystacks.some((value) => value === target.lineText);
}

function isPaid(invoice: Invoice) {
  const outstanding = numberValue(
    invoice.amountCurrencyOutstanding,
    invoice.amountOutstanding,
  );
  return outstanding === 0;
}

function paymentVoucherId(invoice: Invoice) {
  const postings = invoice.postings ?? [];

  const typedVoucherIds = [
    ...new Set(
      postings
        .filter(
          (posting) =>
            posting.type === "INCOMING_PAYMENT" ||
            posting.type === "INCOMING_PAYMENT_OPPOSITE",
        )
        .map((posting) => posting.voucher?.id ?? posting.voucherId)
        .filter((value): value is number => typeof value === "number"),
    ),
  ];
  if (typedVoucherIds.length === 1) return typedVoucherIds[0];
  if (typedVoucherIds.length > 1) {
    throw new Error(`Ambiguous typed payment vouchers on invoice ${invoice.id}`);
  }

  const fallbackVoucherIds = [
    ...new Set(
      postings
        .filter((posting) => {
          const amount = numberValue(posting.amountCurrency, posting.amount);
          const description = posting.description?.trim() ?? "";
          return amount !== undefined && amount < 0 && description.startsWith("Betaling:");
        })
        .map((posting) => posting.voucher?.id ?? posting.voucherId)
        .filter((value): value is number => typeof value === "number"),
    ),
  ];

  if (fallbackVoucherIds.length !== 1) {
    throw new Error(
      `Could not isolate payment voucher on invoice ${invoice.id}; candidates=${fallbackVoucherIds.join(",")}`,
    );
  }

  return fallbackVoucherIds[0];
}

async function main() {
  const invoiceList = await tripletex<Invoice[]>("GET", "invoice", {
    invoiceDateFrom: "2000-01-01",
    invoiceDateTo: target.reverseDate,
    count: "1000",
    sorting: "-invoiceDate",
    fields:
      "*,customer(*),orderLines(*),orders(*),postings(*,voucher(*),account(*),customer(*),closeGroup(*))",
  });

  const invoices = invoiceList.values ?? [];
  const matches = invoices.filter((invoice) => {
    const org = invoice.customer?.organizationNumber?.trim();
    const amountExVat = numberValue(
      invoice.amountExcludingVatCurrency,
      invoice.amountExcludingVat,
    );
    return (
      org === target.customerOrganizationNumber &&
      amountExVat === target.amountExcludingVat &&
      isPaid(invoice) &&
      textMatches(invoice)
    );
  });

  if (matches.length !== 1) {
    throw new Error(`Expected 1 matching invoice, found ${matches.length}`);
  }

  const invoice = matches[0];
  const voucherId = paymentVoucherId(invoice);

  const reversed = await tripletex<{ id: number }>(
    "PUT",
    `ledger/voucher/${voucherId}/:reverse`,
    { date: target.reverseDate },
  );

  const reverseVoucherId = reversed.value?.id;
  if (typeof reverseVoucherId !== "number") {
    throw new Error("Reverse voucher id missing from response");
  }

  console.log(
    JSON.stringify({
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber ?? null,
      reversedVoucherId: reverseVoucherId,
      reversedPaymentVoucherId: voucherId,
    }),
  );
}

await main();
