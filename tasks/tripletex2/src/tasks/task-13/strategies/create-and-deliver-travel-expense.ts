import type {
  StrategyContext,
  StrategyResult,
} from "../../../runtime/contracts";
import type {
  RegisterTravelExpenseCostInput,
  RegisterTravelExpenseInput,
  RegisterTravelExpensePerDiemInput,
  RegisterTravelExpenseStrategy,
} from "../task";
import { REGISTER_TRAVEL_EXPENSE_TASK_ID } from "../task";

interface AddressSummary {
  city?: string;
  addressLine1?: string;
  displayName?: string;
  addressAsString?: string;
}

interface EmployeeSummary {
  id: number;
  email?: string;
  firstName?: string;
  lastName?: string;
  name?: string;
  allowInformationRegistration?: boolean;
  address?: AddressSummary | null;
  companyId?: number;
  company?: {
    id?: number;
  } | null;
}

interface CompanySummary {
  address?: AddressSummary | null;
}

interface CostCategorySummary {
  id: number;
  description?: string;
  showOnTravelExpenses?: boolean;
}

interface TravelPaymentTypeSummary {
  id: number;
  description?: string;
  showOnTravelExpenses?: boolean;
  isInactive?: boolean;
}

interface RateTypeSummary {
  id?: number;
}

interface PerDiemRateSummary {
  id?: number;
  rate?: number;
  rateType?: RateTypeSummary | null;
  rateTypeId?: number;
}

interface TravelExpenseSummary {
  id?: number;
  state?: string;
  title?: string;
  employee?: {
    id?: number;
  } | null;
  travelDetails?: {
    departureDate?: string;
    returnDate?: string;
    departureFrom?: string;
    destination?: string;
  } | null;
  costs?: unknown[];
  perDiemCompensations?: unknown[];
}

interface ResponseWrapper<TValue> {
  value?: TValue;
}

interface ListResponse<TValue> {
  values?: TValue[];
}

type DepartureFromSource = "input" | "employee-address" | "company-address";

const DEFAULT_DEPARTURE_TIME = "08:00";
const DEFAULT_RETURN_TIME = "18:00";

