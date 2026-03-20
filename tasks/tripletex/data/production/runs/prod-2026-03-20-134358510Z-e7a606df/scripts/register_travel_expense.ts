const BASE_URL = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "qLicTrkKyX6m3xZJWpJEGNgn-EtKRaISMwpsPzA7NoY";

const EMAIL = "ines.sousa@example.org";
const TITLE = "Visita cliente Bergen";
const DESTINATION = "Bergen";
const START_DATE = "2026-03-19";
const END_DATE = "2026-03-20";
const DEPARTURE_TIME = "08:00";
const RETURN_TIME = "18:00";
const PER_DIEM_COUNT = 2;
const PER_DIEM_RATE = 800;
const FLIGHT_COMMENT = "bilhete de avi\u00e3o";
const TAXI_COMMENT = "t\u00e1xi";
const FLIGHT_AMOUNT = 5200;
const TAXI_AMOUNT = 350;

type QueryValue = string | number | boolean | null | undefined;

type Employee = {
  id: number;
  email?: string;
  displayName?: string;
  firstName?: string;
  lastName?: string;
  isContact?: boolean;
  allowInformationRegistration?: boolean;
  department?: { id?: number };
};

type TravelCostCategory = {
  id: number;
  description?: string;
  displayName?: string;
  showOnTravelExpenses?: boolean;
  isInactive?: boolean;
};

type TravelPaymentType = {
  id: number;
  description?: string;
  displayName?: string;
  showOnTravelExpenses?: boolean;
  isInactive?: boolean;
};

type TravelExpense = {
  id: number;
  title?: string;
  version?: number;
  employee?: { id?: number; email?: string };
  department?: { id?: number };
  travelDetails?: {
    destination?: string;
    departureDate?: string;
    returnDate?: string;
    departureTime?: string;
    returnTime?: string;
    purpose?: string;
    detailedJourneyDescription?: string;
    isForeignTravel?: boolean;
    isDayTrip?: boolean;
    isCompensationFromRates?: boolean;
  };
  costs?: Array<{ id?: number }>;
  perDiemCompensations?: Array<{ id?: number }>;
};

type PerDiemCompensation = {
  id: number;
  travelExpense?: { id?: number };
  location?: string;
  count?: number;
  rate?: number;
  amount?: number;
};

type Cost = {
  id: number;
  travelExpense?: { id?: number };
  costCategory?: { id?: number; description?: string; displayName?: string };
  paymentType?: { id?: number; description?: string; displayName?: string };
  comments?: string;
  amountNOKInclVAT?: number;
  date?: string;
};

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
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }

  if (!response.ok) {
    throw new Error(
      `${method} ${url.pathname}${url.search} failed: ${response.status}\n${JSON.stringify(
        data ?? text,
        null,
        2,
      )}`,
    );
  }

  return data as T;
}

function asArray<T>(input: unknown): T[] {
  if (!input || typeof input !== "object" || !Array.isArray((input as { values?: unknown[] }).values)) {
    throw new Error(`Expected list response, got ${JSON.stringify(input, null, 2)}`);
  }
  return (input as { values: T[] }).values;
}

function asValue<T>(input: unknown): T {
  if (!input || typeof input !== "object" || !("value" in input)) {
    throw new Error(`Expected wrapper response, got ${JSON.stringify(input, null, 2)}`);
  }
  return (input as { value: T }).value;
}

function normalizeText(value: string | undefined): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function labelOf(entry: { description?: string; displayName?: string }) {
  return normalizeText(entry.displayName || entry.description);
}

function pickEmployee(employees: Employee[]): Employee {
  const exactEmail = employees.filter((employee) => employee.email === EMAIL);
  const nonContacts = exactEmail.filter((employee) => employee.isContact !== true);
  const infoEnabled = nonContacts.filter((employee) => employee.allowInformationRegistration === true);

  const pool =
    infoEnabled.length > 0
      ? infoEnabled
      : nonContacts.length > 0
        ? nonContacts
        : exactEmail;

  if (pool.length !== 1) {
    throw new Error(`Expected exactly one employee for ${EMAIL}, got ${pool.length}`);
  }

  return pool[0];
}

function pickPaymentType(types: TravelPaymentType[]): TravelPaymentType {
  const active = types.filter(
    (entry) => entry.showOnTravelExpenses === true && entry.isInactive !== true,
  );
  if (active.length === 0) {
    throw new Error("No active travel-expense payment type available.");
  }

  const privateMatch = active.find((entry) =>
    /(privat|private|egen|employee|ansatt|utlegg)/.test(labelOf(entry)),
  );

  return privateMatch ?? active[0];
}

