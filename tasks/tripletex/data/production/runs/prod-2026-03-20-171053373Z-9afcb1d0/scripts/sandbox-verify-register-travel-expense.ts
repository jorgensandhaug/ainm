const baseUrl = "https://kkpqfuj-amager.tripletex.dev/v2";
const sessionToken =
  "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";

const departureDate = "2026-03-17";
const returnDate = "2026-03-20";
const destination = "Trondheim";
const title = "Codex reflection travel expense 2026-03-20";

type TripletexList<T> = {
  values?: T[];
  fullResultSize?: number;
};

type TripletexValue<T> = {
  value?: T;
};

type Employee = {
  id: number;
  email?: string;
  displayName?: string;
  allowInformationRegistration?: boolean;
  address?: {
    city?: string;
    addressLine1?: string;
    displayName?: string;
  };
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
    name?: string;
    isValidDomestic?: boolean;
    isValidDayTrip?: boolean;
    isRequiresOvernightAccommodation?: boolean;
  };
};

type TravelExpense = {
  id: number;
  state?: string;
  title?: string;
  employee?: { id?: number };
  travelDetails?: {
    departureDate?: string;
    returnDate?: string;
    departureFrom?: string;
    destination?: string;
  };
  costs?: Array<{ id?: number }>;
  perDiemCompensations?: Array<{ id?: number }>;
};

type TravelCost = {
  id: number;
  comments?: string;
  amountCurrencyIncVat?: number;
  amountNOKInclVAT?: number;
  date?: string;
  vatType?: { id?: number };
  costCategory?: { id?: number; description?: string };
  paymentType?: { id?: number; description?: string };
};

type PerDiemCompensation = {
  id: number;
  location?: string;
  count?: number;
  rate?: number;
  amount?: number;
  overnightAccommodation?: string;
  rateType?: { id?: number; rate?: number };
};

function buildUrl(path: string, query?: Record<string, string | number | boolean | undefined>) {
  const url = new URL(path, baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
  }
  return url;
}

