import { Buffer } from "node:buffer";

const BASE_URL = process.env.TRIPLETEX_BASE_URL;
const TOKEN = process.env.TRIPLETEX_SESSION_TOKEN;

if (!BASE_URL || !TOKEN) {
  throw new Error("Missing TRIPLETEX_BASE_URL or TRIPLETEX_SESSION_TOKEN");
}

const authHeader = `Basic ${Buffer.from(`0:${TOKEN}`).toString("base64")}`;
const probeDate = "2026-03-20";
const probeDescription = "codex payroll fallback proof 2026-03-20";

function buildUrl(path: string, query?: Record<string, string | number | boolean | undefined>) {
  const base = BASE_URL.endsWith("/") ? BASE_URL : `${BASE_URL}/`;
  const url = new URL(path, base);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined) {
      url.searchParams.append(key, String(value));
    }
  }
  return url;
}

async function api(
  method: string,
  path: string,
  options?: {
    query?: Record<string, string | number | boolean | undefined>;
    body?: unknown;
  },
) {
  const response = await fetch(buildUrl(path, options?.query), {
    method,
    headers: {
      Authorization: authHeader,
      Accept: "application/json",
      ...(options?.body ? { "Content-Type": "application/json" } : {}),
    },
    body: options?.body ? JSON.stringify(options.body) : undefined,
  });

  const text = await response.text();
  let data: any = null;
  if (text) {
    data = JSON.parse(text);
  }
  if (response.status >= 400) {
    throw new Error(`${method} ${path} failed ${response.status}: ${text}`);
  }
  return data;
}

function values(data: any) {
  return Array.isArray(data?.values) ? data.values : [];
}

function value(data: any) {
  return data?.value ?? null;
}

async function main() {
  const employeeData = await api("GET", "employee", {
    query: {
      email: "jonas.hansen@example.org",
      count: 10,
      fields: "*",
    },
  });

  const divisionsData = await api("GET", "division", {
    query: {
      count: 5,
      fields: "*",
    },
  });

  const accountData = await api("GET", "ledger/account", {
    query: {
      number: "5000,1920",
      fields: "*",
    },
  });

  const accounts = values(accountData);
  const salaryAccount = accounts.find((account: any) => Number(account?.number) === 5000);
  const bankAccount = accounts.find((account: any) => Number(account?.number) === 1920);
  if (!salaryAccount?.id || !bankAccount?.id) {
    throw new Error("Missing account 5000 or 1920 in sandbox");
  }

  const voucherData = await api("POST", "ledger/voucher", {
    body: {
      date: probeDate,
      description: probeDescription,
      voucherType: null,
      postings: [
        {
          row: 1,
          date: probeDate,
          description: probeDescription,
          account: { id: salaryAccount.id },
          currency: { id: 1 },
          amount: 50600,
          amountCurrency: 50600,
          amountGross: 50600,
          amountGrossCurrency: 50600,
        },
        {
          row: 2,
          date: probeDate,
          description: probeDescription,
          account: { id: bankAccount.id },
          currency: { id: 1 },
          amount: -50600,
          amountCurrency: -50600,
          amountGross: -50600,
          amountGrossCurrency: -50600,
        },
      ],
    },
  });

  console.log(
    JSON.stringify(
      {
        employeeExactHits: values(employeeData).filter(
          (employee: any) => employee?.email === "jonas.hansen@example.org",
        ).length,
        divisionCount: values(divisionsData).length,
        account5000: salaryAccount.id,
        account1920: bankAccount.id,
        voucherId: value(voucherData)?.id ?? null,
        voucherNumber: value(voucherData)?.number ?? null,
      },
      null,
      2,
    ),
  );
}

await main();
