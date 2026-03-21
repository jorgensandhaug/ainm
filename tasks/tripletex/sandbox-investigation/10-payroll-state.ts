// Check payroll state using existing sandbox employees
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa(`0:${TOKEN}`);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: RequestInit = { method, headers: H };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const text = await res.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  console.log(`${method} ${path} => ${res.status}`);
  if (res.status >= 400) console.log("  ERR:", JSON.stringify(json, null, 2).slice(0, 400));
  return { status: res.status, data: json };
}

async function main() {
  // Use existing sandbox payslips to understand the state
  // First check existing salary transactions
  const txRes = await api("GET", "/salary/transaction?count=10&fields=*&sorting=id&order=desc");
  console.log("Transactions:", txRes.data?.fullResultSize);

  // Check existing payslips
  const psRes = await api("GET", "/salary/payslip?count=10&fields=*,specifications(*,salaryType(*))&sorting=id&order=desc");
  console.log("Payslips:", psRes.data?.fullResultSize);
  for (const ps of (psRes.data?.values || []).slice(0, 3)) {
    console.log(`\n  PS id=${ps.id} emp=${ps.employee?.id} year=${ps.year} month=${ps.month}`);
    console.log(`  grossAmount=${ps.grossAmount} netAmount=${ps.netAmount} amount=${ps.amount}`);
    console.log(`  payslipGeneralType=${ps.payslipGeneralType} status=${ps.status}`);
    console.log(`  specifications: ${ps.specifications?.length}`);
    for (const s of (ps.specifications || [])) {
      console.log(`    spec: type=${s.salaryType?.name}(${s.salaryType?.number}) amount=${s.amount} count=${s.count} rate=${s.rate}`);
    }
    // Check all non-null fields
    const keys = Object.keys(ps).filter(k => ps[k] != null && ps[k] !== "" && ps[k] !== 0 && ps[k] !== false);
    console.log(`  non-null fields: ${keys.join(", ")}`);
  }

  // Check salary settings
  const settRes = await api("GET", "/salary/settings?fields=*");
  if (settRes.status < 400) {
    console.log("\nSalary settings:", JSON.stringify(settRes.data?.value, null, 2).slice(0, 1000));
  }

  // Check company sales modules for WAGE
  const modRes = await api("GET", "/company/salesmodules?count=1000&fields=*");
  if (modRes.status < 400) {
    const wage = modRes.data?.values?.find((m: any) => m.name === "WAGE" || m.module === "WAGE");
    console.log("\nWAGE module:", JSON.stringify(wage, null, 2));
  }

  // KEY: Check if there's a payroll-run or salary-payment endpoint
  console.log("\n=== Checking payroll-run and payment endpoints ===");

  // Try various endpoints
  for (const path of [
    "/salary/payrollRun?count=5&fields=*",
    "/salary/payment?count=5&fields=*",
    "/salary/paymentType?count=5&fields=*",
  ]) {
    await api("GET", path);
  }

  // If we have a payslip, check if there's an "approve" or "confirm" action
  if (psRes.data?.values?.length > 0) {
    const psId = psRes.data.values[0].id;
    console.log(`\n=== Try payslip actions on ${psId} ===`);
    // Try approve
    await api("PUT", `/salary/payslip/${psId}/:approve`);
    // Try confirm
    await api("PUT", `/salary/payslip/${psId}/:confirm`);
    // Try close
    await api("PUT", `/salary/payslip/${psId}/:close`);
  }

  // Check if salary/transaction has actions
  if (txRes.data?.values?.length > 0) {
    const txId = txRes.data.values[0].id;
    console.log(`\n=== Try transaction actions on ${txId} ===`);
    await api("PUT", `/salary/transaction/${txId}/:approve`);
    await api("PUT", `/salary/transaction/${txId}/:confirm`);
    await api("PUT", `/salary/transaction/${txId}/:close`);
    // Most importantly - does it need to be "executed"?
    await api("PUT", `/salary/transaction/${txId}/:execute`);
  }
}

main().catch(e => { console.error("FATAL:", e); process.exit(1); });
