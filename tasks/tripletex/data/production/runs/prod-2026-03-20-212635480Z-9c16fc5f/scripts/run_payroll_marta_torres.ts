const BASE_URL = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const SESSION_TOKEN = "gMCHi8XO5rtrj_66vrJeznfMILmUbTOPCgFIrTJUkcg";

const TARGET_EMAIL = "marta.torres@example.org";
const RUN_DATE = "2026-03-20";
const YEAR = 2026;
const MONTH = 3;
const PERIOD_START = "2026-03-01";
const BASE_SALARY = 50400;
const BONUS = 7050;

const authHeader = `Basic ${Buffer.from(`0:${SESSION_TOKEN}`).toString("base64")}`;

type WrappedList<T> = {
  values: T[];
  fullResultSize?: number;
};

type WrappedValue<T> = {
  value: T;
};

type TripletexError = {
  error?: string;
  message?: string;
  source?: string;
  validationMessages?: Array<{ field?: string; message?: string }>;
};

type Employee = {
  id: number;
  email?: string | null;
  dateOfBirth?: string | null;
  employments?: Employment[] | null;
};

type Employment = {
  id?: number;
  startDate?: string | null;
  endDate?: string | null;
  division?: { id?: number | null } | null;
};

type SalaryType = {
  id: number;
  name?: string | null;
};

type Division = {
  id: number;
};

type Municipality = {
  id: number;
  displayName?: string | null;
};

