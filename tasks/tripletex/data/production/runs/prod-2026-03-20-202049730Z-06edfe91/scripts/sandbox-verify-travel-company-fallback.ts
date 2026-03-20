const baseUrl = "https://kkpqfuj-amager.tripletex.dev/v2";
const sessionToken =
  "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";

const task = {
  email: "codex.verify.1773957815637@example.org",
  title: "Codex fallback proof Tromsø 2026-03-20",
  destination: "Tromsø",
  departureDate: "2026-03-16",
  returnDate: "2026-03-20",
  perDiemCount: 5,
  perDiemRate: 800,
  perDiemAmount: 4000,
  flightAmount: 2600,
  taxiAmount: 800,
};

const auth = `Basic ${Buffer.from(`0:${sessionToken}`).toString("base64")}`;
let callCount = 0;

function buildUrl(path: string, query?: Record<string, string>) {
  const next = new URL(path.replace(/^\//, ""), `${baseUrl}/`);
  for (const [key, value] of Object.entries(query ?? {})) {
    next.searchParams.set(key, value);
  }
  return next.toString();
}

async function api<T>(
  method: string,
  path: string,
  options: { query?: Record<string, string>; body?: unknown } = {},
): Promise<T> {
  callCount += 1;
  const response = await fetch(buildUrl(path, options.query), {
    method,
    headers: {
      Authorization: auth,
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${method} ${path} ${JSON.stringify(body)}`);
  }
  return body as T;
}

function companyOrEmployeeLocation(value: any) {
  return (
    value?.address?.city ||
    value?.address?.addressLine1 ||
    value?.address?.displayName ||
    value?.address?.addressAsString ||
    value?.address?.displayNameInklMatrikkel ||
    null
  );
}

function exactEmail(values: any[], email: string) {
  const target = email.toLowerCase();
  return values.filter((value) => String(value?.email ?? "").toLowerCase() === target);
}

const employeeResponse = await api<any>("GET", "employee", {
  query: { email: task.email, count: "10", fields: "*" },
});
const employees = exactEmail(employeeResponse.values ?? [], task.email);
const employee =
  employees.find((value) => value?.allowInformationRegistration === true) ??
  (employees.length === 1 ? employees[0] : null);

if (!employee) {
  throw new Error(`Employee resolution failed for ${task.email}`);
}

let departureFrom = companyOrEmployeeLocation(employee);
let departureSource = "employee";

if (!departureFrom) {
  const companyResponse = await api<any>("GET", `company/${employee.companyId}`, {
    query: { fields: "*,address(*)" },
  });
  departureFrom = companyOrEmployeeLocation(companyResponse.value);
  departureSource = "company";
}

if (!departureFrom) {
  throw new Error("No concrete departureFrom from employee or company");
}

const [costCategoryResponse, paymentTypeResponse, rateResponse] = await Promise.all([
  api<any>("GET", "travelExpense/costCategory", {
    query: { count: "1000", fields: "*" },
  }),
  api<any>("GET", "travelExpense/paymentType", {
    query: { count: "1000", fields: "*" },
  }),
  api<any>("GET", "travelExpense/rate", {
    query: {
      type: "PER_DIEM",
      isValidDomestic: "true",
      dateFrom: task.departureDate,
      dateTo: task.returnDate,
      count: "1000",
      fields: "*",
    },
  }),
]);

const flightCategory = (costCategoryResponse.values ?? []).find(
  (value: any) => value?.showOnTravelExpenses === true && value?.description === "Fly",
);
const taxiCategory = (costCategoryResponse.values ?? []).find(
  (value: any) => value?.showOnTravelExpenses === true && value?.description === "Taxi",
);
const paymentType =
  (paymentTypeResponse.values ?? []).find(
    (value: any) =>
      value?.showOnTravelExpenses === true &&
      value?.isInactive !== true &&
      value?.description === "Privat utlegg",
  ) ??
  (paymentTypeResponse.values ?? []).find(
    (value: any) => value?.showOnTravelExpenses === true && value?.isInactive !== true,
  );
const rateType =
  (rateResponse.values ?? []).find((value: any) => Number(value?.rate) === task.perDiemRate) ??
  rateResponse.values?.[0];

if (!flightCategory || !taxiCategory || !paymentType || !rateType) {
  throw new Error("Lookup resolution failed");
}

const createResponse = await api<any>("POST", "travelExpense", {
  body: {
    employee: { id: employee.id },
    title: task.title,
    travelDetails: {
      isForeignTravel: false,
      isDayTrip: false,
      isCompensationFromRates: true,
      departureDate: task.departureDate,
      returnDate: task.returnDate,
      departureTime: "08:00",
      returnTime: "18:00",
      departureFrom,
      destination: task.destination,
      detailedJourneyDescription: task.title,
      purpose: task.title,
    },
    perDiemCompensations: [
      {
        location: task.destination,
        rateType: { id: rateType.id },
        overnightAccommodation: "HOTEL",
        count: task.perDiemCount,
        rate: task.perDiemRate,
        amount: task.perDiemAmount,
      },
    ],
    costs: [
      {
        costCategory: { id: flightCategory.id },
        paymentType: { id: paymentType.id },
        vatType: { id: 0 },
        comments: "billete de avión",
        amountCurrencyIncVat: task.flightAmount,
        amountNOKInclVAT: task.flightAmount,
        date: task.departureDate,
      },
      {
        costCategory: { id: taxiCategory.id },
        paymentType: { id: paymentType.id },
        vatType: { id: 0 },
        comments: "taxi",
        amountCurrencyIncVat: task.taxiAmount,
        amountNOKInclVAT: task.taxiAmount,
        date: task.returnDate,
      },
    ],
  },
});

const travelExpenseId = createResponse.value?.id;
if (!travelExpenseId) {
  throw new Error(`Create failed ${JSON.stringify(createResponse)}`);
}

const deliverResponse = await api<any>("PUT", "travelExpense/:deliver", {
  query: { id: String(travelExpenseId) },
});

const delivered = (deliverResponse.values ?? []).find((value: any) => value?.id === travelExpenseId);
if (!delivered || delivered?.state !== "DELIVERED") {
  throw new Error(`Deliver failed ${JSON.stringify(deliverResponse)}`);
}

console.log(
  JSON.stringify(
    {
      callCount,
      departureSource,
      employeeId: employee.id,
      companyId: employee.companyId,
      departureFrom,
      id: delivered.id,
      state: delivered.state,
      costCount: Array.isArray(delivered.costs) ? delivered.costs.length : null,
      perDiemCount: Array.isArray(delivered.perDiemCompensations)
        ? delivered.perDiemCompensations.length
        : null,
      title: delivered.title,
    },
    null,
    2,
  ),
);
