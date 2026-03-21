const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa(`0:${TOKEN}`);

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: any = {
    method,
    headers: { Authorization: AUTH, "Content-Type": "application/json" },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const text = await res.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  console.log(`\n${method} ${path} => ${res.status}`);
  return { status: res.status, data: json };
}

async function main() {
  // Get company by ID from whoAmI
  console.log("=== GET /company/108114337 ===");
  const c = await api("GET", "/company/108114337?fields=*");
  if (c.status === 200) {
    console.log("Company:", JSON.stringify(c.data?.value, null, 2));
  } else {
    console.log("Error:", JSON.stringify(c.data, null, 2));
  }

  // Try the /company with the company id
  console.log("\n=== GET /company?id=108114337 ===");
  const c2 = await api("GET", "/company?id=108114337&fields=*");
  if (c2.status === 200) {
    console.log("Company:", JSON.stringify(c2.data, null, 2).slice(0, 500));
  } else {
    console.log("Error:", JSON.stringify(c2.data, null, 2));
  }

  // Also check if the divisions use the SAME org number as the company
  // Let me try getting the logged-in employee's company info
  console.log("\n=== GET /employee/18441996 ===");
  const emp = await api("GET", "/employee/18441996?fields=*");
  if (emp.status === 200) {
    const e = emp.data?.value;
    console.log("Employee company:", JSON.stringify({
      employeeId: e?.id,
      firstName: e?.firstName,
      lastName: e?.lastName,
    }, null, 2));
  }

  // Try /company/with/me with different casing
  console.log("\n=== TRY /company/with/me/ ===");
  const c3 = await api("GET", "/company/with/me/");
  console.log("Status:", c3.status);

  // Let me try /company/{companyId} directly
  console.log("\n=== TRY /company/108114337 directly ===");
  const c4 = await api("GET", "/company/108114337");
  console.log("Status:", c4.status, JSON.stringify(c4.data, null, 2).slice(0, 300));
}

main().catch(console.error);
