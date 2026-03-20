const baseUrl = process.env.TRIPLETEX_BASE_URL;
const token = process.env.TRIPLETEX_TOKEN;

if (!baseUrl || !token) {
  throw new Error("Missing TRIPLETEX_BASE_URL or TRIPLETEX_TOKEN");
}

const title = "Client visit Trondheim";
const employeeEmail = "lucy.walker@example.org";
const destination = "Trondheim";
const departureDate = "2026-03-17";
const returnDate = "2026-03-20";
const departureTime = "08:00";
const returnTime = "18:00";

type TripletexResponse<T> = {
  value?: T;
  values?: T[];
  fullResultSize?: number;
};

type Link = {
  id: number;
  [key: string]: unknown;
};

type Employee = {
  id: number;
  email?: string;
  allowInformationRegistration?: boolean;
  department?: Link | null;
};

type CostCategory = {
  id: number;
  description?: string;
  name?: string;
  showOnTravelExpenses?: boolean;
};

type PaymentType = {
  id: number;
  description?: string;
  name?: string;
  isInactive?: boolean;
  showOnTravelExpenses?: boolean;
};

type TravelExpense = {
  id: number;
  title?: string;
  employee?: Link;
  travelDetails?: {
    destination?: string;
    purpose?: string;
    detailedJourneyDescription?: string;
    departureDate?: string;
    returnDate?: string;
    isCompensationFromRates?: boolean;
  };
};

type TravelCost = {
  comments?: string;
  amountCurrencyIncVat?: number;
  amountNOKInclVAT?: number;
  costCategory?: Link;
  paymentType?: Link;
};

type PerDiem = {
  location?: string;
  count?: number;
  rate?: number;
  amount?: number;
};

async function api<T>(path: string, init?: RequestInit): Promise<TripletexResponse<T>> {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      Authorization: `Basic ${Buffer.from(`0:${token}`).toString("base64")}`,
      Accept: "application/json",
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`${init?.method ?? "GET"} ${path} failed: ${response.status} ${text}`);
  }

  if (response.status === 204) {
    return {};
  }

  return (await response.json()) as TripletexResponse<T>;
}

function oneExact<T>(items: T[], label: string): T {
  if (items.length !== 1) {
    throw new Error(`Expected exactly one ${label}, got ${items.length}`);
  }
  return items[0];
}

