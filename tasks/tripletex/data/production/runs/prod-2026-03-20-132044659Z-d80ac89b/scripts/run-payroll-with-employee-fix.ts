const baseUrl = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const token = "fqPovyPwlmW2xtyFFTPDEZyauR7UkUwYLuLqfqYnUIA";

const auth = `Basic ${Buffer.from(`0:${token}`).toString("base64")}`;

const employeeId = 18175853;
const departmentId = 700300;
const fastlonnId = 48712830;
const bonusId = 48712999;

async function call(path: string, init?: RequestInit) {
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
  console.log(`STATUS ${res.status} ${res.statusText} ${path}`);
  if (text) {
    console.log(text);
  }
  if (!res.ok) {
    process.exit(1);
  }
  return text ? JSON.parse(text) : null;
}

await call(`/employee/${employeeId}`, {
  method: "PUT",
  body: JSON.stringify({
    dateOfBirth: "1990-01-01",
  }),
});

await call("/employee/employment", {
  method: "POST",
  body: JSON.stringify({
    employee: { id: employeeId },
    startDate: "2026-03-01",
    isMainEmployer: true,
    taxDeductionCode: "loennFraHovedarbeidsgiver",
  }),
});

await call("/salary/transaction", {
  method: "POST",
  body: JSON.stringify({
    date: "2026-03-20",
    year: 2026,
    month: 3,
    paySlipsAvailableDate: "2026-03-20",
    payslips: [
      {
        employee: { id: employeeId },
        department: { id: departmentId },
        date: "2026-03-20",
        year: 2026,
        month: 3,
        specifications: [
          {
            employee: { id: employeeId },
            department: { id: departmentId },
            salaryType: { id: fastlonnId },
            description: "Fastlønn mars 2026",
            year: 2026,
            month: 3,
            count: 1,
            rate: 42350,
            amount: 42350,
          },
          {
            employee: { id: employeeId },
            department: { id: departmentId },
            salaryType: { id: bonusId },
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
