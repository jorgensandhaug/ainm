// Read back the H1/H2/H3 test employees with proper field expansion
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { "Content-Type": "application/json", Authorization: AUTH };

async function get(path: string) {
  const r = await fetch(`${BASE}${path}`, { headers: H });
  if (!r.ok) throw new Error(`GET ${path} → ${r.status} ${await r.text()}`);
  return r.json();
}

// Employee IDs from the previous script
const empIds = [18731580, 18731581, 18731586];
const labels = ["H1: employmentType=NOT_CHOSEN", "H2: workingHoursScheme=NOT_CHOSEN", "H3: BOTH NOT_CHOSEN"];

for (let i = 0; i < empIds.length; i++) {
  console.log(`\n=== ${labels[i]} (emp ${empIds[i]}) ===`);

  // Try getting employment details directly
  const empDetailRes = await get(`/employee/employment?employeeId=${empIds[i]}&fields=*`);
  if (empDetailRes.values?.length > 0) {
    const emp = empDetailRes.values[0];
    console.log("employment id:", emp.id);
    console.log("startDate:", emp.startDate);
    console.log("division:", emp.division);

    // Get employment details
    const detailRes = await get(`/employee/employment/details?employmentId=${emp.id}&fields=*`);
    if (detailRes.values?.length > 0) {
      const det = detailRes.values[0];
      console.log("employmentType:", det.employmentType);
      console.log("employmentForm:", det.employmentForm);
      console.log("remunerationType:", det.remunerationType);
      console.log("workingHoursScheme:", det.workingHoursScheme);
      console.log("percentageOfFullTimeEquivalent:", det.percentageOfFullTimeEquivalent);
      console.log("annualSalary:", det.annualSalary);
      console.log("occupationCode:", det.occupationCode);
    }
  }
}