export const strategy = {
  strategyId: "13.create-and-deliver-travel-expense.v1",
  strategyPath:
    "src/tasks/task-13/strategies/create-and-deliver-travel-expense.ts",
  taskId: REGISTER_TRAVEL_EXPENSE_TASK_ID,
  name: "Create and deliver travel expense",
  summary:
    "Resolves the employee, travel categories, payment type, and compatible per-diem rates, then creates and delivers the travel expense in the winning embedded-write flow.",
  hypothesis:
    "The best proven path is a single embedded POST /travelExpense followed by PUT /travelExpense/:deliver, but only after resolving a concrete departureFrom, explicit zero-VAT cost rows, and a live per-diem rateType.",
  expectedCallProfile: {
    targetCalls: 6,
    maxCalls: 7,
  },
  stepOutline: [
    "API call 1: GET /employee by exact email to resolve the owning employee.",
    "Conditional API call 2: GET /company/{companyId}?fields=*,address(*) only when the prompt omits departureFrom and the employee read has no concrete address.",
    "API call 3: GET /travelExpense/costCategory and filter locally to travel-expense-visible categories.",
    "API call 4: GET /travelExpense/paymentType and resolve one active travel reimbursement type.",
    "API call 5: GET /travelExpense/rate for PER_DIEM rows when the request includes per-diem compensation.",
    "API call 6: POST /travelExpense with embedded costs and perDiemCompensations.",
    "API call 7: PUT /travelExpense/:deliver and verify the returned parent row is DELIVERED.",
  ],
  status: "draft",
  async run(
    ctx: StrategyContext,
    input: RegisterTravelExpenseInput,
  ): Promise<StrategyResult> {
    assertTravelRows(input);

    const normalizedEmployeeEmail = normalizeEmail(input.employeeEmail);

    const employeeResponse = await ctx.tripletex.get<ListResponse<EmployeeSummary>>(
      "/employee",
      {
        query: {
          email: normalizedEmployeeEmail,
          count: 10,
          fields: "*",
        },
      },
    );
    const employee = pickEmployee(
      employeeResponse.values ?? [],
      normalizedEmployeeEmail,
      input.employeeName,
    );

    let departureFrom = normalizeOptionalText(input.departureFrom);
    let departureFromSource: DepartureFromSource = "input";

    if (!departureFrom) {
      departureFrom = firstConcreteLocationFromAddress(employee.address);
      if (departureFrom) {
        departureFromSource = "employee-address";
      }
    }

    if (!departureFrom) {
      const companyId = employee.companyId ?? employee.company?.id;
      if (!companyId) {
        throw new Error(
          "Prompt omitted departureFrom and the matched employee did not expose a usable company fallback.",
        );
      }

      const companyResponse = await ctx.tripletex.get<ResponseWrapper<CompanySummary>>(
        `/company/${companyId}`,
        {
          query: {
            fields: "*,address(*)",
          },
        },
      );
      departureFrom = firstConcreteLocationFromAddress(
        companyResponse.value?.address,
      );
      if (departureFrom) {
        departureFromSource = "company-address";
      }
    }

    if (!departureFrom) {
      throw new Error(
        "Unable to resolve a concrete departureFrom value from the prompt, employee, or company address.",
      );
    }

    const costCategoryResponse = await ctx.tripletex.get<ListResponse<CostCategorySummary>>(
      "/travelExpense/costCategory",
      {
        query: {
          count: 1000,
          fields: "*",
        },
      },
    );
    const paymentTypeResponse = await ctx.tripletex.get<ListResponse<TravelPaymentTypeSummary>>(
      "/travelExpense/paymentType",
      {
        query: {
          count: 1000,
          fields: "*",
        },
      },
    );

    let perDiemRateResponse: ListResponse<PerDiemRateSummary> | undefined;
    if (input.perDiemCompensations.length > 0) {
      perDiemRateResponse = await ctx.tripletex.get<ListResponse<PerDiemRateSummary>>(
        "/travelExpense/rate",
        {
          query: {
            type: "PER_DIEM",
            isValidDomestic: true,
            dateFrom: input.departureDate,
            dateTo: input.returnDate,
            count: 1000,
            fields: "*",
          },
        },
      );
    }

    const costCategories = costCategoryResponse.values ?? [];
    const paymentType = chooseTravelPaymentType(paymentTypeResponse.values ?? []);
    const destination =
      inferDestination(
        input.title,
        input.purpose,
        input.detailedJourneyDescription,
      ) ?? input.title;

    const createResponse = await ctx.tripletex.post<ResponseWrapper<TravelExpenseSummary>>(
      "/travelExpense",
      {
        body: {
          employee: { id: employee.id },
          title: input.title,
          travelDetails: {
            isForeignTravel: false,
            isDayTrip: input.departureDate === input.returnDate,
            isCompensationFromRates:
              input.perDiemCompensations.length > 0,
            departureDate: input.departureDate,
            returnDate: input.returnDate,
            departureTime: DEFAULT_DEPARTURE_TIME,
            returnTime: DEFAULT_RETURN_TIME,
            departureFrom,
            destination,
            detailedJourneyDescription:
              input.detailedJourneyDescription ?? input.title,
            purpose: input.purpose,
          },
          perDiemCompensations: input.perDiemCompensations.map((entry) =>
            buildPerDiemPayload(
              entry,
              destination,
              input.departureDate,
              input.returnDate,
              perDiemRateResponse?.values ?? [],
            ),
          ),
          costs: input.costs.map((cost, index) => ({
            costCategory: {
              id: pickCostCategory(costCategories, cost.categoryName).id,
            },
            paymentType: { id: paymentType.id },
            comments: cost.comment ?? cost.categoryName,
            amountCurrencyIncVat: cost.amountNokInclVat,
            amountNOKInclVAT: cost.amountNokInclVat,
            date: chooseCostDate(cost, index, input),
            vatType: { id: 0 },
          })),
        },
      },
    );

    const travelExpenseId = requireId(
      createResponse.value?.id,
      "travel expense",
    );

    const deliverResponse = await ctx.tripletex.put<ListResponse<TravelExpenseSummary>>(
      "/travelExpense/:deliver",
      {
        query: {
          id: travelExpenseId,
        },
      },
    );
    const deliveredExpense = pickDeliveredExpense(
      deliverResponse.values ?? [],
      travelExpenseId,
    );

    const notes: string[] = [];
    const requestedEmployeeName = normalizeOptionalText(input.employeeName);
    const matchedEmployeeName = buildEmployeeDisplayName(employee);
    if (
      requestedEmployeeName &&
      matchedEmployeeName &&
      !sameText(requestedEmployeeName, matchedEmployeeName)
    ) {
      notes.push(
        `Employee lookup matched email ${normalizedEmployeeEmail}, but the stored employee name "${matchedEmployeeName}" differed from extracted input "${requestedEmployeeName}".`,
      );
    }
    if (departureFromSource !== "input") {
      notes.push(
        departureFromSource === "employee-address"
          ? `departureFrom was inferred from the matched employee address as "${departureFrom}".`
          : `departureFrom was inferred from the employee company address as "${departureFrom}".`,
      );
    }

    return {
      createdEntityIds: {
        employeeId: employee.id,
        travelExpenseId,
      },
      notes,
      verification: {
        state: deliveredExpense.state,
        title: deliveredExpense.title,
        departureDate: deliveredExpense.travelDetails?.departureDate,
        returnDate: deliveredExpense.travelDetails?.returnDate,
        departureFrom: deliveredExpense.travelDetails?.departureFrom,
        destination: deliveredExpense.travelDetails?.destination,
        costCount: countEmbeddedChildren(deliveredExpense.costs),
        perDiemCompensationCount: countEmbeddedChildren(
          deliveredExpense.perDiemCompensations,
        ),
      },
    };
  },
} satisfies RegisterTravelExpenseStrategy;

