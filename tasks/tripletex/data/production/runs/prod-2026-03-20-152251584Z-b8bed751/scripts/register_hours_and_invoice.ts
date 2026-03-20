const BASE_URL = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const SESSION_TOKEN = "NUsNLJT9mYHWlHUz3V-ChC38Y-I8JqEiyK_gEF-W2uk";

const RUN_DATE = "2026-03-20";
const CUSTOMER_NAME = "Nordhav AS";
const CUSTOMER_ORG = "912074005";
const PROJECT_NAME = "Skytjeneste-oppsett";
const ACTIVITY_NAME = "Design";
const EMPLOYEE_EMAIL = "silje.strand@example.org";
const HOURS = 5;
const RATE = 1750;

type Envelope<T> = { value?: T; values?: T[]; fullResultSize?: number };

type Ref = { id: number; [key: string]: unknown };

type Customer = Ref & { name?: string; customerName?: string; organizationNumber?: string };
type Employee = Ref & { email?: string; firstName?: string; lastName?: string };
type Activity = Ref & { name?: string; isChargeable?: boolean; isProjectActivity?: boolean; isGeneral?: boolean };
type Project = Ref & {
  name?: string;
  number?: string;
  customer?: Ref & { id: number; name?: string; customerName?: string; organizationNumber?: string };
  projectActivities?: Array<{ id?: number; activity?: Activity; isClosed?: boolean; startDate?: string; endDate?: string }>;
  projectHourlyRates?: Array<ProjectHourlyRate>;
  forParticipantsOnly?: boolean;
  generalProjectActivitiesPerProjectOnly?: boolean;
  isClosed?: boolean;
};
type ProjectHourlyRate = Ref & {
  project?: Ref;
  startDate?: string;
  hourlyRateModel?: string;
  fixedRate?: number;
  projectSpecificRates?: Array<ProjectSpecificRate>;
};
type ProjectSpecificRate = Ref & {
  hourlyRate?: number;
  employee?: Ref & { id: number; email?: string };
  activity?: Ref & { id: number; name?: string };
};
type TimesheetEntry = Ref & {
  date?: string;
  hours?: number;
  projectChargeableHours?: number;
  chargeableHours?: number;
  hourlyRate?: number;
  project?: Ref;
  activity?: Ref;
  employee?: Ref;
};
type WeekStatus = Ref & { approved?: boolean; completed?: boolean; weekYear?: string };
type Order = Ref & { orderLines?: unknown[]; project?: Ref; customer?: Ref };
type Invoice = Ref & {
  invoiceNumber?: string;
  amount?: number;
  amountCurrency?: number;
  amountExcludingVat?: number;
  amountExcludingVatCurrency?: number;
  amountCurrencyOutstanding?: number;
  amountOutstanding?: number;
  customer?: Ref & { id: number; name?: string; customerName?: string; organizationNumber?: string };
  orders?: Array<{ id?: number; project?: Ref & { id: number; name?: string } }>;
};

class HttpError extends Error {
  status: number;
  body: unknown;
  constructor(status: number, body: unknown) {
    super(`HTTP ${status}`);
    this.status = status;
    this.body = body;
  }
}

const auth = `Basic ${Buffer.from(`0:${SESSION_TOKEN}`).toString("base64")}`;

function asArray<T>(env: Envelope<T> | undefined): T[] {
  return env?.values ?? [];
}

function exactOne<T>(items: T[], label: string, predicate: (item: T) => boolean): T {
  const matches = items.filter(predicate);
  if (matches.length !== 1) {
    throw new Error(`${label}: expected 1 match, got ${matches.length}`);
  }
  return matches[0]!;
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      Authorization: auth,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  if (res.status === 204) {
    return undefined as T;
  }

  const text = await res.text();
  const body = text ? JSON.parse(text) : undefined;
  if (!res.ok) {
    throw new HttpError(res.status, body);
  }
  return body as T;
}

function isoWeekYear(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-${String(week).padStart(2, "0")}`;
}

function logStep(label: string, payload: unknown) {
  console.log(`\n## ${label}`);
  console.log(JSON.stringify(payload, null, 2));
}

