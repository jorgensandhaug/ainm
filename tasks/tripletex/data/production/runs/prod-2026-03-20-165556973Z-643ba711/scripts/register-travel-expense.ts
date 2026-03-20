const baseUrl = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const token = "tViIsB6ANvh6gKhhJjP98RZfVOppmoyCaotv80bqFNc";

const runDate = "2026-03-20";
const departureDate = "2026-03-18";
const returnDate = "2026-03-20";
const email = "bruno.santos@example.org";
const title = "Conferência Drammen";
const destination = "Drammen";
const perDiemDays = 3;
const perDiemRate = 800;

const auth = `Basic ${Buffer.from(`0:${token}`).toString("base64")}`;

type ApiError = Error & { status?: number; body?: unknown };

function normalize(text: string | undefined | null) {
  return (text ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

async function api<T>(
  path: string,
  init?: RequestInit,
  search?: Record<string, string>,
): Promise<T> {
  const url = new URL(path, `${baseUrl}/`);
  if (search) {
    for (const [key, value] of Object.entries(search)) {
      url.searchParams.set(key, value);
    }
  }

  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: auth,
      Accept: "application/json",
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...(init?.headers ?? {}),
    },
  });

  const text = await response.text();
  const body = text ? JSON.parse(text) : null;

  if (!response.ok) {
    const error = new Error(`HTTP ${response.status} ${response.statusText}`) as ApiError;
    error.status = response.status;
    error.body = body;
    throw error;
  }

  return body as T;
}

function expectOneExact<T>(
  values: T[],
  predicate: (value: T) => boolean,
  label: string,
): T {
  const matches = values.filter(predicate);
  if (matches.length !== 1) {
    throw new Error(`${label}: expected 1 match, got ${matches.length}`);
  }
  return matches[0];
}

function pickCostCategory(
  values: Array<{ id: number; description?: string; showOnTravelExpenses?: boolean }>,
  wanted: string,
) {
  const active = values.filter((value) => value.showOnTravelExpenses);
  const exact = active.find((value) => normalize(value.description) === normalize(wanted));
  if (exact) return exact;

  const contains = active.find((value) =>
    normalize(value.description).includes(normalize(wanted)),
  );
  if (contains) return contains;

  throw new Error(`No travel cost category found for ${wanted}`);
}

function pickPaymentType(
  values: Array<{ id: number; description?: string; showOnTravelExpenses?: boolean; isInactive?: boolean }>,
) {
  const active = values.filter((value) => value.showOnTravelExpenses && !value.isInactive);
  const preferred = active.find((value) => normalize(value.description) === "privat utlegg");
  if (preferred) return preferred;
  if (active.length === 1) return active[0];
  if (active.length > 0) return active[0];
  throw new Error("No active travel payment type found");
}

function pickRateType(
  values: Array<{
    id: number;
    rate?: number;
    rateCategory?: { id?: number; displayName?: string; name?: string };
  }>,
) {
  const exactRate = values.find((value) => value.rate === perDiemRate);
  if (exactRate) return exactRate;
  if (values.length > 0) return values[0];
  throw new Error("No compatible per diem rate type found");
}

