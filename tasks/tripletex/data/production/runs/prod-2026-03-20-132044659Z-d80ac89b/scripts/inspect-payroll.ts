const baseUrl = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const token = "fqPovyPwlmW2xtyFFTPDEZyauR7UkUwYLuLqfqYnUIA";

const auth = `Basic ${Buffer.from(`0:${token}`).toString("base64")}`;

type ApiResponse<T> = {
  value?: T;
  values?: T[];
  fullResultSize?: number;
};

async function api<T>(path: string): Promise<T> {
  const res = await fetch(`${baseUrl}${path}`, {
    headers: {
      Authorization: auth,
      Accept: "application/json",
    },
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`${res.status} ${res.statusText}\n${text}`);
  }

  return text ? (JSON.parse(text) as T) : (undefined as T);
}

const employeeEmail = "fernando.sanchez@example.org";

const employeeResp = await api<ApiResponse<any>>(
  `/employee?email=${encodeURIComponent(employeeEmail)}&count=10&fields=*`,
);

console.log("EMPLOYEE");
console.log(JSON.stringify(employeeResp, null, 2));

const employee = employeeResp.values?.find((e) => e.email === employeeEmail);
if (!employee) {
  throw new Error("Employee not found by exact email");
}

const salaryTypeResp = await api<ApiResponse<any>>(
  `/salary/type?employeeIds=${employee.id}&count=1000&fields=*`,
);

console.log("SALARY_TYPES");
console.log(JSON.stringify(salaryTypeResp, null, 2));
