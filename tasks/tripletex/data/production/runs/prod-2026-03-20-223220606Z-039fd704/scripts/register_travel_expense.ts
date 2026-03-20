const BASE_URL = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "B4pP-yMncVp9awIwYH1z6pp5qBkARdRV58Gh5aOfGjE";

const EMPLOYEE_EMAIL = "charlotte.williams@example.org";
const TITLE = "Client visit Bod\u00f8";
const DESTINATION = "Bod\u00f8";
const DEPARTURE_DATE = "2026-03-18";
const RETURN_DATE = "2026-03-20";
const PER_DIEM_DAYS = 3;
const PER_DIEM_RATE = 800;
const FLIGHT_AMOUNT = 6200;
const TAXI_AMOUNT = 400;
const FLIGHT_COMMENT = "flight ticket";
const TAXI_COMMENT = "taxi";

type ListResponse<T> = {
  values?: T[];
  fullResultSize?: number;
};

type WrappedResponse<T> = {
  value?: T;
};

type Address = {
  city?: string;
  addressLine1?: string;
  displayName?: string;
  addressAsString?: string;
};

type Employee = {
  id?: number;
  email?: string;
  allowInformationRegistration?: boolean;
  address?: Address | null;
  companyId?: number;
  company?: { id?: number } | null;
};

type CostCategory = {
  id?: number;
  description?: string;
  showOnTravelExpenses?: boolean;
  isInactive?: boolean;
};

type PaymentType = {
  id?: number;
  description?: string;
  showOnTravelExpenses?: boolean;
  isInactive?: boolean;
};

type RateRow = {
  id?: number;
  rate?: number;
  rateType?: { id?: number } | null;
  rateTypeId?: number;
};

