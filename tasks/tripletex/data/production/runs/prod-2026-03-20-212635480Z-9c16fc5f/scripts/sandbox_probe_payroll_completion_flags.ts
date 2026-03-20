const baseUrl = "https://kkpqfuj-amager.tripletex.dev/v2";
const token =
  "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const auth = `Basic ${Buffer.from(`0:${token}`).toString("base64")}`;

type WrappedValue<T> = { value: T };
type WrappedList<T> = { values: T[] };

const employeeId = 18564428;

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
    throw new Error(`Tripletex request failed: ${res.status}`);
  }
  return text ? (JSON.parse(text) as T) : (null as T);
}

function pickSalaryType(values: any[], name: string) {
  const found = values.find((value) => value?.name === name || value?.displayName === name);
  if (!found) throw new Error(`Missing salary type ${name}`);
  return found;
}

const salaryTypes = await api<WrappedList<any>>("salary/type?count=1000&fields=*");
const fastlonn = pickSalaryType(salaryTypes.values, "Fastlønn");
const bonus = pickSalaryType(salaryTypes.values, "Bonus");

const variants = [
  {
    label: "completed only",
    date: "2026-09-20",
    dateTo: "2026-09-21",
    year: 2026,
    month: 9,
    extra: {
      completed: true,
    },
  },
  {
    label: "completed plus paymentDate",
    date: "2026-10-20",
    dateTo: "2026-10-21",
    year: 2026,
    month: 10,
    extra: {
      completed: true,
      paymentDate: "2026-10-20",
    },
  },
  {
    label: "completed paymentDate voucherComment",
    date: "2026-11-20",
    dateTo: "2026-11-21",
    year: 2026,
    month: 11,
    extra: {
      completed: true,
      paymentDate: "2026-11-20",
      voucherComment: "sandbox completion probe",
    },
  },
];

for (const variant of variants) {
  const transaction = await api<WrappedValue<any>>(
    "salary/transaction?generateTaxDeduction=true",
    {
      method: "POST",
      body: JSON.stringify({
        date: variant.date,
        year: variant.year,
        month: variant.month,
        paySlipsAvailableDate: variant.date,
        payslips: [
          {
            employee: { id: employeeId },
            date: variant.date,
            year: variant.year,
            month: variant.month,
            specifications: [
              {
                employee: { id: employeeId },
                salaryType: { id: fastlonn.id },
                description: `${variant.label} Fastlønn`,
                year: variant.year,
                month: variant.month,
                count: 1,
                rate: 50400,
                amount: 50400,
              },
              {
                employee: { id: employeeId },
                salaryType: { id: bonus.id },
                description: `${variant.label} Bonus`,
                year: variant.year,
                month: variant.month,
                count: 1,
                rate: 7050,
                amount: 7050,
              },
            ],
          },
        ],
        ...variant.extra,
      }),
    },
  );

  const transactionId = transaction.value.id;
  const transactionRead = await api<WrappedValue<any>>(`salary/transaction/${transactionId}?fields=*`);
  const payslipId = transactionRead.value?.payslips?.[0]?.id;
  const payslip = payslipId
    ? await api<WrappedValue<any>>(
        `salary/payslip/${payslipId}?fields=*,specifications(*,salaryType(*))`,
      )
    : null;
  const postings = await api<WrappedList<any>>(
    `ledger/posting?dateFrom=${variant.date}&dateTo=${variant.dateTo}&employeeId=${employeeId}&type=WAGE&count=1000&fields=*`,
  );
  const vouchers = await api<WrappedList<any>>(
    `ledger/voucher?dateFrom=${variant.date}&dateTo=${variant.dateTo}&count=1000&fields=*`,
  );
  const payslipSearch = await api<WrappedList<any>>(
    `salary/payslip?employeeId=${employeeId}&yearFrom=${variant.year}&yearTo=${variant.year + 1}&monthFrom=${variant.month}&monthTo=${variant.month + 1}&count=1000&fields=*`,
  );
  const compilation = await api<WrappedValue<any>>(
    `salary/compilation?employeeId=${employeeId}&year=${variant.year}&fields=*`,
  );

  console.log(
    JSON.stringify(
      {
        label: variant.label,
        transactionId,
        transaction: transactionRead.value,
        payslipId,
        payslip: payslip?.value ?? null,
        postingsCount: postings.values.length,
        voucherCount: vouchers.values.length,
        payslipSearchCount: payslipSearch.values.length,
        compilation: compilation.value,
      },
      null,
      2,
    ),
  );
}
