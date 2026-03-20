const baseUrl = "https://kkpqfuj-amager.tripletex.dev/v2";
const token =
  "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";

const auth = Buffer.from(`0:${token}`).toString("base64");

type ListResponse<T> = {
  values?: T[];
};

type ResponseWrapper<T> = {
  value?: T;
};

type Employee = {
  id: number;
  email?: string;
  allowInformationRegistration?: boolean;
};

type TravelExpense = {
  id: number;
  title?: string;
  amount?: number;
  paymentAmount?: number;
  state?: string;
  stateName?: string;
  travelDetails?: Record<string, unknown>;
  perDiemCompensations?: Array<{ id?: number }>;
  costs?: Array<{ id?: number }>;
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

function one<T>(values: T[], label: string): T {
  if (values.length !== 1) throw new Error(`Expected 1 ${label}, got ${values.length}`);
  return values[0];
}

function summarize(expense: TravelExpense | undefined) {
  return expense
    ? {
        id: expense.id,
        title: expense.title,
        amount: expense.amount,
        paymentAmount: expense.paymentAmount,
        state: expense.state,
        stateName: expense.stateName,
        costCount: expense.costs?.length ?? 0,
        perDiemCount: expense.perDiemCompensations?.length ?? 0,
      }
    : null;
}

async function main() {
  const employeeRes = await api<ListResponse<Employee>>(
    `/employee?email=${encodeURIComponent("lucy.walker@example.org")}&count=10&fields=*`,
  );
  const employee = one(
    (employeeRes.values ?? []).filter(
      (item) => item.email === "lucy.walker@example.org",
    ),
    "employee",
  );

  const createRes = await api<ResponseWrapper<TravelExpense>>("/travelExpense", {
    method: "POST",
    body: JSON.stringify({
      employee: { id: employee.id },
      title: "State investigation travel expense",
      travelDetails: {
        isForeignTravel: false,
        isDayTrip: false,
        isCompensationFromRates: true,
        departureDate: "2026-03-16",
        returnDate: "2026-03-20",
        departureTime: "08:00",
        returnTime: "18:00",
        destination: "Ålesund",
        detailedJourneyDescription: "State investigation travel expense",
        purpose: "State investigation travel expense",
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
          costCategory: { id: 32813722 },
          paymentType: { id: 32813706 },
          comments: "flight ticket",
          amountCurrencyIncVat: 2750,
          amountNOKInclVAT: 2750,
          date: "2026-03-16",
        },
        {
          costCategory: { id: 32813737 },
          paymentType: { id: 32813706 },
          comments: "taxi",
          amountCurrencyIncVat: 700,
          amountNOKInclVAT: 700,
          date: "2026-03-20",
        },
      ],
    }),
  });

  const created = createRes.value;
  if (!created?.id) throw new Error("Missing id from create response");

  const deliveredRes = await api<ListResponse<TravelExpense>>(
    `/travelExpense/:deliver?id=${created.id}`,
    { method: "PUT" },
  );

  let approvedSummary: unknown = null;
  try {
    const approvedRes = await api<ListResponse<TravelExpense>>(
      `/travelExpense/:approve?id=${created.id}&overrideApprovalFlow=true`,
      { method: "PUT" },
    );
    approvedSummary = summarize((approvedRes.values ?? [])[0]);
  } catch (error) {
    approvedSummary = String(error);
  }

  const finalRead = await api<ResponseWrapper<TravelExpense>>(
    `/travelExpense/${created.id}?fields=*`,
  );

  console.log(
    JSON.stringify(
      {
        created: summarize(created),
        delivered: summarize((deliveredRes.values ?? [])[0]),
        approved: approvedSummary,
        finalRead: summarize(finalRead.value),
      },
      null,
      2,
    ),
  );
}

await main();