function buildUrl(
  path: string,
  query?: Record<string, string | number | boolean | undefined>,
): string {
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

async function tripletex<T>(
  path: string,
  init?: RequestInit,
  query?: Record<string, string | number | boolean | undefined>,
): Promise<T> {
  const response = await fetch(buildUrl(path, query), {
    ...init,
    headers: {
      Authorization: `Basic ${Buffer.from(`0:${TOKEN}`).toString("base64")}`,
      Accept: "application/json",
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...(init?.headers ?? {}),
    },
  });

  const text = await response.text();
  const body = text ? JSON.parse(text) : undefined;

  if (!response.ok) {
    const error = body?.error;
    if (
      response.status === 403 &&
      (error === "Invalid or expired token" ||
        error ===
          "Invalid or expired proxy token. Each submission receives a unique token - do not reuse tokens from previous submissions.")
    ) {
      throw new Error(`blocked_credentials: ${error}`);
    }
    throw new Error(
      `${init?.method ?? "GET"} ${path} failed: ${response.status} ${response.statusText}\n${text}`,
    );
  }

  return body as T;
}

function firstConcreteLocation(address: Address | null | undefined): string | undefined {
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

function exactEmailMatches(values: Employee[]): Employee[] {
  return values.filter(
    (employee) =>
      String(employee.email ?? "").trim().toLowerCase() === EMPLOYEE_EMAIL,
  );
}

function pickEmployee(values: Employee[]): Employee {
  const matches = exactEmailMatches(values);
  if (matches.length === 1) {
    return matches[0];
  }
  const preferred = matches.filter(
    (employee) => employee.allowInformationRegistration === true,
  );
  if (preferred.length === 1) {
    return preferred[0];
  }
  if (matches.length === 0) {
    throw new Error(`employee_not_found: ${EMPLOYEE_EMAIL}`);
  }
  throw new Error(`employee_ambiguous: ${EMPLOYEE_EMAIL}`);
}

function normalizeText(value: string | undefined): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
    .toLowerCase();
}

function pickCostCategory(values: CostCategory[], wantedDescription: string): CostCategory {
  const visible = values.filter(
    (value) =>
      value.showOnTravelExpenses === true && value.isInactive !== true,
  );
  const target = normalizeText(wantedDescription);
  const exact = visible.find(
    (value) => normalizeText(value.description) === target,
  );
  if (exact?.id) {
    return exact;
  }
  const partial = visible.find((value) =>
    normalizeText(value.description).includes(target),
  );
  if (partial?.id) {
    return partial;
  }
  throw new Error(`cost_category_not_found: ${wantedDescription}`);
}

function pickPaymentType(values: PaymentType[]): PaymentType {
  const visible = values.filter(
    (value) =>
      value.showOnTravelExpenses === true && value.isInactive !== true,
  );
  const preferred = visible.find((value) => value.description === "Privat utlegg");
  if (preferred?.id) {
    return preferred;
  }
  if (visible.length === 1 && visible[0]?.id) {
    return visible[0];
  }
  if (visible[0]?.id) {
    return visible[0];
  }
  throw new Error("payment_type_not_found");
}

function pickRateType(values: RateRow[]): { id: number } {
  const matchingRate = values.find((value) => Number(value.rate) === PER_DIEM_RATE);
  const chosen = matchingRate ?? values[0];
  const id = Number(chosen?.rateType?.id ?? chosen?.rateTypeId ?? chosen?.id);
  if (!id) {
    throw new Error("rate_type_not_found");
  }
  return { id };
}

async function main() {
  const employeeResponse = await tripletex<ListResponse<Employee>>("employee", undefined, {
    email: EMPLOYEE_EMAIL,
    count: 10,
    fields: "*",
  });

  const employee = pickEmployee(employeeResponse.values ?? []);
  const employeeId = Number(employee.id);
  if (!employeeId) {
    throw new Error("employee_id_missing");
  }

  let departureFrom = firstConcreteLocation(employee.address);
  if (!departureFrom) {
    const companyId = Number(employee.companyId ?? employee.company?.id);
    if (!companyId) {
      throw new Error("departure_from_unresolved");
    }
    const companyResponse = await tripletex<WrappedResponse<{ address?: Address | null }>>(
      `company/${companyId}`,
      undefined,
      { fields: "*,address(*)" },
    );
    departureFrom = firstConcreteLocation(companyResponse.value?.address);
  }

  if (!departureFrom) {
    throw new Error("departure_from_unresolved");
  }

  const [costCategoryResponse, paymentTypeResponse, rateResponse] = await Promise.all([
    tripletex<ListResponse<CostCategory>>("travelExpense/costCategory", undefined, {
      count: 1000,
      fields: "*",
    }),
    tripletex<ListResponse<PaymentType>>("travelExpense/paymentType", undefined, {
      count: 1000,
      fields: "*",
    }),
    tripletex<ListResponse<RateRow>>("travelExpense/rate", undefined, {
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

  const created = await tripletex<
    WrappedResponse<{
      id?: number;
      title?: string;
      employee?: { id?: number } | null;
      travelDetails?: {
        departureDate?: string;
        returnDate?: string;
        departureFrom?: string;
        destination?: string;
      } | null;
      costs?: Array<{ id?: number }>;
      perDiemCompensations?: Array<{ id?: number }>;
    }>
  >("travelExpense", {
    method: "POST",
    body: JSON.stringify({
      employee: { id: employeeId },
      title: TITLE,
      travelDetails: {
        isForeignTravel: false,
        isDayTrip: false,
        isCompensationFromRates: true,
        departureDate: DEPARTURE_DATE,
        returnDate: RETURN_DATE,
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
          amountCurrencyIncVat: FLIGHT_AMOUNT,
          amountNOKInclVAT: FLIGHT_AMOUNT,
          date: DEPARTURE_DATE,
          vatType: { id: 0 },
        },
        {
          costCategory: { id: Number(taxiCategory.id) },
          paymentType: { id: Number(paymentType.id) },
          comments: TAXI_COMMENT,
          amountCurrencyIncVat: TAXI_AMOUNT,
          amountNOKInclVAT: TAXI_AMOUNT,
          date: RETURN_DATE,
          vatType: { id: 0 },
        },
      ],
    }),
  });

  const travelExpenseId = Number(created.value?.id);
  if (!travelExpenseId) {
    throw new Error("travel_expense_id_missing");
  }

  const delivered = await tripletex<
    ListResponse<{
      id?: number;
      state?: string;
      title?: string;
      employee?: { id?: number } | null;
      travelDetails?: {
        departureDate?: string;
        returnDate?: string;
        departureFrom?: string;
        destination?: string;
      } | null;
      costs?: unknown[];
      perDiemCompensations?: unknown[];
    }>
  >("travelExpense/:deliver", { method: "PUT" }, { id: travelExpenseId });

  const result =
    (delivered.values ?? []).find((value) => Number(value.id) === travelExpenseId) ??
    delivered.values?.[0];

  if (!result || result.state !== "DELIVERED") {
    throw new Error("travel_expense_not_delivered");
  }

  console.log(
    JSON.stringify(
      {
        id: result.id,
        state: result.state,
        title: result.title,
        employeeId: result.employee?.id,
        departureDate: result.travelDetails?.departureDate,
        returnDate: result.travelDetails?.returnDate,
        departureFrom: result.travelDetails?.departureFrom,
        destination: result.travelDetails?.destination,
        costs: Array.isArray(result.costs) ? result.costs.length : undefined,
        perDiemCompensations: Array.isArray(result.perDiemCompensations)
          ? result.perDiemCompensations.length
          : undefined,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
