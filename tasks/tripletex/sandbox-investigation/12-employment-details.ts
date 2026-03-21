// Test creating employment details for payroll employees
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
  if (res.status >= 400) console.log("  ERR:", JSON.stringify(json, null, 2).slice(0, 600));
  return { status: res.status, data: json };
}

async function main() {
  // Use existing employee 18592549 with employment 2806874
  const empId = 18592549;
  const emplId = 2806874;

  // Try POST /employee/employment/details with salary info
  console.log("=== TEST: Create employment details ===");

  // First check what occupationCode values exist
  const occRes = await api("GET", "/employee/employment/occupationCode?count=10&fields=*");
  console.log("Occupation codes sample:", JSON.stringify(occRes.data?.values?.slice(0, 5), null, 2).slice(0, 500));

  // Try creating employment details
  const detRes = await api("POST", "/employee/employment/details", {
    employment: { id: emplId },
    date: "2026-03-01",
    employmentType: "ORDINARY",
    employmentForm: "PERMANENT",
    remunerationType: "MONTHLY_WAGE",
    workingHoursScheme: "NOT_SHIFT",
    percentageOfFullTimeEquivalent: 100,
    monthlySalary: 41750,
    annualSalary: 501000,
    occupationCode: { id: occRes.data?.values?.[0]?.id },
  });
  console.log("Employment details created:", JSON.stringify(detRes.data, null, 2).slice(0, 1000));

  // Verify
  const verRes = await api("GET", `/employee/employment/details?employmentId=${emplId}&fields=*`);
  console.log("\nVerification:", JSON.stringify(verRes.data?.values, null, 2).slice(0, 1000));

  // Also check: what does the employment look like now?
  const emplRes = await api("GET", `/employee/employment/${emplId}?fields=*`);
  console.log("\nEmployment:", JSON.stringify(emplRes.data?.value, null, 2).slice(0, 1000));

  // Check: is there a payrollTaxMunicipalityId we need?
  console.log("\n=== Also: Try without occupationCode ===");
  const det2Res = await api("POST", "/employee/employment/details", {
    employment: { id: emplId },
    date: "2026-04-01",
    employmentType: "ORDINARY",
    employmentForm: "PERMANENT",
    remunerationType: "MONTHLY_WAGE",
    workingHoursScheme: "NOT_SHIFT",
    percentageOfFullTimeEquivalent: 100,
    monthlySalary: 41750,
    annualSalary: 501000,
  });
  console.log("Without occupationCode:", JSON.stringify(det2Res.data, null, 2).slice(0, 800));
}

main().catch(e => { console.error("FATAL:", e); process.exit(1); });