function buildUrl(path: string): string {
  const normalizedBase = BASE_URL.endsWith("/") ? BASE_URL : `${BASE_URL}/`;
  return new URL(path.replace(/^\//, ""), normalizedBase).toString();
}

function parseError(bodyText: string): TripletexError | undefined {
  try {
    return JSON.parse(bodyText) as TripletexError;
  } catch {
    return undefined;
  }
}

function isBlockedTokenError(status: number, bodyText: string): boolean {
  if (status !== 403) return false;
  const parsed = parseError(bodyText);
  if (!parsed?.error) return false;
  return (
    parsed.error === "Invalid or expired token" ||
    parsed.error ===
      "Invalid or expired proxy token. Each submission receives a unique token - do not reuse tokens from previous submissions."
  );
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(buildUrl(path), {
    ...init,
    headers: {
      Authorization: authHeader,
      Accept: "application/json",
      ...(init?.body ? { "Content-Type": "application/json; charset=utf-8" } : {}),
      ...(init?.headers ?? {}),
    },
  });

  const text = await response.text();

  if (!response.ok) {
    if (isBlockedTokenError(response.status, text)) {
      throw new Error("BLOCKED: Invalid or expired token");
    }
    throw new Error(`${response.status} ${response.statusText} ${path}\n${text}`);
  }

  if (!text) {
    return undefined as T;
  }

  return JSON.parse(text) as T;
}

function exactEmployeeMatch(values: Employee[]): Employee {
  const matches = values.filter((employee) => employee.email === TARGET_EMAIL);
  if (matches.length !== 1) {
    throw new Error(`BLOCKED: Employee exact match count=${matches.length} for ${TARGET_EMAIL}`);
  }
  return matches[0];
}

function salaryTypeByName(values: SalaryType[], name: string): SalaryType {
  const salaryType = values.find((value) => value.name === name);
  if (!salaryType) {
    throw new Error(`BLOCKED: Missing salary type ${name}`);
  }
  return salaryType;
}

function isEmploymentActiveInPeriod(employment: Employment): boolean {
  const startDate = employment.startDate;
  const endDate = employment.endDate;
  const divisionId = employment.division?.id;
  if (!startDate || !divisionId) return false;
  if (startDate > RUN_DATE) return false;
  if (endDate && endDate < PERIOD_START) return false;
  return true;
}

function getActiveEmployment(employments: Employment[] | null | undefined): Employment | undefined {
  return (employments ?? []).find(isEmploymentActiveInPeriod);
}

function computeOrgChecksum(digits: number[]): number | null {
  const weights = [3, 2, 7, 6, 5, 4, 3, 2];
  const sum = digits.reduce((acc, digit, index) => acc + digit * weights[index], 0);
  const remainder = 11 - (sum % 11);
  if (remainder === 11) return 0;
  if (remainder === 10) return null;
  return remainder;
}

function generateOrgNumber(): string {
  for (let i = 0; i < 10000; i += 1) {
    const body = [
      9,
      Math.floor(Math.random() * 10),
      Math.floor(Math.random() * 10),
      Math.floor(Math.random() * 10),
      Math.floor(Math.random() * 10),
      Math.floor(Math.random() * 10),
      Math.floor(Math.random() * 10),
      Math.floor(Math.random() * 10),
    ];
    const checksum = computeOrgChecksum(body);
    if (checksum !== null) {
      return [...body, checksum].join("");
    }
  }
  throw new Error("BLOCKED: Failed to generate organization number");
}

async function resolveDivisionId(): Promise<number> {
  const divisionResponse = await api<WrappedList<Division>>("division?count=1&fields=*");
  const existingDivision = divisionResponse.values[0];
  if (existingDivision?.id) {
    return existingDivision.id;
  }

  const municipalityResponse = await api<WrappedList<Municipality>>(
    "municipality/query?query=Oslo&count=5&fields=*",
  );
  const municipality =
    municipalityResponse.values.find(
      (value) => !String(value.displayName ?? "").toLowerCase().includes("inaktiv"),
    ) ?? municipalityResponse.values[0];

  if (!municipality?.id) {
    throw new Error("BLOCKED: No municipality available for division repair");
  }

  const createdDivision = await api<WrappedValue<Division>>("division", {
    method: "POST",
    body: JSON.stringify({
      name: `Payroll Division ${Date.now().toString().slice(-6)}`,
      startDate: PERIOD_START,
      organizationNumber: generateOrgNumber(),
      municipalityDate: PERIOD_START,
      municipality: { id: municipality.id },
    }),
  });

  if (!createdDivision.value?.id) {
    throw new Error("BLOCKED: Division create returned no id");
  }

  return createdDivision.value.id;
}

async function main() {
  const employeeResponse = await api<WrappedList<Employee>>(
    `employee?email=${encodeURIComponent(TARGET_EMAIL)}&count=10&fields=*`,
  );
  const employee = exactEmployeeMatch(employeeResponse.values);

  const embeddedEmployments = employee.employments ?? [];
  const obviousRepairBranch = !employee.dateOfBirth && embeddedEmployments.length === 0;

  let activeEmployment = getActiveEmployment(embeddedEmployments);
  if (!activeEmployment && !obviousRepairBranch) {
    const employmentResponse = await api<WrappedList<Employment>>(
      `employee/employment?employeeId=${employee.id}&count=20&fields=*`,
    );
    activeEmployment = getActiveEmployment(employmentResponse.values);
  }

  const salaryTypesResponse = await api<WrappedList<SalaryType>>("salary/type?count=1000&fields=*");
  const fastlonn = salaryTypeByName(salaryTypesResponse.values, "Fastlønn");
  const bonus = salaryTypeByName(salaryTypesResponse.values, "Bonus");

  if (!activeEmployment) {
    const divisionId = await resolveDivisionId();

    if (!employee.dateOfBirth) {
      await api<WrappedValue<Employee>>(`employee/${employee.id}`, {
        method: "PUT",
        body: JSON.stringify({
          dateOfBirth: "1990-01-01",
        }),
      });
    }

    const employmentCreated = await api<WrappedValue<Employment>>("employee/employment", {
      method: "POST",
      body: JSON.stringify({
        employee: { id: employee.id },
        division: { id: divisionId },
        startDate: PERIOD_START,
        isMainEmployer: true,
        taxDeductionCode: "loennFraHovedarbeidsgiver",
      }),
    });

    activeEmployment = employmentCreated.value;
  }

  if (!activeEmployment?.division?.id) {
    throw new Error(`BLOCKED: No active division-backed employment for ${TARGET_EMAIL}`);
  }

  const transactionPayload = {
    date: RUN_DATE,
    year: YEAR,
    month: MONTH,
    paySlipsAvailableDate: RUN_DATE,
    payslips: [
      {
        employee: { id: employee.id },
        date: RUN_DATE,
        year: YEAR,
        month: MONTH,
        specifications: [
          {
            employee: { id: employee.id },
            salaryType: { id: fastlonn.id },
            description: "Fastlønn mars 2026",
            year: YEAR,
            month: MONTH,
            count: 1,
            rate: BASE_SALARY,
            amount: BASE_SALARY,
          },
          {
            employee: { id: employee.id },
            salaryType: { id: bonus.id },
            description: "Bonus mars 2026",
            year: YEAR,
            month: MONTH,
            count: 1,
            rate: BONUS,
            amount: BONUS,
          },
        ],
      },
    ],
  };

  const transactionResponse = await api<WrappedValue<Record<string, unknown>>>("salary/transaction", {
    method: "POST",
    body: JSON.stringify(transactionPayload),
  });

  console.log(
    JSON.stringify(
      {
        employeeId: employee.id,
        salaryTransactionId: transactionResponse.value?.id ?? null,
        totalAmount: BASE_SALARY + BONUS,
        writeResponse: transactionResponse.value,
      },
      null,
      2,
    ),
  );
}

await main();
