const BASE_URL = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN =
  "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";

const RUN_DATE = "2026-03-20";
const PERIOD_START = "2026-03-01";
const YEAR = 2026;
const MONTH = 3;
const BASE_SALARY = 50400;
const BONUS = 7050;
const suffix = `${Date.now()}`.slice(-6);

const authHeader = `Basic ${Buffer.from(`0:${TOKEN}`).toString("base64")}`;

type Link = { id: number; name?: string | null; displayName?: string | null };
type WrappedList<T> = { values: T[] };
type WrappedValue<T> = { value: T };

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const base = BASE_URL.endsWith("/") ? BASE_URL : `${BASE_URL}/`;
  const url = new URL(path.replace(/^\//, ""), base);
  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: authHeader,
      Accept: "application/json",
      ...(init?.body ? { "Content-Type": "application/json; charset=utf-8" } : {}),
      ...(init?.headers ?? {}),
    },
  });
  const text = await response.text();
  let body: unknown = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }
  if (!response.ok) {
    const error = new Error(`${response.status} ${response.statusText} ${path}`);
    (error as Error & { status?: number; body?: unknown }).status = response.status;
    (error as Error & { status?: number; body?: unknown }).body = body;
    throw error;
  }
  return body as T;
}

async function maybeApi<T>(path: string, init?: RequestInit) {
  try {
    return await api<T>(path, init);
  } catch (error) {
    return {
      error: (error as Error).message,
      status: (error as { status?: number }).status ?? null,
      body: (error as { body?: unknown }).body ?? null,
    };
  }
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
    if (checksum !== null) return [...body, checksum].join("");
  }
  throw new Error("failed to generate org number");
}

function computeBankChecksum(digits: number[]): number | null {
  const weights = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  const sum = digits.reduce((acc, digit, index) => acc + digit * weights[index], 0);
  const remainder = 11 - (sum % 11);
  if (remainder === 11) return 0;
  if (remainder === 10) return null;
  return remainder;
}

function generateBankAccountNumber(): string {
  for (let i = 0; i < 10000; i += 1) {
    const body = Array.from({ length: 10 }, () => Math.floor(Math.random() * 10));
    const checksum = computeBankChecksum(body);
    if (checksum !== null) return [...body, checksum].join("");
  }
  throw new Error("failed to generate bank account");
}