async function main() {
  const employeeResp = await api<{
    values: Array<{
      id: number;
      email?: string;
      allowInformationRegistration?: boolean;
      address?: { city?: string };
      department?: { id?: number };
    }>;
  }>("employee", undefined, {
    email,
    count: "10",
    fields: "*",
  });

  const exactEmployees = employeeResp.values.filter(
    (employee) => normalize(employee.email) === normalize(email),
  );
  const employee =
    exactEmployees.find((value) => value.allowInformationRegistration) ??
    expectOneExact(exactEmployees, () => true, "employee");

  const departureFrom = employee.address?.city?.trim() || "Oslo";

  const costCategoryResp = await api<{
    values: Array<{ id: number; description?: string; showOnTravelExpenses?: boolean }>;
  }>("travelExpense/costCategory", undefined, {
    count: "1000",
    fields: "*",
  });

  const paymentTypeResp = await api<{
    values: Array<{
      id: number;
      description?: string;
      showOnTravelExpenses?: boolean;
      isInactive?: boolean;
    }>;
  }>("travelExpense/paymentType", undefined, {
    count: "1000",
    fields: "*",
  });

  const rateResp = await api<{
    values: Array<{
      id: number;
      rate?: number;
      rateCategory?: { id?: number; displayName?: string; name?: string };
    }>;
  }>("travelExpense/rate", undefined, {
    type: "PER_DIEM",
    isValidDomestic: "true",
    dateFrom: departureDate,
    dateTo: returnDate,
    count: "1000",
    fields: "*",
  });

  const flightCategory = pickCostCategory(costCategoryResp.values, "Fly");
  const taxiCategory = pickCostCategory(costCategoryResp.values, "Taxi");
  const paymentType = pickPaymentType(paymentTypeResp.values);
  const rateType = pickRateType(rateResp.values);

  const createResp = await api<{
    value: {
      id: number;
      title?: string;
      state?: string;
      costs?: Array<{ id?: number }>;
      perDiemCompensations?: Array<{ id?: number }>;
      employee?: { id?: number };
      travelDetails?: {
        departureDate?: string;
        returnDate?: string;
        destination?: string;
        departureFrom?: string;
      };
    };
  }>(
    "travelExpense",
    {
      method: "POST",
      body: JSON.stringify({
        employee: { id: employee.id },
        title,
        travelDetails: {
          isForeignTravel: false,
          isDayTrip: false,
          isCompensationFromRates: true,
          departureDate,
          returnDate,
          departureFrom,
          destination,
          detailedJourneyDescription: title,
          purpose: title,
        },
        perDiemCompensations: [
          {
            location: destination,
            count: perDiemDays,
            rate: perDiemRate,
            amount: perDiemDays * perDiemRate,
            rateType: { id: rateType.id },
            overnightAccommodation: "HOTEL",
          },
        ],
        costs: [
          {
            costCategory: { id: flightCategory.id },
            paymentType: { id: paymentType.id },
            vatType: { id: 0 },
            comments: "bilhete de avião",
            amountCurrencyIncVat: 5950,
            amountNOKInclVAT: 5950,
            date: departureDate,
          },
          {
            costCategory: { id: taxiCategory.id },
            paymentType: { id: paymentType.id },
            vatType: { id: 0 },
            comments: "táxi",
            amountCurrencyIncVat: 600,
            amountNOKInclVAT: 600,
            date: returnDate,
          },
        ],
      }),
    },
  );

  const travelExpenseId = createResp.value.id;
  if (!travelExpenseId) {
    throw new Error("Travel expense creation returned no id");
  }

  const deliverResp = await api<{
    values: Array<{
      id: number;
      title?: string;
      state?: string;
      employee?: { id?: number };
      travelDetails?: {
        departureDate?: string;
        returnDate?: string;
        destination?: string;
        departureFrom?: string;
      };
      costs?: Array<{ id?: number }>;
      perDiemCompensations?: Array<{ id?: number }>;
    }>;
  }>(
    "travelExpense/:deliver",
    { method: "PUT" },
    { id: String(travelExpenseId) },
  );

  const delivered = expectOneExact(
    deliverResp.values,
    (value) => value.id === travelExpenseId,
    "delivered travel expense",
  );

  console.log(
    JSON.stringify(
      {
        id: delivered.id,
        state: delivered.state,
        title: delivered.title,
        employeeId: delivered.employee?.id,
        departureDate: delivered.travelDetails?.departureDate,
        returnDate: delivered.travelDetails?.returnDate,
        departureFrom: delivered.travelDetails?.departureFrom,
        destination: delivered.travelDetails?.destination,
        costCount: delivered.costs?.length ?? 0,
        perDiemCount: delivered.perDiemCompensations?.length ?? 0,
      },
      null,
      2,
    ),
  );
}

await main();
