const baseUrl = "https://kkpqfuj-amager.tripletex.dev/v2";
const token =
  "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";

const auth = `Basic ${Buffer.from(`0:${token}`).toString("base64")}`;

async function api(path: string) {
  const res = await fetch(`${baseUrl}/${path}`, {
    headers: {
      Authorization: auth,
      Accept: "application/json",
    },
  });
  const text = await res.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }
  return { status: res.status, json };
}

const employeesRes = await api("employee?count=1000&fields=*");
if (employeesRes.status !== 200) {
  console.log(JSON.stringify(employeesRes, null, 2));
  process.exit(1);
}

const detailsRes = await api(
  "employee/employment/details?count=1000&fields=*,employment(*,employee(*),division(*))",
);
if (detailsRes.status !== 200) {
  console.log(JSON.stringify(detailsRes, null, 2));
  process.exit(1);
}

const employees = employeesRes.json.values ?? [];
const details = detailsRes.json.values ?? [];

const byEmployeeId = new Map<number, any[]>();
for (const detail of details) {
  const employeeId = detail.employment?.employee?.id;
  if (!employeeId) continue;
  const list = byEmployeeId.get(employeeId) ?? [];
  list.push(detail);
  byEmployeeId.set(employeeId, list);
}

const summary = employees
  .map((employee: any) => ({
    id: employee.id,
    email: employee.email,
    displayName: employee.displayName,
    dateOfBirth: employee.dateOfBirth ?? null,
    bankAccountNumber: employee.bankAccountNumber ?? null,
    nationalIdentityNumber: employee.nationalIdentityNumber ?? null,
    deliveryMethodWageSlipString: employee.deliveryMethodWageSlipString ?? null,
    employments: (employee.employments ?? []).map((employment: any) => ({
      id: employment.id,
      startDate: employment.startDate ?? null,
      divisionId: employment.division?.id ?? null,
      latestSalaryId: employment.latestSalary?.id ?? null,
    })),
    employmentDetails: (byEmployeeId.get(employee.id) ?? []).map((detail: any) => ({
      id: detail.id,
      date: detail.date ?? null,
      remunerationType: detail.remunerationType ?? null,
      annualSalary: detail.annualSalary ?? null,
      monthlySalary: detail.monthlySalary ?? null,
      percentageOfFullTimeEquivalent: detail.percentageOfFullTimeEquivalent ?? null,
      employmentType: detail.employmentType ?? null,
      employmentForm: detail.employmentForm ?? null,
      payrollTaxMunicipalityId: detail.payrollTaxMunicipalityId?.id ?? null,
    })),
  }))
  .filter((employee: any) => employee.employmentDetails.length > 0)
  .slice(0, 20);

console.log(
  JSON.stringify(
    {
      employeesWithEmploymentDetails: summary.length,
      sample: summary,
    },
    null,
    2,
  ),
);
