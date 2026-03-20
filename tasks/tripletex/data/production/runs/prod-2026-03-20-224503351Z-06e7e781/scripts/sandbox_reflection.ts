const BASE_URL = "https://kkpqfuj-amager.tripletex.dev/v2";
const SESSION_TOKEN =
  "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";

const INVOICE_DATE = "2026-03-20";
const SUFFIX = "06e7781";
const CUSTOMER_NAME = `Brightstone Reflection ${SUFFIX} Ltd`;

type QueryValue = string | number | boolean | null | undefined;

type Wrapper<T> = { value?: T };
type ListResponse<T> = { values?: T[]; fullResultSize?: number };

type Customer = {
  id: number;
  name?: string | null;
  organizationNumber?: string | null;
};

type VatType = {
  id: number;
  percentage?: number | null;
  displayName?: string | null;
  number?: string | null;
};

let callCount = 0;

function authHeader() {
  return `Basic ${Buffer.from(`0:${SESSION_TOKEN}`).toString("base64")}`;
}

function buildUrl(path: string, query?: Record<string, QueryValue>) {
  const url = new URL(path.replace(/^\/+/, ""), BASE_URL.endsWith("/") ? BASE_URL : `${BASE_URL}/`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null) continue;
      url.searchParams.append(key, String(value));
    }
  }
  return url;
}

async function request<T>(
  method: string,
  path: string,
  options: { query?: Record<string, QueryValue>; body?: unknown } = {},
): Promise<T> {
  callCount += 1;
  const url = buildUrl(path, options.query);
  const response = await fetch(url, {
    method,
    headers: {
      Authorization: authHeader(),
      Accept: "application/json",
      ...(options.body === undefined ? {} : { "Content-Type": "application/json; charset=utf-8" }),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : null;

  if (!response.ok) {
    throw new Error(`${method} ${url.pathname}${url.search} failed ${response.status}: ${JSON.stringify(data)}`);
  }

  return data as T;
}

function orgChecksum(firstEightDigits: string): string | null {
  const weights = [3, 2, 7, 6, 5, 4, 3, 2];
  const digits = firstEightDigits.split("").map(Number);
  const sum = digits.reduce((acc, digit, index) => acc + digit * weights[index], 0);
  const remainder = 11 - (sum % 11);
  if (remainder === 11) return "0";
  if (remainder === 10) return null;
  return String(remainder);
}

function makeOrgNumber(seed: string) {
  const digits = seed.replace(/\D/g, "").padStart(8, "0").slice(-8);
  const check = orgChecksum(digits);
  if (check) return `${digits}${check}`;
  const altDigits = `${Number(digits) + 1}`.padStart(8, "0").slice(-8);
  const altCheck = orgChecksum(altDigits);
  if (!altCheck) throw new Error("Unable to generate valid organization number");
  return `${altDigits}${altCheck}`;
}

async function main() {
  const orgNumber = makeOrgNumber(SUFFIX);
  const customer = (await request<Wrapper<Customer>>("POST", "customer", {
    body: {
      name: CUSTOMER_NAME,
      organizationNumber: orgNumber,
      invoiceSendMethod: "MANUAL",
    },
  })).value;

  if (!customer?.id) throw new Error("Customer create returned no id");

  const vatTypes = await request<ListResponse<VatType>>("GET", "ledger/vatType", {
    query: { typeOfVat: "OUTGOING", vatDate: INVOICE_DATE, fields: "*" },
  });

  const values = vatTypes.values ?? [];
  const vat25 = values.filter((entry) => Number(entry.percentage) === 25);
  const vat0 = values.filter((entry) => Number(entry.percentage) === 0);

  console.log(
    JSON.stringify(
      {
        ok: true,
        callCount,
        customerId: customer.id,
        organizationNumber: orgNumber,
        vatTypes: values.map((entry) => ({
          id: entry.id,
          percentage: entry.percentage,
          number: entry.number,
          displayName: entry.displayName,
        })),
        has25Percent: vat25.length > 0,
        hasZeroPercent: vat0.length > 0,
        conclusion:
          vat25.length > 0
            ? "sandbox exposes 25% VAT for this date"
            : "sandbox still blocks exact taxed ex-VAT direct-line create-and-send branch on this date",
      },
      null,
      2,
    ),
  );
}

await main();
