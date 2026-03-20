const baseUrl = "https://kkpqfuj-amager.tripletex.dev/v2";
const token =
  "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";

const authHeader = `Basic ${Buffer.from(`0:${token}`).toString("base64")}`;

type ListResponse<T> = { values?: T[] };
type WrappedValue<T> = { value?: T };

type Employee = {
  id: number;
  email?: string;
  firstName?: string;
  lastName?: string;
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

function first<T>(values: T[], message: string): T {
  if (values.length === 0) {
    throw new Error(message);
  }
  return values[0];
}

function matchCategory(values: CostCategory[], description: string): CostCategory {
  const found = values.find(
    (value) =>
      value.showOnTravelExpenses === true && value.description === description,
  );
  if (!found) {
    throw new Error(`Missing category: ${description}`);
  }
  return found;
}

async function main() {
  const [employeeResp, categoryResp, paymentTypeResp] = await Promise.all([
    api<ListResponse<Employee>>(`/employee?count=20&fields=*`),
    api<ListResponse<CostCategory>>(`/travelExpense/costCategory?count=1000&fields=*`),
    api<ListResponse<PaymentType>>(`/travelExpense/paymentType?count=1000&fields=*`),
  ]);

  const employee =
    employeeResp.values?.find(
      (value) => value.email === "lucy.walker@example.org",
    ) ??
    employeeResp.values?.find(
      (value) => value.allowInformationRegistration === true,
    ) ??
    first(employeeResp.values ?? [], "No sandbox employee available");

  const categories = categoryResp.values ?? [];
  const paymentType =
    paymentTypeResp.values?.find(
      (value) =>
        value.showOnTravelExpenses === true &&
        value.isInactive !== true &&
        value.description === "Privat utlegg",
    ) ??
    first(
      (paymentTypeResp.values ?? []).filter(
        (value) =>
          value.showOnTravelExpenses === true && value.isInactive !== true,
      ),
      "No sandbox travel payment type available",
    );

  const payload = {
    employee: { id: employee.id },
    title: "Client visit Trondheim",
    travelDetails: {
      isForeignTravel: false,
      isDayTrip: false,
      isCompensationFromRates: true,
      departureDate: "2026-03-17",
      returnDate: "2026-03-20",
      departureTime: "08:00",
      returnTime: "18:00",
      destination: "Trondheim",
      detailedJourneyDescription: "Client visit Trondheim",
      purpose: "Client visit Trondheim",
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
        costCategory: { id: matchCategory(categories, "Fly").id },
        paymentType: { id: paymentType.id },
        comments: "flight ticket",
        amountCurrencyIncVat: 7200,
        amountNOKInclVAT: 7200,
        date: "2026-03-17",
      },
      {
        costCategory: { id: matchCategory(categories, "Taxi").id },
        paymentType: { id: paymentType.id },
        comments: "taxi",
        amountCurrencyIncVat: 650,
        amountNOKInclVAT: 650,
        date: "2026-03-20",
      },
    ],
  };

  const created = await api<
    WrappedValue<{
      id: number;
      title: string;
      employee?: { id?: number };
      travelDetails?: Record<string, unknown>;
      costs?: Array<{ id?: number }>;
      perDiemCompensations?: Array<{ id?: number }>;
    }>
  >("/travelExpense", {
    method: "POST",
    body: JSON.stringify(payload),
  });

  const id = created.value?.id;
  if (!id) {
    throw new Error("Create did not return travel expense id");
  }

  const [costs, perDiems] = await Promise.all([
    api<ListResponse<Record<string, unknown>>>(
      `/travelExpense/cost?travelExpenseId=${id}&count=20&fields=*`,
    ),
    api<ListResponse<Record<string, unknown>>>(
      `/travelExpense/perDiemCompensation?travelExpenseId=${id}&count=20&fields=*`,
    ),
  ]);

  console.log(
    JSON.stringify(
      {
        employee: {
          id: employee.id,
          email: employee.email,
          firstName: employee.firstName,
          lastName: employee.lastName,
        },
        payload,
        created: created.value,
        persistedCosts: costs.values,
        persistedPerDiems: perDiems.values,
      },
      null,
      2,
    ),
  );
}

await main();
