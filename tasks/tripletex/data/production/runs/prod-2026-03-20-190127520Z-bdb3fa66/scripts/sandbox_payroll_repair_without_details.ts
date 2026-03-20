const BASE_URL = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN =
  "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";

const auth = `Basic ${Buffer.from(`0:${TOKEN}`).toString("base64")}`;
const suffix = `${Date.now()}`.slice(-6);

function endpoint(path: string): string {
  return new URL(path.replace(/^\//, ""), `${BASE_URL.replace(/\/+$/, "")}/`).toString();
}

async function api(path: string, init?: RequestInit) {
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
  return {
    status: res.status,
    ok: res.ok,
    body: text ? JSON.parse(text) : null,
  };
}

const salaryTypes = await api("salary/type?count=1000&fields=*");
if (!salaryTypes.ok) throw new Error(JSON.stringify(salaryTypes));
const fastlonn = salaryTypes.body.values.find((value: any) => value.name === "Fastlønn");
const bonus = salaryTypes.body.values.find((value: any) => value.name === "Bonus");

const employee = await api("employee", {
  method: "POST",
  body: JSON.stringify({
    firstName: "Repair",
    lastName: `No Details ${suffix}`,
    email: `repair-no-details-${suffix}@example.org`,
    userType: "NO_ACCESS",
    department: { id: 837842 },
  }),
});
if (!employee.ok) throw new Error(JSON.stringify(employee));

const fixedEmployee = await api(`employee/${employee.body.value.id}`, {
  method: "PUT",
  body: JSON.stringify({ dateOfBirth: "1990-01-01" }),
});
if (!fixedEmployee.ok) throw new Error(JSON.stringify(fixedEmployee));

const employment = await api("employee/employment", {
  method: "POST",
  body: JSON.stringify({
    employee: { id: employee.body.value.id },
    division: { id: 108244568 },
    startDate: "2026-03-01",
    isMainEmployer: true,
    taxDeductionCode: "loennFraHovedarbeidsgiver",
  }),
});
if (!employment.ok) throw new Error(JSON.stringify(employment));

const transaction = await api("salary/transaction", {
  method: "POST",
  body: JSON.stringify({
    date: "2026-03-20",
    year: 2026,
    month: 3,
    paySlipsAvailableDate: "2026-03-20",
    payslips: [
      {
        employee: { id: employee.body.value.id },
        date: "2026-03-20",
        year: 2026,
        month: 3,
        specifications: [
          {
            employee: { id: employee.body.value.id },
            salaryType: { id: fastlonn.id },
            description: "Fastlønn mars 2026",
            year: 2026,
            month: 3,
            count: 1,
            rate: 40350,
            amount: 40350,
          },
          {
            employee: { id: employee.body.value.id },
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

console.log(
  JSON.stringify(
    {
      employeeId: employee.body.value.id,
      employmentId: employment.body.value.id,
      transaction,
    },
    null,
    2,
  ),
);