async function discover() {
  const customerEnv = await call<Envelope<Customer>>(
    `/customer?organizationNumber=${encodeURIComponent(CUSTOMER_ORG)}&count=10&fields=*`,
  );
  const employeeEnv = await call<Envelope<Employee>>(
    `/employee?email=${encodeURIComponent(EMPLOYEE_EMAIL)}&count=10&fields=*`,
  );

  const customer = exactOne(
    asArray(customerEnv),
    "customer",
    (c) => c.organizationNumber === CUSTOMER_ORG && (c.name === CUSTOMER_NAME || c.customerName === CUSTOMER_NAME),
  );
  const employee = exactOne(
    asArray(employeeEnv),
    "employee",
    (e) => (e.email ?? "").toLowerCase() === EMPLOYEE_EMAIL,
  );

  const projectEnv = await call<Envelope<Project>>(
    `/project?customerId=${customer.id}&name=${encodeURIComponent(PROJECT_NAME)}&count=50&fields=*`,
  );
  const project = exactOne(
    asArray(projectEnv),
    "project",
    (p) => p.name === PROJECT_NAME && p.customer?.id === customer.id && !p.isClosed,
  );

  const activityEnv = await call<Envelope<Activity>>(
    `/activity/>forTimeSheet?projectId=${project.id}&employeeId=${employee.id}&date=${RUN_DATE}&query=${encodeURIComponent(ACTIVITY_NAME)}&filterExistingHours=false&count=50&fields=*`,
  );
  const activities = asArray(activityEnv);
  const activity =
    activities.find((a) => a.name === ACTIVITY_NAME) ??
    exactOne(
      activities,
      "activity",
      (a) => a.name === ACTIVITY_NAME || (a.name ?? "").toLowerCase() === ACTIVITY_NAME.toLowerCase(),
    );

  const hourlyRatesEnv = await call<Envelope<ProjectHourlyRate>>(
    `/project/hourlyRates?projectId=${project.id}&count=100&fields=*`,
  );

  const weekYear = isoWeekYear(RUN_DATE);

  logStep("discovery", {
    customer: { id: customer.id, name: customer.name ?? customer.customerName, organizationNumber: customer.organizationNumber },
    employee: { id: employee.id, email: employee.email, name: `${employee.firstName ?? ""} ${employee.lastName ?? ""}`.trim() },
    project: {
      id: project.id,
      name: project.name,
      generalProjectActivitiesPerProjectOnly: project.generalProjectActivitiesPerProjectOnly,
      forParticipantsOnly: project.forParticipantsOnly,
      projectActivities: (project.projectActivities ?? []).map((pa) => ({
        id: pa.id,
        activityId: pa.activity?.id,
        activityName: pa.activity?.name,
        isClosed: pa.isClosed,
      })),
    },
    activity: {
      id: activity.id,
      name: activity.name,
      isChargeable: activity.isChargeable,
      isProjectActivity: activity.isProjectActivity,
      isGeneral: activity.isGeneral,
    },
    hourlyRates: asArray(hourlyRatesEnv).map((r) => ({
      id: r.id,
      startDate: r.startDate,
      hourlyRateModel: r.hourlyRateModel,
      fixedRate: r.fixedRate,
      projectSpecificRates: (r.projectSpecificRates ?? []).map((psr) => ({
        id: psr.id,
        hourlyRate: psr.hourlyRate,
        employeeId: psr.employee?.id,
        employeeEmail: psr.employee?.email,
        activityId: psr.activity?.id,
        activityName: psr.activity?.name,
      })),
    })),
    weekYear,
  });

  return { customer, employee, project, activity, hourlyRates: asArray(hourlyRatesEnv), weekYear };
}

function selectRelevantRate(hourlyRates: ProjectHourlyRate[], employeeId: number, activityId: number) {
  const direct = hourlyRates.find((r) =>
    (r.projectSpecificRates ?? []).some((psr) => psr.employee?.id === employeeId && psr.activity?.id === activityId),
  );
  if (direct) {
    return direct;
  }
  return hourlyRates.find((r) => r.hourlyRateModel === "TYPE_FIXED_HOURLY_RATE");
}