function pickEmployee(
  employees: readonly EmployeeSummary[],
  email: string,
  requestedName?: string,
): EmployeeSummary {
  const exactMatches = employees.filter(
    (employee) => normalizeEmail(employee.email) === email,
  );

  if (exactMatches.length === 0) {
    throw new Error(`Expected an existing employee with email ${email}.`);
  }

  if (exactMatches.length === 1) {
    return exactMatches[0];
  }

  const informationRegistrationMatches = exactMatches.filter(
    (employee) => employee.allowInformationRegistration === true,
  );
  if (informationRegistrationMatches.length === 1) {
    return informationRegistrationMatches[0];
  }

  const normalizedRequestedName = normalizeOptionalText(requestedName);
  if (normalizedRequestedName) {
    const nameMatches = exactMatches.filter((employee) =>
      sameText(buildEmployeeDisplayName(employee) ?? "", normalizedRequestedName),
    );
    if (nameMatches.length === 1) {
      return nameMatches[0];
    }
  }

  throw new Error(`Employee lookup was ambiguous for email ${email}.`);
}

function chooseTravelPaymentType(
  paymentTypes: readonly TravelPaymentTypeSummary[],
): TravelPaymentTypeSummary {
  const visible = paymentTypes.filter(
    (paymentType) =>
      paymentType.showOnTravelExpenses === true &&
      paymentType.isInactive !== true,
  );

  const preferred = visible.find((paymentType) =>
    sameText(paymentType.description ?? "", "Privat utlegg"),
  );

  if (preferred) {
    return preferred;
  }

  if (visible.length === 0) {
    throw new Error("Tripletex did not return any active travel-expense payment types.");
  }

  return visible[0];
}

function pickCostCategory(
  categories: readonly CostCategorySummary[],
  categoryName: string,
): CostCategorySummary {
  const visible = categories.filter(
    (category) => category.showOnTravelExpenses === true,
  );
  const normalizedTarget = normalizeText(categoryName);

  const exact = visible.find(
    (category) => normalizeText(category.description ?? "") === normalizedTarget,
  );
  if (exact) {
    return exact;
  }

  const partial = visible.find((category) =>
    normalizeText(category.description ?? "").includes(normalizedTarget),
  );
  if (partial) {
    return partial;
  }

  throw new Error(`Unable to resolve travel-expense cost category "${categoryName}".`);
}

function buildPerDiemPayload(
  entry: RegisterTravelExpensePerDiemInput,
  destination: string,
  departureDate: string,
  returnDate: string,
  rates: readonly PerDiemRateSummary[],
): Record<string, unknown> {
  assertPositiveNumber(entry.count, "perDiemCompensations.count");
  assertPositiveNumber(entry.rateNok, "perDiemCompensations.rateNok");
  assertPositiveNumber(entry.amountNok, "perDiemCompensations.amountNok");

  return {
    location: destination,
    count: entry.count,
    rate: entry.rateNok,
    amount: entry.amountNok,
    rateType: choosePerDiemRateType(rates, entry.rateNok),
    overnightAccommodation: chooseOvernightAccommodation(
      entry.overnightAccommodation,
      departureDate,
      returnDate,
    ),
  };
}

function choosePerDiemRateType(
  rates: readonly PerDiemRateSummary[],
  requestedRate: number,
): { id: number } {
  if (rates.length === 0) {
    throw new Error(
      "Tripletex did not return any per-diem rates for the requested date range.",
    );
  }

  const matchingRate =
    rates.find((entry) => Number(entry.rate) === requestedRate) ?? rates[0];
  const rateTypeId =
    matchingRate.rateType?.id ?? matchingRate.rateTypeId ?? matchingRate.id;

  if (typeof rateTypeId !== "number") {
    throw new Error("Tripletex did not return a usable per-diem rateType id.");
  }

  return { id: rateTypeId };
}