function norm(value: string | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function pickEmployee(employees: Employee[]): Employee {
  const exact = employees.filter((employee) => norm(employee.email) === employeeEmail);
  if (exact.length === 1) {
    return exact[0];
  }
  const preferred = exact.filter((employee) => employee.allowInformationRegistration === true);
  if (preferred.length === 1) {
    return preferred[0];
  }
  throw new Error(`Employee match ambiguous for ${employeeEmail}`);
}

function pickCostCategory(categories: CostCategory[], wanted: string): CostCategory {
  const travelCategories = categories.filter((category) => category.showOnTravelExpenses === true);
  const exact = travelCategories.filter((category) => norm(category.description ?? category.name) === norm(wanted));
  return oneExact(exact, `cost category ${wanted}`);
}

function pickPaymentType(paymentTypes: PaymentType[]): PaymentType {
  const candidates = paymentTypes.filter(
    (paymentType) =>
      paymentType.showOnTravelExpenses === true &&
      paymentType.isInactive !== true &&
      norm(paymentType.description ?? paymentType.name) === "privat utlegg",
  );
  if (candidates.length === 1) {
    return candidates[0];
  }
  const fallback = paymentTypes.filter(
    (paymentType) => paymentType.showOnTravelExpenses === true && paymentType.isInactive !== true,
  );
  return oneExact(fallback, "travel payment type");
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

const employeeResp = await api<Employee>(
  `/employee?email=${encodeURIComponent(employeeEmail)}&count=10&fields=*`,
);
const employee = pickEmployee(employeeResp.values ?? []);

const categoriesResp = await api<CostCategory>("/travelExpense/costCategory?count=1000&fields=*");
const paymentTypesResp = await api<PaymentType>("/travelExpense/paymentType?count=1000&fields=*");

const flightCategory = pickCostCategory(categoriesResp.values ?? [], "Fly");
const taxiCategory = pickCostCategory(categoriesResp.values ?? [], "Taxi");
const paymentType = pickPaymentType(paymentTypesResp.values ?? []);

const payload = {
  employee: { id: employee.id },
  ...(employee.department?.id ? { department: { id: employee.department.id } } : {}),
  title,
  travelDetails: {
    isForeignTravel: false,
    isDayTrip: false,
    isCompensationFromRates: true,
    departureDate,
    returnDate,
    departureTime,
    returnTime,
    destination,
    detailedJourneyDescription: title,
    purpose: title,
  },
  perDiemCompensations: [
    {
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
      comments: "flight ticket",
      amountCurrencyIncVat: 7200,
      amountNOKInclVAT: 7200,
      date: departureDate,
    },
    {
      costCategory: { id: taxiCategory.id },
      paymentType: { id: paymentType.id },
      comments: "taxi",
      amountCurrencyIncVat: 650,
      amountNOKInclVAT: 650,
      date: returnDate,
    },
  ],
};

const createResp = await api<TravelExpense>("/travelExpense", {
  method: "POST",
  body: JSON.stringify(payload),
});

const travelExpense = createResp.value;
assert(travelExpense, "Missing travelExpense in create response");
assert(travelExpense.id, "Missing travelExpense id");
assert(travelExpense.title === title, "Travel expense title mismatch");
assert(travelExpense.employee?.id === employee.id, "Travel expense employee mismatch");
assert(travelExpense.travelDetails?.destination === destination, "Travel expense destination mismatch");
assert(travelExpense.travelDetails?.purpose === title, "Travel expense purpose mismatch");
assert(travelExpense.travelDetails?.detailedJourneyDescription === title, "Travel expense description mismatch");
assert(travelExpense.travelDetails?.departureDate === departureDate, "Travel expense departureDate mismatch");
assert(travelExpense.travelDetails?.returnDate === returnDate, "Travel expense returnDate mismatch");
assert(
  travelExpense.travelDetails?.isCompensationFromRates === true,
  "Travel expense compensation flag mismatch",
);

const costsResp = await api<TravelCost>(
  `/travelExpense/cost?travelExpenseId=${travelExpense.id}&count=20&fields=*`,
);
const perDiemResp = await api<PerDiem>(
  `/travelExpense/perDiemCompensation?travelExpenseId=${travelExpense.id}&count=20&fields=*`,
);

const costs = costsResp.values ?? [];
assert(costs.length === 2, `Expected 2 costs, got ${costs.length}`);

const flightCost = oneExact(
  costs.filter(
    (cost) =>
      norm(cost.comments) === "flight ticket" &&
      cost.amountCurrencyIncVat === 7200 &&
      cost.amountNOKInclVAT === 7200 &&
      cost.costCategory?.id === flightCategory.id &&
      cost.paymentType?.id === paymentType.id,
  ),
  "flight cost",
);
void flightCost;

const taxiCost = oneExact(
  costs.filter(
    (cost) =>
      norm(cost.comments) === "taxi" &&
      cost.amountCurrencyIncVat === 650 &&
      cost.amountNOKInclVAT === 650 &&
      cost.costCategory?.id === taxiCategory.id &&
      cost.paymentType?.id === paymentType.id,
  ),
  "taxi cost",
);
void taxiCost;

const perDiems = perDiemResp.values ?? [];
const perDiem = oneExact(
  perDiems.filter(
    (item) => item.location === destination && item.count === 4 && item.rate === 800 && item.amount === 3200,
  ),
  "per diem row",
);
void perDiem;

console.log(
  JSON.stringify({
    ok: true,
    travelExpenseId: travelExpense.id,
    employeeId: employee.id,
    costCategoryIds: {
      flight: flightCategory.id,
      taxi: taxiCategory.id,
    },
    paymentTypeId: paymentType.id,
  }),
);
