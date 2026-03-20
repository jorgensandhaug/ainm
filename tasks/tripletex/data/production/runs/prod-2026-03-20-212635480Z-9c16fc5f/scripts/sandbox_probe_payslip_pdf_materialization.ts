const baseUrl = "https://kkpqfuj-amager.tripletex.dev/v2";
const token =
  "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const auth = `Basic ${Buffer.from(`0:${token}`).toString("base64")}`;

type WrappedValue<T> = { value: T };
type WrappedList<T> = { values: T[] };

const employeeId = 18564428;
const payslipId = 32627879;
const dateFrom = "2026-08-20";
const dateTo = "2026-08-21";

async function jsonApi<T>(path: string): Promise<T> {
  const res = await fetch(`${baseUrl}/${path}`, {
    headers: {
      Authorization: auth,
      Accept: "application/json",
    },
  });
  const text = await res.text();
  if (!res.ok) {
    console.error(`FAIL ${res.status} ${path}`);
    console.error(text);
    throw new Error(`Tripletex request failed: ${res.status}`);
  }
  return JSON.parse(text) as T;
}

async function binaryApi(path: string) {
  const res = await fetch(`${baseUrl}/${path}`, {
    headers: {
      Authorization: auth,
      Accept: "application/pdf,application/octet-stream",
    },
  });
  const buffer = await res.arrayBuffer();
  const bodyText = new TextDecoder().decode(buffer);
  return {
    status: res.status,
    contentType: res.headers.get("content-type"),
    byteLength: buffer.byteLength,
    bodyText: bodyText.slice(0, 2000),
  };
}

function summarizeCompilation(value: any) {
  return {
    vacationPayBasis: value?.vacationPayBasis ?? null,
    wagesLength: Array.isArray(value?.wages) ? value.wages.length : null,
    expensesLength: Array.isArray(value?.expenses) ? value.expenses.length : null,
    taxDeductionsLength: Array.isArray(value?.taxDeductions) ? value.taxDeductions.length : null,
    mandatoryTaxDeductionsLength: Array.isArray(value?.mandatoryTaxDeductions)
      ? value.mandatoryTaxDeductions.length
      : null,
  };
}

async function snapshot(label: string) {
  const payslip = await jsonApi<WrappedValue<any>>(
    `salary/payslip/${payslipId}?fields=*,specifications(*,salaryType(*))`,
  );
  const payslipSearch = await jsonApi<WrappedList<any>>(
    `salary/payslip?employeeId=${employeeId}&yearFrom=2026&yearTo=2027&monthFrom=8&monthTo=9&count=1000&fields=*`,
  );
  const payslipByIdSearch = await jsonApi<WrappedList<any>>(
    `salary/payslip?id=${payslipId}&count=1000&fields=*`,
  );
  const postings = await jsonApi<WrappedList<any>>(
    `ledger/posting?dateFrom=${dateFrom}&dateTo=${dateTo}&employeeId=${employeeId}&type=WAGE&count=1000&fields=*`,
  );
  const vouchers = await jsonApi<WrappedList<any>>(
    `ledger/voucher?dateFrom=${dateFrom}&dateTo=${dateTo}&count=1000&fields=*`,
  );
  const compilation = await jsonApi<WrappedValue<any>>(
    `salary/compilation?employeeId=${employeeId}&year=2026&fields=*`,
  );

  return {
    label,
    payslipNumber: payslip.value?.number ?? null,
    grossAmount: payslip.value?.grossAmount ?? null,
    amount: payslip.value?.amount ?? null,
    specificationNames:
      payslip.value?.specifications?.map((spec: any) => spec?.salaryType?.name ?? null) ?? [],
    payslipSearchCount: payslipSearch.values.length,
    payslipByIdSearchCount: payslipByIdSearch.values.length,
    postingsCount: postings.values.length,
    vouchersCount: vouchers.values.length,
    compilation: summarizeCompilation(compilation.value),
  };
}

const before = await snapshot("before");
const pdf = await binaryApi(`salary/payslip/${payslipId}/pdf`);
const after = await snapshot("after");

console.log(JSON.stringify({ before, pdf, after }, null, 2));
