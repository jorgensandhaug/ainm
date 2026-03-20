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

type WrappedList<T> = { values: T[] };
type WrappedValue<T> = { value: T };

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const url = new URL(path.replace(/^\//, ""), `${BASE_URL}/`);
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
    throw new Error(`${response.status} ${path} ${JSON.stringify(body)}`);
  }
  return body as T;
}

async function maybe(path: string) {
  try {
    return await api<any>(path);
  } catch (error) {
    return { error: String(error) };
  }
}

function computeMod11(body: number[], weights: number[]) {
  const sum = body.reduce((acc, digit, index) => acc + digit * weights[index], 0);
  const remainder = 11 - (sum % 11);
  if (remainder === 11) return 0;
  if (remainder === 10) return null;
  return remainder;
}

function generateBankAccountNumber() {
  for (let i = 0; i < 10000; i += 1) {
    const body = Array.from({ length: 10 }, () => Math.floor(Math.random() * 10));
    const checksum = computeMod11(body, [5, 4, 3, 2, 7, 6, 5, 4, 3, 2]);
    if (checksum !== null) return [...body, checksum].join("");
  }
  throw new Error("failed to generate bank account");
}

function generateOrgNumber() {
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
    const checksum = computeMod11(body, [3, 2, 7, 6, 5, 4, 3, 2]);
    if (checksum !== null) return [...body, checksum].join("");
  }
  throw new Error("failed to generate org number");
}

function generateNationalIdentityNumber() {
  const dd = "01";
  const mm = "01";
  const yy = "90";
  for (let individ = 500; individ <= 999; individ += 1) {
    const individStr = String(individ).padStart(3, "0");
    const first9 = `${dd}${mm}${yy}${individStr}`.split("").map(Number);
    const k1 = computeMod11(first9, [3, 7, 6, 1, 8, 9, 4, 5, 2]);
    if (k1 === null) continue;
    const k2 = computeMod11([...first9, k1], [5, 4, 3, 2, 7, 6, 5, 4, 3, 2]);
    if (k2 === null) continue;
    return `${dd}${mm}${yy}${individStr}${k1}${k2}`;
  }
  throw new Error("failed to generate fnr");
}

const departmentRes = await api<WrappedList<{ id: number }>>("department?isInactive=false&count=1&fields=*");
const department = departmentRes.values[0];
const municipalityRes = await api<WrappedValue<{ id: number }>>("salary/settings?fields=*");
const municipalityId = municipalityRes.value.municipality.id;
const divisionRes = await api<WrappedValue<{ id: number }>>("division", {
  method: "POST",
  body: JSON.stringify({
    name: `Payroll Full Basis ${suffix}`,
    startDate: PERIOD_START,
    organizationNumber: generateOrgNumber(),
    municipalityDate: PERIOD_START,
    municipality: { id: municipalityId },
  }),
});
const occupationCodeRes = await api<WrappedList<{ id: number; code?: string; name?: string }>>(
  "employee/employment/occupationCode?count=1&fields=*",
);
const occupationCode = occupationCodeRes.values[0];
const salaryTypes = await api<WrappedList<{ id: number; name: string }>>("salary/type?count=1000&fields=*");
const fastlonn = salaryTypes.values.find((type) => type.name === "Fastlønn");
const bonusType = salaryTypes.values.find((type) => type.name === "Bonus");
if (!department?.id || !occupationCode?.id || !fastlonn?.id || !bonusType?.id) {
  throw new Error("missing prerequisite ids");
}

const employeeRes = await api<WrappedValue<{ id: number }>>("employee", {
  method: "POST",
  body: JSON.stringify({
    firstName: "Full",
    lastName: `Payroll ${suffix}`,
    email: `full-payroll-${suffix}@example.org`,
    userType: "NO_ACCESS",
    department: { id: department.id },
    dateOfBirth: "1990-01-01",
    nationalIdentityNumber: generateNationalIdentityNumber(),
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
    occupationCode: { id: occupationCode.id },
    percentageOfFullTimeEquivalent: 100,
    annualSalary: BASE_SALARY * 12,
    payrollTaxMunicipalityId: { id: municipalityId },
  }),
});

const transactionRes = await api<WrappedValue<{ id: number }>>("salary/transaction?generateTaxDeduction=true", {
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
});

const transactionId = transactionRes.value.id;
const transactionRead = await api<WrappedValue<any>>(`salary/transaction/${transactionId}?fields=*`);
const payslipId = transactionRead.value.payslips?.[0]?.id;

console.log(
  JSON.stringify(
    {
      employeeId,
      employmentId: employmentRes.value.id,
      employmentDetailsId: employmentDetailsRes.value.id,
      occupationCode,
      transactionId,
      payslipId,
      payslip: payslipId ? await maybe(`salary/payslip/${payslipId}?fields=*,specifications(*,salaryType(*))`) : null,
      payslipSearch: await maybe(
        `salary/payslip?employeeId=${employeeId}&yearFrom=2026&yearTo=2027&monthFrom=3&monthTo=4&count=100&fields=*`,
      ),
      compilation: await maybe(`salary/compilation?employeeId=${employeeId}&year=2026&fields=*`),
      postings: await maybe(
        `ledger/posting?employeeId=${employeeId}&dateFrom=${RUN_DATE}&dateTo=2026-03-21&type=WAGE&fields=*`,
      ),
      payslipPdf: payslipId ? await maybe(`salary/payslip/${payslipId}/pdf`) : null,
      compilationPdfHeadersOnly: await fetch(
        `${BASE_URL}/salary/compilation/pdf?employeeId=${employeeId}&year=2026`,
        {
          headers: {
            Authorization: authHeader,
            Accept: "application/octet-stream,application/json",
          },
        },
      ).then(async (response) => ({
        status: response.status,
        contentType: response.headers.get("content-type"),
        bytes: (await response.arrayBuffer()).byteLength,
      })),
    },
    null,
    2,
  ),
);