function chooseOvernightAccommodation(
  value: string | undefined,
  departureDate: string,
  returnDate: string,
): string {
  const normalized = normalizeOptionalText(value);
  if (!normalized) {
    return departureDate === returnDate ? "NONE" : "HOTEL";
  }

  const upper = normalized.toUpperCase().replace(/\s+/g, "_");
  if (upper.includes("HOTEL")) {
    return "HOTEL";
  }
  if (upper.includes("NONE") || upper.includes("INGEN")) {
    return "NONE";
  }

  return upper;
}

function pickDeliveredExpense(
  expenses: readonly TravelExpenseSummary[],
  travelExpenseId: number,
): TravelExpenseSummary {
  const exact =
    expenses.find((expense) => Number(expense.id) === travelExpenseId) ??
    expenses[0];

  if (!exact) {
    throw new Error("Tripletex did not return the delivered travel expense row.");
  }

  if (exact.state !== "DELIVERED") {
    throw new Error(
      `Expected delivered travel expense state DELIVERED, but received ${exact.state ?? "<missing>"}.`,
    );
  }

  return exact;
}

function chooseCostDate(
  cost: RegisterTravelExpenseCostInput,
  index: number,
  input: RegisterTravelExpenseInput,
): string {
  const normalizedCategory = normalizeText(cost.categoryName);
  if (containsAny(normalizedCategory, ["fly", "flight", "air", "plane"])) {
    return input.departureDate;
  }
  if (containsAny(normalizedCategory, ["taxi", "cab"])) {
    return input.returnDate;
  }
  if (input.costs.length === 1 || index === 0) {
    return input.departureDate;
  }

  return input.returnDate;
}

function containsAny(haystack: string, needles: readonly string[]): boolean {
  return needles.some((needle) => haystack.includes(needle));
}

function inferDestination(...values: Array<string | undefined>): string | undefined {
  for (const value of values) {
    const normalized = normalizeOptionalText(value);
    if (!normalized) {
      continue;
    }

    const tokens = normalized
      .split(/\s+/)
      .map((token) => token.replace(/[.,;:!?]+$/g, ""))
      .filter((token) => token.length > 0);
    const lastToken = tokens[tokens.length - 1];
    if (lastToken && looksLikePlaceToken(lastToken)) {
      return lastToken;
    }
  }

  return undefined;
}

function looksLikePlaceToken(token: string): boolean {
  return /^[A-ZÅÆØÁÀÂÄÃÉÈÊËÍÌÎÏÓÒÔÖÕÚÙÛÜÑÇ]/u.test(token);
}

function firstConcreteLocationFromAddress(
  address: AddressSummary | null | undefined,
): string | undefined {
  return (
    normalizeOptionalText(address?.city) ??
    normalizeOptionalText(address?.addressLine1) ??
    normalizeOptionalText(address?.displayName) ??
    normalizeOptionalText(address?.addressAsString)
  );
}

function buildEmployeeDisplayName(employee: EmployeeSummary): string | undefined {
  return (
    normalizeOptionalText(employee.name) ??
    normalizeOptionalText(
      [employee.firstName, employee.lastName]
        .map((value) => normalizeOptionalText(value))
        .filter((value): value is string => value !== undefined)
        .join(" "),
    )
  );
}

function countEmbeddedChildren(value: unknown[] | undefined): number | undefined {
  return Array.isArray(value) ? value.length : undefined;
}

function assertTravelRows(input: RegisterTravelExpenseInput): void {
  if (input.costs.length === 0) {
    throw new Error("costs must contain at least one travel-expense cost row.");
  }
}

function assertPositiveNumber(value: number, fieldName: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${fieldName} must be a positive number.`);
  }
}

function requireId(value: number | undefined, entityName: string): number {
  if (typeof value !== "number") {
    throw new Error(`Tripletex did not return a ${entityName} id.`);
  }

  return value;
}

function normalizeEmail(value: string | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function normalizeOptionalText(value: unknown): string | undefined {
  const normalized = String(value ?? "").trim();
  return normalized.length > 0 ? normalized : undefined;
}

function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function sameText(left: string, right: string): boolean {
  return left.localeCompare(right, undefined, { sensitivity: "base" }) === 0;
}
