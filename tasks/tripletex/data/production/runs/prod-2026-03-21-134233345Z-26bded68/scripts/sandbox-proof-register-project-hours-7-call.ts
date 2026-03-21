const BASE_URL = "https://kkpqfuj-amager.tripletex.dev/v2";
const SESSION_TOKEN =
  "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";

const PROOF = {
  employeeEmail: "codex.verify.1773957815637@example.org",
  projectName: "Sandbox Hour Invoice Project 1774020541520",
  activityName: "Prosjektadministrasjon",
  hours: 16,
  hourlyRate: 1300,
  date: "2026-08-03",
} as const;

class ApiError extends Error {
  method: string;
  path: string;
  status: number;
  bodyText: string;
  bodyJson: any;

  constructor(method: string, path: string, status: number, bodyText: string, bodyJson: any) {
    super(`${method} ${path} failed with ${status}`);
    this.method = method;
    this.path = path;
    this.status = status;
    this.bodyText = bodyText;
    this.bodyJson = bodyJson;
  }
}

function normalize(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function buildUrl(path: string, query?: Record<string, string | number | boolean>) {
  const url = new URL(`${BASE_URL.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      url.searchParams.append(key, String(value));
    }
  }
  return url.toString();
}

function unwrap(json: any) {
  if (json?.values !== undefined) return json.values;
  if (json?.value !== undefined) return json.value;
  return json;
}

function asArray<T>(value: T | T[] | null | undefined): T[] {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

async function request(method: string, path: string, options: { query?: Record<string, any>; body?: any } = {}) {
  const response = await fetch(buildUrl(path, options.query), {
    method,
    headers: {
      Authorization: `Basic ${Buffer.from(`0:${SESSION_TOKEN}`).toString("base64")}`,
      Accept: "application/json",
      ...(options.body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  const bodyText = await response.text();
  const bodyJson = bodyText ? JSON.parse(bodyText) : null;
  if (!response.ok) {
    throw new ApiError(method, path, response.status, bodyText, bodyJson);
  }
  return bodyText ? unwrap(bodyJson) : null;
}

function pickExact<T>(items: T[], predicate: (value: T) => boolean, label: string): T {
  const matches = items.filter(predicate);
  if (matches.length !== 1) {
    throw new Error(`${label}: expected exactly 1 match, got ${matches.length}`);
  }
  return matches[0];
}

function resolveVatPercent(vatType: any): number | null {
  for (const key of ["rate", "percentage", "percent", "value"]) {
    const raw = vatType?.[key];
    if (typeof raw === "number") return raw;
    if (typeof raw === "string" && raw.trim() !== "") {
      const parsed = Number(raw.replace(",", "."));
      if (!Number.isNaN(parsed)) return parsed;
    }
  }
  for (const key of ["displayName", "name", "description"]) {
    const raw = vatType?.[key];
    if (typeof raw === "string") {
      const match = raw.match(/(\d+(?:[.,]\d+)?)\s*%/);
      if (match) return Number(match[1].replace(",", "."));
    }
  }
  return null;
}

function chooseVatType(vatTypes: any[]) {
  if (vatTypes.length === 1) return vatTypes[0];
  const exact25 = vatTypes.filter((vatType) => resolveVatPercent(vatType) === 25);
  if (exact25.length >= 1) return exact25[0];
  throw new Error(`Unexpected VAT set: ${JSON.stringify(vatTypes)}`);
}

async function main() {
  const employee = pickExact(
    asArray(
      await request("GET", "employee", {
        query: { email: PROOF.employeeEmail, count: 10, fields: "*" },
      }),
    ),
    (item) => normalize((item as any)?.email) === normalize(PROOF.employeeEmail),
    "employee",
  );

  const project = pickExact(
    asArray(
      await request("GET", "project", {
        query: { name: PROOF.projectName, count: 50, fields: "*,customer(*)" },
      }),
    ),
    (item) => normalize((item as any)?.name) === normalize(PROOF.projectName),
    "project",
  );

  const activity = pickExact(
    asArray(
      await request("GET", "activity/>forTimeSheet", {
        query: {
          projectId: (project as any).id,
          employeeId: (employee as any).id,
          date: PROOF.date,
          query: PROOF.activityName,
          filterExistingHours: false,
          count: 50,
          fields: "*",
        },
      }),
    ),
    (item) => normalize((item as any)?.name) === normalize(PROOF.activityName),
    "activity",
  );

  const timesheet = await request("POST", "timesheet/entry", {
    body: {
      employee: { id: (employee as any).id },
      project: { id: (project as any).id },
      activity: { id: (activity as any).id },
      date: PROOF.date,
      hours: PROOF.hours,
      projectChargeableHours: PROOF.hours,
    },
  });

  const vatType = chooseVatType(
    asArray(
      await request("GET", "ledger/vatType", {
        query: { typeOfVat: "OUTGOING", vatDate: PROOF.date, fields: "*" },
      }),
    ),
  );

  const order = await request("POST", "order", {
    body: {
      customer: { id: (project as any).customer.id },
      project: { id: (project as any).id },
      orderDate: PROOF.date,
      deliveryDate: PROOF.date,
      orderLines: [
        {
          description: PROOF.activityName,
          count: PROOF.hours,
          unitPriceExcludingVatCurrency: PROOF.hourlyRate,
          vatType: { id: vatType.id },
        },
      ],
    },
  });

  const invoice = await request("PUT", `order/${(order as any).id}/:invoice`, {
    query: { invoiceDate: PROOF.date, sendToCustomer: false },
  });

  console.log(
    JSON.stringify(
      {
        proof: "optimistic_non_chargeable_branch",
        calls: 7,
        date: PROOF.date,
        activityIsChargeable: (activity as any).isChargeable === true,
        timesheetEntryId: (timesheet as any).id,
        orderId: (order as any).id,
        invoiceId: (invoice as any).id,
        amountExcludingVatCurrency: (invoice as any).amountExcludingVatCurrency,
        amountCurrencyOutstanding: (invoice as any).amountCurrencyOutstanding,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  if (error instanceof ApiError) {
    console.error(
      JSON.stringify(
        {
          error: {
            method: error.method,
            path: error.path,
            status: error.status,
            body: error.bodyJson,
          },
        },
        null,
        2,
      ),
    );
    process.exit(1);
  }

  console.error(String(error));
  process.exit(1);
});
