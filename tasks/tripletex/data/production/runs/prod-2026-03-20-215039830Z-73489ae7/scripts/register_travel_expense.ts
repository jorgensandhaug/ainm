const BASE_URL = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "a210c3IUp_S9VCJUmCuNTD4nAB2LUx6GEsdXBnjFayw";

const TITLE = "Visita cliente Bergen";
const EMPLOYEE_EMAIL = "maria.hernandez@example.org";
const DESTINATION = "Bergen";
const DEPARTURE_DATE = "2026-03-17";
const RETURN_DATE = "2026-03-20";
const DEPARTURE_TIME = "08:00";
const RETURN_TIME = "18:00";
const PER_DIEM_DAYS = 4;
const PER_DIEM_RATE = 800;
const FLIGHT_COMMENT = "billete de avión";
const TAXI_COMMENT = "taxi";

const auth = Buffer.from(`0:${TOKEN}`).toString("base64");

type ListResponse<T> = {
  values?: T[];
  fullResultSize?: number;
};

type WrappedResponse<T> = {
  value?: T;
};

function buildUrl(path: string, query?: Record<string, string | number | boolean | undefined>) {
  const url = new URL(path, `${BASE_URL}/`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) {
        url.searchParams.set(key, String(value));
      }
    }
  }
  return url.toString();
}

