const BASE_URL = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";

const EMPLOYEE_EMAIL = "miguel.perez@example.org";
const TITLE = "Visita cliente Bergen";
const DESTINATION = "Bergen";
const DEPARTURE_DATE = "2026-02-24";
const RETURN_DATE = "2026-02-27";

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
      if (value !== undefined) url.searchParams.set(key, String(value));
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
    throw new Error(`${response.status} ${data?.message ?? data?.error ?? response.statusText}`);
  }
  return data as T;
}

function pickEmployee(values: any[]): any {
  const exact = values.filter((employee) => String(employee?.email ?? "").trim().toLowerCase() === EMPLOYEE_EMAIL);
  if (exact.length === 1) return exact[0];
  const infoEnabled = exact.filter((employee) => employee?.allowInformationRegistration === true);
  if (infoEnabled.length === 1) return infoEnabled[0];
  throw new Error(JSON.stringify({
    email: EMPLOYEE_EMAIL,
    exactMatches: exact.map((employee) => ({
      id: employee?.id,
      allowInformationRegistration: employee?.allowInformationRegistration,
      isInactive: employee?.isInactive,
      address: employee?.address,
      companyId: employee?.companyId ?? employee?.company?.id,
      departmentId: employee?.department?.id,
    })),
  }, null, 2));
}

function firstConcreteLocationFromAddress(address: any): string | undefined {
  for (const value of [address?.city, address?.addressLine1, address?.displayName, address?.addressAsString]) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}

function normalize(value: string): string {
  return value.normalize("NFD").replace(/\p{Diacritic}/gu, "").trim().toLowerCase();
}

function pickCostCategory(values: any[], description: string): any {
  const visible = values.filter((category) => category?.showOnTravelExpenses === true);
  const exact = visible.find((category) => normalize(String(category?.description ?? "")) === normalize(description));
  if (exact) return exact;
  throw new Error(`Cost category not found: ${description}`);
}

function pickPaymentType(values: any[]): any {
  const visible = values.filter((paymentType) => paymentType?.showOnTravelExpenses === true && paymentType?.isInactive !== true);
  const preferred = visible.find((paymentType) => String(paymentType?.description ?? "") === "Privat utlegg");
  if (preferred) return preferred;
  if (visible[0]) return visible[0];
  throw new Error("Travel payment type not found");
}

function pickRateType(values: any[]): { id: number } {
  const exact = values.find((row) => Number(row?.rate) === 800);
  const chosen = exact ?? values[0];
  const id = chosen?.rateType?.id ?? chosen?.rateTypeId ?? chosen?.id;
  if (!id) throw new Error("Rate type id missing");
  return { id: Number(id) };
}

async function main() {
  const employeeResponse = await tripletex<ListResponse<any>>("employee", undefined, {
    email: EMPLOYEE_EMAIL,
    count: 10,
    fields: "*",
  });
  const employee = pickEmployee(employeeResponse.values ?? []);

  let departureFrom = firstConcreteLocationFromAddress(employee?.address);
  let usedCompanyFallback = false;
  if (!departureFrom) {
    usedCompanyFallback = true;
    const companyId = employee?.companyId ?? employee?.company?.id;
    const companyResponse = await tripletex<WrappedResponse<any>>(`company/${companyId}`, undefined, {
      fields: "*,address(*)",
    });
    departureFrom = firstConcreteLocationFromAddress(companyResponse.value?.address);
  }
  if (!departureFrom) throw new Error("No concrete departureFrom");

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

  const created = await tripletex<WrappedResponse<any>>("travelExpense", {
    method: "POST",
    body: JSON.stringify({
      employee: { id: Number(employee.id) },
      title: TITLE,
      travelDetails: {
        isForeignTravel: false,
        isDayTrip: false,
        isCompensationFromRates: true,
        departureDate: DEPARTURE_DATE,
        returnDate: RETURN_DATE,
        departureTime: "08:00",
        returnTime: "18:00",
        departureFrom,
        destination: DESTINATION,
        detailedJourneyDescription: TITLE,
        purpose: TITLE,
      },
      perDiemCompensations: [
        {
          location: DESTINATION,
          count: 4,
          rate: 800,
          amount: 3200,
          rateType,
          overnightAccommodation: "HOTEL",
        },
      ],
      costs: [
        {
          costCategory: { id: Number(flightCategory.id) },
          paymentType: { id: Number(paymentType.id) },
          comments: "billete de avión",
          amountCurrencyIncVat: 7800,
          amountNOKInclVAT: 7800,
          date: DEPARTURE_DATE,
          vatType: { id: 0 },
        },
        {
          costCategory: { id: Number(taxiCategory.id) },
          paymentType: { id: Number(paymentType.id) },
          comments: "taxi",
          amountCurrencyIncVat: 600,
          amountNOKInclVAT: 600,
          date: RETURN_DATE,
          vatType: { id: 0 },
        },
      ],
    }),
  });

  const deliverResponse = await tripletex<ListResponse<any>>("travelExpense/:deliver", {
    method: "PUT",
  }, {
    id: Number(created.value?.id),
  });

  console.log(JSON.stringify({
    employeeId: employee.id,
    usedCompanyFallback,
    departureFrom,
    createdId: created.value?.id,
    deliverResponseKeys: Object.keys(deliverResponse ?? {}),
    deliverValuesLength: Array.isArray(deliverResponse.values) ? deliverResponse.values.length : null,
    deliveredId: deliverResponse.values?.[0]?.id,
    deliveredState: deliverResponse.values?.[0]?.state,
    deliveredTitle: deliverResponse.values?.[0]?.title,
    deliveredCostsLength: Array.isArray(deliverResponse.values?.[0]?.costs) ? deliverResponse.values[0].costs.length : null,
    deliveredPerDiemsLength: Array.isArray(deliverResponse.values?.[0]?.perDiemCompensations) ? deliverResponse.values[0].perDiemCompensations.length : null,
    matchedRateTypeId: rateType.id,
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
