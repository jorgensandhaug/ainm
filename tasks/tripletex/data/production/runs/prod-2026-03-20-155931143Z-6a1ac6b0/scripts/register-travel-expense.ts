const baseUrl = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const token = "govj4pO2e4L26byVVqo5Doeyq9DxncnMWiS3vj_7YV4";

const employeeEmail = "lucy.walker@example.org";
const title = "Client visit Trondheim";
const destination = "Trondheim";
const returnDate = "2026-03-20";
const departureDate = "2026-03-17";

type ListResponse<T> = {
  values?: T[];
  fullResultSize?: number;
};

type WrappedValue<T> = {
  value?: T;
};

type Employee = {
  id: number;
  email?: string;
  allowInformationRegistration?: boolean;
};

type CostCategory = {
  id: number;
  description?: string;
  showOnTravelExpenses?: boolean;
};

type PaymentType = {
  id: number;
  description?: string;
  showOnTravelExpenses?: boolean;
  isInactive?: boolean;
};

const authHeader = `Basic ${Buffer.from(`0:${token}`).toString("base64")}`;

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      Authorization: authHeader,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  const text = await response.text();
  const body = text ? JSON.parse(text) : undefined;

  if (!response.ok) {
    throw new Error(
      `${init?.method ?? "GET"} ${path} failed: ${response.status} ${response.statusText}\n${text}`,
    );
  }

  return body as T;
}

function exactEmailMatches(values: Employee[], email: string): Employee[] {
  return values.filter((employee) => employee.email === email);
}

function pickEmployee(values: Employee[], email: string): Employee {
  const matches = exactEmailMatches(values, email);
  if (matches.length === 0) {
    throw new Error(`Employee not found for exact email: ${email}`);
  }
  if (matches.length === 1) {
    return matches[0];
  }

  const preferred = matches.find(
    (employee) => employee.allowInformationRegistration === true,
  );
  if (preferred) {
    return preferred;
  }

  throw new Error(`Ambiguous employee match for email: ${email}`);
}

function pickCostCategory(values: CostCategory[], description: string): CostCategory {
  const travelValues = values.filter(
    (category) => category.showOnTravelExpenses === true,
  );
  const exact = travelValues.find(
    (category) => category.description === description,
  );
  if (exact) {
    return exact;
  }

  throw new Error(`Travel cost category not found: ${description}`);
}

function pickPaymentType(values: PaymentType[]): PaymentType {
  const travelValues = values.filter(
    (paymentType) =>
      paymentType.showOnTravelExpenses === true &&
      paymentType.isInactive !== true,
  );

  const preferred = travelValues.find(
    (paymentType) => paymentType.description === "Privat utlegg",
  );
  if (preferred) {
    return preferred;
  }
  if (travelValues.length === 1) {
    return travelValues[0];
  }

  throw new Error("Unable to resolve a single active travel payment type");
}

async function main() {
  const [employeeResponse, costCategoryResponse, paymentTypeResponse] =
    await Promise.all([
      api<ListResponse<Employee>>(
        `/employee?email=${encodeURIComponent(employeeEmail)}&count=10&fields=*`,
      ),
      api<ListResponse<CostCategory>>(`/travelExpense/costCategory?count=1000&fields=*`),
      api<ListResponse<PaymentType>>(`/travelExpense/paymentType?count=1000&fields=*`),
    ]);

  const employee = pickEmployee(employeeResponse.values ?? [], employeeEmail);
  const flightCategory = pickCostCategory(
    costCategoryResponse.values ?? [],
    "Fly",
  );
  const taxiCategory = pickCostCategory(costCategoryResponse.values ?? [], "Taxi");
  const paymentType = pickPaymentType(paymentTypeResponse.values ?? []);

  const payload = {
    employee: { id: employee.id },
    title,
    travelDetails: {
      isForeignTravel: false,
      isDayTrip: false,
      isCompensationFromRates: true,
      departureDate,
      returnDate,
      departureTime: "08:00",
      returnTime: "18:00",
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

  const created = await api<
    WrappedValue<{
      id: number;
      title?: string;
      employee?: { id?: number };
      costs?: Array<{ id?: number }>;
      perDiemCompensations?: Array<{ id?: number }>;
      travelDetails?: {
        departureDate?: string;
        returnDate?: string;
        destination?: string;
      };
    }>
  >("/travelExpense", {
    method: "POST",
    body: JSON.stringify(payload),
  });

  const value = created.value;
  if (!value?.id) {
    throw new Error("Travel expense create response did not include id");
  }
  if (value.title !== title) {
    throw new Error(`Unexpected title in create response: ${value.title}`);
  }
  if (value.employee?.id !== employee.id) {
    throw new Error("Unexpected employee id in create response");
  }
  if (value.travelDetails?.departureDate !== departureDate) {
    throw new Error("Unexpected departureDate in create response");
  }
  if (value.travelDetails?.returnDate !== returnDate) {
    throw new Error("Unexpected returnDate in create response");
  }
  if (value.travelDetails?.destination !== destination) {
    throw new Error("Unexpected destination in create response");
  }
  if ((value.costs ?? []).length !== 2) {
    throw new Error("Unexpected costs count in create response");
  }
  if ((value.perDiemCompensations ?? []).length !== 1) {
    throw new Error("Unexpected per diem count in create response");
  }

  console.log(
    JSON.stringify(
      {
        travelExpenseId: value.id,
        employeeId: employee.id,
        title: value.title,
        departureDate: value.travelDetails?.departureDate,
        returnDate: value.travelDetails?.returnDate,
        destination: value.travelDetails?.destination,
        costsCount: value.costs?.length ?? 0,
        perDiemCount: value.perDiemCompensations?.length ?? 0,
      },
      null,
      2,
    ),
  );
}

await main();
