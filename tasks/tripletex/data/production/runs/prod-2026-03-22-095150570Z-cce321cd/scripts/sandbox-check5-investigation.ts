// Deep investigation: what fields exist on employee and employment details that we might be missing?
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: any = { method, headers: H };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  const text = await r.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  console.log(`\n${method} ${path} → ${r.status}`);
  if (!r.ok) console.error(JSON.stringify(json, null, 2));
  return { status: r.status, ok: r.ok, json };
}

async function main() {
  // Find the employee we just created in sandbox
  const empSearch = await api("GET", "/employee?firstName=TestSandbox&lastName=Verify&count=1&fields=*");
  if (empSearch.json.values?.length > 0) {
    const emp = empSearch.json.values[0];
    console.log("\n=== FULL Employee object (all fields) ===");
    console.log(JSON.stringify(emp, null, 2));

    // Get employment with full expansion
    const empId = emp.id;
    const empFull = await api("GET", `/employee/${empId}?fields=*,department(*),employments(*)`);
    console.log("\n=== Employee with expansions ===");
    console.log(JSON.stringify(empFull.json.value, null, 2));

    // Get employment details
    const employmentId = emp.employments?.[0]?.id;
    if (employmentId) {
      const details = await api("GET", `/employee/employment/details?employmentId=${employmentId}&fields=*`);
      console.log("\n=== FULL Employment Details ===");
      console.log(JSON.stringify(details.json, null, 2));

      // Get employment itself
      const employment = await api("GET", `/employee/employment/${employmentId}?fields=*`);
      console.log("\n=== FULL Employment ===");
      console.log(JSON.stringify(employment.json, null, 2));
    }
  }

  // Also try: what fields does GET /employee support in its schema?
  // Try adding some unusual fields to see what's available
  const testFields = await api("GET", "/employee?firstName=TestSandbox&lastName=Verify&count=1&fields=id,firstName,lastName,email,address(*),phoneNumberMobile,phoneNumberHome,phoneNumberWork,nationalIdentityNumber,bankAccountNumber,employeeNumber,employeeCategory(*),isContact,comments,userType");
  console.log("\n=== Employee with specific field selection ===");
  console.log(JSON.stringify(testFields.json?.values?.[0], null, 2));

  // Check if there's a separate endpoint for employee address
  const empId = empSearch.json.values?.[0]?.id;
  if (empId) {
    // Try to see what employee address looks like
    const addrTest = await api("GET", `/employee/${empId}?fields=*,address(*)`);
    console.log("\n=== Employee with address expansion ===");
    const empVal = addrTest.json?.value;
    if (empVal) {
      console.log(`address: ${JSON.stringify(empVal.address)}`);
    }
  }

  console.log("\n=== Investigation complete ===");
}

main().catch(e => { console.error(e); process.exit(1); });
