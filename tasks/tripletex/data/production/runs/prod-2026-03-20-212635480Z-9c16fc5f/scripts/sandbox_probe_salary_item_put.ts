const BASE_URL = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN =
  "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";

const TRANSACTION_ID = Number(process.argv[2] ?? "6956919");
const PAYSLIP_ID = Number(process.argv[3] ?? "32627937");
const authHeader = `Basic ${Buffer.from(`0:${TOKEN}`).toString("base64")}`;

async function req(path: string, method: string, body?: unknown) {
  const response = await fetch(`${BASE_URL}/${path}`, {
    method,
    headers: {
      Authorization: authHeader,
      Accept: "application/json",
      ...(body ? { "Content-Type": "application/json; charset=utf-8" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await response.text();
  let parsed: unknown = null;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text;
    }
  }
  return {
    method,
    path,
    status: response.status,
    allow: response.headers.get("allow"),
    body: parsed,
  };
}

const paths = [
  `salary/transaction/${TRANSACTION_ID}`,
  `salary/payslip/${PAYSLIP_ID}`,
];

const payloads = [
  { label: "completed", body: { completed: true } },
  {
    label: "completed-payment",
    body: { completed: true, paymentDate: "2026-03-20" },
  },
  {
    label: "completed-payment-type",
    body: {
      completed: true,
      paymentDate: "2026-03-20",
      paymentType: { id: 10706775 },
    },
  },
  {
    label: "public-shape-plus-comment",
    body: {
      date: "2026-03-20",
      year: 2026,
      month: 3,
      paySlipsAvailableDate: "2026-03-20",
      payslipGeneralComment: "test",
      voucherComment: "test",
    },
  },
];

const results = [];
for (const path of paths) {
  results.push(await req(path, "OPTIONS"));
  results.push(await req(path, "HEAD"));
  for (const payload of payloads) {
    results.push({
      label: payload.label,
      ...(await req(path, "PUT", payload.body)),
    });
  }
}

console.log(JSON.stringify(results, null, 2));
