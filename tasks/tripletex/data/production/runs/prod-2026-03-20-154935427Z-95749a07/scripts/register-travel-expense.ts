const BASE_URL = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const SESSION_TOKEN = "W81UW0QaKmZWyOCW5ndjsWzJhl0AF8JRYR_pHJv8HK4";

const employeeEmail = "johanna.hoffmann@example.org";
const title = "Kundenbesuch Tromsø";
const destination = "Tromsø";
const departureDate = "2026-03-18";
const returnDate = "2026-03-20";

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

function exactOne<T>(items: T[], label: string): T {
  if (items.length !== 1) {
    throw new Error(`Expected exactly one ${label}, got ${items.length}`);
  }
  return items[0]!;
}

function norm(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

function pickEmployee(employees: JsonRecord[]): JsonRecord {
  const exactEmailMatches = employees.filter((employee) => {
    const email =
      employee.email ??
      employee.user?.email ??
      employee.person?.email ??
      employee.contactPerson?.email;
    return norm(email) === norm(employeeEmail);
  });

  if (exactEmailMatches.length === 1) return exactEmailMatches[0]!;

  const allowed = exactEmailMatches.filter(
    (employee) => employee.allowInformationRegistration === true
  );
  if (allowed.length === 1) return allowed[0]!;

  throw new Error(
    `Employee match ambiguous for ${employeeEmail}: ${JSON.stringify(
      exactEmailMatches.map((employee) => ({
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

function pickCostCategory(categories: JsonRecord[], wanted: string): JsonRecord {
  const visible = categories.filter(
    (category) => category.showOnTravelExpenses === true
  );
  const exact = visible.filter(
    (category) => norm(category.description ?? category.name) === norm(wanted)
  );
  if (exact.length === 1) return exact[0]!;

  const contains = visible.filter((category) =>
    norm(category.description ?? category.name).includes(norm(wanted))
  );
  if (contains.length === 1) return contains[0]!;

  throw new Error(
    `Could not resolve cost category ${wanted}: ${JSON.stringify(
      visible.map((category) => ({
        id: category.id,
        description: category.description ?? category.name,
      }))
    )}`
  );
}

function pickPaymentType(paymentTypes: JsonRecord[]): JsonRecord {
  const visible = paymentTypes.filter(
    (paymentType) => paymentType.showOnTravelExpenses === true
  );

  const preferred = visible.find(
    (paymentType) =>
      norm(paymentType.description ?? paymentType.name) ===
      norm("Privat utlegg")
  );
  if (preferred) return preferred;

  if (visible.length === 1) return visible[0]!;

  throw new Error(
    `Could not resolve payment type: ${JSON.stringify(
      visible.map((paymentType) => ({
        id: paymentType.id,
        description: paymentType.description ?? paymentType.name,
      }))
    )}`
  );
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function amountsMatch(actual: unknown, expected: number): boolean {
  return Number(actual) === expected;
}

async function main() {
  const employeeResponse = await api<JsonRecord>(
    `/employee?email=${encodeURIComponent(employeeEmail)}&count=10&fields=*`
  );
  const costCategoryResponse = await api<JsonRecord>(
    "/travelExpense/costCategory?count=1000&fields=*"
  );
  const paymentTypeResponse = await api<JsonRecord>(
    "/travelExpense/paymentType?count=1000&fields=*"
  );

  const employee = pickEmployee(unwrap<JsonRecord[]>(employeeResponse));
  const categories = unwrap<JsonRecord[]>(costCategoryResponse);
  const paymentTypes = unwrap<JsonRecord[]>(paymentTypeResponse);

  const flightCategory = pickCostCategory(categories, "Fly");
  const taxiCategory = pickCostCategory(categories, "Taxi");
  const paymentType = pickPaymentType(paymentTypes);

  const createPayload = {
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
        date: departureDate,
      },
      {
        costCategory: { id: taxiCategory.id },
        paymentType: { id: paymentType.id },
        comments: "Taxi",
        amountCurrencyIncVat: 250,
        amountNOKInclVAT: 250,
        date: returnDate,
      },
    ],
  };

  const createResponse = await api<JsonRecord>("/travelExpense", {
    method: "POST",
    body: JSON.stringify(createPayload),
  });
  const travelExpense = unwrap<JsonRecord>(createResponse);

  assert(travelExpense.id, "Missing travel expense id");
  assert(travelExpense.title === title, "Travel expense title mismatch");
  assert(travelExpense.employee?.id === employee.id, "Employee mismatch");
  assert(
    travelExpense.travelDetails?.departureDate === departureDate,
    "Departure date mismatch"
  );
  assert(
    travelExpense.travelDetails?.returnDate === returnDate,
    "Return date mismatch"
  );
  assert(
    travelExpense.travelDetails?.destination === destination,
    "Destination mismatch"
  );

  const costResponse = await api<JsonRecord>(
    `/travelExpense/cost?travelExpenseId=${travelExpense.id}&count=20&fields=*`
  );
  const perDiemResponse = await api<JsonRecord>(
    `/travelExpense/perDiemCompensation?travelExpenseId=${travelExpense.id}&count=20&fields=*`
  );

  const costs = unwrap<JsonRecord[]>(costResponse);
  const perDiems = unwrap<JsonRecord[]>(perDiemResponse);

  const flightCost = exactOne(
    costs.filter(
      (cost) =>
        norm(cost.comments) === norm("Flugticket") &&
        amountsMatch(cost.amountCurrencyIncVat, 5250)
    ),
    "flight cost"
  );
  const taxiCost = exactOne(
    costs.filter(
      (cost) =>
        norm(cost.comments) === norm("Taxi") &&
        amountsMatch(cost.amountCurrencyIncVat, 250)
    ),
    "taxi cost"
  );
  const perDiem = exactOne(
    perDiems.filter(
      (item) =>
        norm(item.location) === norm(destination) &&
        amountsMatch(item.count, 3) &&
        amountsMatch(item.rate, 800) &&
        amountsMatch(item.amount, 2400)
    ),
    "per diem compensation"
  );

  assert(flightCost.costCategory?.id === flightCategory.id, "Flight category mismatch");
  assert(flightCost.paymentType?.id === paymentType.id, "Flight payment type mismatch");
  assert(flightCost.date === departureDate, "Flight date mismatch");
  assert(taxiCost.costCategory?.id === taxiCategory.id, "Taxi category mismatch");
  assert(taxiCost.paymentType?.id === paymentType.id, "Taxi payment type mismatch");
  assert(taxiCost.date === returnDate, "Taxi date mismatch");
  assert(perDiem.location === destination, "Per diem location mismatch");

  console.log(
    JSON.stringify(
      {
        ok: true,
        travelExpenseId: travelExpense.id,
        employeeId: employee.id,
        paymentTypeId: paymentType.id,
        flightCostId: flightCost.id,
        taxiCostId: taxiCost.id,
        perDiemId: perDiem.id,
      },
      null,
      2
    )
  );
}

await main();
