const baseUrl = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const sessionToken = "9wXy4F9wVJlYpoWCoswd07BPqGo26cbSzBoGJ10PO20";

const employeeEmail = "torbjrn.brekke@example.org";
const title = "Kundebesøk Trondheim";
const destination = "Trondheim";
const departureDate = "2026-03-17";
const returnDate = "2026-03-20";
const perDiemCount = 4;
const perDiemRate = 800;
const perDiemAmount = perDiemCount * perDiemRate;

type TripletexList<T> = {
  values?: T[];
  fullResultSize?: number;
};

type TripletexValue<T> = {
  value?: T;
};

type Address = {
  addressLine1?: string;
  city?: string;
  displayName?: string;
};

type Employee = {
  id: number;
  email?: string;
  displayName?: string;
  allowInformationRegistration?: boolean;
  address?: Address;
};

type TravelCostCategory = {
  id: number;
  description?: string;
  showOnTravelExpenses?: boolean;
  isInactive?: boolean;
};

type TravelPaymentType = {
  id: number;
  description?: string;
  showOnTravelExpenses?: boolean;
  isInactive?: boolean;
};

type TravelExpenseRate = {
  id: number;
  rate?: number;
  rateCategory?: {
    id?: number;
    type?: string;
    isValidDomestic?: boolean;
    isValidDayTrip?: boolean;
    isRequiresOvernightAccommodation?: boolean;
  };
};

type TravelExpense = {
  id: number;
  title?: string;
  state?: string;
  employee?: { id?: number };
  travelDetails?: {
    departureDate?: string;
    returnDate?: string;
    departureFrom?: string;
    destination?: string;
    purpose?: string;
    detailedJourneyDescription?: string;
  };
  costs?: Array<{ id?: number }>;
  perDiemCompensations?: Array<{ id?: number }>;
};

function buildUrl(path: string, query?: Record<string, string | number | boolean | undefined>) {
  const url = new URL(path, baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) {
        url.searchParams.set(key, String(value));
      }
    }
  }
  return url;
}

async function api<T>(method: string, path: string, options?: { query?: Record<string, string | number | boolean | undefined>; body?: unknown }): Promise<T> {
  const url = buildUrl(path, options?.query);
  const headers: Record<string, string> = {
    Authorization: `Basic ${Buffer.from(`0:${sessionToken}`).toString("base64")}`,
    Accept: "application/json",
  };

  let body: string | undefined;
  if (options?.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(options.body);
  }

  const response = await fetch(url, { method, headers, body });
  const text = await response.text();
  const json = text ? JSON.parse(text) : undefined;

  if (!response.ok) {
    const error = new Error(`${method} ${url} failed with ${response.status}: ${text}`);
    (error as Error & { status?: number; body?: unknown }).status = response.status;
    (error as Error & { status?: number; body?: unknown }).body = json;
    throw error;
  }

  return json as T;
}

