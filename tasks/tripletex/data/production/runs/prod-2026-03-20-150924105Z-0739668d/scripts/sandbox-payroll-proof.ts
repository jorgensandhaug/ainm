const BASE_URL = "https://kkpqfuj-amager.tripletex.dev/v2";
const SESSION_TOKEN =
  "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";

const BASE_SALARY = 40350;
const BONUS = 5850;
const EXPECTED_GROSS = BASE_SALARY + BONUS;

type ApiEnvelope<T> = {
  value?: T;
  values?: T[];
  message?: string;
  developerMessage?: string;
  requestId?: string;
  validationMessages?: Array<{ field?: string; message?: string }>;
};

type Employee = {
  id: number;
  firstName?: string;
  lastName?: string;
  displayName?: string;
  email?: string;
  dateOfBirth?: string | null;
  allowInformationRegistration?: boolean;
  employments?: Employment[];
};

type Employment = {
  id?: number;
  startDate?: string | null;
  endDate?: string | null;
  division?: { id?: number | null };
  employmentDetails?: EmploymentDetails[];
  latestSalary?: EmploymentDetails | null;
};

type EmploymentDetails = {
  id?: number;
  date?: string | null;
  employmentType?: string | null;
  employmentForm?: string | null;
  remunerationType?: string | null;
};

type SalaryType = {
  id: number;
  name?: string;
};

type SalarySpecification = {
  id?: number;
  amount?: number;
  description?: string;
  salaryType?: SalaryType;
};

type Payslip = {
  id?: number;
  year?: number;
  month?: number;
  date?: string;
  grossAmount?: number;
  amount?: number;
  specifications?: SalarySpecification[];
};

type SalaryTransaction = {
  id?: number;
  year?: number;
  month?: number;
  date?: string;
  payslips?: Payslip[];
};

const authHeader = `Basic ${Buffer.from(`0:${SESSION_TOKEN}`).toString("base64")}`;

async function api<T>(path: string, init?: RequestInit): Promise<ApiEnvelope<T>> {
  const response = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      Authorization: authHeader,
      Accept: "application/json",
      ...(init?.body ? { "Content-Type": "application/json; charset=utf-8" } : {}),
      ...(init?.headers ?? {}),
    },
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : {};

  if (!response.ok) {
    const err = data as ApiEnvelope<T>;
    const validation = (err.validationMessages ?? [])
      .map((v) => `${v.field ?? "?"}: ${v.message ?? ""}`)
      .join(" | ");
    throw new Error(
      [
        `HTTP ${response.status} ${response.statusText}`,
        err.message,
        err.developerMessage,
        validation || undefined,
        err.requestId ? `requestId=${err.requestId}` : undefined,
      ]
        .filter(Boolean)
        .join(" :: "),
    );
  }

  return data as ApiEnvelope<T>;
}

function monthBounds(year: number, month: number) {
  const paddedMonth = String(month).padStart(2, "0");
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return {
    start: `${year}-${paddedMonth}-01`,
    end: `${year}-${paddedMonth}-${String(lastDay).padStart(2, "0")}`,
    voucherDate: `${year}-${paddedMonth}-20`,
  };
}

function coversPeriod(employment: Employment, start: string, end: string) {
  const employmentStart = employment.startDate ?? "";
  const employmentEnd = employment.endDate ?? "";
  const startsBeforeEnd = !employmentStart || employmentStart <= end;
  const endsAfterStart = !employmentEnd || employmentEnd >= start;
  return startsBeforeEnd && endsAfterStart;
}

function hasPayrollDetails(employment: Employment) {
  if (employment.division?.id == null) return false;
  if (employment.latestSalary) return true;
  return (employment.employmentDetails ?? []).length > 0;
}

function pickSalaryType(types: SalaryType[], wantedName: string): SalaryType {
  const exact = types.find(
    (type) => (type.name ?? "").trim().toLowerCase() === wantedName.trim().toLowerCase(),
  );
  if (exact) return exact;

  const contains = types.find((type) =>
    (type.name ?? "").trim().toLowerCase().includes(wantedName.trim().toLowerCase()),
  );
  if (contains) return contains;

  throw new Error(`Missing salary type ${wantedName}`);
}

function employeeName(employee: Employee) {
  return employee.displayName ?? `${employee.firstName ?? ""} ${employee.lastName ?? ""}`.trim();
}

