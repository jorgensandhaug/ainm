const BASE_URL = "https://kkpqfuj-amager.tripletex.dev/v2";
const SESSION_TOKEN =
  "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";

const authHeader = `Basic ${Buffer.from(`0:${SESSION_TOKEN}`).toString("base64")}`;

type JsonRecord = Record<string, any>;

function unwrap<T>(payload: any): T {
  if (payload && typeof payload === "object") {
    if ("value" in payload) return payload.value as T;
    if ("values" in payload) return payload.values as T;
  }
  return payload as T;
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      Authorization: authHeader,
      Accept: "application/json",
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...(init?.headers ?? {}),
    },
  });

  const text = await response.text();
  const body = text ? JSON.parse(text) : null;

  if (!response.ok) {
    throw new Error(
      `HTTP ${response.status} ${response.statusText} on ${path}\n${JSON.stringify(body)}`
    );
  }

  return body as T;
}

function norm(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

function chooseEmployee(employees: JsonRecord[]): JsonRecord {
  const withEmail = employees.filter((employee) => {
    const email =
      employee.email ??
      employee.user?.email ??
      employee.person?.email ??
      employee.contactPerson?.email;
    return email;
  });

  const preferred =
    withEmail.find((employee) => employee.allowInformationRegistration === true) ??
    withEmail[0];

  if (!preferred) {
    throw new Error(
      `No employee with email found: ${JSON.stringify(
        employees.map((employee) => ({
          id: employee.id,
          email:
            employee.email ??
            employee.user?.email ??
            employee.person?.email ??
            employee.contactPerson?.email,
          allowInformationRegistration: employee.allowInformationRegistration,
        }))
      )}`
    );
  }

  return preferred;
}

function chooseCategory(categories: JsonRecord[], wanted: string): JsonRecord {
  const visible = categories.filter(
    (category) => category.showOnTravelExpenses === true
  );
  const exact = visible.find(
    (category) => norm(category.description ?? category.name) === norm(wanted)
  );
  if (exact) return exact;

  const contains = visible.find((category) =>
    norm(category.description ?? category.name).includes(norm(wanted))
  );
  if (contains) return contains;

  throw new Error(
    `Missing category ${wanted}: ${JSON.stringify(
      visible.map((category) => ({
        id: category.id,
        description: category.description ?? category.name,
      }))
    )}`
  );
}

function choosePaymentType(paymentTypes: JsonRecord[]): JsonRecord {
  const visible = paymentTypes.filter(
    (paymentType) => paymentType.showOnTravelExpenses === true
  );
  const preferred = visible.find(
    (paymentType) =>
      norm(paymentType.description ?? paymentType.name) ===
      norm("Privat utlegg")
  );
  return preferred ?? visible[0]!;
}

async function main() {
  const employeesPayload = await api<JsonRecord>("/employee?count=50&fields=*");
  const costCategoriesPayload = await api<JsonRecord>(
    "/travelExpense/costCategory?count=1000&fields=*"
  );
  const paymentTypesPayload = await api<JsonRecord>(
    "/travelExpense/paymentType?count=1000&fields=*"
  );

  const employee = chooseEmployee(unwrap<JsonRecord[]>(employeesPayload));
  const flightCategory = chooseCategory(unwrap<JsonRecord[]>(costCategoriesPayload), "Fly");
  const taxiCategory = chooseCategory(unwrap<JsonRecord[]>(costCategoriesPayload), "Taxi");
  const paymentType = choosePaymentType(unwrap<JsonRecord[]>(paymentTypesPayload));

  const uniqueSuffix = new Date().toISOString().replace(/[:.]/g, "-");
  const title = `Sandbox post-run Tromso ${uniqueSuffix}`;
  const payload = {
    employee: { id: employee.id },
    title,
    travelDetails: {
      isForeignTravel: false,
      isDayTrip: false,
      isCompensationFromRates: true,
      departureDate: "2026-03-18",
      returnDate: "2026-03-20",
      departureTime: "08:00",
      returnTime: "18:00",
      destination: "Tromsø",
      detailedJourneyDescription: title,
      purpose: title,
    },
    perDiemCompensations: [
      {
        location: "Tromsø",
        count: 3,
        rate: 800,
        amount: 2400,
      },
    ],
    costs: [
      {
        costCategory: { id: flightCategory.id },
        paymentType: { id: paymentType.id },
        comments: "Flugticket",
        amountCurrencyIncVat: 5250,
        amountNOKInclVAT: 5250,
        date: "2026-03-18",
      },
      {
        costCategory: { id: taxiCategory.id },
        paymentType: { id: paymentType.id },
        comments: "Taxi",
        amountCurrencyIncVat: 250,
        amountNOKInclVAT: 250,
        date: "2026-03-20",
      },
    ],
  };

  const createPayload = await api<JsonRecord>("/travelExpense", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  const created = unwrap<JsonRecord>(createPayload);

  const costsPayload = await api<JsonRecord>(
    `/travelExpense/cost?travelExpenseId=${created.id}&count=20&fields=*`
  );
  const perDiemsPayload = await api<JsonRecord>(
    `/travelExpense/perDiemCompensation?travelExpenseId=${created.id}&count=20&fields=*`
  );

  console.log(
    JSON.stringify(
      {
        employee: {
          id: employee.id,
          email:
            employee.email ??
            employee.user?.email ??
            employee.person?.email ??
            employee.contactPerson?.email,
        },
        flightCategory: {
          id: flightCategory.id,
          description: flightCategory.description ?? flightCategory.name,
        },
        taxiCategory: {
          id: taxiCategory.id,
          description: taxiCategory.description ?? taxiCategory.name,
        },
        paymentType: {
          id: paymentType.id,
          description: paymentType.description ?? paymentType.name,
        },
        created: {
          id: created.id,
          title: created.title,
          destination: created.travelDetails?.destination,
          costs: created.costs,
          perDiemCompensations: created.perDiemCompensations,
        },
        verifiedCosts: unwrap<JsonRecord[]>(costsPayload).map((cost) => ({
          id: cost.id,
          comments: cost.comments,
          amountCurrencyIncVat: cost.amountCurrencyIncVat,
          amountNOKInclVAT: cost.amountNOKInclVAT,
          date: cost.date,
          costCategoryId: cost.costCategory?.id,
          paymentTypeId: cost.paymentType?.id,
        })),
        verifiedPerDiems: unwrap<JsonRecord[]>(perDiemsPayload).map((item) => ({
          id: item.id,
          location: item.location,
          count: item.count,
          rate: item.rate,
          amount: item.amount,
        })),
      },
      null,
      2
    )
  );
}

await main();