function normalize(value: string | undefined) {
  return (value ?? "")
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

function exactOne<T>(values: T[], predicate: (value: T) => boolean, description: string): T {
  const matches = values.filter(predicate);
  if (matches.length !== 1) {
    throw new Error(`Expected exactly one ${description}, got ${matches.length}`);
  }
  return matches[0]!;
}

function preferEmployee(values: Employee[]) {
  const exactEmail = values.filter((employee) => employee.email === employeeEmail);
  const allowed = exactEmail.filter((employee) => employee.allowInformationRegistration);
  if (allowed.length === 1) return allowed[0]!;
  if (exactEmail.length === 1) return exactEmail[0]!;
  if (allowed.length > 1) {
    throw new Error(`Expected one information-enabled employee for ${employeeEmail}, got ${allowed.length}`);
  }
  throw new Error(`Expected one employee for ${employeeEmail}, got ${exactEmail.length}`);
}

function findCategory(values: TravelCostCategory[], preferredDescription: string, fallbacks: string[]) {
  const active = values.filter((value) => value.showOnTravelExpenses && !value.isInactive);
  const exact = active.find((value) => value.description === preferredDescription);
  if (exact) return exact;
  const fallback = active.find((value) => {
    const desc = normalize(value.description);
    return fallbacks.some((needle) => desc.includes(needle));
  });
  if (!fallback) {
    throw new Error(`Missing cost category for ${preferredDescription}`);
  }
  return fallback;
}

function findPaymentType(values: TravelPaymentType[]) {
  const active = values.filter((value) => value.showOnTravelExpenses && !value.isInactive);
  const preferred = active.find((value) => value.description === "Privat utlegg");
  if (preferred) return preferred;
  if (active.length === 1) return active[0]!;
  if (active.length > 1) {
    const privateExpense = active.find((value) => normalize(value.description).includes("privat"));
    if (privateExpense) return privateExpense;
  }
  throw new Error(`Missing unique active travel payment type, got ${active.length}`);
}

function pickPerDiemRate(values: TravelExpenseRate[]) {
  const candidates = values.filter(
    (value) => !value.rateCategory?.type || value.rateCategory.type === "PER_DIEM",
  );
  if (candidates.length === 0) {
    throw new Error("Missing domestic per diem rate");
  }

  const ranked = [...candidates].sort((a, b) => {
    const aScore =
      (a.rate === perDiemRate ? 4 : 0) +
      (a.rateCategory?.isRequiresOvernightAccommodation ? 2 : 0) +
      (a.rateCategory?.isValidDayTrip === false ? 1 : 0);
    const bScore =
      (b.rate === perDiemRate ? 4 : 0) +
      (b.rateCategory?.isRequiresOvernightAccommodation ? 2 : 0) +
      (b.rateCategory?.isValidDayTrip === false ? 1 : 0);
    return bScore - aScore;
  });

  return ranked[0]!;
}

function deriveDepartureFrom(employee: Employee) {
  return employee.address?.city || employee.address?.addressLine1 || employee.address?.displayName || "Hjemsted";
}

function pickDeliveredExpense(response: TripletexList<TravelExpense>, expectedId: number) {
  const values = response.values ?? [];
  return values.find((value) => value.id === expectedId) ?? values[0];
}

async function main() {
  const employeeResponse = await api<TripletexList<Employee>>("GET", "employee", {
    query: {
      email: employeeEmail,
      count: 10,
      fields: "*",
    },
  });
  const employee = preferEmployee(employeeResponse.values ?? []);

  const [costCategoriesResponse, paymentTypesResponse, ratesResponse] = await Promise.all([
    api<TripletexList<TravelCostCategory>>("GET", "travelExpense/costCategory", {
      query: { count: 1000, fields: "*" },
    }),
    api<TripletexList<TravelPaymentType>>("GET", "travelExpense/paymentType", {
      query: { count: 1000, fields: "*" },
    }),
    api<TripletexList<TravelExpenseRate>>("GET", "travelExpense/rate", {
      query: {
        type: "PER_DIEM",
        isValidDomestic: true,
        dateFrom: departureDate,
        dateTo: returnDate,
        count: 1000,
        fields: "*",
      },
    }),
  ]);

  const flightCategory = findCategory(costCategoriesResponse.values ?? [], "Fly", ["fly", "flight", "air"]);
  const taxiCategory = findCategory(costCategoriesResponse.values ?? [], "Taxi", ["taxi"]);
  const paymentType = findPaymentType(paymentTypesResponse.values ?? []);
  const perDiemRateType = pickPerDiemRate(ratesResponse.values ?? []);
  const departureFrom = deriveDepartureFrom(employee);

  const createPayload = {
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
        rateType: { id: perDiemRateType.id },
        overnightAccommodation: "HOTEL",
        location: destination,
        count: perDiemCount,
        rate: perDiemRate,
        amount: perDiemAmount,
      },
    ],
    costs: [
      {
        costCategory: { id: flightCategory.id },
        paymentType: { id: paymentType.id },
        vatType: { id: 0 },
        comments: "flybillett",
        amountCurrencyIncVat: 6150,
        amountNOKInclVAT: 6150,
        date: departureDate,
      },
      {
        costCategory: { id: taxiCategory.id },
        paymentType: { id: paymentType.id },
        vatType: { id: 0 },
        comments: "taxi",
        amountCurrencyIncVat: 750,
        amountNOKInclVAT: 750,
        date: returnDate,
      },
    ],
  };

  const created = await api<TripletexValue<TravelExpense>>("POST", "travelExpense", {
    body: createPayload,
  });

  const travelExpense = created.value;
  if (!travelExpense?.id) {
    throw new Error("Travel expense create response missing id");
  }

  const deliveredResponse = await api<TripletexList<TravelExpense>>("PUT", "travelExpense/:deliver", {
    query: { id: travelExpense.id },
  });
  const delivered = pickDeliveredExpense(deliveredResponse, travelExpense.id);

  if (!delivered) {
    throw new Error(`Deliver response missing expense ${travelExpense.id}`);
  }
  if (delivered.state !== "DELIVERED") {
    throw new Error(`Expected DELIVERED state, got ${delivered.state ?? "undefined"}`);
  }
  if ((delivered.costs ?? []).length !== 2) {
    throw new Error(`Expected 2 costs, got ${(delivered.costs ?? []).length}`);
  }
  if ((delivered.perDiemCompensations ?? []).length !== 1) {
    throw new Error(`Expected 1 per diem row, got ${(delivered.perDiemCompensations ?? []).length}`);
  }

  console.log(
    JSON.stringify(
      {
        id: delivered.id,
        state: delivered.state,
        employeeId: delivered.employee?.id,
        title: delivered.title,
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
