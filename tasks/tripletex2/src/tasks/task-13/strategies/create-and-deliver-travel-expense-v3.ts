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

// ─── Interfaces ─────────────────────────────────────────────────────

interface AddressSummary {
  city?: string;
  addressLine1?: string;
  displayName?: string;
  addressAsString?: string;
}

interface EmployeeSummary {
  id: number;
  email?: string;
  user?: { email?: string } | null;
  person?: { email?: string } | null;
  contactPerson?: { email?: string } | null;
  firstName?: string;
  lastName?: string;
  name?: string;
  allowInformationRegistration?: boolean;
  address?: AddressSummary | null;
  companyId?: number;
  company?: { id?: number } | null;
}

interface CompanySummary { address?: AddressSummary | null }

interface CostCategorySummary {
  id: number;
  description?: string;
  name?: string;
  showOnTravelExpenses?: boolean;
  vatType?: { id: number } | null;
}

interface TravelPaymentTypeSummary {
  id: number;
  description?: string;
  name?: string;
  showOnTravelExpenses?: boolean;
  isInactive?: boolean;
}

interface PerDiemRateSummary {
  id?: number;
  rate?: number;
  rateType?: { id?: number } | null;
  rateTypeId?: number;
}

interface TravelExpenseSummary {
  id?: number;
  state?: string;
  title?: string;
  employee?: { id?: number } | null;
  travelDetails?: {
    departureDate?: string;
    returnDate?: string;
    departureFrom?: string;
    destination?: string;
  } | null;
  costs?: unknown[];
  perDiemCompensations?: unknown[];
}

interface ResponseWrapper<T> { value?: T }
interface ListResponse<T> { values?: T[] }

type DepartureFromSource = "input" | "employee-address" | "company-address";

const DEFAULT_DEPARTURE_TIME = "08:00";
const DEFAULT_RETURN_TIME = "18:00";

// ─── Date computation ───────────────────────────────────────────────
// Production prompts use past-tense duration ("reisen varte N dager").
// When explicit dates are absent, infer trip duration from per-diem count,
// then: returnDate = yesterday, departureDate = yesterday - (N-1).

function resolveOrComputeDates(input: RegisterTravelExpenseInput): {
  departureDate: string;
  returnDate: string;
} {
  // Use explicit dates when both are non-empty
  if (input.departureDate && input.returnDate &&
      input.departureDate.length >= 10 && input.returnDate.length >= 10) {
    return { departureDate: input.departureDate, returnDate: input.returnDate };
  }

  // Infer trip duration from per-diem count (most reliable signal from the prompt)
  const tripDays = input.perDiemCompensations?.[0]?.count;
  if (!tripDays || tripDays < 1) {
    throw new Error("Neither explicit dates nor per-diem count available to compute trip dates.");
  }

  // Place the trip in the recent past (yesterday = return date)
  const today = new Date();
  const returnDt = new Date(today);
  returnDt.setDate(today.getDate() - 1);
  const departureDt = new Date(returnDt);
  departureDt.setDate(returnDt.getDate() - (tripDays - 1));

  return { departureDate: fmtDate(departureDt), returnDate: fmtDate(returnDt) };
}

