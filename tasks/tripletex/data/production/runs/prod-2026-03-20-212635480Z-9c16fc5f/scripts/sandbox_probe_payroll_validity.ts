const baseUrl = "https://kkpqfuj-amager.tripletex.dev/v2";
const token =
  "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const auth = `Basic ${Buffer.from(`0:${token}`).toString("base64")}`;

type WrappedValue<T> = { value: T };
type WrappedList<T> = { values: T[]; count?: number; fullResultSize?: number };

const employeeId = 18564428;
const payrollDate = "2026-08-20";
const year = 2026;
const month = 8;

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${baseUrl}/${path}`, {
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
    console.error(`FAIL ${res.status} ${path}`);
    console.error(text);
    throw new Error(`Tripletex request failed: ${res.status} ${path}`);
  }
  return text ? (JSON.parse(text) as T) : (null as T);
}

function pickSalaryType(values: any[], names: string[]) {
  for (const name of names) {
    const found = values.find((value) => value?.name === name || value?.displayName === name);
    if (found) return found;
  }
  throw new Error(`Missing salary type: ${names.join(" / ")}`);
}

async function runVariant(label: string, generateTaxDeduction: boolean) {
  const salaryTypes = await api<WrappedList<any>>("salary/type?count=1000&fields=*");
  const fastlonn = pickSalaryType(salaryTypes.values, ["Fastlønn"]);
  const bonus = pickSalaryType(salaryTypes.values, ["Bonus"]);

  const transaction = await api<WrappedValue<any>>(
    `salary/transaction${generateTaxDeduction ? "?generateTaxDeduction=true" : ""}`,
    {
      method: "POST",
      body: JSON.stringify({
        date: payrollDate,
        year,
        month,
        paySlipsAvailableDate: payrollDate,
        payslips: [
          {
            employee: { id: employeeId },
            date: payrollDate,
            year,
            month,
            specifications: [
              {
                employee: { id: employeeId },
                salaryType: { id: fastlonn.id },
                description: `${label} Fastlønn`,
                year,
                month,
                count: 1,
                rate: 50400,
                amount: 50400,
              },
              {
                employee: { id: employeeId },
                salaryType: { id: bonus.id },
                description: `${label} Bonus`,
                year,
                month,
                count: 1,
                rate: 7050,
                amount: 7050,
              },
            ],
          },
        ],
      }),
    },
  );

  const transactionId = transaction.value.id;
  const fetchedTransaction = await api<WrappedValue<any>>(
    `salary/transaction/${transactionId}?fields=*`,
  );
  const payslipId = fetchedTransaction.value?.payslips?.[0]?.id;
  const payslip = payslipId
    ? await api<WrappedValue<any>>(
        `salary/payslip/${payslipId}?fields=*,specifications(*,salaryType(*),employee(*))`,
      )
    : null;

  const payslipSearch = await api<WrappedList<any>>(
    `salary/payslip?employeeId=${employeeId}&yearFrom=${year}&yearTo=${year + 1}&monthFrom=${month}&monthTo=${month + 1}&count=1000&fields=*`,
  );
  const payslipByIdSearch = payslipId
    ? await api<WrappedList<any>>(`salary/payslip?id=${payslipId}&count=1000&fields=*`)
    : null;
  const compilation = await api<WrappedValue<any>>(
    `salary/compilation?employeeId=${employeeId}&year=${year}&fields=*`,
  );

  const result = {
    label,
    generateTaxDeduction,
    transactionId,
    payslipId,
    transaction: fetchedTransaction.value,
    payslip: payslip?.value ?? null,
    payslipSearchCount: payslipSearch.values.length,
    payslipSearchIds: payslipSearch.values.map((value) => value.id),
    payslipByIdSearchCount: payslipByIdSearch?.values?.length ?? 0,
    payslipByIdSearchIds: payslipByIdSearch?.values?.map((value) => value.id) ?? [],
    compilation: compilation.value,
  };

  console.log(JSON.stringify(result, null, 2));
}

const employee = await api<WrappedValue<any>>(`employee/${employeeId}?fields=*`);
const employments = await api<WrappedList<any>>(
  `employee/employment?employeeId=${employeeId}&count=20&fields=*`,
);
const salarySettings = await api<WrappedValue<any>>("salary/settings?fields=*");

console.log(
  JSON.stringify(
    {
      employee: employee.value,
      employments: employments.values,
      salarySettings: salarySettings.value,
    },
    null,
    2,
  ),
);

await runVariant("Probe no tax", false);
await runVariant("Probe with tax", true);