async function ensureRate(projectId: number, employeeId: number, activityId: number, hourlyRates: ProjectHourlyRate[]) {
  let holder = selectRelevantRate(hourlyRates, employeeId, activityId) ?? hourlyRates[0];
  if (holder?.hourlyRateModel === "TYPE_FIXED_HOURLY_RATE" && holder.fixedRate === RATE) {
    return { action: "reuse-fixed", rate: holder, specificRate: null };
  }

  if (!holder) {
    const created = await call<Envelope<ProjectHourlyRate>>(`/project/hourlyRates`, {
      method: "POST",
      body: JSON.stringify({
        project: { id: projectId },
        startDate: RUN_DATE,
        hourlyRateModel: "TYPE_PROJECT_SPECIFIC_HOURLY_RATES",
      }),
    });
    holder = created.value!;
  } else if (holder.hourlyRateModel !== "TYPE_PROJECT_SPECIFIC_HOURLY_RATES") {
    const updated = await call<Envelope<ProjectHourlyRate>>(`/project/hourlyRates/${holder.id}`, {
      method: "PUT",
      body: JSON.stringify({
        project: { id: projectId },
        startDate: RUN_DATE,
        hourlyRateModel: "TYPE_PROJECT_SPECIFIC_HOURLY_RATES",
      }),
    });
    holder = updated.value!;
  }

  const existingSpecificEnv = await call<Envelope<ProjectSpecificRate>>(
    `/project/hourlyRates/projectSpecificRates?projectHourlyRateId=${holder.id}&employeeId=${employeeId}&activityId=${activityId}&count=10&fields=*`,
  );
  const existingSpecific = asArray(existingSpecificEnv).find(
    (psr) => psr.employee?.id === employeeId && psr.activity?.id === activityId,
  );

  if (existingSpecific?.hourlyRate === RATE) {
    return { action: "reuse-project-specific", rate: holder, specificRate: existingSpecific };
  }

  if (existingSpecific) {
    const updatedSpecific = await call<Envelope<ProjectSpecificRate>>(
      `/project/hourlyRates/projectSpecificRates/${existingSpecific.id}`,
      {
        method: "PUT",
        body: JSON.stringify({
          projectHourlyRate: { id: holder.id },
          employee: { id: employeeId },
          activity: { id: activityId },
          hourlyRate: RATE,
        }),
      },
    );
    return { action: "updated-project-specific", rate: holder, specificRate: updatedSpecific.value };
  }

  const createdSpecific = await call<Envelope<ProjectSpecificRate>>(`/project/hourlyRates/projectSpecificRates`, {
    method: "POST",
    body: JSON.stringify({
      projectHourlyRate: { id: holder.id },
      employee: { id: employeeId },
      activity: { id: activityId },
      hourlyRate: RATE,
    }),
  });
  return { action: "created-project-specific", rate: holder, specificRate: createdSpecific.value };
}

