const baseUrl = "https://kkpqfuj-amager.tripletex.dev/v2";
const sessionToken =
  "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";

const authHeader = `Basic ${Buffer.from(`0:${sessionToken}`).toString("base64")}`;

function urlFor(path: string, params?: Record<string, string>): string {
  const url = new URL(`${baseUrl.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`);
  for (const [key, value] of Object.entries(params ?? {})) url.searchParams.set(key, value);
  return url.toString();
}

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function normalize(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function getOutstanding(invoice: Record<string, unknown>): number {
  return typeof invoice.amountCurrencyOutstanding === "number"
    ? invoice.amountCurrencyOutstanding
    : typeof invoice.amountOutstanding === "number"
      ? invoice.amountOutstanding
      : 0;
}

function getExVat(invoice: Record<string, unknown>): number | null {
  return typeof invoice.amountExcludingVatCurrency === "number"
    ? invoice.amountExcludingVatCurrency
    : typeof invoice.amountExcludingVat === "number"
      ? invoice.amountExcludingVat
      : null;
}

function collectDescriptions(invoice: Record<string, unknown>): string[] {
  const values: string[] = [];
  for (const line of asArray<Record<string, unknown>>(invoice.orderLines)) {
    const desc = normalize(line.description || line.displayName);
    if (desc) values.push(desc);
  }
  for (const order of asArray<Record<string, unknown>>(invoice.orders)) {
    for (const line of asArray<Record<string, unknown>>(order.orderLines)) {
      const desc = normalize(line.description || line.displayName);
      if (desc) values.push(desc);
    }
  }
  return values;
}

const response = await fetch(
  urlFor("invoice", {
    invoiceDateFrom: "2020-01-01",
    invoiceDateTo: "2030-12-31",
    count: "1000",
    sorting: "-invoiceDate",
    fields: "*,customer(*),currency(*),orderLines(*),orders(*,orderLines(*))",
  }),
  {
    headers: {
      Authorization: authHeader,
      Accept: "application/json",
    },
  },
);

if (!response.ok) {
  throw new Error(`HTTP ${response.status}: ${await response.text()}`);
}

const body = (await response.json()) as { values?: Record<string, unknown>[] };
const invoices = asArray<Record<string, unknown>>(body.values).filter((invoice) => getOutstanding(invoice) > 0);

const grouped = new Map<
  string,
  {
    count: number;
    invoice: Record<string, unknown>;
  }
>();

for (const invoice of invoices) {
  const customer = invoice.customer as Record<string, unknown> | undefined;
  const org = normalize(customer?.organizationNumber);
  const exVat = getExVat(invoice);
  const descriptions = collectDescriptions(invoice);
  for (const description of descriptions) {
    const key = JSON.stringify([org, exVat, description]);
    const prev = grouped.get(key);
    if (prev) {
      prev.count += 1;
    } else {
      grouped.set(key, { count: 1, invoice });
    }
  }
}

const unique = [...grouped.entries()]
  .filter(([, value]) => value.count === 1)
  .map(([key, value]) => {
    const [org, exVat, description] = JSON.parse(key) as [string, number, string];
    const invoice = value.invoice;
    return {
      invoiceId: invoice.id,
      invoiceDate: invoice.invoiceDate,
      customerName: (invoice.customer as Record<string, unknown> | undefined)?.name ?? null,
      organizationNumber: org,
      amountExcludingVat: exVat,
      description,
      amountOutstanding: getOutstanding(invoice),
    };
  })
  .slice(0, 30);

const sample = invoices.slice(0, 20).map((invoice) => ({
  invoiceId: invoice.id,
  invoiceDate: invoice.invoiceDate,
  customerName: (invoice.customer as Record<string, unknown> | undefined)?.name ?? null,
  organizationNumber: normalize((invoice.customer as Record<string, unknown> | undefined)?.organizationNumber),
  amountExcludingVat: getExVat(invoice),
  amountOutstanding: getOutstanding(invoice),
  descriptions: collectDescriptions(invoice),
}));

console.log(JSON.stringify({ unique, sample }, null, 2));
