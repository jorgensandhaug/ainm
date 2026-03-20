const BASE_URL = "https://kkpqfuj-amager.tripletex.dev/v2";
const SESSION_TOKEN =
  "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";

const EMPLOYEE_IDS = [
  18564380,
  18564408,
  18564428,
  18564431,
  18564437,
  18564442,
  18564447,
  18565207,
];

type ApiEnvelope<T> = {
  values?: T[];
};

type Employment = {
  id?: number;
  startDate?: string | null;
  endDate?: string | null;
  division?: { id?: number | null; name?: string | null };
  employmentDetails?: Array<{
    id?: number;
    date?: string | null;
    employmentType?: string | null;
    employmentForm?: string | null;
    remunerationType?: string | null;
  }>;
  latestSalary?: {
    id?: number;
    remunerationType?: string | null;
    date?: string | null;
  } | null;
};

const authHeader = `Basic ${Buffer.from(`0:${SESSION_TOKEN}`).toString("base64")}`;

async function api<T>(path: string): Promise<ApiEnvelope<T>> {
  const response = await fetch(`${BASE_URL}${path}`, {
    headers: {
      Authorization: authHeader,
      Accept: "application/json",
    },
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`HTTP ${response.status} ${text}`);
  return (text ? JSON.parse(text) : {}) as ApiEnvelope<T>;
}

const rows = [];

for (const employeeId of EMPLOYEE_IDS) {
  const res = await api<Employment>(`/employee/employment?employeeId=${employeeId}&count=20&fields=*`);
  rows.push({
    employeeId,
    employments: (res.values ?? []).map((employment) => ({
      id: employment.id ?? null,
      startDate: employment.startDate ?? null,
      endDate: employment.endDate ?? null,
      divisionId: employment.division?.id ?? null,
      divisionName: employment.division?.name ?? null,
      latestSalaryId: employment.latestSalary?.id ?? null,
      latestSalaryDate: employment.latestSalary?.date ?? null,
      latestSalaryRemunerationType: employment.latestSalary?.remunerationType ?? null,
      employmentDetails: (employment.employmentDetails ?? []).map((detail) => ({
        id: detail.id ?? null,
        date: detail.date ?? null,
        employmentType: detail.employmentType ?? null,
        employmentForm: detail.employmentForm ?? null,
        remunerationType: detail.remunerationType ?? null,
      })),
    })),
  });
}

console.log(JSON.stringify(rows, null, 2));
