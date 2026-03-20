const BASE_URL = "https://kkpqfuj-amager.tripletex.dev/v2";
const SESSION_TOKEN =
  "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";

const RUN_DATE = "2026-03-20";
const PERIOD_START = "2026-03-01";
const YEAR = 2026;
const MONTH = 3;
const BASE_SALARY = 50400;
const BONUS = 7050;
const suffix = `${Date.now()}`.slice(-6);

const authHeader = `Basic ${Buffer.from(`0:${SESSION_TOKEN}`).toString("base64")}`;

type WrappedList<T> = { values: T[] };
type WrappedValue<T> = { value: T };
type Link = { id: number; name?: string | null; displayName?: string | null };

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
  if (!response.ok) throw new Error(`${response.status} ${response.statusText} ${path}\n${text}`);
  return (text ? JSON.parse(text) : undefined) as T;
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

const departmentRes = await api<WrappedList<Link>>("department?isInactive=false&count=1&fields=*");
const department = departmentRes.values[0];
if (!department?.id) throw new Error("no department");

const municipalityRes = await api<WrappedList<Link>>("municipality/query?query=Oslo&count=5&fields=*");
const municipality =
  municipalityRes.values.find((value) => !String(value.displayName ?? "").toLowerCase().includes("inaktiv")) ??
  municipalityRes.values[0];
if (!municipality?.id) throw new Error("no municipality");

const divisionRes = await api<WrappedValue<Link>>("division", {
  method: "POST",
  body: JSON.stringify({
    name: `Payroll Visibility Division ${suffix}`,
    startDate: PERIOD_START,
    organizationNumber: generateOrgNumber(),
    municipalityDate: PERIOD_START,
    municipality: { id: municipality.id },
  }),
});
const divisionId = divisionRes.value.id;

const employeeRes = await api<WrappedValue<{ id: number }>>("employee", {
  method: "POST",
  body: JSON.stringify({
    firstName: "Payroll",
    lastName: `Visibility ${suffix}`,
    email: `payroll-visibility-${suffix}@example.org`,
    userType: "NO_ACCESS",
    department: { id: department.id },
  }),
});
const employeeId = employeeRes.value.id;

await api(`employee/${employeeId}`, {
  method: "PUT",
  body: JSON.stringify({ dateOfBirth: "1990-01-01" }),
});

const employmentRes = await api<WrappedValue<{ id: number }>>("employee/employment", {
  method: "POST",
  body: JSON.stringify({
    employee: { id: employeeId },
    division: { id: divisionId },
    startDate: PERIOD_START,
    isMainEmployer: true,
    taxDeductionCode: "loennFraHovedarbeidsgiver",
  }),
});
const employmentId = employmentRes.value.id;

const employmentDetailsRes = await api<WrappedValue<{ id: number }>>("employee/employment/details", {
  method: "POST",
  body: JSON.stringify({
    employment: { id: employmentId },
    date: PERIOD_START,
    employmentType: "NOT_CHOSEN",
    employmentForm: "NOT_CHOSEN",
    remunerationType: "MONTHLY_WAGE",
    workingHoursScheme: "NOT_CHOSEN",
    shiftDurationHours: 0,
    percentageOfFullTimeEquivalent: 100,
    annualSalary: BASE_SALARY * 12,
  }),
});

const salaryTypeRes = await api<WrappedList<{ id: number; name?: string | null }>>("salary/type?count=1000&fields=*");
const fastlonn = salaryTypeRes.values.find((value) => value.name === "Fastlønn");
const bonusType = salaryTypeRes.values.find((value) => value.name === "Bonus");
if (!fastlonn?.id || !bonusType?.id) throw new Error("missing salary types");

const transactionRes = await api<WrappedValue<{ id: number; payslips?: Array<{ id?: number }> }>>("salary/transaction", {
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
            employee: { id: employeeId },
            salaryType: { id: fastlonn.id },
            description: "Fastlønn mars 2026",
            year: YEAR,
            month: MONTH,
            count: 1,
            rate: BASE_SALARY,
            amount: BASE_SALARY,
          },
          {
            employee: { id: employeeId },
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
});

const transactionId = transactionRes.value.id;
const transactionRead = await api<WrappedValue<{ payslips?: Array<{ id?: number }> }>>(`salary/transaction/${transactionId}?fields=*`);
const payslipId = transactionRead.value.payslips?.[0]?.id;
if (!payslipId) throw new Error("missing payslip id");

const payslipRead = await api(`salary/payslip/${payslipId}?fields=*,specifications(*,salaryType(*),employee(*))`);
const payslipSearch = await api(
  `salary/payslip?employeeId=${employeeId}&yearFrom=2026&yearTo=2026&monthFrom=3&monthTo=4&count=1000&fields=*`,
);
const compilation = await api(`salary/compilation?employeeId=${employeeId}&year=2026&fields=*`);

console.log(
  JSON.stringify(
    {
      employeeId,
      divisionId,
      employmentId,
      employmentDetailsId: employmentDetailsRes.value.id,
      transactionId,
      payslipId,
      payslipRead,
      payslipSearch,
      compilation,
    },
    null,
    2,
  ),
);
