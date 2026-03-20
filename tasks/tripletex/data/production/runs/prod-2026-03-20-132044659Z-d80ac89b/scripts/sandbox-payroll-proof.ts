const baseUrl = "https://kkpqfuj-amager.tripletex.dev/v2";
const token =
  "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";

const auth = `Basic ${Buffer.from(`0:${token}`).toString("base64")}`;
const suffix = `${Date.now()}`.slice(-6);

type WrappedList<T> = { values: T[] };
type WrappedValue<T> = { value: T };

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      Authorization: auth,
      Accept: "application/json",
      ...(init?.body ? { "Content-Type": "application/json; charset=utf-8" } : {}),
      ...(init?.headers ?? {}),
    },
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`${res.status} ${res.statusText} ${path}\n${text}`);
  }

  return text ? (JSON.parse(text) as T) : (undefined as T);
}

function computeOrgChecksum(digits: number[]) {
  const weights = [3, 2, 7, 6, 5, 4, 3, 2];
  const sum = digits.reduce((acc, digit, i) => acc + digit * weights[i], 0);
  const remainder = 11 - (sum % 11);
  if (remainder === 11) return 0;
  if (remainder === 10) return null;
  return remainder;
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
    const checksum = computeOrgChecksum(body);
    if (checksum !== null) {
      return [...body, checksum].join("");
    }
  }
  throw new Error("Failed to generate org number");
}

const departmentResp = await api<WrappedList<any>>(
  "/department?isInactive=false&count=1&fields=*",
);
const department = departmentResp.values[0];
if (!department) {
  throw new Error("No active department in sandbox");
}

const salaryTypeResp = await api<WrappedList<any>>("/salary/type?count=1000&fields=*");
const fastlonn = salaryTypeResp.values.find((v) => v.name === "Fastlønn");
const bonus = salaryTypeResp.values.find((v) => v.name === "Bonus");
if (!fastlonn || !bonus) {
  throw new Error("Could not resolve Fastlønn/Bonus salary types");
}

const municipalityResp = await api<WrappedList<any>>(
  "/municipality/query?query=Oslo&count=5&fields=*",
);
const municipality =
  municipalityResp.values.find((m) => !String(m.displayName ?? "").includes("Inaktiv")) ??
  municipalityResp.values[0];
if (!municipality) {
  throw new Error("Could not resolve municipality");
}

const divisionResp = await api<WrappedValue<any>>("/division", {
  method: "POST",
  body: JSON.stringify({
    name: `Payroll Proof Division ${suffix}`,
    startDate: "2026-01-01",
    organizationNumber: generateOrgNumber(),
    municipalityDate: "2026-01-01",
    municipality: { id: municipality.id },
  }),
});
const division = divisionResp.value;

const employeeResp = await api<WrappedValue<any>>("/employee", {
  method: "POST",
  body: JSON.stringify({
    firstName: "Payroll",
    lastName: `Proof ${suffix}`,
    email: `payroll-proof-${suffix}@example.org`,
    dateOfBirth: "1990-01-01",
    userType: "NO_ACCESS",
    department: { id: department.id },
  }),
});
const employee = employeeResp.value;

const employmentResp = await api<WrappedValue<any>>("/employee/employment", {
  method: "POST",
  body: JSON.stringify({
    employee: { id: employee.id },
    division: { id: division.id },
    startDate: "2026-03-01",
    isMainEmployer: true,
    taxDeductionCode: "loennFraHovedarbeidsgiver",
  }),
});

const employmentDetailsResp = await api<WrappedValue<any>>("/employee/employment/details", {
  method: "POST",
  body: JSON.stringify({
    employment: { id: employmentResp.value.id },
    date: "2026-03-01",
    employmentType: "NOT_CHOSEN",
    employmentForm: "NOT_CHOSEN",
    remunerationType: "MONTHLY_WAGE",
    workingHoursScheme: "NOT_CHOSEN",
    shiftDurationHours: 0,
    percentageOfFullTimeEquivalent: 100,
    annualSalary: 508200,
  }),
});

const transactionResp = await api<WrappedValue<any>>("/salary/transaction", {
  method: "POST",
  body: JSON.stringify({
    date: "2026-03-20",
    year: 2026,
    month: 3,
    paySlipsAvailableDate: "2026-03-20",
    payslips: [
      {
        employee: { id: employee.id },
        date: "2026-03-20",
        year: 2026,
        month: 3,
        specifications: [
          {
            employee: { id: employee.id },
            salaryType: { id: fastlonn.id },
            description: "Fastlønn mars 2026",
            year: 2026,
            month: 3,
            count: 1,
            rate: 42350,
            amount: 42350,
          },
          {
            employee: { id: employee.id },
            salaryType: { id: bonus.id },
            description: "Bonus mars 2026",
            year: 2026,
            month: 3,
            count: 1,
            rate: 12850,
            amount: 12850,
          },
        ],
      },
    ],
  }),
});

const transactionGetResp = await api<WrappedValue<any>>(
  `/salary/transaction/${transactionResp.value.id}?fields=*`,
);
const payslipLink = transactionGetResp.value.payslips?.[0];
const payslipResp = payslipLink
  ? await api<WrappedValue<any>>(`/salary/payslip/${payslipLink.id}?fields=*`)
  : null;
const payslip = payslipResp?.value;

console.log(
  JSON.stringify(
    {
      departmentId: department.id,
      fastlonnId: fastlonn.id,
      bonusId: bonus.id,
      divisionId: division.id,
      employeeId: employee.id,
      employmentId: employmentResp.value.id,
      employmentDetailsId: employmentDetailsResp.value.id,
      salaryTransactionId: transactionResp.value.id,
      payrollMonth: transactionResp.value.month,
      payrollYear: transactionResp.value.year,
      payslipCount: transactionGetResp.value.payslips?.length ?? 0,
      payslipId: payslip?.id,
      grossAmount: payslip?.grossAmount,
      amount: payslip?.amount,
      specificationCount: payslip?.specifications?.length,
      specificationNames: payslip?.specifications?.map((s: any) => s.salaryType?.name),
    },
    null,
    2,
  ),
);
