const BASE_URL = "https://kkpqfuj-amager.tripletex.dev/v2";
const SESSION_TOKEN =
  "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";

type ApiEnvelope<T> = {
  value?: T;
  values?: T[];
};

type Employee = {
  id: number;
  firstName?: string;
  lastName?: string;
  displayName?: string;
  email?: string;
  dateOfBirth?: string | null;
  allowInformationRegistration?: boolean;
  employments?: Array<{
    id?: number;
    startDate?: string | null;
    endDate?: string | null;
    division?: { id?: number | null };
    employmentDetails?: Array<{
      id?: number;
      date?: string | null;
      employmentType?: string | null;
      employmentForm?: string | null;
      remunerationType?: string | null;
    }>;
    latestSalary?: { id?: number } | null;
  }>;
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

const employees = (await api<Employee>(`/employee?count=20&fields=*`)).values ?? [];

console.log(
  JSON.stringify(
    employees.map((employee) => ({
      id: employee.id,
      name: employee.displayName ?? `${employee.firstName ?? ""} ${employee.lastName ?? ""}`.trim(),
      email: employee.email ?? null,
      allowInformationRegistration: employee.allowInformationRegistration ?? null,
      dateOfBirth: employee.dateOfBirth ?? null,
      employments: (employee.employments ?? []).map((employment) => ({
        id: employment.id ?? null,
        startDate: employment.startDate ?? null,
        endDate: employment.endDate ?? null,
        divisionId: employment.division?.id ?? null,
        latestSalaryId: employment.latestSalary?.id ?? null,
        employmentDetails: (employment.employmentDetails ?? []).map((detail) => ({
          id: detail.id ?? null,
          date: detail.date ?? null,
          employmentType: detail.employmentType ?? null,
          employmentForm: detail.employmentForm ?? null,
          remunerationType: detail.remunerationType ?? null,
        })),
      })),
    })),
    null,
    2,
  ),
);
