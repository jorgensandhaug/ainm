const BASE_URL = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN =
  "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";

function authHeader() {
  return `Basic ${Buffer.from(`0:${TOKEN}`).toString("base64")}`;
}

async function request(path: string) {
  const response = await fetch(`${BASE_URL}${path}`, {
    headers: {
      Authorization: authHeader(),
      Accept: "application/json",
    },
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(`${path} failed: ${response.status}\n${JSON.stringify(data, null, 2)}`);
  }
  return data;
}

async function main() {
  const list = await request(
    "/travelExpense?employeeId=18478235&departureDateFrom=2026-03-19&returnDateTo=2026-03-21&count=20&fields=*",
  );

  const values = (list.values ?? []).map((entry: any) => ({
    id: entry.id,
    title: entry.title,
    state: entry.state,
    travelDetails: entry.travelDetails,
    perDiemCompensations: entry.perDiemCompensations,
    costs: entry.costs,
  }));

  const latest = values[0];
  if (!latest?.id) {
    throw new Error("No travel expense found.");
  }

  const [costs, perDiems] = await Promise.all([
    request(`/travelExpense/cost?travelExpenseId=${latest.id}&count=20&fields=*`),
    request(`/travelExpense/perDiemCompensation?travelExpenseId=${latest.id}&count=20&fields=*`),
  ]);

  console.log(
    JSON.stringify(
      {
        parent: values,
        childCosts: costs.values ?? [],
        childPerDiems: perDiems.values ?? [],
      },
      null,
      2,
    ),
  );
}

await main();
