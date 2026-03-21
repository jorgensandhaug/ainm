const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);

// Get more employees
const res = await fetch(`${BASE}/employee?count=50&fields=*`, {
  headers: { Authorization: AUTH },
});
const data = await res.json();
console.log("Total employees:", data.fullResultSize);

for (const e of data.values || []) {
  console.log(`id=${e.id} ${e.firstName} ${e.lastName} dob=${e.dateOfBirth} emps=${e.employments?.length}`);
}

// Check employments for those with DOB
const withDob = data.values?.filter((e: any) => e.dateOfBirth) || [];
for (const e of withDob.slice(0, 5)) {
  const emplRes = await fetch(`${BASE}/employee/employment?employeeId=${e.id}&count=20&fields=*`, {
    headers: { Authorization: AUTH },
  });
  const emplData = await emplRes.json();
  for (const empl of emplData.values || []) {
    console.log(`  emp ${e.id}: employment ${empl.id} start=${empl.startDate} div=${empl.division?.id} divName=${empl.division?.displayName}`);
  }
}
