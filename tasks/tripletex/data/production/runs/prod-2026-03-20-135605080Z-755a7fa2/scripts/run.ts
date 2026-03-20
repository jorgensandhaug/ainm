const BASE_URL = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "e7K5vojSciokhcclOAJe7fdVcUmfKsyLzP-2z4kIsaE";

const DATE = "2026-03-20";
const CUSTOMER_ORG = "909621682";
const CUSTOMER_NAME = "Estrela Lda";
const EMPLOYEE_EMAIL = "maria.ferreira@example.org";
const PROJECT_NAME = "Desenvolvimento de app";
const ACTIVITY_NAME = "Utvikling";
const HOURS = 4;
const RATE = 1050;

const auth = `Basic ${Buffer.from(`0:${TOKEN}`).toString("base64")}`;

type TripletexList<T> = {
  values?: T[];
  fullResultSize?: number;
};

type TripletexValue<T> = {
  value?: T;
};

type Customer = {
  id: number;
  name?: string;
  organizationNumber?: string;
};

type Employee = {
  id: number;
  email?: string;
  name?: string;
  displayName?: string;
};

type Activity = {
  id: number;
  name?: string;
  description?: string;
  number?: string;
};

type ProjectSpecificRate = {
  id?: number;
  hourlyRate?: number;
  hourlyCostPercentage?: number;
  employee?: Employee;
  activity?: Activity;
};

type ProjectHourlyRate = {
  id?: number;
  startDate?: string;
  showInProjectOrder?: boolean;
  hourlyRateModel?: string;
  fixedRate?: number;
  projectSpecificRates?: ProjectSpecificRate[];
};

type VatType = {
  id: number;
  number?: string;
  percentage?: number;
};

type Project = {
  id: number;
  name?: string;
  isClosed?: boolean;
  customer?: Customer;
  vatType?: VatType;
  projectHourlyRates?: ProjectHourlyRate[];
};

type TimesheetEntry = {
  id: number;
  date?: string;
  hours?: number;
  projectChargeableHours?: number;
  hourlyRate?: number;
  employee?: Employee;
  project?: Project;
  activity?: Activity;
};

type Order = {
  id: number;
};

type Invoice = {
  id: number;
  invoiceNumber?: number | string;
  amountExcludingVatCurrency?: number;
  amountCurrency?: number;
  amountCurrencyOutstanding?: number;
  amountOutstanding?: number;
  customer?: Customer;
};

type LedgerAccount = {
  id: number;
  number?: string | number;
  isBankAccount?: boolean;
  isInvoiceAccount?: boolean;
  bankAccountNumber?: string;
};

class ApiError extends Error {
  status: number;
  url: string;
  data: unknown;

  constructor(message: string, status: number, url: string, data: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.url = url;
    this.data = data;
  }
}

function buildUrl(path: string, query?: Record<string, string | number | boolean | Array<string | number | boolean> | undefined>) {
  const normalizedPath = path.startsWith("/") ? path.slice(1) : path;
  const url = new URL(normalizedPath, `${BASE_URL}/`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined) continue;
      if (Array.isArray(value)) {
        for (const item of value) url.searchParams.append(key, String(item));
      } else {
        url.searchParams.set(key, String(value));
      }
    }
  }
  return url;
}