async function tripletex<T>(path: string, init?: RequestInit, query?: Record<string, string | number | boolean | undefined>): Promise<T> {
  const response = await fetch(buildUrl(path, query), {
    ...init,
    headers: {
      Authorization: `Basic ${auth}`,
      Accept: "application/json",
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...(init?.headers ?? {}),
    },
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : undefined;

  if (!response.ok) {
    const errorMessage = typeof data?.error === "string" ? data.error : typeof data?.message === "string" ? data.message : response.statusText;
    throw new Error(`${response.status} ${errorMessage}`);
  }

  return data as T;
}

function exactEmailEmployees(values: any[]): any[] {
  return values.filter((employee) => String(employee?.email ?? "").trim().toLowerCase() === EMPLOYEE_EMAIL);
}

function pickEmployee(values: any[]): any {
  const exact = exactEmailEmployees(values);
  if (exact.length === 1) return exact[0];
  const withInfoRegistration = exact.filter((employee) => employee?.allowInformationRegistration === true);
  if (withInfoRegistration.length === 1) return withInfoRegistration[0];
  throw new Error(`Employee lookup ambiguous for ${EMPLOYEE_EMAIL}`);
}

function firstConcreteLocationFromAddress(address: any): string | undefined {
  const candidates = [
    address?.city,
    address?.addressLine1,
    address?.displayName,
    address?.addressAsString,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }
  return undefined;
}

function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
    .toLowerCase();
}

function pickCostCategory(values: any[], description: string): any {
  const visible = values.filter((category) => category?.showOnTravelExpenses === true);
  const normalizedTarget = normalizeText(description);
  const exact = visible.find((category) => normalizeText(String(category?.description ?? "")) === normalizedTarget);
  if (exact) return exact;
  const partial = visible.find((category) => normalizeText(String(category?.description ?? "")).includes(normalizedTarget));
  if (partial) return partial;
  throw new Error(`Missing cost category ${description}`);
}

function pickPaymentType(values: any[]): any {
  const visible = values.filter((paymentType) => paymentType?.showOnTravelExpenses === true && paymentType?.isInactive !== true);
  const preferred = visible.find((paymentType) => String(paymentType?.description ?? "").trim() === "Privat utlegg");
  if (preferred) return preferred;
  if (visible.length > 0) return visible[0];
  throw new Error("Missing travel expense payment type");
}

function pickRateType(values: any[]): { id: number } {
  const matchingRate = values.find((entry) => Number(entry?.rate) === PER_DIEM_RATE);
  const chosen = matchingRate ?? values[0];
  const id = chosen?.rateType?.id ?? chosen?.rateTypeId ?? chosen?.id;
  if (!id) {
    throw new Error("Missing per diem rateType id");
  }
  return { id: Number(id) };
}

function isTargetExpense(expense: any): boolean {
  return (
    expense?.title === TITLE &&
    expense?.travelDetails?.departureDate === DEPARTURE_DATE &&
    expense?.travelDetails?.returnDate === RETURN_DATE &&
    expense?.travelDetails?.destination === DESTINATION
  );
}

function summarizeExpense(expense: any) {
  return {
    id: expense?.id,
    state: expense?.state,
    title: expense?.title,
    employeeId: expense?.employee?.id,
    departureDate: expense?.travelDetails?.departureDate,
    returnDate: expense?.travelDetails?.returnDate,
    destination: expense?.travelDetails?.destination,
    departureFrom: expense?.travelDetails?.departureFrom,
    costs: Array.isArray(expense?.costs) ? expense.costs.length : undefined,
    perDiemCompensations: Array.isArray(expense?.perDiemCompensations) ? expense.perDiemCompensations.length : undefined,
  };
}

async function main() {
  const employeeResponse = await tripletex<ListResponse<any>>("employee", undefined, {
    email: EMPLOYEE_EMAIL,
    count: 10,
    fields: "*",
  });

  const employee = pickEmployee(employeeResponse.values ?? []);

  const existingExpenseResponse = await tripletex<ListResponse<any>>("travelExpense", undefined, {
    employeeId: Number(employee.id),
    departureDateFrom: DEPARTURE_DATE,
    returnDateTo: "2026-03-21",
    state: "ALL",
    count: 100,
    fields: "*",
  });

  const matchingExpenses = (existingExpenseResponse.values ?? []).filter(isTargetExpense);
  const deliveredExpense = matchingExpenses.find((expense) => expense?.state === "DELIVERED");
  if (deliveredExpense) {
    console.log(JSON.stringify(summarizeExpense(deliveredExpense), null, 2));
    return;
  }

  const openExpense = matchingExpenses.find((expense) => expense?.state === "OPEN" && expense?.id);
  if (openExpense) {
    const deliveredExisting = await tripletex<ListResponse<any>>("travelExpense/:deliver", {
      method: "PUT",
    }, {
      id: Number(openExpense.id),
    });
    const deliveredMatch = (deliveredExisting.values ?? []).find(isTargetExpense) ?? deliveredExisting.values?.[0];
    if (!deliveredMatch || deliveredMatch.state !== "DELIVERED") {
      throw new Error("Existing travel expense not delivered");
    }
    console.log(JSON.stringify(summarizeExpense(deliveredMatch), null, 2));
    return;
  }

  let departureFrom = firstConcreteLocationFromAddress(employee?.address);
  if (!departureFrom) {
    const companyId = employee?.companyId ?? employee?.company?.id;
    if (!companyId) {
      throw new Error("Missing concrete departureFrom and no company fallback");
    }
    const companyResponse = await tripletex<WrappedResponse<any>>(`company/${companyId}`, undefined, {
      fields: "*,address(*)",
    });
    departureFrom = firstConcreteLocationFromAddress(companyResponse.value?.address);
  }

  if (!departureFrom) {
    throw new Error("Unable to resolve concrete departureFrom");
  }

  const [costCategoryResponse, paymentTypeResponse, rateResponse] = await Promise.all([
    tripletex<ListResponse<any>>("travelExpense/costCategory", undefined, {
      count: 1000,
      fields: "*",
    }),
    tripletex<ListResponse<any>>("travelExpense/paymentType", undefined, {
      count: 1000,
      fields: "*",
    }),
    tripletex<ListResponse<any>>("travelExpense/rate", undefined, {
      type: "PER_DIEM",
      isValidDomestic: true,
      dateFrom: DEPARTURE_DATE,
      dateTo: RETURN_DATE,
      count: 1000,
      fields: "*",
    }),
  ]);

  const flightCategory = pickCostCategory(costCategoryResponse.values ?? [], "Fly");
  const taxiCategory = pickCostCategory(costCategoryResponse.values ?? [], "Taxi");
  const paymentType = pickPaymentType(paymentTypeResponse.values ?? []);
  const rateType = pickRateType(rateResponse.values ?? []);

  const createPayload = {
    employee: { id: Number(employee.id) },
    title: TITLE,
    travelDetails: {
      isForeignTravel: false,
      isDayTrip: false,
      isCompensationFromRates: true,
      departureDate: DEPARTURE_DATE,
      returnDate: RETURN_DATE,
      departureTime: DEPARTURE_TIME,
      returnTime: RETURN_TIME,
      departureFrom,
      destination: DESTINATION,
      detailedJourneyDescription: TITLE,
      purpose: TITLE,
    },
    perDiemCompensations: [
      {
        location: DESTINATION,
        count: PER_DIEM_DAYS,
        rate: PER_DIEM_RATE,
        amount: PER_DIEM_DAYS * PER_DIEM_RATE,
        rateType,
        overnightAccommodation: "HOTEL",
      },
    ],
    costs: [
      {
        costCategory: { id: Number(flightCategory.id) },
        paymentType: { id: Number(paymentType.id) },
        comments: FLIGHT_COMMENT,
        amountCurrencyIncVat: 7800,
        amountNOKInclVAT: 7800,
        date: DEPARTURE_DATE,
        vatType: { id: 0 },
      },
      {
        costCategory: { id: Number(taxiCategory.id) },
        paymentType: { id: Number(paymentType.id) },
        comments: TAXI_COMMENT,
        amountCurrencyIncVat: 600,
        amountNOKInclVAT: 600,
        date: RETURN_DATE,
        vatType: { id: 0 },
      },
    ],
  };

  const created = await tripletex<WrappedResponse<any>>("travelExpense", {
    method: "POST",
    body: JSON.stringify(createPayload),
  });

  const travelExpenseId = created.value?.id;
  if (!travelExpenseId) {
    throw new Error("Travel expense create response missing id");
  }

  const delivered = await tripletex<ListResponse<any>>("travelExpense/:deliver", {
    method: "PUT",
  }, {
    id: Number(travelExpenseId),
  });

  const result = (delivered.values ?? []).find((expense) => Number(expense?.id) === Number(travelExpenseId)) ?? delivered.values?.[0];
  if (!result || result.state !== "DELIVERED") {
    throw new Error("Travel expense not delivered");
  }

  console.log(JSON.stringify(summarizeExpense(result), null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