async function main() {
  const employeesRes = await api<Employee>(`/employee?count=1000&fields=*`);
  const employees = employeesRes.values ?? [];
  if (!employees.length) throw new Error("No employees returned from sandbox");

  const candidatePeriods = [
    { year: 2026, month: 4 },
    { year: 2026, month: 5 },
    { year: 2026, month: 6 },
    { year: 2026, month: 7 },
    { year: 2026, month: 8 },
    { year: 2026, month: 9 },
  ];

  let chosenEmployee: Employee | undefined;
  let chosenPeriod: { year: number; month: number; start: string; end: string; voucherDate: string } | undefined;
  let chosenEmployment: Employment | undefined;

  const employeeCandidates = employees.filter(
    (employee) => employee.dateOfBirth && employee.allowInformationRegistration !== false,
  );

  employeeLoop: for (const employee of employeeCandidates) {
    if (!employee.dateOfBirth) continue;
    const employmentRes = await api<Employment>(
      `/employee/employment?employeeId=${employee.id}&count=20&fields=*`,
    );
    const employments = employmentRes.values ?? [];
    for (const period of candidatePeriods) {
      const bounds = monthBounds(period.year, period.month);
      const readyEmployment = employments.find(
        (employment) => coversPeriod(employment, bounds.start, bounds.end) && hasPayrollDetails(employment),
      );
      if (!readyEmployment) continue;

      const existingPayslipsRes = await api<Payslip>(
        `/salary/payslip?employeeId=${employee.id}&yearFrom=${period.year}&yearTo=${period.year + 1}&monthFrom=${period.month}&monthTo=${period.month + 1}&count=10&fields=*`,
      );
      if ((existingPayslipsRes.values ?? []).length > 0) continue;

      chosenEmployee = employee;
      chosenEmployment = readyEmployment;
      chosenPeriod = { ...period, ...bounds };
      break employeeLoop;
    }
  }

  if (!chosenEmployee || !chosenPeriod || !chosenEmployment) {
    throw new Error("No payroll-ready employee with a free proof month was found");
  }

  const salaryTypesRes = await api<SalaryType>(`/salary/type?count=1000&fields=*`);
  const salaryTypes = salaryTypesRes.values ?? [];
  const fastlonn = pickSalaryType(salaryTypes, "Fastlønn");
  const bonusType = pickSalaryType(salaryTypes, "Bonus");

  const payload = {
    date: chosenPeriod.voucherDate,
    year: chosenPeriod.year,
    month: chosenPeriod.month,
    paySlipsAvailableDate: chosenPeriod.voucherDate,
    payslips: [
      {
        employee: { id: chosenEmployee.id },
        date: chosenPeriod.voucherDate,
        year: chosenPeriod.year,
        month: chosenPeriod.month,
        specifications: [
          {
            employee: { id: chosenEmployee.id },
            salaryType: { id: fastlonn.id },
            description: `Fastlønn ${String(chosenPeriod.month).padStart(2, "0")}/${chosenPeriod.year} sandbox proof`,
            year: chosenPeriod.year,
            month: chosenPeriod.month,
            count: 1,
            rate: BASE_SALARY,
            amount: BASE_SALARY,
          },
          {
            employee: { id: chosenEmployee.id },
            salaryType: { id: bonusType.id },
            description: `Bonus ${String(chosenPeriod.month).padStart(2, "0")}/${chosenPeriod.year} sandbox proof`,
            year: chosenPeriod.year,
            month: chosenPeriod.month,
            count: 1,
            rate: BONUS,
            amount: BONUS,
          },
        ],
      },
    ],
  };

  const createRes = await api<SalaryTransaction>(`/salary/transaction`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  const transaction = createRes.value;
  if (!transaction?.id) throw new Error("Missing salary transaction id in create response");

  const txRes = await api<SalaryTransaction>(`/salary/transaction/${transaction.id}?fields=*`);
  const tx = txRes.value;
  const payslipId = tx?.payslips?.[0]?.id;
  if (!payslipId) throw new Error(`Missing payslip id on salary transaction ${transaction.id}`);

  const payslipRes = await api<Payslip>(`/salary/payslip/${payslipId}?fields=*`);
  const payslip = payslipRes.value;

  if (payslip?.grossAmount !== EXPECTED_GROSS) {
    throw new Error(`Unexpected grossAmount ${payslip?.grossAmount}; expected ${EXPECTED_GROSS}`);
  }
  if (payslip?.amount !== EXPECTED_GROSS) {
    throw new Error(`Unexpected amount ${payslip?.amount}; expected ${EXPECTED_GROSS}`);
  }
  if ((payslip?.specifications ?? []).length !== 2) {
    throw new Error(`Unexpected specification count ${(payslip?.specifications ?? []).length}; expected 2`);
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        employee: {
          id: chosenEmployee.id,
          name: employeeName(chosenEmployee),
          email: chosenEmployee.email ?? null,
        },
        employment: {
          id: chosenEmployment.id ?? null,
          startDate: chosenEmployment.startDate ?? null,
          endDate: chosenEmployment.endDate ?? null,
          divisionId: chosenEmployment.division?.id ?? null,
          latestSalaryId: chosenEmployment.latestSalary?.id ?? null,
          employmentDetailsCount: (chosenEmployment.employmentDetails ?? []).length,
        },
        period: {
          year: chosenPeriod.year,
          month: chosenPeriod.month,
          voucherDate: chosenPeriod.voucherDate,
        },
        salaryTypes: {
          fastlonn: { id: fastlonn.id, name: fastlonn.name ?? null },
          bonus: { id: bonusType.id, name: bonusType.name ?? null },
        },
        salaryTransactionId: transaction.id,
        payslipId,
        grossAmount: payslip?.grossAmount ?? null,
        amount: payslip?.amount ?? null,
        specificationCount: payslip?.specifications?.length ?? 0,
        specificationAmounts: (payslip?.specifications ?? []).map((spec) => ({
          id: spec.id ?? null,
          description: spec.description ?? null,
          amount: spec.amount ?? null,
          salaryTypeName: spec.salaryType?.name ?? null,
        })),
      },
      null,
      2,
    ),
  );
}

await main();
