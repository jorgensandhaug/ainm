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
  // Employment ID 2868689 is for emp 18736763
  const employmentId = 2868689;

  console.log("=== Reading employment details by employmentId ===");
  const detailsRes = await api("GET", `employee/employment/details?employmentId=${employmentId}&fields=*`);
  console.log("Details count:", detailsRes.count);
  if (detailsRes.values?.length > 0) {
    for (const d of detailsRes.values) {
      console.log("---");
      console.log("  id:", d.id);
      console.log("  date:", d.date);
      console.log("  employmentType:", d.employmentType);
      console.log("  workingHoursScheme:", d.workingHoursScheme);
      console.log("  remunerationType:", d.remunerationType);
      console.log("  employmentForm:", d.employmentForm);
      console.log("  annualSalary:", d.annualSalary);
      console.log("  percentageOfFullTimeEquivalent:", d.percentageOfFullTimeEquivalent);
      console.log("  occupationCode:", JSON.stringify(d.occupationCode));
    }
  }
}

main().catch(e => { console.error(e); process.exit(1); });
