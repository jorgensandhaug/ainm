const baseUrl = "https://kkpqfuj-amager.tripletex.dev/v2";
const token =
  "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";

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
  displayName?: string;
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

type TravelExpense = {
  id: number;
  title?: string;
  employee?: { id?: number };
  travelDetails?: {
    departureDate?: string;
    returnDate?: string;
    destination?: string;
    purpose?: string;
  };
  costs?: Array<{ id?: number }>;
  perDiemCompensations?: Array<{ id?: number }>;
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

function pickEmployee(preferred: Employee[], fallback: Employee[]): Employee {
  const exact = preferred.filter(
    (employee) => employee.email === "pablo.rodriguez@example.org",
  );
  if (exact.length === 1) return exact[0];

  const exactPreferred = exact.filter(
    (employee) => employee.allowInformationRegistration === true,
  );
  if (exactPreferred.length === 1) return exactPreferred[0];

  const eligible = fallback.filter(
    (employee) =>
      employee.allowInformationRegistration === true && !!employee.email,
  );
  if (eligible.length > 0) return eligible[0];

  const withEmail = fallback.filter((employee) => !!employee.email);
  if (withEmail.length > 0) return withEmail[0];

  throw new Error("No usable sandbox employee found");
}

function exactCategory(
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
  throw new Error(`Category not uniquely found: ${description}`);
}

function paymentType(values: TravelPaymentType[]): TravelPaymentType {
  const preferred = values.filter(
    (item) =>
      item.showOnTravelExpenses === true &&
      item.isInactive !== true &&
      item.description === "Privat utlegg",
  );
  if (preferred.length === 1) return preferred[0];

  const eligible = values.filter(
    (item) => item.showOnTravelExpenses === true && item.isInactive !== true,
  );
  if (eligible.length === 1) return eligible[0];

  throw new Error("Payment type not uniquely found");
}

async function main() {
  const exactEmployeeRes = await api<ListResponse<Employee>>(
    `/employee?email=${encodeURIComponent("pablo.rodriguez@example.org")}&count=10&fields=*`,
  );

  let employeePool = exactEmployeeRes.values ?? [];
  if (employeePool.length === 0) {
    const fallbackRes = await api<ListResponse<Employee>>(
      "/employee?count=200&fields=*",
    );
    employeePool = fallbackRes.values ?? [];
  }

  const [categoryRes, paymentTypeRes] = await Promise.all([
    api<ListResponse<TravelCostCategory>>(
      "/travelExpense/costCategory?count=1000&fields=*",
    ),
    api<ListResponse<TravelPaymentType>>(
      "/travelExpense/paymentType?count=1000&fields=*",
    ),
  ]);

  const employee = pickEmployee(exactEmployeeRes.values ?? [], employeePool);
  const flightCategory = exactCategory(categoryRes.values ?? [], "Fly");
  const taxiCategory = exactCategory(categoryRes.values ?? [], "Taxi");
  const reimbursement = paymentType(paymentTypeRes.values ?? []);

  const payload = {
    employee: { id: employee.id },
    title: "Conferencia Ålesund",
    travelDetails: {
      isForeignTravel: false,
      isDayTrip: false,
      isCompensationFromRates: true,
      departureDate: "2026-03-16",
      returnDate: "2026-03-20",
      destination: "Ålesund",
      detailedJourneyDescription: "Conferencia Ålesund",
      purpose: "Conferencia Ålesund",
    },
    perDiemCompensations: [
      {
        location: "Ålesund",
        count: 5,
        rate: 800,
        amount: 4000,
      },
    ],
    costs: [
      {
        costCategory: { id: flightCategory.id },
        paymentType: { id: reimbursement.id },
        comments: "billete de avión",
        amountCurrencyIncVat: 2750,
        amountNOKInclVAT: 2750,
        date: "2026-03-16",
      },
      {
        costCategory: { id: taxiCategory.id },
        paymentType: { id: reimbursement.id },
        comments: "taxi",
        amountCurrencyIncVat: 700,
        amountNOKInclVAT: 700,
        date: "2026-03-20",
      },
    ],
  };

  const createRes = await api<ResponseWrapper<TravelExpense>>("/travelExpense", {
    method: "POST",
    body: JSON.stringify(payload),
  });

  const created = createRes.value;
  if (!created?.id) throw new Error("Create response missing travel expense id");

  const [costRes, perDiemRes] = await Promise.all([
    api<ListResponse<any>>(
      `/travelExpense/cost?travelExpenseId=${created.id}&count=20&fields=*`,
    ),
    api<ListResponse<any>>(
      `/travelExpense/perDiemCompensation?travelExpenseId=${created.id}&count=20&fields=*`,
    ),
  ]);

  console.log(
    JSON.stringify(
      {
        sandboxEmployee: {
          id: employee.id,
          email: employee.email,
          displayName: employee.displayName,
        },
        created: {
          id: created.id,
          title: created.title,
          employeeId: created.employee?.id,
          departureDate: created.travelDetails?.departureDate,
          returnDate: created.travelDetails?.returnDate,
          destination: created.travelDetails?.destination,
          purpose: created.travelDetails?.purpose,
          costCount: created.costs?.length ?? 0,
          perDiemCount: created.perDiemCompensations?.length ?? 0,
        },
        verifiedCosts: (costRes.values ?? []).map((cost) => ({
          category: cost.costCategory?.description,
          paymentType: cost.paymentType?.description,
          comments: cost.comments,
          amountCurrencyIncVat: cost.amountCurrencyIncVat,
          amountNOKInclVAT: cost.amountNOKInclVAT,
          date: cost.date,
        })),
        verifiedPerDiems: (perDiemRes.values ?? []).map((perDiem) => ({
          location: perDiem.location,
          count: perDiem.count,
          rate: perDiem.rate,
          amount: perDiem.amount,
        })),
      },
      null,
      2,
    ),
  );
}

await main();
