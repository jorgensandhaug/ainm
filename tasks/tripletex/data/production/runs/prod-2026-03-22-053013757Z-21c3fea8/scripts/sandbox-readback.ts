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

  // Get employee with all fields
  const emp = await api("GET", `/employee/${empId}?fields=id,firstName,lastName,dateOfBirth,nationalIdentityNumber,bankAccountNumber,department(id,name)`);
  console.log("Employee:", JSON.stringify(emp.value, null, 2));

  // Get employment with nested details
  const employment = await api("GET", `/employee/employment?employeeId=${empId}&fields=id,startDate,division(id,name),employmentDetails(id,date,employmentType,employmentForm,remunerationType,workingHoursScheme,percentageOfFullTimeEquivalent,annualSalary,occupationCode(id,nameNO,code),payrollTaxMunicipalityId(id,municipalityName))`);
  console.log("Employment:", JSON.stringify(employment.values, null, 2));

  // Get employment details separately
  const details = await api("GET", `/employee/employment/details?employmentId=${employment.values?.[0]?.id}&fields=*`);
  console.log("Employment Details:", JSON.stringify(details.values, null, 2));

  // Get standard time
  const st = await api("GET", `/employee/standardTime?employeeId=${empId}&fields=*`);
  console.log("Standard Time:", JSON.stringify(st.values, null, 2));
}

main().catch(e => { console.error("FATAL:", e); process.exit(1); });
