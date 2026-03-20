const baseUrl = "https://kkpqfuj-amager.tripletex.dev/v2";
const token =
  "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";

const auth = `Basic ${Buffer.from(`0:${token}`).toString("base64")}`;

type WrappedList<T> = { values: T[] };
type WrappedValue<T> = { value: T };

async function api<T>(path: string, init?: RequestInit): Promise<T> {
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
  if (!res.ok) {
    throw new Error(`${res.status} ${res.statusText} ${path}\n${text}`);
  }
  return text ? (JSON.parse(text) as T) : (undefined as T);
}

const employeeId = 18441996;
const departmentId = 837842;

const salaryTypeResp = await api<WrappedList<any>>("/salary/type?count=1000&fields=*");
const fastlonn = salaryTypeResp.values.find((v) => v.name === "Fastlønn");
const bonus = salaryTypeResp.values.find((v) => v.name === "Bonus");
if (!fastlonn || !bonus) {
  throw new Error("Could not resolve Fastlønn/Bonus salary types");
}

const transactionResp = await api<WrappedValue<any>>("/salary/transaction", {
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
            salaryType: { id: fastlonn.id },
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
            salaryType: { id: bonus.id },
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

console.log(JSON.stringify(transactionResp, null, 2));