async function maybePdf(path: string) {
  const base = BASE_URL.endsWith("/") ? BASE_URL : `${BASE_URL}/`;
  const url = new URL(path.replace(/^\//, ""), base);
  const response = await fetch(url, {
    headers: {
      Authorization: authHeader,
      Accept: "application/octet-stream,application/json",
    },
  });
  const contentType = response.headers.get("content-type") ?? "";
  if (response.ok) {
    const buffer = await response.arrayBuffer();
    return { status: response.status, contentType, bytes: buffer.byteLength };
  }
  const text = await response.text();
  let body: unknown = text;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    // Keep raw text.
  }
  return { status: response.status, contentType, body };
}

const departmentRes = await api<WrappedList<Link>>("department?isInactive=false&count=1&fields=*");
const department = departmentRes.values[0];
if (!department?.id) throw new Error("no department");

const municipalityRes = await api<WrappedList<Link>>("municipality/query?query=Oslo&count=5&fields=*");
const municipality = municipalityRes.values[0];
if (!municipality?.id) throw new Error("no municipality");

const divisionRes = await api<WrappedValue<{ id: number }>>("division", {
  method: "POST",
  body: JSON.stringify({
    name: `Payroll Fresh Division ${suffix}`,
    startDate: PERIOD_START,
    organizationNumber: generateOrgNumber(),
    municipalityDate: PERIOD_START,
    municipality: { id: municipality.id },
  }),
});

const employeeRes = await api<WrappedValue<{ id: number }>>("employee", {
  method: "POST",
  body: JSON.stringify({
    firstName: "Fresh",
    lastName: `Payroll ${suffix}`,
    email: `fresh-payroll-${suffix}@example.org`,
    userType: "NO_ACCESS",
    department: { id: department.id },
    dateOfBirth: "1990-01-01",
    bankAccountNumber: generateBankAccountNumber(),
    address: {
      addressLine1: "Karl Johans gate 1",
      postalCode: "0154",
      city: "Oslo",
    },
  }),
});

const employeeId = employeeRes.value.id;

const employmentRes = await api<WrappedValue<{ id: number }>>("employee/employment", {
  method: "POST",
  body: JSON.stringify({
    employee: { id: employeeId },
    division: { id: divisionRes.value.id },
    startDate: PERIOD_START,
    isMainEmployer: true,
    taxDeductionCode: "loennFraHovedarbeidsgiver",
  }),
});

const employmentDetailsRes = await api<WrappedValue<{ id: number }>>("employee/employment/details", {
  method: "POST",
  body: JSON.stringify({
    employment: { id: employmentRes.value.id },
    date: PERIOD_START,
    employmentType: "ORDINARY",
    employmentForm: "PERMANENT",
    remunerationType: "MONTHLY_WAGE",
    workingHoursScheme: "NOT_SHIFT",
    percentageOfFullTimeEquivalent: 100,
    annualSalary: BASE_SALARY * 12,
  }),
});

const salaryTypeRes = await api<WrappedList<Link>>("salary/type?count=1000&fields=*");
const fastlonn = salaryTypeRes.values.find((value) => value.name === "Fastlønn");
const bonusType = salaryTypeRes.values.find((value) => value.name === "Bonus");
if (!fastlonn?.id || !bonusType?.id) throw new Error("missing salary types");

const transactionRes = await api<WrappedValue<{ id: number; payslips?: Array<{ id?: number }> }>>(
  "salary/transaction?generateTaxDeduction=true",
  {
    method: "POST",
    body: JSON.stringify({
      date: RUN_DATE,
      year: YEAR,
      month: MONTH,
      paySlipsAvailableDate: RUN_DATE,
      payslips: [
        {
          employee: { id: employeeId },
          date: RUN_DATE,
          year: YEAR,
          month: MONTH,
          specifications: [
            {
              salaryType: { id: fastlonn.id },
              description: "Fastlønn mars 2026",
              year: YEAR,
              month: MONTH,
              count: 1,
              rate: BASE_SALARY,
              amount: BASE_SALARY,
            },
            {
              salaryType: { id: bonusType.id },
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
    }),
  },
);

const transactionId = transactionRes.value.id;
const transactionRead = await api<WrappedValue<any>>(`salary/transaction/${transactionId}?fields=*`);
const payslipId = transactionRead.value.payslips?.[0]?.id;
if (!payslipId) throw new Error("missing payslip id");

const payslipRead = await api<any>(`salary/payslip/${payslipId}?fields=*,specifications(*,salaryType(*))`);
const payslipSearchByEmployee = await maybeApi<any>(
  `salary/payslip?employeeId=${employeeId}&yearFrom=2026&yearTo=2026&monthFrom=3&monthTo=4&count=1000&fields=*`,
);
const payslipSearchById = await maybeApi<any>(`salary/payslip?id=${payslipId}&count=1000&fields=*`);
const compilation = await maybeApi<any>(`salary/compilation?employeeId=${employeeId}&year=2026&fields=*`);
const compilationPdf = await maybePdf(`salary/compilation/pdf?employeeId=${employeeId}&year=2026`);
const payslipPdf = await maybePdf(`salary/payslip/${payslipId}/pdf`);
const postings = await maybeApi<any>(
  `ledger/posting?employeeId=${employeeId}&dateFrom=${RUN_DATE}&dateTo=${RUN_DATE}&type=WAGE&fields=*`,
);
const vouchers = await maybeApi<any>(
  `ledger/voucher?dateFrom=${RUN_DATE}&dateTo=2026-03-21&description=L%C3%B8nn&fields=*`,
);

console.log(
  JSON.stringify(
    {
      employeeId,
      divisionId: divisionRes.value.id,
      employmentId: employmentRes.value.id,
      employmentDetailsId: employmentDetailsRes.value.id,
      transactionId,
      payslipId,
      payslipRead,
      payslipSearchByEmployee,
      payslipSearchById,
      compilation,
      compilationPdf,
      payslipPdf,
      postings,
      vouchers,
    },
    null,
    2,
  ),
);
