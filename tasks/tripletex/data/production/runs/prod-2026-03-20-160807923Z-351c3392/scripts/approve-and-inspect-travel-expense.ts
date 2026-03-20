const baseUrl = "https://kkpqfuj-amager.tripletex.dev/v2";
const token =
  "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";

const auth = Buffer.from(`0:${token}`).toString("base64");
const id = 11144068;

async function api(path: string, init?: RequestInit) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      Authorization: `Basic ${auth}`,
      Accept: "application/json",
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...(init?.headers ?? {}),
    },
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${path}\n${text}`);
  }
  return data;
}

let approved: unknown;
try {
  approved = await api(
    `/travelExpense/:approve?id=${id}&overrideApprovalFlow=true`,
    { method: "PUT" },
  );
} catch (error) {
  approved = String(error);
}

const [expense, costs, perDiems] = await Promise.all([
  api(`/travelExpense/${id}?fields=*`),
  api(`/travelExpense/cost?travelExpenseId=${id}&count=20&fields=*`),
  api(`/travelExpense/perDiemCompensation?travelExpenseId=${id}&count=20&fields=*`),
]);

console.log(
  JSON.stringify(
    {
      approved,
      expense: expense.value,
      costs: costs.values,
      perDiems: perDiems.values,
    },
    null,
    2,
  ),
);
