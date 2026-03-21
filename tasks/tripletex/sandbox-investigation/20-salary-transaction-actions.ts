// TEST: Undocumented salary transaction action endpoints
// Previous probing only tested PAYSLIP actions. Transaction may have different actions.
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa(`0:${TOKEN}`);

async function raw(method: string, path: string) {
  const url = `${BASE}${path}`;
  const res = await fetch(url, {
    method,
    headers: { Authorization: AUTH, "Content-Type": "application/json", Accept: "application/json" },
  });
  const allow = res.headers.get("allow");
  const text = await res.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  return { status: res.status, allow, message: json?.message?.slice?.(0, 100) || json?.developerMessage?.slice?.(0, 100) };
}

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: RequestInit = { method, headers: { Authorization: AUTH, "Content-Type": "application/json" } };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const text = await res.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  return { status: res.status, data: json };
}

async function main() {
  const empId = 18592549;

  // Get salary types
  const stRes = await api("GET", "/salary/type?count=1000&fields=*");
  const fastlonn = stRes.data?.values?.find((t: any) => t.name === "Fastlønn");
  const bonus = stRes.data?.values?.find((t: any) => t.name === "Bonus");

  // Create a fresh salary transaction
  const txRes = await api("POST", "/salary/transaction?generateTaxDeduction=true", {
    date: "2026-03-21",
    year: 2026,
    month: 8,
    paySlipsAvailableDate: "2026-03-21",
    payslips: [{
      employee: { id: empId },
      specifications: [
        { employee: { id: empId }, salaryType: { id: fastlonn?.id }, description: "Fastlønn", year: 2026, month: 8, count: 1, rate: 41750, amount: 41750 },
        { employee: { id: empId }, salaryType: { id: bonus?.id }, description: "Bonus", year: 2026, month: 8, count: 1, rate: 6750, amount: 6750 },
      ],
    }],
  });

  const txId = txRes.data?.value?.id;
  const psId = txRes.data?.value?.payslips?.[0]?.id;
  console.log(`Created: tx=${txId} ps=${psId}`);

  if (!txId) {
    console.log("FAILED", JSON.stringify(txRes.data, null, 2).slice(0, 500));
    return;
  }

  // Test TRANSACTION action endpoints
  console.log("\n=== TRANSACTION ACTIONS ===\n");
  const txActions = [
    "PUT /:complete",
    "POST /:complete",
    "PUT /:book",
    "POST /:book",
    "PUT /:sendToLedger",
    "POST /:sendToLedger",
    "PUT /:execute",
    "POST /:execute",
    "PUT /:run",
    "POST /:run",
    "PUT /:deliver",
    "POST /:deliver",
    "PUT /:approve",
    "POST /:approve",
    "PUT /:confirm",
    "POST /:confirm",
    "PUT /:pay",
    "POST /:pay",
    "PUT /:close",
    "POST /:close",
    "PUT /:finalize",
    "POST /:finalize",
    "PUT /:process",
    "POST /:process",
  ];

  for (const action of txActions) {
    const [method, suffix] = action.split(" ");
    const result = await raw(method, `/salary/transaction/${txId}${suffix}`);
    const indicator = result.status < 400 ? "✓ SUCCESS" :
                     result.status === 404 ? "  404 not found" :
                     result.status === 405 ? "  405 method not allowed" :
                     result.status === 403 ? "  403 forbidden" :
                     `  ${result.status}`;
    console.log(`${action.padEnd(25)} => ${indicator} ${result.message || ''}`);
    if (result.allow) console.log(`    Allow: ${result.allow}`);
  }

  // Also test batch/list actions
  console.log("\n=== BATCH ACTIONS (salary/transaction/) ===\n");
  const batchActions = [
    "PUT /salary/transaction/:complete",
    "POST /salary/transaction/:complete",
    "PUT /salary/transaction/:book",
    "POST /salary/transaction/:book",
    "PUT /salary/transaction/:execute",
    "PUT /salary/transaction/:run",
    "PUT /salary/transaction/:deliver",
    "PUT /salary/transaction/:pay",
  ];

  for (const action of batchActions) {
    const [method, path] = action.split(" ");
    const result = await raw(method, `${path}?id=${txId}`);
    const indicator = result.status < 400 ? "✓ SUCCESS" :
                     result.status === 404 ? "  404" :
                     result.status === 405 ? "  405" :
                     result.status === 403 ? "  403" :
                     `  ${result.status}`;
    console.log(`${action.padEnd(50)} => ${indicator} ${result.message || ''}`);
    if (result.allow) console.log(`    Allow: ${result.allow}`);
  }

  // Check if there's a salary/v2 API
  console.log("\n=== SALARY V2 API ===\n");
  const v2Actions = [
    "GET /salary/v2/payment?count=10",
    "GET /salary/v2/payslip?count=10",
    "GET /salary/v2/transaction?count=10",
  ];
  for (const action of v2Actions) {
    const [method, path] = action.split(" ");
    const result = await raw(method, path);
    console.log(`${action.padEnd(50)} => ${result.status} ${result.message || ''}`);
  }

  // Check if payslip search works in prod differently
  console.log("\n=== PAYSLIP SEARCH VARIATIONS ===\n");
  const searches = [
    `/salary/payslip?employeeId=${empId}&count=100&fields=*`,
    `/salary/payslip?employeeId=${empId}&yearFrom=2026&monthFrom=8&yearTo=2026&monthTo=9&count=100&fields=*`,
    `/salary/payslip?count=100&fields=*`,
    `/salary/payslip?transactionId=${txId}&count=100&fields=*`,
  ];
  for (const path of searches) {
    const res = await api("GET", path);
    console.log(`GET ${path.slice(0, 80)}... => ${res.status} fullResultSize=${res.data?.fullResultSize}`);
  }

  // Clean up
  await api("DELETE", `/salary/transaction/${txId}`);
  console.log(`\nCleaned up tx=${txId}`);
}

main().catch(e => { console.error("FATAL:", e); process.exit(1); });
