import { Buffer } from "node:buffer";

const BASE_URL = process.env.TRIPLETEX_BASE_URL;
const TOKEN = process.env.TRIPLETEX_TOKEN;

if (!BASE_URL) throw new Error("Missing TRIPLETEX_BASE_URL");
if (!TOKEN) throw new Error("Missing TRIPLETEX_TOKEN");

const DATE = "2026-03-20";
const CUSTOMER_NAME = "Strandvik AS";
const CUSTOMER_ORG = "906155605";
const CUSTOMER_EMAIL = "post@strandvik.example.org";
const EMPLOYEE_EMAIL = "sigrid.haugen@example.org";
const PROJECT_NAME = "Nettbutikk-utvikling";
const ACTIVITY_NAME = "Rådgivning";

type Json = Record<string, any>;

class ApiError extends Error {
  status: number;
  body: any;
  method: string;
  path: string;

  constructor(method: string, path: string, status: number, body: any) {
    super(`${method} ${path} failed with ${status}`);
    this.status = status;
    this.body = body;
    this.method = method;
    this.path = path;
  }
}

function authHeader() {
  return `Basic ${Buffer.from(`0:${TOKEN}`).toString("base64")}`;
}

function buildUrl(path: string, query?: Record<string, any>) {
  const normalizedPath = path.startsWith("/") ? path.slice(1) : path;
  const url = new URL(normalizedPath, BASE_URL.endsWith("/") ? BASE_URL : `${BASE_URL}/`);
  for (const [key, raw] of Object.entries(query ?? {})) {
    if (raw === undefined || raw === null) continue;
    if (Array.isArray(raw)) {
      for (const value of raw) url.searchParams.append(key, String(value));
    } else {
      url.searchParams.set(key, String(raw));
    }
  }
  return url;
}

