const baseUrl = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const token = "AfFLQ9Jed32CoG2lrwu4IoudytZ4grTAmSPYEoexEP4";

const auth = Buffer.from(`0:${token}`).toString("base64");

type ListResponse<T> = {
  values?: T[];
  fullResultSize?: number;
};

type ResponseWrapper<T> = {
  value?: T;
};

type Employee = {
  id: number;
  email?: string;
  allowInformationRegistration?: boolean;
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

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      Authorization: `Basic ${auth}`,
      Accept: "application/json",
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...(init?.headers ?? {}),
    },
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : null;

  if (!response.ok) {
    throw new Error(
      `HTTP ${response.status} ${response.statusText} for ${path}\n${text}`,
    );
  }

  return data as T;
}

function exactOneEmployee(values: Employee[], email: string): Employee {
  const exact = values.filter((employee) => employee.email === email);
  if (exact.length === 1) return exact[0];

  const preferred = exact.filter(
    (employee) => employee.allowInformationRegistration === true,
  );
  if (preferred.length === 1) return preferred[0];

  throw new Error(`Employee lookup ambiguous or missing for ${email}`);
}

function exactOneCategory(
  values: TravelCostCategory[],
  description: string,
): TravelCostCategory {
  const exact = values.filter(
    (category) =>
      category.showOnTravelExpenses === true &&
      category.isInactive !== true &&
      category.description === description,
  );
  if (exact.length === 1) return exact[0];
  throw new Error(`Travel cost category not uniquely found: ${description}`);
}

function onePaymentType(values: TravelPaymentType[]): TravelPaymentType {
  const preferred = values.filter(
    (paymentType) =>
      paymentType.showOnTravelExpenses === true &&
      paymentType.isInactive !== true &&
      paymentType.description === "Privat utlegg",
  );
  if (preferred.length === 1) return preferred[0];

  const fallback = values.filter(
    (paymentType) =>
      paymentType.showOnTravelExpenses === true &&
      paymentType.isInactive !== true,
  );
  if (fallback.length === 1) return fallback[0];

  throw new Error("Travel payment type not uniquely found");
}

async function main() {
  const employeeEmail = "pablo.rodriguez@example.org";
  const title = "Conferencia Ålesund";
  const destination = "Ålesund";
  const departureDate = "2026-03-16";
  const returnDate = "2026-03-20";

  const [employeeRes, categoryRes, paymentTypeRes] = await Promise.all([
    api<ListResponse<Employee>>(
      `/employee?email=${encodeURIComponent(employeeEmail)}&count=10&fields=*`,
    ),
    api<ListResponse<TravelCostCategory>>(
      "/travelExpense/costCategory?count=1000&fields=*",
    ),
    api<ListResponse<TravelPaymentType>>(
      "/travelExpense/paymentType?count=1000&fields=*",
    ),
  ]);

  const employee = exactOneEmployee(employeeRes.values ?? [], employeeEmail);
  const flightCategory = exactOneCategory(categoryRes.values ?? [], "Fly");
  const taxiCategory = exactOneCategory(categoryRes.values ?? [], "Taxi");
  const paymentType = onePaymentType(paymentTypeRes.values ?? []);

  const payload = {
    employee: { id: employee.id },
    title,
    travelDetails: {
      isForeignTravel: false,
      isDayTrip: false,
      isCompensationFromRates: true,
      departureDate,
      returnDate,
      destination,
      detailedJourneyDescription: title,
      purpose: title,
    },
    perDiemCompensations: [
      {
        location: destination,
        count: 5,
        rate: 800,
        amount: 4000,
      },
    ],
    costs: [
      {
        costCategory: { id: flightCategory.id },
        paymentType: { id: paymentType.id },
        comments: "billete de avión",
        amountCurrencyIncVat: 2750,
        amountNOKInclVAT: 2750,
        date: departureDate,
      },
      {
        costCategory: { id: taxiCategory.id },
        paymentType: { id: paymentType.id },
        comments: "taxi",
        amountCurrencyIncVat: 700,
        amountNOKInclVAT: 700,
        date: returnDate,
      },
    ],
  };

  const createRes = await api<ResponseWrapper<any>>("/travelExpense", {
    method: "POST",
    body: JSON.stringify(payload),
  });

  const created = createRes.value;
  if (!created?.id) {
    throw new Error("Travel expense create response missing id");
  }

  console.log(
    JSON.stringify(
      {
        id: created.id,
        title: created.title,
        employeeId: created.employee?.id,
        departureDate: created.travelDetails?.departureDate,
        returnDate: created.travelDetails?.returnDate,
        destination: created.travelDetails?.destination,
        costCount: created.costs?.length,
        perDiemCount: created.perDiemCompensations?.length,
      },
      null,
      2,
    ),
  );
}

await main();