async function api<T>(method: string, path: string, opts: {
  query?: Record<string, string | number | boolean | Array<string | number | boolean> | undefined>;
  body?: unknown;
  expected?: number[];
} = {}): Promise<T> {
  const url = buildUrl(path, opts.query);
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: auth,
      Accept: "application/json",
      ...(opts.body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : undefined;
  const expected = opts.expected ?? [200, 201, 204];
  if (!expected.includes(res.status)) {
    throw new ApiError(`${method} ${url.pathname} failed`, res.status, url.toString(), data);
  }
  return data as T;
}

function exactOne<T>(values: T[] | undefined, predicate: (value: T) => boolean, label: string): T {
  const matches = (values ?? []).filter(predicate);
  if (matches.length !== 1) {
    throw new Error(`${label}: expected 1 match, got ${matches.length}`);
  }
  return matches[0];
}

function normalize(value: string | undefined) {
  return (value ?? "").trim().toLowerCase();
}

function isActiveOn(date: string, startDate?: string, endDate?: string) {
  if (startDate && startDate > date) return false;
  if (endDate && endDate < date) return false;
  return true;
}

function latestApplicableRate(project: Project) {
  return (project.projectHourlyRates ?? [])
    .filter((rate) => isActiveOn(DATE, rate.startDate))
    .sort((a, b) => (b.startDate ?? "").localeCompare(a.startDate ?? ""))[0];
}

function makeValidBankAccountNumber(seed: number, existing: Set<string>) {
  const prefix = "1234";
  for (let n = 0; n < 1000000; n++) {
    const body6 = String((seed + n) % 1000000).padStart(6, "0");
    const first10 = `${prefix}${body6}`;
    const weights = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
    const sum = first10
      .split("")
      .reduce((acc, digit, index) => acc + Number(digit) * weights[index], 0);
    const remainder = sum % 11;
    const check = remainder === 0 ? 0 : 11 - remainder;
    if (check === 10) continue;
    const candidate = `${first10}${check}`;
    if (!existing.has(candidate)) return candidate;
  }
  throw new Error("unable to generate bankAccountNumber");
}

function errorText(error: unknown) {
  if (!(error instanceof ApiError)) return String(error);
  return JSON.stringify(error.data);
}

async function invoiceOrder(orderId: number): Promise<Invoice> {
  try {
    const res = await api<TripletexValue<Invoice>>("PUT", `/order/${orderId}/:invoice`, {
      query: {
        invoiceDate: DATE,
        sendToCustomer: false,
      },
    });
    if (!res.value) throw new Error("missing invoice response");
    return res.value;
  } catch (error) {
    if (!(error instanceof ApiError) || error.status !== 422 || !errorText(error).includes("bankkontonummer")) {
      throw error;
    }

    const accountsRes = await api<TripletexList<LedgerAccount>>("GET", "/ledger/account", {
      query: {
        isBankAccount: true,
        fields: "*",
      },
    });
    const accounts = accountsRes.values ?? [];
    const account =
      accounts.find((item) => item.isInvoiceAccount) ??
      accounts.find((item) => String(item.number) === "1920") ??
      accounts.find((item) => String(item.number).startsWith("19"));
    if (!account) throw new Error("invoice bank account not found");

    const existingNumbers = new Set(
      accounts
        .map((item) => item.bankAccountNumber)
        .filter((item): item is string => Boolean(item)),
    );
    const bankAccountNumber =
      account.bankAccountNumber && /^\d{11}$/.test(account.bankAccountNumber)
        ? account.bankAccountNumber
        : makeValidBankAccountNumber(account.id, existingNumbers);

    await api<TripletexValue<LedgerAccount>>("PUT", `/ledger/account/${account.id}`, {
      body: {
        bankAccountNumber,
      },
    });

    const retry = await api<TripletexValue<Invoice>>("PUT", `/order/${orderId}/:invoice`, {
      query: {
        invoiceDate: DATE,
        sendToCustomer: false,
      },
    });
    if (!retry.value) throw new Error("missing invoice response after bank repair");
    return retry.value;
  }
}

async function main() {
  const customerRes = await api<TripletexList<Customer>>("GET", "/customer", {
    query: {
      organizationNumber: CUSTOMER_ORG,
      count: 10,
      fields: "*",
    },
  });
  const customer = exactOne(
    customerRes.values,
    (item) =>
      normalize(item.organizationNumber) === normalize(CUSTOMER_ORG) &&
      normalize(item.name) === normalize(CUSTOMER_NAME),
    "customer",
  );

  const employeeRes = await api<TripletexList<Employee>>("GET", "/employee", {
    query: {
      email: EMPLOYEE_EMAIL,
      count: 10,
      fields: "*",
    },
  });
  const employee = exactOne(
    employeeRes.values,
    (item) => normalize(item.email) === normalize(EMPLOYEE_EMAIL),
    "employee",
  );

  const projectRes = await api<TripletexList<Project>>("GET", "/project", {
    query: {
      name: PROJECT_NAME,
      customerId: customer.id,
      count: 50,
      fields: "*,customer(*),vatType(*),projectHourlyRates(*,projectSpecificRates(*,employee(*),activity(*)))",
    },
  });
  const project = exactOne(
    projectRes.values,
    (item) =>
      normalize(item.name) === normalize(PROJECT_NAME) &&
      item.customer?.id === customer.id &&
      item.isClosed !== true,
    "project",
  );

  const activityRes = await api<TripletexList<Activity>>("GET", "/activity/>forTimeSheet", {
    query: {
      projectId: project.id,
      employeeId: employee.id,
      date: DATE,
      filterExistingHours: false,
      query: ACTIVITY_NAME,
      count: 1000,
      fields: "*",
    },
  });
  const activity = exactOne(
    activityRes.values,
    (item) => normalize(item.name) === normalize(ACTIVITY_NAME),
    "activity",
  );

  const activeRate = latestApplicableRate(project);
  const exactSpecificRate = activeRate?.projectSpecificRates?.find(
    (item) =>
      item.employee?.id === employee.id &&
      item.activity?.id === activity.id &&
      item.hourlyRate === RATE,
  );
  const activeFixedRateMatches =
    activeRate?.hourlyRateModel === "TYPE_FIXED_HOURLY_RATE" && activeRate.fixedRate === RATE;

  if (!exactSpecificRate && !activeFixedRateMatches) {
    if (activeRate?.id && activeRate.hourlyRateModel === "TYPE_PROJECT_SPECIFIC_HOURLY_RATES") {
      const mergedRates = [...(activeRate.projectSpecificRates ?? [])];
      const existingIndex = mergedRates.findIndex(
        (item) => item.employee?.id === employee.id && item.activity?.id === activity.id,
      );
      const newRate = {
        employee: { id: employee.id },
        activity: { id: activity.id },
        hourlyRate: RATE,
      };
      if (existingIndex >= 0) mergedRates[existingIndex] = { ...mergedRates[existingIndex], ...newRate };
      else mergedRates.push(newRate);

      await api("PUT", `/project/hourlyRates/${activeRate.id}`, {
        body: {
          project: { id: project.id },
          startDate: activeRate.startDate ?? DATE,
          showInProjectOrder: activeRate.showInProjectOrder ?? true,
          hourlyRateModel: "TYPE_PROJECT_SPECIFIC_HOURLY_RATES",
          projectSpecificRates: mergedRates.map((item) => ({
            employee: { id: item.employee!.id },
            activity: { id: item.activity!.id },
            hourlyRate: item.hourlyRate,
            ...(item.hourlyCostPercentage !== undefined
              ? { hourlyCostPercentage: item.hourlyCostPercentage }
              : {}),
          })),
        },
      });
    } else {
      await api("POST", "/project/hourlyRates", {
        body: {
          project: { id: project.id },
          startDate: DATE,
          showInProjectOrder: true,
          hourlyRateModel: "TYPE_PROJECT_SPECIFIC_HOURLY_RATES",
          projectSpecificRates: [
            {
              employee: { id: employee.id },
              activity: { id: activity.id },
              hourlyRate: RATE,
            },
          ],
        },
      });
    }
  }

  const timesheetRes = await api<TripletexValue<TimesheetEntry>>("POST", "/timesheet/entry", {
    body: {
      employee: { id: employee.id },
      project: { id: project.id },
      activity: { id: activity.id },
      date: DATE,
      hours: HOURS,
      projectChargeableHours: HOURS,
    },
  });
  if (!timesheetRes.value) throw new Error("missing timesheet response");

  const orderBody: Record<string, unknown> = {
    customer: { id: customer.id },
    project: { id: project.id },
    orderDate: DATE,
    deliveryDate: DATE,
    orderLines: [
      {
        description: `${ACTIVITY_NAME} (${HOURS} h)`,
        count: HOURS,
        unitPriceExcludingVatCurrency: RATE,
        ...(project.vatType?.id ? { vatType: { id: project.vatType.id } } : {}),
      },
    ],
  };

  const orderRes = await api<TripletexValue<Order>>("POST", "/order", {
    body: orderBody,
  });
  if (!orderRes.value?.id) throw new Error("missing order id");

  const invoice = await invoiceOrder(orderRes.value.id);

  const result = {
    customerId: customer.id,
    employeeId: employee.id,
    projectId: project.id,
    activityId: activity.id,
    timesheetEntryId: timesheetRes.value.id,
    timesheetHourlyRate: timesheetRes.value.hourlyRate ?? null,
    orderId: orderRes.value.id,
    invoiceId: invoice.id,
    invoiceNumber: invoice.invoiceNumber ?? null,
    amountExcludingVatCurrency: invoice.amountExcludingVatCurrency ?? null,
    amountCurrency: invoice.amountCurrency ?? null,
    amountCurrencyOutstanding: invoice.amountCurrencyOutstanding ?? invoice.amountOutstanding ?? null,
  };

  console.log(JSON.stringify(result, null, 2));
}

await main();
