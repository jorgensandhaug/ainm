// Verify the response shape of GET /employee/employment/details
// to confirm it's a list response (.values[]) not single (.value)
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

async function api(method: string, path: string) {
  const url = `${BASE}${path}`;
  const r = await fetch(url, { method, headers: H });
  const json = await r.json();
  console.log(`${method} ${path} → ${r.status}`);
  return json;
}

async function main() {
  // Find an existing employee with employment to check response shape
  const emps = await api("GET", "/employee?count=1&fields=id,employments(id)");
  if (emps.count === 0) {
    console.log("No employees found in sandbox");
    return;
  }
  const emp = emps.values[0];
  const employmentId = emp.employments?.[0]?.id;
  console.log("Employee:", emp.id, "Employment:", employmentId);

  if (!employmentId) {
    console.log("No employment found");
    return;
  }

  // Check response shape of employment details
  const details = await api("GET", `/employee/employment/details?employmentId=${employmentId}&fields=*`);

  console.log("\n--- Response shape analysis ---");
  console.log("Has .value?", details.value !== undefined);
  console.log("Has .values?", details.values !== undefined);
  console.log("Has .count?", details.count !== undefined);
  console.log("Type:", details.values ? "LIST (.values[])" : details.value ? "SINGLE (.value)" : "UNKNOWN");

  if (details.values) {
    console.log("values.length:", details.values.length);
    const d = details.values[0];
    if (d) {
      console.log("First detail occupationCode:", d.occupationCode?.id);
      console.log("First detail annualSalary:", d.annualSalary);
      console.log("First detail percentageOfFullTimeEquivalent:", d.percentageOfFullTimeEquivalent);
      console.log("First detail payrollTaxMunicipalityId:", d.payrollTaxMunicipalityId?.id);
    }
  }

  // Also check: can we combine employee + details in one call?
  const empFull = await api("GET", `/employee/${emp.id}?fields=*,employments(*,employmentDetails(*))`);
  console.log("\n--- Deep expansion test ---");
  const firstEmp = empFull.value?.employments?.[0];
  if (firstEmp) {
    const firstDetail = firstEmp.employmentDetails?.[0];
    console.log("Employment details via deep expansion:");
    console.log("  Has full detail?", firstDetail?.annualSalary !== undefined);
    console.log("  annualSalary:", firstDetail?.annualSalary);
    console.log("  occupationCode:", firstDetail?.occupationCode?.id);
    console.log("  percentageOfFullTimeEquivalent:", firstDetail?.percentageOfFullTimeEquivalent);
  }
}

main().catch(console.error);
