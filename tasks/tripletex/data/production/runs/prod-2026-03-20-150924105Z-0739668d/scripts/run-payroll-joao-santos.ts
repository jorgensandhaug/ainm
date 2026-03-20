const BASE_URL = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const SESSION_TOKEN = "IG9ZJuZV0CKZNPiReTmatdsJyv3Hx-Mi27tjcez34Zw";

const TARGET_EMAIL = "joao.santos@example.org";
const TARGET_NAME = "João Santos";
const TODAY = "2026-03-20";
const YEAR = 2026;
const MONTH = 3;
const PERIOD_START = "2026-03-01";
const PERIOD_END = "2026-03-31";
const BASE_SALARY = 40350;
const BONUS = 5850;
const EXPECTED_GROSS = BASE_SALARY + BONUS;

type ApiEnvelope<T> = {
  value?: T;
  values?: T[];
  status?: number;
  code?: number;
  message?: string;
  developerMessage?: string;
  validationMessages?: Array<{ field?: string; message?: string }>;
  requestId?: string;
};

type Employee = {
  id: number;
  firstName?: string;
  lastName?: string;
  displayName?: string;
  email?: string;
  dateOfBirth?: string | null;
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
  number?: string;
  description?: string;
};

type SalarySpecification = {
  id?: number;
  description?: string;
  amount?: number;
  rate?: number;
  count?: number;
  salaryType?: SalaryType;
};

type Payslip = {
  id?: number;
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
    const error = data as ApiEnvelope<T>;
    const validation = (error.validationMessages ?? [])
      .map((v) => `${v.field ?? "?"}: ${v.message ?? ""}`)
      .join(" | ");
    throw new Error(
      [
        `HTTP ${response.status} ${response.statusText}`,
        error.message,
        error.developerMessage,
        validation || undefined,
        error.requestId ? `requestId=${error.requestId}` : undefined,
      ]
        .filter(Boolean)
        .join(" :: "),
    );
  }

  return data as ApiEnvelope<T>;
}

function exactEmailMatch(employee: Employee): boolean {
  return (employee.email ?? "").trim().toLowerCase() === TARGET_EMAIL.toLowerCase();
}

function coversPayrollPeriod(employment: Employment): boolean {
  const start = employment.startDate ?? "";
  const end = employment.endDate ?? "";
  const startsBeforeEnd = !start || start <= PERIOD_END;
  const endsAfterStart = !end || end >= PERIOD_START;
  return startsBeforeEnd && endsAfterStart;
}

function hasPayrollDetails(employment: Employment): boolean {
  if (employment.latestSalary) return true;
  const details = employment.employmentDetails ?? [];
  return details.some((detail) => {
    if (!detail.date || detail.date > PERIOD_END) return false;
    return Boolean(detail.employmentType || detail.employmentForm || detail.remunerationType);
  });
}

function pickSalaryType(types: SalaryType[], wantedName: string): SalaryType {
  const normalizedWanted = wantedName.trim().toLowerCase();
  const exact = types.find((type) => (type.name ?? "").trim().toLowerCase() === normalizedWanted);
  if (exact) return exact;

  const contains = types.find((type) =>
    (type.name ?? "").trim().toLowerCase().includes(normalizedWanted),
  );
  if (contains) return contains;

  throw new Error(`Salary type not found: ${wantedName}`);
}

function writeResponseAlreadyProves(tx: SalaryTransaction | undefined): boolean {
  if (!tx?.payslips?.length) return false;
  const payslip = tx.payslips[0];
  if (payslip.grossAmount !== EXPECTED_GROSS) return false;
  if (payslip.amount !== EXPECTED_GROSS) return false;
  const specs = payslip.specifications ?? [];
  if (specs.length !== 2) return false;
  const amounts = specs.map((s) => s.amount).sort((a, b) => (a ?? 0) - (b ?? 0));
  return amounts[0] === BONUS && amounts[1] === BASE_SALARY;
}

