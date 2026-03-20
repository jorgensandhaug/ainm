const BASE_URL = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN =
  "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";

const EMPLOYEE_ID = Number(process.argv[2] ?? "18587860");
const authHeader = `Basic ${Buffer.from(`0:${TOKEN}`).toString("base64")}`;

async function api(path: string, init?: RequestInit) {
  const response = await fetch(`${BASE_URL}/${path}`, {
    ...init,
    headers: {
      Authorization: authHeader,
      Accept: "application/json",
      ...(init?.body ? { "Content-Type": "application/json; charset=utf-8" } : {}),
      ...(init?.headers ?? {}),
    },
  });
  const text = await response.text();
  let body: unknown = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }
  return {
    status: response.status,
    body,
  };
}

const before = await api(`employee/${EMPLOYEE_ID}?fields=*`);

const payloads = [
  { label: "allowLogin-true", body: { allowLogin: true } },
  { label: "userType-standard", body: { userType: "STANDARD" } },
  {
    label: "allowLogin-standard",
    body: { allowLogin: true, userType: "STANDARD" },
  },
  {
    label: "delivery-manual",
    body: { deliveryMethodWageSlipString: "MANUAL" },
  },
  {
    label: "delivery-email",
    body: { deliveryMethodWageSlipString: "EMAIL" },
  },
  {
    label: "delivery-app",
    body: { deliveryMethodWageSlipString: "APP" },
  },
  {
    label: "isPayslipOnly",
    body: { isPayslipOnly: true },
  },
];

const results = [];
for (const payload of payloads) {
  results.push({
    label: payload.label,
    update: await api(`employee/${EMPLOYEE_ID}`, {
      method: "PUT",
      body: JSON.stringify(payload.body),
    }),
    after: await api(`employee/${EMPLOYEE_ID}?fields=*`),
  });
}

console.log(JSON.stringify({ before, results }, null, 2));
