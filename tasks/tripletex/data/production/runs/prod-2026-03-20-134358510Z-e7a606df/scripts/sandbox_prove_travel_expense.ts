const BASE_URL = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN =
  "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";

const EMAIL = "codex.verify.1773957815637@example.org";
const TITLE = `Codex Travel Expense Proof ${Date.now()}`;
const START_DATE = "2026-03-19";
const END_DATE = "2026-03-20";
const DESTINATION = "Bergen";
const FLIGHT_COMMENT = "bilhete de avi\u00e3o";
const TAXI_COMMENT = "t\u00e1xi";

type QueryValue = string | number | boolean | null | undefined;

function authHeader() {
  return `Basic ${Buffer.from(`0:${TOKEN}`).toString("base64")}`;
}

function buildUrl(path: string, query?: Record<string, QueryValue>) {
  const url = new URL(`${BASE_URL}${path}`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null) continue;
      url.searchParams.set(key, String(value));
    }
  }
  return url;
}

async function request<T>(
  method: string,
  path: string,
  options: { query?: Record<string, QueryValue>; body?: unknown } = {},
): Promise<T> {
  const url = buildUrl(path, options.query);
  const response = await fetch(url, {
    method,
    headers: {
      Authorization: authHeader(),
      Accept: "application/json",
      ...(options.body !== undefined
        ? { "Content-Type": "application/json; charset=utf-8" }
        : {}),
    },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(
      `${method} ${url.pathname}${url.search} failed: ${response.status}\n${JSON.stringify(
        data,
        null,
        2,
      )}`,
    );
  }
  return data as T;
}

function exactOne<T>(values: T[], predicate: (value: T) => boolean, label: string): T {
  const matches = values.filter(predicate);
  if (matches.length !== 1) {
    throw new Error(`Expected exactly one ${label}, got ${matches.length}`);
  }
  return matches[0];
}

async function main() {
  const [employeeRes, categoryRes, paymentTypeRes] = await Promise.all([
    request<any>("GET", "/employee", {
      query: { email: EMAIL, count: 10, fields: "*" },
    }),
    request<any>("GET", "/travelExpense/costCategory", {
      query: { count: 1000, fields: "*" },
    }),
    request<any>("GET", "/travelExpense/paymentType", {
      query: { count: 1000, fields: "*" },
    }),
  ]);

  const employee = exactOne(
    employeeRes.values ?? [],
    (entry) => entry.email === EMAIL && entry.allowInformationRegistration === true,
    "sandbox employee",
  );
  const flyCategory = exactOne(
    categoryRes.values ?? [],
    (entry) => entry.description === "Fly" && entry.showOnTravelExpenses === true,
    "Fly travel cost category",
  );
  const taxiCategory = exactOne(
    categoryRes.values ?? [],
    (entry) => entry.description === "Taxi" && entry.showOnTravelExpenses === true,
    "Taxi travel cost category",
  );
  const paymentType = exactOne(
    paymentTypeRes.values ?? [],
    (entry) => entry.description === "Privat utlegg" && entry.showOnTravelExpenses === true,
    "travel payment type",
  );

  const createRes = await request<any>("POST", "/travelExpense", {
    body: {
      employee: { id: employee.id },
      department: employee.department?.id ? { id: employee.department.id } : undefined,
      title: TITLE,
      travelDetails: {
        isForeignTravel: false,
        isDayTrip: false,
        isCompensationFromRates: true,
        departureDate: START_DATE,
        returnDate: END_DATE,
        departureTime: "08:00",
        returnTime: "18:00",
        destination: DESTINATION,
        detailedJourneyDescription: TITLE,
        purpose: TITLE,
      },
      perDiemCompensations: [
        {
          location: DESTINATION,
          count: 2,
          rate: 800,
          amount: 1600,
        },
      ],
      costs: [
        {
          costCategory: { id: flyCategory.id },
          paymentType: { id: paymentType.id },
          comments: FLIGHT_COMMENT,
          amountCurrencyIncVat: 5200,
          amountNOKInclVAT: 5200,
          date: START_DATE,
        },
        {
          costCategory: { id: taxiCategory.id },
          paymentType: { id: paymentType.id },
          comments: TAXI_COMMENT,
          amountCurrencyIncVat: 350,
          amountNOKInclVAT: 350,
          date: END_DATE,
        },
      ],
    },
  });

  const created = createRes.value;
  if (
    created.title !== TITLE ||
    created.employee?.id !== employee.id ||
    created.travelDetails?.destination !== DESTINATION ||
    created.travelDetails?.departureDate !== START_DATE ||
    created.travelDetails?.returnDate !== END_DATE
  ) {
    throw new Error(`Parent write response mismatch: ${JSON.stringify(created, null, 2)}`);
  }

  const [costRes, perDiemRes] = await Promise.all([
    request<any>("GET", "/travelExpense/cost", {
      query: { travelExpenseId: created.id, count: 20, fields: "*" },
    }),
    request<any>("GET", "/travelExpense/perDiemCompensation", {
      query: { travelExpenseId: created.id, count: 20, fields: "*" },
    }),
  ]);

  const perDiem = exactOne(
    perDiemRes.values ?? [],
    (entry) =>
      entry.location === DESTINATION &&
      Number(entry.count) === 2 &&
      Number(entry.rate) === 800 &&
      Number(entry.amount) === 1600,
    "per diem",
  );

  const flightCost = exactOne(
    costRes.values ?? [],
    (entry) =>
      entry.comments === FLIGHT_COMMENT &&
      Number(entry.amountNOKInclVAT) === 5200 &&
      entry.costCategory?.id === flyCategory.id &&
      entry.paymentType?.id === paymentType.id,
    "flight cost",
  );

  const taxiCost = exactOne(
    costRes.values ?? [],
    (entry) =>
      entry.comments === TAXI_COMMENT &&
      Number(entry.amountNOKInclVAT) === 350 &&
      entry.costCategory?.id === taxiCategory.id &&
      entry.paymentType?.id === paymentType.id,
    "taxi cost",
  );

  console.log(
    JSON.stringify(
      {
        title: created.title,
        employeeId: created.employee?.id,
        travelExpenseId: created.id,
        createResponseShape: {
          costCount: Array.isArray(created.costs) ? created.costs.length : null,
          perDiemCount: Array.isArray(created.perDiemCompensations)
            ? created.perDiemCompensations.length
            : null,
          firstCostKeys: created.costs?.[0] ? Object.keys(created.costs[0]).sort() : [],
          firstPerDiemKeys: created.perDiemCompensations?.[0]
            ? Object.keys(created.perDiemCompensations[0]).sort()
            : [],
        },
        verifiedSummary: {
          perDiemId: perDiem.id,
          flightCostId: flightCost.id,
          taxiCostId: taxiCost.id,
          totalCostAmount: (costRes.values ?? []).reduce(
            (sum: number, entry: any) => sum + Number(entry.amountNOKInclVAT ?? 0),
            0,
          ),
        },
      },
      null,
      2,
    ),
  );
}

await main();