async function api<T>(method: string, path: string, options?: { query?: Record<string, string | number | boolean | undefined>; body?: unknown }) {
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
    throw new Error(`${method} ${url} failed with ${response.status}: ${text}`);
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

function chooseEmployee(values: Employee[]) {
  const eligible = values.filter((value) => value.allowInformationRegistration);
  const withEmail = eligible.filter((value) => value.email);
  return withEmail[0] ?? eligible[0] ?? values[0];
}

function findCategory(values: TravelCostCategory[], preferredDescription: string, fallbacks: string[]) {
  const active = values.filter((value) => value.showOnTravelExpenses && !value.isInactive);
  return (
    active.find((value) => value.description === preferredDescription) ??
    active.find((value) => {
      const desc = normalize(value.description);
      return fallbacks.some((fallback) => desc.includes(fallback));
    })
  );
}

function findPaymentType(values: TravelPaymentType[]) {
  const active = values.filter((value) => value.showOnTravelExpenses && !value.isInactive);
  return active.find((value) => value.description === "Privat utlegg") ?? active[0];
}

function pickRate(values: TravelExpenseRate[]) {
  const ranked = [...values].sort((a, b) => {
    const aScore =
      (a.rate === 800 ? 4 : 0) +
      (a.rateCategory?.isRequiresOvernightAccommodation ? 2 : 0) +
      (a.rateCategory?.isValidDayTrip === false ? 1 : 0);
    const bScore =
      (b.rate === 800 ? 4 : 0) +
      (b.rateCategory?.isRequiresOvernightAccommodation ? 2 : 0) +
      (b.rateCategory?.isValidDayTrip === false ? 1 : 0);
    return bScore - aScore;
  });
  return ranked[0];
}

async function main() {
  const employeeResponse = await api<TripletexList<Employee>>("GET", "employee", {
    query: { allowInformationRegistration: true, count: 20, fields: "*" },
  });
  const employee = chooseEmployee(employeeResponse.values ?? []);
  if (!employee?.id) throw new Error("Missing sandbox employee");

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
  const rate = pickRate(ratesResponse.values ?? []);
  if (!flightCategory || !taxiCategory || !paymentType || !rate?.id) {
    throw new Error("Missing sandbox lookup data");
  }

  const departureFrom = employee.address?.city || employee.address?.addressLine1 || employee.address?.displayName || "Hjemsted";

  const created = await api<TripletexValue<TravelExpense>>("POST", "travelExpense", {
    body: {
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
          rateType: { id: rate.id },
          overnightAccommodation: "HOTEL",
          location: destination,
          count: 4,
          rate: 800,
          amount: 3200,
        },
      ],
      costs: [
        {
          costCategory: { id: flightCategory.id },
          paymentType: { id: paymentType.id },
          vatType: { id: 0 },
          comments: "sandbox fly",
          amountCurrencyIncVat: 6150,
          amountNOKInclVAT: 6150,
          date: departureDate,
        },
        {
          costCategory: { id: taxiCategory.id },
          paymentType: { id: paymentType.id },
          vatType: { id: 0 },
          comments: "sandbox taxi",
          amountCurrencyIncVat: 750,
          amountNOKInclVAT: 750,
          date: returnDate,
        },
      ],
    },
  });

  const createdExpense = created.value;
  if (!createdExpense?.id) throw new Error("Missing created sandbox travel expense id");

  const delivered = await api<TripletexList<TravelExpense>>("PUT", "travelExpense/:deliver", {
    query: { id: createdExpense.id },
  });

  const deliveredExpense = (delivered.values ?? []).find((value) => value.id === createdExpense.id) ?? delivered.values?.[0];
  if (!deliveredExpense) throw new Error("Missing delivered sandbox travel expense");

  const [costs, perDiems] = await Promise.all([
    api<TripletexList<TravelCost>>("GET", "travelExpense/cost", {
      query: { travelExpenseId: createdExpense.id, count: 20, fields: "*" },
    }),
    api<TripletexList<PerDiemCompensation>>("GET", "travelExpense/perDiemCompensation", {
      query: { travelExpenseId: createdExpense.id, count: 20, fields: "*" },
    }),
  ]);

  console.log(
    JSON.stringify(
      {
        employee: {
          id: employee.id,
          email: employee.email,
          allowInformationRegistration: employee.allowInformationRegistration,
          departureFromSource: departureFrom,
        },
        rateLookup: {
          count: ratesResponse.values?.length ?? 0,
          sample: (ratesResponse.values ?? []).slice(0, 3).map((value) => ({
            id: value.id,
            rate: value.rate,
            rateCategory: value.rateCategory,
          })),
          chosen: {
            id: rate.id,
            rate: rate.rate,
            rateCategory: rate.rateCategory,
          },
        },
        paymentTypes: (paymentTypesResponse.values ?? []).map((value) => ({
          id: value.id,
          description: value.description,
          showOnTravelExpenses: value.showOnTravelExpenses,
          isInactive: value.isInactive,
        })),
        delivered: {
          id: deliveredExpense.id,
          state: deliveredExpense.state,
          title: deliveredExpense.title,
          employeeId: deliveredExpense.employee?.id,
          departureDate: deliveredExpense.travelDetails?.departureDate,
          returnDate: deliveredExpense.travelDetails?.returnDate,
          departureFrom: deliveredExpense.travelDetails?.departureFrom,
          destination: deliveredExpense.travelDetails?.destination,
          costCount: deliveredExpense.costs?.length ?? 0,
          perDiemCount: deliveredExpense.perDiemCompensations?.length ?? 0,
        },
        expandedChildren: {
          costs: costs.values,
          perDiems: perDiems.values,
        },
      },
      null,
      2,
    ),
  );
}

await main();
