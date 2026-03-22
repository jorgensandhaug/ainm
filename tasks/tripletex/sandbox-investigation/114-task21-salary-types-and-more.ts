/**
 * Investigation: Task 21 Check 5 — explore salary types, employee categories,
 * hourly cost & rate, and entitlements. Search for any step we're missing.
 */

const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa(`0:${TOKEN}`);
const H = { "Content-Type": "application/json", Authorization: AUTH };

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}/${path}`;
  const opts: RequestInit = { method, headers: H };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  const text = await r.text();
  console.log(`${method} ${path} → ${r.status}`);
  let parsed: any;
  try { parsed = JSON.parse(text); } catch { parsed = text; }
  if (!r.ok) console.error(`  ERROR: ${text.substring(0, 300)}`);
  return { ok: r.ok, status: r.status, data: parsed };
}

async function main() {
  // ==========================================
  // 1. List available salary types
  // ==========================================
  console.log("\n=== SALARY TYPES (lønnsarter) ===");
  const st = await api("GET", "salary/type?count=20&fields=id,number,name,description");
  if (st.ok) {
    for (const v of st.data.values || []) {
      console.log(`  ${v.number}: ${v.name} (${v.description || ""})`);
    }
  }

  // ==========================================
  // 2. List employee categories
  // ==========================================
  console.log("\n=== EMPLOYEE CATEGORIES ===");
  const ec = await api("GET", "employee/category?count=20&fields=id,name,number,description");
  if (ec.ok) {
    for (const v of ec.data.values || []) {
      console.log(`  ${v.id}: ${v.name} (${v.number}) - ${v.description || ""}`);
    }
  }

  // ==========================================
  // 3. Check employee entitlements
  // ==========================================
  console.log("\n=== EMPLOYEE ENTITLEMENTS ===");
  const ee = await api("GET", "employee/entitlement?count=20&fields=*");
  if (ee.ok) {
    console.log("  Count:", ee.data.count);
    for (const v of (ee.data.values || []).slice(0, 5)) {
      console.log(`  Entitlement:`, JSON.stringify(v));
    }
  }

  // ==========================================
  // 4. Check hourly cost and rate for existing employee
  // ==========================================
  console.log("\n=== HOURLY COST AND RATE (for employee 18737928) ===");
  const hcr = await api("GET", "employee/hourlyCostAndRate?employeeId=18737928&fields=*");
  if (hcr.ok) {
    console.log("  Values:", JSON.stringify(hcr.data.values));
  }

  // ==========================================
  // 5. Try creating hourly cost and rate
  // ==========================================
  console.log("\n=== TRY POST hourly cost and rate ===");
  const hcrPost = await api("POST", "employee/hourlyCostAndRate", {
    employee: { id: 18737928 },
    date: "2026-06-01",
    rate: 308,
    hourCostRate: 308,
  });
  if (hcrPost.ok) {
    console.log("  Created:", JSON.stringify(hcrPost.data.value));
  }

  // ==========================================
  // 6. Check salary settings
  // ==========================================
  console.log("\n=== SALARY SETTINGS ===");
  const ss = await api("GET", "salary/settings?fields=*");
  if (ss.ok) {
    console.log("  Settings:", JSON.stringify(ss.data.value));
  }

  // ==========================================
  // 7. Explore employee/employment/employmentType endpoint
  // ==========================================
  console.log("\n=== EMPLOYMENT TYPES ===");
  const et = await api("GET", "employee/employment/employmentType?count=20&fields=*");
  if (et.ok) {
    for (const v of (et.data.values || []).slice(0, 10)) {
      console.log(`  ${JSON.stringify(v)}`);
    }
  }

  // ==========================================
  // 8. Check remuneration types
  // ==========================================
  console.log("\n=== REMUNERATION TYPES ===");
  const rt = await api("GET", "employee/employment/remunerationType?count=20&fields=*");
  if (rt.ok) {
    for (const v of (rt.data.values || []).slice(0, 10)) {
      console.log(`  ${JSON.stringify(v)}`);
    }
  }

  // ==========================================
  // 9. Check working hours schemes
  // ==========================================
  console.log("\n=== WORKING HOURS SCHEMES ===");
  const whs = await api("GET", "employee/employment/workingHoursScheme?count=20&fields=*");
  if (whs.ok) {
    for (const v of (whs.data.values || []).slice(0, 10)) {
      console.log(`  ${JSON.stringify(v)}`);
    }
  }

  // ==========================================
  // 10. Check employment form types
  // ==========================================
  console.log("\n=== EMPLOYMENT FORM TYPES ===");
  const eft = await api("GET", "employee/employment/employmentType/employmentFormType?count=20&fields=*");
  if (eft.ok) {
    for (const v of (eft.data.values || []).slice(0, 10)) {
      console.log(`  ${JSON.stringify(v)}`);
    }
  }

  // ==========================================
  // 11. What does salary/type POST look like?
  // ==========================================
  console.log("\n=== TRY salary/transaction POST (explore) ===");
  // Just to see the error message and understand what's expected
  const txn = await api("POST", "salary/transaction", {
    date: "2026-06-01",
    year: 2026,
    month: 6,
  });

  // ==========================================
  // 12. Check if there's a /salary/payslip for employee
  // ==========================================
  console.log("\n=== SALARY PAYSLIPS ===");
  const ps = await api("GET", "salary/payslip?employeeId=18737928&count=5&fields=*");
  if (ps.ok) {
    console.log("  Count:", ps.data.count);
  }

  // ==========================================
  // 13. Check if there's an employee-level GET with ALL expanded fields
  // ==========================================
  console.log("\n=== EMPLOYEE WITH DEEP EXPANSION ===");
  const empDeep = await api("GET", "employee/18737928?fields=id,firstName,lastName,dateOfBirth,email,address(*),department(*),employments(*),employeeCategory(*),holidayAllowanceEarned(*)");
  if (empDeep.ok) {
    const v = empDeep.data.value;
    console.log("  address:", JSON.stringify(v.address));
    console.log("  employeeCategory:", JSON.stringify(v.employeeCategory));
    console.log("  holidayAllowanceEarned:", JSON.stringify(v.holidayAllowanceEarned));
    console.log("  employments:", JSON.stringify(v.employments));
  }

  console.log("\n\nDONE");
}

main().catch(e => { console.error(e); process.exit(1); });