async function main() {
  const employeeRes = await api<Employee>(
    `/employee?email=${encodeURIComponent(TARGET_EMAIL)}&count=10&fields=*`,
  );
  const employees = (employeeRes.values ?? []).filter(exactEmailMatch);
  if (employees.length !== 1) {
    throw new Error(`Expected exactly one employee for ${TARGET_EMAIL}, got ${employees.length}`);
  }

  const employee = employees[0];
  const activeEmployments = (employee.employments ?? []).filter(coversPayrollPeriod);
  if (!employee.dateOfBirth) {
    throw new Error(`Blocked: employee ${TARGET_EMAIL} missing dateOfBirth`);
  }
  if (!activeEmployments.length) {
    throw new Error(`Blocked: employee ${TARGET_EMAIL} has no active employment in ${YEAR}-${MONTH}`);
  }
  if (!activeEmployments.some(hasPayrollDetails)) {
    throw new Error(`Blocked: employee ${TARGET_EMAIL} lacks payroll-ready employment details`);
  }

  const salaryTypeRes = await api<SalaryType>(`/salary/type?count=1000&fields=*`);
  const salaryTypes = salaryTypeRes.values ?? [];
  const baseSalaryType = pickSalaryType(salaryTypes, "Fastlønn");
  const bonusType = pickSalaryType(salaryTypes, "Bonus");

  const payload = {
    date: TODAY,
    year: YEAR,
    month: MONTH,
    paySlipsAvailableDate: TODAY,
    payslips: [
      {
        employee: { id: employee.id },
        date: TODAY,
        year: YEAR,
        month: MONTH,
        specifications: [
          {
            employee: { id: employee.id },
            salaryType: { id: baseSalaryType.id },
            description: "Fastlønn mars 2026",
            year: YEAR,
            month: MONTH,
            count: 1,
            rate: BASE_SALARY,
            amount: BASE_SALARY,
          },
          {
            employee: { id: employee.id },
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
  };

  const createRes = await api<SalaryTransaction>(`/salary/transaction`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  const created = createRes.value;
  if (!created?.id) {
    throw new Error("Salary transaction created without id in response");
  }

  let verification: { transactionId: number; payslipId?: number; grossAmount?: number; amount?: number; specCount?: number };

  if (writeResponseAlreadyProves(created)) {
    const payslip = created.payslips![0];
    verification = {
      transactionId: created.id,
      payslipId: payslip.id,
      grossAmount: payslip.grossAmount,
      amount: payslip.amount,
      specCount: payslip.specifications?.length,
    };
  } else {
    const txRes = await api<SalaryTransaction>(`/salary/transaction/${created.id}?fields=*`);
    const tx = txRes.value;
    const payslipId = tx?.payslips?.[0]?.id;
    if (!payslipId) {
      throw new Error(`Verification failed: missing payslip id on salary transaction ${created.id}`);
    }

    const payslipRes = await api<Payslip>(`/salary/payslip/${payslipId}?fields=*`);
    const payslip = payslipRes.value;
    verification = {
      transactionId: created.id,
      payslipId,
      grossAmount: payslip?.grossAmount,
      amount: payslip?.amount,
      specCount: payslip?.specifications?.length,
    };
  }

  if (verification.grossAmount !== EXPECTED_GROSS) {
    throw new Error(`Verification failed: grossAmount=${verification.grossAmount}, expected=${EXPECTED_GROSS}`);
  }
  if (verification.amount !== EXPECTED_GROSS) {
    throw new Error(`Verification failed: amount=${verification.amount}, expected=${EXPECTED_GROSS}`);
  }
  if (verification.specCount !== 2) {
    throw new Error(`Verification failed: specCount=${verification.specCount}, expected=2`);
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        employeeId: employee.id,
        employeeName: employee.displayName ?? `${employee.firstName ?? ""} ${employee.lastName ?? ""}`.trim(),
        transactionId: verification.transactionId,
        payslipId: verification.payslipId ?? null,
        grossAmount: verification.grossAmount,
        amount: verification.amount,
        specificationCount: verification.specCount,
        salaryTypeIds: {
          fastlonn: baseSalaryType.id,
          bonus: bonusType.id,
        },
      },
      null,
      2,
    ),
  );
}

await main();