function pickCategory(
  categories: TravelCostCategory[],
  primaryPatterns: RegExp[],
  fallbackPatterns: RegExp[],
): TravelCostCategory {
  const active = categories.filter(
    (entry) => entry.showOnTravelExpenses === true && entry.isInactive !== true,
  );
  if (active.length === 0) {
    throw new Error("No active travel-expense cost category available.");
  }

  for (const pattern of primaryPatterns) {
    const match = active.find((entry) => pattern.test(labelOf(entry)));
    if (match) return match;
  }

  for (const pattern of fallbackPatterns) {
    const match = active.find((entry) => pattern.test(labelOf(entry)));
    if (match) return match;
  }

  return active[0];
}

function verifyTravelExpense(expense: TravelExpense, employee: Employee) {
  if (!expense.id) throw new Error("Travel expense id missing.");
  if (expense.title !== TITLE) {
    throw new Error(`Travel expense title mismatch: ${JSON.stringify(expense, null, 2)}`);
  }
  if (expense.employee?.id !== employee.id) {
    throw new Error(`Travel expense employee mismatch: ${JSON.stringify(expense, null, 2)}`);
  }
}

function sameTravelExpense(expense: TravelExpense, employeeId: number) {
  return (
    expense.title === TITLE &&
    expense.employee?.id === employeeId &&
    expense.travelDetails?.departureDate === START_DATE &&
    expense.travelDetails?.returnDate === END_DATE
  );
}

function hasPerDiem(expense: TravelExpense) {
  return (expense.perDiemCompensations ?? []).some(
    (item: any) =>
      item?.location === DESTINATION &&
      Number(item?.count) === PER_DIEM_COUNT &&
      Number(item?.rate) === PER_DIEM_RATE &&
      Number(item?.amount) === PER_DIEM_COUNT * PER_DIEM_RATE,
  );
}

function hasCost(expense: TravelExpense, comment: string, amount: number) {
  return (expense.costs ?? []).some(
    (item: any) => item?.comments === comment && Number(item?.amountNOKInclVAT) === amount,
  );
}

function assertFinalState(
  expense: TravelExpense,
  employee: Employee,
  paymentTypeId: number,
  flightCategoryId: number,
  taxiCategoryId: number,
) {
  verifyTravelExpense(expense, employee);

  const perDiems = expense.perDiemCompensations ?? [];
  if (
    !perDiems.some(
      (item: any) =>
        item?.location === DESTINATION &&
        Number(item?.count) === PER_DIEM_COUNT &&
        Number(item?.rate) === PER_DIEM_RATE &&
        Number(item?.amount) === PER_DIEM_COUNT * PER_DIEM_RATE,
    )
  ) {
    throw new Error(`Missing expected per diem: ${JSON.stringify(expense, null, 2)}`);
  }

  const costs = expense.costs ?? [];
  const flight = costs.find((item: any) => item?.comments === FLIGHT_COMMENT);
  const taxi = costs.find((item: any) => item?.comments === TAXI_COMMENT);

  if (!flight || Number((flight as any).amountNOKInclVAT) !== FLIGHT_AMOUNT) {
    throw new Error(`Missing expected flight cost: ${JSON.stringify(expense, null, 2)}`);
  }
  if (!taxi || Number((taxi as any).amountNOKInclVAT) !== TAXI_AMOUNT) {
    throw new Error(`Missing expected taxi cost: ${JSON.stringify(expense, null, 2)}`);
  }

  if ((flight as any).costCategory?.id !== flightCategoryId || (flight as any).paymentType?.id !== paymentTypeId) {
    throw new Error(`Flight cost linkage mismatch: ${JSON.stringify(flight, null, 2)}`);
  }
  if ((taxi as any).costCategory?.id !== taxiCategoryId || (taxi as any).paymentType?.id !== paymentTypeId) {
    throw new Error(`Taxi cost linkage mismatch: ${JSON.stringify(taxi, null, 2)}`);
  }
}

async function getTravelExpense(id: number) {
  const response = await request<unknown>("GET", `/travelExpense/${id}`, {
    query: { fields: "*" },
  });
  return asValue<TravelExpense>(response);
}

