const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa(`0:${TOKEN}`);
const H = { "Content-Type": "application/json", Authorization: AUTH };

async function api(method: string, path: string) {
  const url = `${BASE}/${path}`;
  const r = await fetch(url, { method, headers: H });
  const data = await r.json();
  return data;
}

async function main() {
  // Read employment details for emp 18736763 (created with NOT_CHOSEN)
  const empId = 18736763;

  // Try reading employment directly
  console.log("=== Reading employee employment ===");
  const empRes = await api("GET", `employee/employment?employeeId=${empId}&fields=*`);
  console.log("Employment count:", empRes.count);
  if (empRes.values?.length > 0) {
    const emp = empRes.values[0];
    console.log("Employment ID:", emp.id);
    console.log("startDate:", emp.startDate);
    console.log("division:", JSON.stringify(emp.division));
  }

  // Read employment details
  console.log("\n=== Reading employment details ===");
  const detailsRes = await api("GET", `employee/employment/details?employeeId=${empId}&fields=*`);
  console.log("Details count:", detailsRes.count);
  if (detailsRes.values?.length > 0) {
    const d = detailsRes.values[0];
    console.log("employmentType:", d.employmentType);
    console.log("workingHoursScheme:", d.workingHoursScheme);
    console.log("remunerationType:", d.remunerationType);
    console.log("employmentForm:", d.employmentForm);
    console.log("annualSalary:", d.annualSalary);
    console.log("percentageOfFullTimeEquivalent:", d.percentageOfFullTimeEquivalent);
    console.log("occupationCode:", JSON.stringify(d.occupationCode));
  }

  // Read standard time
  console.log("\n=== Reading employee standard time ===");
  const stRes = await api("GET", `employee/standardTime?employeeId=${empId}&fields=*`);
  console.log("StandardTime count:", stRes.count);
  if (stRes.values?.length > 0) {
    const st = stRes.values[0];
    console.log("hoursPerDay:", st.hoursPerDay);
    console.log("fromDate:", st.fromDate);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
