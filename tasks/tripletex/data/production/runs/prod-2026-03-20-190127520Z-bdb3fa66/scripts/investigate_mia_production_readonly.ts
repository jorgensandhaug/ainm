const BASE_URL = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "ao3GjpJ8_ai55JqMYx7aa3ux0SLZpbXgR8S7sS_HKys";
const EMAIL = "mia.hoffmann@example.org";

const auth = `Basic ${Buffer.from(`0:${TOKEN}`).toString("base64")}`;

type WrappedList<T> = { values: T[] };

function url(path: string): string {
  return new URL(path.replace(/^\//, ""), `${BASE_URL.replace(/\/+$/, "")}/`).toString();
}

async function api<T>(path: string): Promise<T> {
  const res = await fetch(url(path), {
    headers: {
      Authorization: auth,
      Accept: "application/json",
    },
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`${res.status} ${res.statusText} ${path}\n${text}`);
  }
  return text ? (JSON.parse(text) as T) : (undefined as T);
}

const employeeSearch = await api<WrappedList<any>>(
  `employee?email=${encodeURIComponent(EMAIL)}&count=10&fields=*`,
);
const exact = employeeSearch.values.find((value) => value.email === EMAIL);

const result: Record<string, unknown> = {
  salesModules: await api<any>("company/salesmodules?count=1000&fields=*"),
  salarySettings: await api<any>("salary/settings?fields=*"),
  divisions: await api<any>("division?count=10&fields=*"),
  salaryTypes: await api<any>("salary/type?count=1000&fields=*"),
  employeeSearch,
};

if (exact?.id) {
  result.employeeRead = await api<any>(`employee/${exact.id}?fields=*`);
  result.employmentRead = await api<WrappedList<any>>(
    `employee/employment?employeeId=${exact.id}&count=20&fields=*`,
  );
}

console.log(JSON.stringify(result, null, 2));