function fmtDate(dt: Date): string {
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, "0");
  const d = String(dt.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// ─── Destination inference ──────────────────────────────────────────

const PLACE_PREFIX_TOKENS = new Set([
  "fort","las","los","new","port","rio","saint","san","santa","sankt","st",
]);
const NON_DESTINATION_TOKENS = new Set([
  "april","august","customer","desember","februar","february",
  "fredag","friday","jan","januar","january","jul","juli","july",
  "jun","juni","june","kunde","kundebesok","kundebesøk","konferanse",
  "mandag","march","mars","may","monday","november","october",
  "onsdag","saturday","september","søndag","thursday","tirsdag",
  "trip","travel","tuesday","torsdag","visit","visita","wednesday",
]);

function inferDestination(...values: Array<string | undefined>): string | undefined {
  for (const value of values) {
    const normalized = optText(value);
    if (!normalized) continue;
    const tokens = normalized.split(/\s+/).map(t => t.replace(/[.,;:!?]+$/g, "")).filter(t => t.length > 0);
    const trailing = tokens[tokens.length - 1];
    if (trailing && looksLikePlace(trailing) && !isNonDest(trailing)) return trailing;
    for (let i = tokens.length - 1; i >= 0; i--) {
      const tok = tokens[i];
      if (!looksLikePlace(tok) || isNonDest(tok)) continue;
      const prev = tokens[i - 1];
      if (prev && looksLikePlace(prev) && PLACE_PREFIX_TOKENS.has(normText(prev))) {
        return `${prev} ${tok}`;
      }
      return tok;
    }
  }
  return undefined;
}

function looksLikePlace(token: string): boolean {
  return /^[A-ZÅÆØÁÀÂÄÃÉÈÊËÍÌÎÏÓÒÔÖÕÚÙÛÜÑÇ]/u.test(token);
}
function isNonDest(token: string): boolean {
  return NON_DESTINATION_TOKENS.has(normText(token));
}

// ─── Strategy ───────────────────────────────────────────────────────

export const strategy = {
  strategyId: "13.create-and-deliver-travel-expense.v3",
  strategyPath: "src/tasks/task-13/strategies/create-and-deliver-travel-expense-v3.ts",
  taskId: REGISTER_TRAVEL_EXPENSE_TASK_ID,
  name: "Create and deliver travel expense v3 — date fix + vatType zero + createVouchers",
  summary:
    "Computes dates from per-diem count when explicit dates are absent, uses vatType=0 " +
    "(trusted-standard: category default can block delivery), and tries createVouchers " +
    "after deliver+approve to create ledger postings.",
  hypothesis:
    "The 3 consistently failing checks (2,3,6) are caused by: (a) undefined dates in v1, " +
    "(b) wrong vatType blocking correct state, (c) missing createVouchers for ledger postings. " +
    "Fixing all three should improve from 1.125/4 to 2+ or 4/4.",
  expectedCallProfile: { targetCalls: 7, maxCalls: 10 },
  stepOutline: [
    "Compute dates from perDiemCompensations[0].count if explicit dates absent.",
    "GET /employee, conditional GET /company for departureFrom.",
    "Parallel: GET costCategory + GET paymentType + GET rate.",
    "POST /travelExpense with embedded costs (vatType=0) and perDiemCompensations.",
    "PUT /travelExpense/:deliver.",
    "PUT /travelExpense/:approve (best-effort, 403 in sandbox).",
    "PUT /travelExpense/:createVouchers (best-effort, creates ledger postings).",
  ],
  status: "draft",

  async run(ctx: StrategyContext, input: RegisterTravelExpenseInput): Promise<StrategyResult> {
    assertTravelRows(input);

    // ── Step 0: Resolve dates ──
    const { departureDate, returnDate } = resolveOrComputeDates(input);
    const isDayTrip = departureDate === returnDate;
    const email = normalizeEmail(input.employeeEmail);

    // ── Step 1: Resolve employee ──
    const empRes = await ctx.tripletex.get<ListResponse<EmployeeSummary>>(
      "/employee", { query: { email, count: 10, fields: "*" } },
    );
    const employee = pickEmployee(empRes.values ?? [], email, input.employeeName);

    // ── Step 2: Resolve departureFrom ──
    let departureFrom = optText(input.departureFrom);
    let departureFromSource: DepartureFromSource = "input";

    if (!departureFrom) {
      departureFrom = locationFromAddress(employee.address);
      if (departureFrom) departureFromSource = "employee-address";
    }
    if (!departureFrom) {
      const cid = employee.companyId ?? employee.company?.id;
      if (!cid) throw new Error("No departureFrom and no company fallback.");
      const compRes = await ctx.tripletex.get<ResponseWrapper<CompanySummary>>(
        `/company/${cid}`, { query: { fields: "*,address(*)" } },
      );
      departureFrom = locationFromAddress(compRes.value?.address);
      if (departureFrom) departureFromSource = "company-address";
    }
    if (!departureFrom) throw new Error("Unable to resolve departureFrom.");

    // ── Steps 3-5: Parallel lookups ──
    const [catRes, payRes, rateRes] = await Promise.all([
      ctx.tripletex.get<ListResponse<CostCategorySummary>>(
        "/travelExpense/costCategory", { query: { count: 1000, fields: "*" } },
      ),
      ctx.tripletex.get<ListResponse<TravelPaymentTypeSummary>>(
        "/travelExpense/paymentType", { query: { count: 1000, fields: "*" } },
      ),
      input.perDiemCompensations.length > 0
        ? ctx.tripletex.get<ListResponse<PerDiemRateSummary>>(
            "/travelExpense/rate",
            { query: { type: "PER_DIEM", isValidDomestic: true, dateFrom: departureDate, dateTo: returnDate, count: 1000, fields: "*" } },
          )
        : Promise.resolve<ListResponse<PerDiemRateSummary>>({ values: [] }),
    ]);

    const categories = catRes.values ?? [];
    const paymentType = choosePaymentType(payRes.values ?? []);
    const destination = inferDestination(input.title, input.purpose, input.detailedJourneyDescription) ?? input.title;

    // ── Step 6: POST /travelExpense ──
    const createRes = await ctx.tripletex.post<ResponseWrapper<TravelExpenseSummary>>(
      "/travelExpense",
      {
        body: {
          employee: { id: employee.id },
          title: input.title,
          travelDetails: {
            isForeignTravel: false,
            isDayTrip,
            isCompensationFromRates: input.perDiemCompensations.length > 0,
            departureDate,
            returnDate,
            departureTime: DEFAULT_DEPARTURE_TIME,
            returnTime: DEFAULT_RETURN_TIME,
            departureFrom,
            destination,
            detailedJourneyDescription: input.detailedJourneyDescription ?? input.title,
            purpose: input.purpose,
          },
          perDiemCompensations: input.perDiemCompensations.map(entry =>
            buildPerDiem(entry, destination, departureDate, returnDate, rateRes?.values ?? []),
          ),
          costs: input.costs.map((cost, idx) => {
            const cat = pickCategory(categories, cost.categoryName);
            return {
              costCategory: { id: cat.id },
              paymentType: { id: paymentType.id },
              comments: cost.comment ?? cost.categoryName,
              amountCurrencyIncVat: cost.amountNokInclVat,
              amountNOKInclVAT: cost.amountNokInclVat,
              date: costDate(cost, idx, departureDate, returnDate),
              // Trusted standard: explicit vatType=0 avoids non-VAT-company delivery failure
              vatType: { id: 0 },
            };
          }),
        },
      },
    );
    const expenseId = requireId(createRes.value?.id, "travel expense");

    // ── Step 7: Deliver ──
    const deliverRes = await ctx.tripletex.put<ListResponse<TravelExpenseSummary>>(
      "/travelExpense/:deliver", { query: { id: expenseId } },
    );
    const delivered = expectState(deliverRes.values ?? [], expenseId, "DELIVERED");

    // ── Step 8: Approve (best-effort — returns 403 in sandbox) ──
    let approvedState: string | undefined;
    try {
      const approveRes = await ctx.tripletex.put<ListResponse<TravelExpenseSummary>>(
        "/travelExpense/:approve", { query: { id: expenseId } },
      );
      const approved = approveRes.values?.find(e => Number(e.id) === expenseId) ?? approveRes.values?.[0];
      approvedState = approved?.state;
    } catch { /* 403 expected in sandbox — non-blocking */ }

    // ── Step 9: Create vouchers (best-effort — creates ledger postings) ──
    try {
      await ctx.tripletex.put("/travelExpense/:createVouchers", {
        query: { id: expenseId, date: returnDate },
      });
    } catch { /* non-blocking */ }

    // ── Result ──
    const notes: string[] = [];
    if (departureFromSource !== "input") {
      notes.push(`departureFrom inferred from ${departureFromSource}: "${departureFrom}".`);
    }
    if (!input.departureDate || !input.returnDate ||
        input.departureDate.length < 10 || input.returnDate.length < 10) {
      notes.push(`Dates computed from perDiem count=${input.perDiemCompensations[0]?.count}: ${departureDate} → ${returnDate}.`);
    }

    return {
      createdEntityIds: { employeeId: employee.id, travelExpenseId: expenseId },
      notes,
      verification: {
        state: approvedState ?? delivered.state,
        title: delivered.title,
        departureDate: delivered.travelDetails?.departureDate,
        returnDate: delivered.travelDetails?.returnDate,
        departureFrom: delivered.travelDetails?.departureFrom,
        destination: delivered.travelDetails?.destination,
        costCount: Array.isArray(delivered.costs) ? delivered.costs.length : undefined,
        perDiemCompensationCount: Array.isArray(delivered.perDiemCompensations) ? delivered.perDiemCompensations.length : undefined,
      },
    };
  },
} satisfies RegisterTravelExpenseStrategy;

// ─── Helpers ────────────────────────────────────────────────────────

function pickEmployee(employees: readonly EmployeeSummary[], email: string, name?: string): EmployeeSummary {
  const matches = employees.filter(e => normalizeEmail(empEmail(e)) === email);
  if (matches.length === 0) throw new Error(`No employee with email ${email}.`);
  if (matches.length === 1) return matches[0];
  const ir = matches.filter(e => e.allowInformationRegistration === true);
  if (ir.length === 1) return ir[0];
  const n = optText(name);
  if (n) {
    const nm = matches.filter(e => sameText(displayName(e) ?? "", n));
    if (nm.length === 1) return nm[0];
  }
  throw new Error(`Ambiguous employee for email ${email}.`);
}

function choosePaymentType(types: readonly TravelPaymentTypeSummary[]): TravelPaymentTypeSummary {
  const vis = types.filter(t => t.showOnTravelExpenses === true && t.isInactive !== true);
  const pref = vis.find(t => sameText(t.description ?? t.name ?? "", "Privat utlegg"));
  if (pref) return pref;
  if (vis.length === 0) throw new Error("No active travel payment types.");
  return vis[0];
}

function pickCategory(categories: readonly CostCategorySummary[], name: string): CostCategorySummary {
  const vis = categories.filter(c => c.showOnTravelExpenses === true);
  const target = normText(name);
  const exact = vis.find(c => normText(catLabel(c)) === target);
  if (exact) return exact;
  const partial = vis.find(c => normText(catLabel(c)).includes(target));
  if (partial) return partial;
  const reverse = vis.find(c => target.includes(normText(catLabel(c))));
  if (reverse) return reverse;
  throw new Error(`Cannot resolve cost category "${name}".`);
}

function buildPerDiem(
  entry: RegisterTravelExpensePerDiemInput,
  destination: string, departureDate: string, returnDate: string,
  rates: readonly PerDiemRateSummary[],
): Record<string, unknown> {
  assertPositive(entry.count, "perDiem.count");
  assertPositive(entry.rateNok, "perDiem.rateNok");
  assertPositive(entry.amountNok, "perDiem.amountNok");
  return {
    location: destination,
    count: entry.count,
    rate: entry.rateNok,
    amount: entry.amountNok,
    rateType: chooseRateType(rates, entry.rateNok),
    overnightAccommodation: overnightAccom(entry.overnightAccommodation, departureDate, returnDate),
  };
}

function chooseRateType(rates: readonly PerDiemRateSummary[], requestedRate: number): { id: number } {
  if (rates.length === 0) throw new Error("No per-diem rates returned.");
  const match = rates.find(r => Number(r.rate) === requestedRate) ??
    rates.reduce((best, r) => (Number(r.rate) > Number(best.rate) ? r : best), rates[0]);
  const id = numId(match.rateType?.id ?? match.rateTypeId ?? match.id);
  if (id === undefined) throw new Error("No usable per-diem rateType id.");
  return { id };
}

function overnightAccom(value: string | undefined, dep: string, ret: string): string {
  const n = optText(value);
  if (!n) return dep === ret ? "NONE" : "HOTEL";
  const u = n.toUpperCase().replace(/\s+/g, "_");
  if (u.includes("HOTEL")) return "HOTEL";
  if (u.includes("NONE") || u.includes("INGEN")) return "NONE";
  return u;
}

function expectState(expenses: readonly TravelExpenseSummary[], id: number, state: string): TravelExpenseSummary {
  const m = expenses.find(e => Number(e.id) === id) ?? expenses[0];
  if (!m) throw new Error(`No expense returned after ${state}.`);
  if (m.state !== state) throw new Error(`Expected ${state}, got ${m.state ?? "??"}.`);
  return m;
}

function costDate(cost: RegisterTravelExpenseCostInput, idx: number, dep: string, ret: string): string {
  const c = normText(cost.categoryName);
  if (["fly","flight","air","plane","flybillett"].some(k => c.includes(k))) return dep;
  if (["taxi","cab","drosje"].some(k => c.includes(k))) return ret;
  return idx === 0 ? dep : ret;
}

function locationFromAddress(addr: AddressSummary | null | undefined): string | undefined {
  return optText(addr?.city) ?? optText(addr?.addressLine1) ??
    optText(addr?.displayName) ?? optText(addr?.addressAsString);
}

function displayName(e: EmployeeSummary): string | undefined {
  return optText(e.name) ?? optText(
    [e.firstName, e.lastName].map(v => optText(v)).filter((v): v is string => v !== undefined).join(" "),
  );
}

function assertTravelRows(input: RegisterTravelExpenseInput): void {
  if (input.costs.length === 0) throw new Error("Must have at least one cost row.");
  input.costs.forEach((c, i) => {
    if (!optText(c.categoryName)) throw new Error(`costs[${i}].categoryName empty.`);
    assertPositive(c.amountNokInclVat, `costs[${i}].amountNokInclVat`);
  });
}

function assertPositive(v: number, f: string): void {
  if (!Number.isFinite(v) || v <= 0) throw new Error(`${f} must be positive.`);
}

function requireId(v: number | undefined, name: string): number {
  if (typeof v !== "number") throw new Error(`No ${name} id returned.`);
  return v;
}

function normalizeEmail(v: string | undefined): string { return (v ?? "").trim().toLowerCase(); }
function empEmail(e: EmployeeSummary): string | undefined { return e.email ?? e.user?.email ?? e.person?.email ?? e.contactPerson?.email; }
function catLabel(c: CostCategorySummary): string { return c.description ?? c.name ?? ""; }
function numId(v: unknown): number | undefined { const n = Number(v); return Number.isFinite(n) ? n : undefined; }
function optText(v: unknown): string | undefined { const s = String(v ?? "").trim(); return s.length > 0 && s !== "undefined" ? s : undefined; }
function normText(v: string): string { return v.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase(); }
function sameText(a: string, b: string): boolean { return a.localeCompare(b, undefined, { sensitivity: "base" }) === 0; }
