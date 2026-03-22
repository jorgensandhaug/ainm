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
  const empId = 18743260;

  // Get employment without nested expansion
  const employment = await api("GET", `/employee/employment?employeeId=${empId}&fields=id,startDate`);
  console.log("Employment:", JSON.stringify(employment.values, null, 2));

  if (!employment.values?.length) return;
  const emplId = employment.values[0].id;

  // Get employment details
  const details = await api("GET", `/employee/employment/details?employmentId=${emplId}&fields=*`);
  console.log("Employment Details:", JSON.stringify(details.values, null, 2));
}

main().catch(e => { console.error("FATAL:", e); process.exit(1); });
