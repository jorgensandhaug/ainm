const BASE_URL = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN =
  "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";

const auth = `Basic ${Buffer.from(`0:${TOKEN}`).toString("base64")}`;
const suffix = `${Date.now()}`.slice(-6);
const departmentId = 837842;
const divisionId = 108244568;

type WrappedList<T> = { values: T[] };
type WrappedValue<T> = { value: T };

function endpoint(path: string): string {
  return new URL(path.replace(/^\//, ""), `${BASE_URL.replace(/\/+$/, "")}/`).toString();
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(endpoint(path), {
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

const salaryTypes = await api<WrappedList<any>>("salary/type?count=1000&fields=*");
const fastlonn = salaryTypes.values.find((value) => value.name === "Fastlønn");
const bonus = salaryTypes.values.find((value) => value.name === "Bonus");

if (!fastlonn || !bonus) {
  throw new Error("Missing Fastlønn or Bonus salary type");
}

const employeeCreated = await api<WrappedValue<any>>("employee", {
  method: "POST",
  body: JSON.stringify({
    firstName: "Repair",
    lastName: `Payroll ${suffix}`,
    email: `repair-payroll-${suffix}@example.org`,
    userType: "NO_ACCESS",
    department: { id: departmentId },
  }),
});

const employeeId = employeeCreated.value.id;

const employeeBrokenState = await api<WrappedValue<any>>(`employee/${employeeId}?fields=*`);

const employeeFixed = await api<WrappedValue<any>>(`employee/${employeeId}`, {
  method: "PUT",
  body: JSON.stringify({
    dateOfBirth: "1990-01-01",
  }),
});

const employmentCreated = await api<WrappedValue<any>>("employee/employment", {
  method: "POST",
  body: JSON.stringify({
    employee: { id: employeeId },
    division: { id: divisionId },
    startDate: "2026-03-01",
    isMainEmployer: true,
    taxDeductionCode: "loennFraHovedarbeidsgiver",
  }),
});

const employmentDetailsCreated = await api<WrappedValue<any>>("employee/employment/details", {
  method: "POST",
  body: JSON.stringify({
    employment: { id: employmentCreated.value.id },
    date: "2026-03-01",
    employmentType: "NOT_CHOSEN",
    employmentForm: "NOT_CHOSEN",
    remunerationType: "MONTHLY_WAGE",
    workingHoursScheme: "NOT_CHOSEN",
    shiftDurationHours: 0,
    percentageOfFullTimeEquivalent: 100,
    annualSalary: 484200,
  }),
});

const transactionCreated = await api<WrappedValue<any>>("salary/transaction", {
  method: "POST",
  body: JSON.stringify({
    date: "2026-03-20",
    year: 2026,
    month: 3,
    paySlipsAvailableDate: "2026-03-20",
    payslips: [
      {
        employee: { id: employeeId },
        date: "2026-03-20",
        year: 2026,
        month: 3,
        specifications: [
          {
            employee: { id: employeeId },
            salaryType: { id: fastlonn.id },
            description: "Fastlønn mars 2026",
            year: 2026,
            month: 3,
            count: 1,
            rate: 40350,
            amount: 40350,
          },
          {
            employee: { id: employeeId },
            salaryType: { id: bonus.id },
            description: "Bonus mars 2026",
            year: 2026,
            month: 3,
            count: 1,
            rate: 7350,
            amount: 7350,
          },
        ],
      },
    ],
  }),
});

const transactionRead = await api<WrappedValue<any>>(
  `salary/transaction/${transactionCreated.value.id}?fields=*`,
);
const payslipId = transactionRead.value.payslips?.[0]?.id;
const payslipRead = payslipId
  ? await api<WrappedValue<any>>(`salary/payslip/${payslipId}?fields=*,specifications(*,salaryType(*))`)
  : null;

console.log(
  JSON.stringify(
    {
      employeeId,
      employeeBrokenState: {
        dateOfBirth: employeeBrokenState.value.dateOfBirth,
        employments: employeeBrokenState.value.employments,
      },
      employeeFixedDateOfBirth: employeeFixed.value.dateOfBirth,
      employmentId: employmentCreated.value.id,
      employmentDetailsId: employmentDetailsCreated.value.id,
      salaryTransactionId: transactionCreated.value.id,
      payslipId,
      grossAmount: payslipRead?.value?.grossAmount,
      amount: payslipRead?.value?.amount,
      specificationSummaries: payslipRead?.value?.specifications?.map((value: any) => ({
        salaryType: value.salaryType?.name,
        amount: value.amount,
        description: value.description,
      })),
    },
    null,
    2,
  ),
);