async function main() {
  const [employeeRes, categoryRes, paymentTypeRes] = await Promise.all([
    request<unknown>("GET", "/employee", {
      query: {
        email: EMAIL,
        count: 10,
        fields: "*",
      },
    }),
    request<unknown>("GET", "/travelExpense/costCategory", {
      query: {
        count: 1000,
        fields: "*",
      },
    }),
    request<unknown>("GET", "/travelExpense/paymentType", {
      query: {
        count: 1000,
        fields: "*",
      },
    }),
  ]);

  const employee = pickEmployee(asArray<Employee>(employeeRes));
  const categories = asArray<TravelCostCategory>(categoryRes);
  const paymentTypes = asArray<TravelPaymentType>(paymentTypeRes);

  const paymentType = pickPaymentType(paymentTypes);
  const flightCategory = pickCategory(
    categories,
    [/fly/, /flight/, /air/, /flybil/, /billett/],
    [/transport/, /reise/, /taxi/, /drosje/],
  );
  const taxiCategory = pickCategory(
    categories,
    [/taxi/, /drosje/],
    [/transport/, /reise/, /fly/, /flight/, /air/],
  );

  const existingExpensesRes = await request<unknown>("GET", "/travelExpense", {
    query: {
      employeeId: employee.id,
      departureDateFrom: START_DATE,
      returnDateTo: "2026-03-21",
      state: "ALL",
      count: 20,
      fields: "*",
    },
  });
  const existingExpenses = asArray<TravelExpense>(existingExpensesRes);
  const matchingExpenses = existingExpenses.filter((expense) => sameTravelExpense(expense, employee.id));
  if (matchingExpenses.length > 1) {
    throw new Error(`Found multiple matching travel expenses: ${JSON.stringify(matchingExpenses, null, 2)}`);
  }

  let travelExpense =
    matchingExpenses.length === 1
      ? await getTravelExpense(matchingExpenses[0].id)
      : asValue<TravelExpense>(
          await request<unknown>("POST", "/travelExpense", {
            body: {
              employee: { id: employee.id },
              ...(employee.department?.id ? { department: { id: employee.department.id } } : {}),
              title: TITLE,
              travelDetails: {
                isForeignTravel: false,
                isDayTrip: false,
                isCompensationFromRates: false,
                departureDate: START_DATE,
                returnDate: END_DATE,
                departureTime: DEPARTURE_TIME,
                returnTime: RETURN_TIME,
                destination: DESTINATION,
                detailedJourneyDescription: TITLE,
                purpose: TITLE,
              },
            },
          }),
        );

  verifyTravelExpense(travelExpense, employee);

  if (!hasPerDiem(travelExpense)) {
    await request<unknown>("POST", "/travelExpense/perDiemCompensation", {
      body: {
        travelExpense: { id: travelExpense.id },
        location: DESTINATION,
        count: PER_DIEM_COUNT,
        rate: PER_DIEM_RATE,
        amount: PER_DIEM_COUNT * PER_DIEM_RATE,
      },
    });
  }

  if (!hasCost(travelExpense, FLIGHT_COMMENT, FLIGHT_AMOUNT)) {
    await request<unknown>("POST", "/travelExpense/cost", {
      body: {
        travelExpense: { id: travelExpense.id },
        costCategory: { id: flightCategory.id },
        paymentType: { id: paymentType.id },
        comments: FLIGHT_COMMENT,
        amountNOKInclVAT: FLIGHT_AMOUNT,
        date: START_DATE,
      },
    });
  }

  if (!hasCost(travelExpense, TAXI_COMMENT, TAXI_AMOUNT)) {
    await request<unknown>("POST", "/travelExpense/cost", {
      body: {
        travelExpense: { id: travelExpense.id },
        costCategory: { id: taxiCategory.id },
        paymentType: { id: paymentType.id },
        comments: TAXI_COMMENT,
        amountNOKInclVAT: TAXI_AMOUNT,
        date: END_DATE,
      },
    });
  }

  travelExpense = await getTravelExpense(travelExpense.id);
  assertFinalState(
    travelExpense,
    employee,
    paymentType.id,
    flightCategory.id,
    taxiCategory.id,
  );

  console.log(
    JSON.stringify(
      {
        employeeId: employee.id,
        travelExpenseId: travelExpense.id,
        paymentType: {
          id: paymentType.id,
          label: paymentType.displayName ?? paymentType.description,
        },
        flightCategory: {
          id: flightCategory.id,
          label: flightCategory.displayName ?? flightCategory.description,
        },
        taxiCategory: {
          id: taxiCategory.id,
          label: taxiCategory.displayName ?? taxiCategory.description,
        },
        costCount: travelExpense.costs?.length ?? 0,
        perDiemCount: travelExpense.perDiemCompensations?.length ?? 0,
      },
      null,
      2,
    ),
  );
}

await main();
