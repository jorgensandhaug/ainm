const BASE_URL = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN =
  "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";

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

async function main() {
  const [employeeRes, categoryRes, paymentTypeRes, rateCategoryRes, rateRes] = await Promise.all([
    request<any>("GET", "/employee", {
      query: { count: 50, fields: "*" },
    }),
    request<any>("GET", "/travelExpense/costCategory", {
      query: { count: 1000, fields: "*" },
    }),
    request<any>("GET", "/travelExpense/paymentType", {
      query: { count: 1000, fields: "*" },
    }),
    request<any>("GET", "/travelExpense/rateCategory", {
      query: {
        type: "PER_DIEM",
        isValidDomestic: true,
        dateFrom: "2026-03-19",
        dateTo: "2026-03-21",
        count: 1000,
        fields: "*",
      },
    }),
    request<any>("GET", "/travelExpense/rate", {
      query: {
        type: "PER_DIEM",
        isValidDomestic: true,
        dateFrom: "2026-03-19",
        dateTo: "2026-03-21",
        count: 1000,
        fields: "*",
      },
    }),
  ]);

  const employees = (employeeRes.values ?? []).map((employee: any) => ({
    id: employee.id,
    name: employee.displayName,
    email: employee.email,
    allowInformationRegistration: employee.allowInformationRegistration,
    isContact: employee.isContact,
    departmentId: employee.department?.id ?? null,
  }));

  const categories = (categoryRes.values ?? []).map((entry: any) => ({
    id: entry.id,
    description: entry.description,
    displayName: entry.displayName,
    showOnTravelExpenses: entry.showOnTravelExpenses,
    isInactive: entry.isInactive,
  }));

  const paymentTypes = (paymentTypeRes.values ?? []).map((entry: any) => ({
    id: entry.id,
    description: entry.description,
    displayName: entry.displayName,
    showOnTravelExpenses: entry.showOnTravelExpenses,
    isInactive: entry.isInactive,
  }));

  const rateCategories = (rateCategoryRes.values ?? []).map((entry: any) => ({
    id: entry.id,
    name: entry.name,
    displayName: entry.displayName,
    isValidDayTrip: entry.isValidDayTrip,
    isValidDomestic: entry.isValidDomestic,
    requiresZone: entry.requiresZone,
    isRequiresOvernightAccommodation: entry.isRequiresOvernightAccommodation,
  }));

  const rates = (rateRes.values ?? []).map((entry: any) => ({
    id: entry.id,
    amount: entry.amount,
    type: entry.type,
    dateFrom: entry.dateFrom,
    dateTo: entry.dateTo,
    isValidDomestic: entry.isValidDomestic,
    isValidDayTrip: entry.isValidDayTrip,
    requiresZone: entry.requiresZone,
    requiresOvernightAccommodation: entry.requiresOvernightAccommodation,
    rateCategory: entry.rateCategory
      ? {
          id: entry.rateCategory.id,
          name: entry.rateCategory.name,
          displayName: entry.rateCategory.displayName,
        }
      : null,
  }));

  console.log(
    JSON.stringify(
      {
        employees,
        categories,
        paymentTypes,
        rateCategories,
        rates,
      },
      null,
      2,
    ),
  );
}

await main();