async function createTimesheetEntry(employeeId: number, projectId: number, activityId: number) {
  const payload = {
    employee: { id: employeeId },
    project: { id: projectId },
    activity: { id: activityId },
    date: RUN_DATE,
    hours: HOURS,
    projectChargeableHours: HOURS,
  };

  return call<Envelope<TimesheetEntry>>(`/timesheet/entry`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

async function findTimesheetEntries(employeeId: number, projectId: number, activityId: number) {
  return call<Envelope<TimesheetEntry>>(
    `/timesheet/entry?employeeId=${employeeId}&projectId=${projectId}&activityId=${activityId}&dateFrom=${RUN_DATE}&dateTo=2026-03-21&count=10&fields=*`,
  );
}

async function deleteTimesheetEntry(id: number, version: number) {
  return call<void>(`/timesheet/entry/${id}?version=${version}`, { method: "DELETE" });
}

async function approveWeek(employeeId: number, weekYear: string) {
  return call<Envelope<WeekStatus>>(
    `/timesheet/week/:approve?employeeId=${employeeId}&weekYear=${encodeURIComponent(weekYear)}`,
    { method: "PUT" },
  );
}

async function completeWeek(employeeId: number, weekYear: string) {
  return call<Envelope<WeekStatus>>(
    `/timesheet/week/:complete?employeeId=${employeeId}&weekYear=${encodeURIComponent(weekYear)}`,
    { method: "PUT" },
  );
}

async function getProjectHourlyReport(projectId: number) {
  return call<Envelope<{
    chargeableHours?: number;
    nonChargeableHours?: number;
    approvedButUnchargedHours?: number;
    nonApprovedHours?: number;
    registeredHours?: number;
  }>>(
    `/project/${projectId}/period/hourlistReport?dateFrom=${RUN_DATE}&dateTo=2026-03-21&fields=*`,
  );
}

async function getProjectReserve(projectId: number) {
  return call<Envelope<{
    invoiceFeeReserveCurrency?: number;
    periodOrderLinesIncomeCurrency?: number;
    invoiceExtracostsReserveCurrency?: number;
    invoiceAkontoReserveAmountCurrency?: number;
    invoiceReserveTotalAmountCurrency?: number;
  }>>(
    `/project/${projectId}/period/invoicingReserve?dateFrom=${RUN_DATE}&dateTo=2026-03-21&fields=*`,
  );
}

async function createProjectOrder(customerId: number, projectId: number) {
  return call<Envelope<Order>>(`/order`, {
    method: "POST",
    body: JSON.stringify({
      customer: { id: customerId },
      project: { id: projectId },
      orderDate: RUN_DATE,
      deliveryDate: RUN_DATE,
    }),
  });
}

async function invoiceOrder(orderId: number) {
  return call<Envelope<Invoice>>(
    `/order/${orderId}/:invoice?invoiceDate=${RUN_DATE}&sendToCustomer=false`,
    { method: "PUT" },
  );
}

async function main() {
  const mode = process.argv[2] ?? "discover";
  const ctx = await discover();

  if (mode === "discover") {
    return;
  }

  const rateResult = await ensureRate(ctx.project.id, ctx.employee.id, ctx.activity.id, ctx.hourlyRates);
  logStep("rate", {
    action: rateResult.action,
    rate: rateResult.rate,
    specificRate: rateResult.specificRate,
  });

  const existingEntries = asArray(await findTimesheetEntries(ctx.employee.id, ctx.project.id, ctx.activity.id));
  for (const existingEntry of existingEntries) {
    if (existingEntry.invoice?.id) {
      throw new Error(`timesheet entry ${existingEntry.id} already invoiced`);
    }
    await deleteTimesheetEntry(existingEntry.id, existingEntry.version);
  }

  const entry = await createTimesheetEntry(ctx.employee.id, ctx.project.id, ctx.activity.id);
  logStep("timesheet-entry", entry.value);

  try {
    const approved = await approveWeek(ctx.employee.id, ctx.weekYear);
    logStep("week-approved", approved.value);
  } catch (error) {
    if (error instanceof HttpError && error.status === 403) {
      const completed = await completeWeek(ctx.employee.id, ctx.weekYear).catch((completeError) => {
        if (completeError instanceof HttpError) {
          logStep("week-complete-error", completeError.body);
        }
        throw completeError;
      });
      logStep("week-completed", completed.value);
    } else {
      throw error;
    }
  }

  const hourlyReport = await getProjectHourlyReport(ctx.project.id);
  const reserve = await getProjectReserve(ctx.project.id);
  logStep("project-hourly-report", hourlyReport.value);
  logStep("project-reserve", reserve.value);

  const order = await createProjectOrder(ctx.customer.id, ctx.project.id);
  logStep("order", order.value);

  try {
    const invoice = await invoiceOrder(order.value!.id);
    logStep("invoice", invoice.value);
  } catch (error) {
    if (error instanceof HttpError) {
      logStep("invoice-error", error.body);
    }
    throw error;
  }
}

main().catch((error) => {
  if (error instanceof HttpError) {
    console.error(JSON.stringify(error.body, null, 2));
  }
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exit(1);
});
