const baseUrl = process.env.TRIPLETEX_BASE_URL;
const token = process.env.TRIPLETEX_TOKEN;

if (!baseUrl || !token) {
  throw new Error("Missing TRIPLETEX_BASE_URL or TRIPLETEX_TOKEN");
}

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
  firstName?: string;
  lastName?: string;
  email?: string;
  department?: Link | null;
  allowInformationRegistration?: boolean;
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
  department?: Link | null;
  travelDetails?: {
    destination?: string;
    departureDate?: string;
    returnDate?: string;
    purpose?: string;
    detailedJourneyDescription?: string;
    isCompensationFromRates?: boolean;
  };
};

type TravelCost = {
  id: number;
  comments?: string;
  amountCurrencyIncVat?: number;
  amountNOKInclVAT?: number;
  costCategory?: Link;
  paymentType?: Link;
};

type PerDiem = {
  id: number;
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

function norm(value: string | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function oneExact<T>(items: T[], label: string): T {
  if (items.length !== 1) {
    throw new Error(`Expected exactly one ${label}, got ${items.length}`);
  }
  return items[0];
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function pickEmployee(employees: Employee[], email: string): Employee {
  const exact = employees.filter((employee) => norm(employee.email) === norm(email));
  if (exact.length === 0) {
    throw new Error(`Employee not found for ${email}`);
  }
  if (exact.length === 1) {
    return exact[0];
  }
  const preferred = exact.filter((employee) => employee.allowInformationRegistration === true);
  if (preferred.length === 1) {
    return preferred[0];
  }
  throw new Error(`Employee match ambiguous for ${email}`);
}

function pickCostCategory(categories: CostCategory[], wanted: string): CostCategory {
  const travelCategories = categories.filter((category) => category.showOnTravelExpenses === true);
  const exact = travelCategories.filter((category) => norm(category.description ?? category.name) === norm(wanted));
  return oneExact(exact, `cost category ${wanted}`);
}

function pickPaymentType(paymentTypes: PaymentType[]): PaymentType {
  const preferred = paymentTypes.filter(
    (paymentType) =>
      paymentType.showOnTravelExpenses === true &&
      paymentType.isInactive !== true &&
      norm(paymentType.description ?? paymentType.name) === "privat utlegg",
  );
  if (preferred.length === 1) {
    return preferred[0];
  }
  const fallback = paymentTypes.filter(
    (paymentType) => paymentType.showOnTravelExpenses === true && paymentType.isInactive !== true,
  );
  return oneExact(fallback, "travel payment type");
}

async function resolveEmployee(email: string): Promise<{
  employee: Employee;
  createdDepartmentId: number | null;
  createdEmployeeId: number | null;
  divisionId: number | null;
}> {
  const employeeResp = await api<Employee>(`/employee?email=${encodeURIComponent(email)}&count=10&fields=*`);
  const existing = employeeResp.values ?? [];
  if (existing.length > 0) {
    return {
      employee: pickEmployee(existing, email),
      createdDepartmentId: null,
      createdEmployeeId: null,
      divisionId: null,
    };
  }

  const departmentResp = await api<Link & { name?: string }>(
    "/department?isInactive=false&count=1&fields=*",
  );
  let department = (departmentResp.values ?? [])[0];
  let createdDepartmentId: number | null = null;

  if (!department) {
    const createDepartmentResp = await api<Link & { name?: string }>("/department", {
      method: "POST",
      body: JSON.stringify({ name: "Sandbox Travel Expenses" }),
    });
    department = createDepartmentResp.value;
    createdDepartmentId = department?.id ?? null;
  }

  if (!department?.id) {
    throw new Error("Failed to resolve department for sandbox employee creation");
  }

  const divisionResp = await api<Link & { name?: string }>("/division?count=1&fields=*");
  const division = (divisionResp.values ?? [])[0];
  if (!division?.id) {
    throw new Error("Failed to resolve division for sandbox employee creation");
  }

  const createEmployeeResp = await api<Employee>("/employee", {
    method: "POST",
    body: JSON.stringify({
      firstName: "Lucy",
      lastName: "Walker",
      dateOfBirth: "1990-04-15",
      email,
      userType: "NO_ACCESS",
      department: { id: department.id },
      employments: [{ startDate: "2026-01-01", division: { id: division.id } }],
    }),
  });

  if (!createEmployeeResp.value?.id) {
    throw new Error("Sandbox employee creation did not return an id");
  }

  return {
    employee: {
      id: createEmployeeResp.value.id,
      firstName: createEmployeeResp.value.firstName ?? "Lucy",
      lastName: createEmployeeResp.value.lastName ?? "Walker",
      email,
      department: { id: department.id },
    },
    createdDepartmentId,
    createdEmployeeId: createEmployeeResp.value.id,
    divisionId: division.id,
  };
}

const employeeEmail = "lucy.walker@example.org";
const employeeResolution = await resolveEmployee(employeeEmail);
const employee = employeeResolution.employee;

const categoriesResp = await api<CostCategory>("/travelExpense/costCategory?count=1000&fields=*");
const paymentTypesResp = await api<PaymentType>("/travelExpense/paymentType?count=1000&fields=*");

const flightCategory = pickCostCategory(categoriesResp.values ?? [], "Fly");
const taxiCategory = pickCostCategory(categoriesResp.values ?? [], "Taxi");
const paymentType = pickPaymentType(paymentTypesResp.values ?? []);

const payload = {
  employee: { id: employee.id },
  title: "Sandbox verification Trondheim",
  travelDetails: {
    isForeignTravel: false,
    isDayTrip: false,
    isCompensationFromRates: true,
    departureDate: "2026-03-17",
    returnDate: "2026-03-20",
    departureTime: "08:00",
    returnTime: "18:00",
    destination: "Trondheim",
    detailedJourneyDescription: "Sandbox verification Trondheim",
    purpose: "Sandbox verification Trondheim",
  },
  perDiemCompensations: [
    {
      location: "Trondheim",
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
      date: "2026-03-17",
    },
    {
      costCategory: { id: taxiCategory.id },
      paymentType: { id: paymentType.id },
      comments: "taxi",
      amountCurrencyIncVat: 650,
      amountNOKInclVAT: 650,
      date: "2026-03-20",
    },
  ],
};

const createResp = await api<TravelExpense>("/travelExpense", {
  method: "POST",
  body: JSON.stringify(payload),
});

const travelExpense = createResp.value;
assert(travelExpense, "Missing travel expense in create response");
assert(travelExpense.id, "Missing travel expense id");
assert(travelExpense.title === "Sandbox verification Trondheim", "title mismatch");
assert(travelExpense.employee?.id === employee.id, "employee mismatch");
assert(travelExpense.travelDetails?.destination === "Trondheim", "destination mismatch");
assert(travelExpense.travelDetails?.departureDate === "2026-03-17", "departure date mismatch");
assert(travelExpense.travelDetails?.returnDate === "2026-03-20", "return date mismatch");
assert(travelExpense.travelDetails?.isCompensationFromRates === true, "per diem flag mismatch");

const costsResp = await api<TravelCost>(
  `/travelExpense/cost?travelExpenseId=${travelExpense.id}&count=20&fields=*`,
);
const perDiemResp = await api<PerDiem>(
  `/travelExpense/perDiemCompensation?travelExpenseId=${travelExpense.id}&count=20&fields=*`,
);

const flightCost = oneExact(
  (costsResp.values ?? []).filter(
    (cost) =>
      cost.comments === "flight ticket" &&
      cost.amountCurrencyIncVat === 7200 &&
      cost.amountNOKInclVAT === 7200 &&
      cost.costCategory?.id === flightCategory.id &&
      cost.paymentType?.id === paymentType.id,
  ),
  "flight cost",
);

const taxiCost = oneExact(
  (costsResp.values ?? []).filter(
    (cost) =>
      cost.comments === "taxi" &&
      cost.amountCurrencyIncVat === 650 &&
      cost.amountNOKInclVAT === 650 &&
      cost.costCategory?.id === taxiCategory.id &&
      cost.paymentType?.id === paymentType.id,
  ),
  "taxi cost",
);

const perDiem = oneExact(
  (perDiemResp.values ?? []).filter(
    (item) => item.location === "Trondheim" && item.count === 4 && item.rate === 800 && item.amount === 3200,
  ),
  "per diem row",
);

console.log(
  JSON.stringify({
    ok: true,
    employeeId: employee.id,
    employeeDepartmentId: employee.department?.id ?? null,
    sandboxCreatedDepartmentId: employeeResolution.createdDepartmentId,
    sandboxCreatedEmployeeId: employeeResolution.createdEmployeeId,
    sandboxDivisionId: employeeResolution.divisionId,
    paymentType: {
      id: paymentType.id,
      label: paymentType.description ?? paymentType.name ?? null,
    },
    costCategories: {
      flight: {
        id: flightCategory.id,
        label: flightCategory.description ?? flightCategory.name ?? null,
      },
      taxi: {
        id: taxiCategory.id,
        label: taxiCategory.description ?? taxiCategory.name ?? null,
      },
    },
    createdTravelExpenseId: travelExpense.id,
    travelExpenseDepartmentId: travelExpense.department?.id ?? null,
    verifiedChildIds: {
      flightCostId: flightCost.id,
      taxiCostId: taxiCost.id,
      perDiemId: perDiem.id,
    },
  }),
);