async function api<T = any>(method: string, path: string, opts: { query?: Record<string, any>; body?: any } = {}): Promise<T> {
  const url = buildUrl(path, opts.query);
  const response = await fetch(url, {
    method,
    headers: {
      Authorization: authHeader(),
      Accept: "application/json",
      ...(opts.body !== undefined ? { "Content-Type": "application/json; charset=utf-8" } : {}),
    },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) : null;
  if (!response.ok) throw new ApiError(method, `${path}${url.search}`, response.status, body);
  return body as T;
}

function norm(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function expectOne<T>(items: T[], label: string) {
  if (items.length !== 1) throw new Error(`Expected exactly one ${label}, got ${items.length}`);
  return items[0]!;
}

function validationText(body: any) {
  return JSON.stringify(body?.validationMessages ?? body);
}

async function resolveAssignableProjectManager() {
  const response = await api<Json>("GET", "/employee", {
    query: { assignableProjectManagers: true, count: 10, fields: "*" },
  });
  const values = response.values ?? [];
  if (values.length === 0) throw new Error("No assignable project manager found in sandbox");
  return values[0];
}

async function getOrCreateCustomer() {
  const search = await api<Json>("GET", "/customer", {
    query: { organizationNumber: CUSTOMER_ORG, count: 10, fields: "*" },
  });
  const exact = (search.values ?? []).filter(
    (item: any) => norm(item.organizationNumber) === norm(CUSTOMER_ORG) && norm(item.name) === norm(CUSTOMER_NAME),
  );
  if (exact.length > 0) return exact[0];

  const created = await api<Json>("POST", "/customer", {
    body: {
      name: CUSTOMER_NAME,
      email: CUSTOMER_EMAIL,
      organizationNumber: CUSTOMER_ORG,
    },
  });
  return created.value;
}

async function getOrCreateEmployee() {
  const search = await api<Json>("GET", "/employee", {
    query: { email: EMPLOYEE_EMAIL, count: 10, fields: "*" },
  });
  const exact = (search.values ?? []).filter((item: any) => norm(item.email) === norm(EMPLOYEE_EMAIL));
  if (exact.length > 0) return exact[0];

  const baseBody: any = {
    firstName: "Sigrid",
    lastName: "Haugen",
    dateOfBirth: "1990-04-12",
    email: EMPLOYEE_EMAIL,
    userType: "NO_ACCESS",
    employments: [{ startDate: DATE }],
  };

  try {
    return (await api<Json>("POST", "/employee", { body: baseBody })).value;
  } catch (error) {
    if (!(error instanceof ApiError) || error.status !== 422) throw error;

    let body = { ...baseBody };
    const firstValidation = validationText(error.body);

    if (firstValidation.includes("department.id")) {
      const departmentResp = await api<Json>("GET", "/department", {
        query: { isInactive: false, count: 1, fields: "*" },
      });
      let department = departmentResp.values?.[0];
      if (!department) {
        const createdDepartment = await api<Json>("POST", "/department", {
          body: { name: "Default department" },
        });
        department = createdDepartment.value;
      }
      body = { ...body, department: { id: department.id } };
    }

    try {
      return (await api<Json>("POST", "/employee", { body })).value;
    } catch (secondError) {
      if (!(secondError instanceof ApiError) || secondError.status !== 422) throw secondError;
      const secondValidation = validationText(secondError.body);
      if (!secondValidation.includes("employments.division.id")) throw secondError;

      const divisionResp = await api<Json>("GET", "/division", {
        query: { count: 1, fields: "*" },
      });
      const division = divisionResp.values?.[0];
      if (!division) throw new Error("No division found for employee creation");

      const retryBody = {
        ...body,
        employments: [{ startDate: DATE, division: { id: division.id } }],
      };
      return (await api<Json>("POST", "/employee", { body: retryBody })).value;
    }
  }
}

async function getOrCreateProject(customerId: number, projectManagerId: number) {
  const search = await api<Json>("GET", "/project", {
    query: { name: PROJECT_NAME, count: 50, fields: "*,customer(*)" },
  });
  const exact = (search.values ?? []).filter(
    (item: any) =>
      norm(item.name) === norm(PROJECT_NAME) && Number(item.customer?.id) === Number(customerId),
  );
  if (exact.length > 0) return exact[0];

  const created = await api<Json>("POST", "/project", {
    body: {
      name: PROJECT_NAME,
      startDate: DATE,
      customer: { id: customerId },
      projectManager: { id: projectManagerId },
    },
  });
  return created.value;
}

async function ensureProjectParticipant(projectId: number, employeeId: number) {
  try {
    const created = await api<Json>("POST", "/project/participant", {
      body: {
        project: { id: projectId },
        employee: { id: employeeId },
        adminAccess: false,
      },
    });
    return created.value;
  } catch (error) {
    if (
      error instanceof ApiError &&
      (error.status === 400 || error.status === 409 || error.status === 422) &&
      /already|eksisterer|duplicate/i.test(JSON.stringify(error.body))
    ) {
      return { project: { id: projectId }, employee: { id: employeeId }, duplicate: true };
    }
    throw error;
  }
}

async function getOrCreateActivity() {
  const search = await api<Json>("GET", "/activity", {
    query: { name: ACTIVITY_NAME, isChargeable: true, count: 50, fields: "*" },
  });
  const exact = (search.values ?? []).filter(
    (item: any) => norm(item.name) === norm(ACTIVITY_NAME) && item.isChargeable === true,
  );
  if (exact.length > 0) return exact[0];

  const created = await api<Json>("POST", "/activity", {
    body: {
      name: ACTIVITY_NAME,
      activityType: "PROJECT_GENERAL_ACTIVITY",
      isChargeable: true,
    },
  });
  return created.value;
}

async function confirmTimeSheetActivity(projectId: number, employeeId: number) {
  const response = await api<Json>("GET", "/activity/>forTimeSheet", {
    query: {
      projectId,
      employeeId,
      date: DATE,
      query: ACTIVITY_NAME,
      filterExistingHours: false,
      count: 50,
      fields: "*",
    },
  });
  const exact = (response.values ?? []).filter((item: any) => norm(item.name) === norm(ACTIVITY_NAME));
  return exact[0] ?? null;
}

const customer = await getOrCreateCustomer();
const manager = await resolveAssignableProjectManager();
const employee = await getOrCreateEmployee();
const project = await getOrCreateProject(customer.id, manager.id);
await ensureProjectParticipant(project.id, employee.id);
const activity = await getOrCreateActivity();
const availableActivity = await confirmTimeSheetActivity(project.id, employee.id);

console.log(
  JSON.stringify(
    {
      customerId: customer.id,
      employeeId: employee.id,
      projectId: project.id,
      projectManagerId: manager.id,
      activityId: activity.id,
      availableActivityId: availableActivity?.id ?? null,
      availableActivityChargeable: availableActivity?.isChargeable ?? null,
    },
    null,
    2,
  ),
);
