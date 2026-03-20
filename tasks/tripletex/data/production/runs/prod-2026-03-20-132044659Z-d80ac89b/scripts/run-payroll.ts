const baseUrl = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const token = "fqPovyPwlmW2xtyFFTPDEZyauR7UkUwYLuLqfqYnUIA";

const auth = `Basic ${Buffer.from(`0:${token}`).toString("base64")}`;

const employeeId = 18175853;
const departmentId = 700300;
const fastlonnId = 48712830;
const bonusId = 48712999;

const payload = {
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
};

const res = await fetch(`${baseUrl}/salary/transaction`, {
  method: "POST",
  headers: {
    Authorization: auth,
    Accept: "application/json",
    "Content-Type": "application/json; charset=utf-8",
  },
  body: JSON.stringify(payload),
});

const text = await res.text();

console.log(`STATUS ${res.status} ${res.statusText}`);
console.log(text);

if (!res.ok) {
  process.exit(1);
}
