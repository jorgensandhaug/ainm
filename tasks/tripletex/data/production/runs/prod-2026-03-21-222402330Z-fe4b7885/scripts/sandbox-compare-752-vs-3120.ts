const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { Authorization: AUTH };

async function get(path: string) {
  const url = `${BASE}${path}`;
  const r = await fetch(url, { headers: H });
  return r.json();
}

// Compare the two candidates for STYRK 3512
console.log("=== Candidate 1: BRUKERSTØTTE IKT (id 752) ===");
const c1 = await get("/employee/employment/occupationCode/752?fields=*");
console.log(JSON.stringify(c1.value, null, 2));

console.log("\n=== Candidate 2: KUNDESTØTTE (IKT) (id 3120) ===");
const c2 = await get("/employee/employment/occupationCode/3120?fields=*");
console.log(JSON.stringify(c2.value, null, 2));

// Also check DATAKONSULENT (SUPPORT) (id 932)
console.log("\n=== Candidate 3: DATAKONSULENT (SUPPORT) (id 932) ===");
const c3 = await get("/employee/employment/occupationCode/932?fields=*");
console.log(JSON.stringify(c3.value, null, 2));

// Also check IT-BRUKERKONSULENT (id 2608)
console.log("\n=== Candidate 4: IT-BRUKERKONSULENT (id 2608) ===");
const c4 = await get("/employee/employment/occupationCode/2608?fields=*");
console.log(JSON.stringify(c4.value, null, 2));

// Check IT-MEDARBEIDER (id 2613)
console.log("\n=== Candidate 5: IT-MEDARBEIDER (id 2613) ===");
const c5 = await get("/employee/employment/occupationCode/2613?fields=*");
console.log(JSON.stringify(c5.value, null, 2));

// Check DRIFTSKONSULENT (IT SUPPORT) (id 1124)
console.log("\n=== Candidate 6: DRIFTSKONSULENT (IT SUPPORT) (id 1124) ===");
const c6 = await get("/employee/employment/occupationCode/1124?fields=*");
console.log(JSON.stringify(c6.value, null, 2));

// The STYRK-08 3512 literal group name is "IKT-brukerstøttere"
// The previous correction pattern (3313 → REGNSKAPSMEDARBEIDER) suggests using the literal singular name
// But "IKT-brukerstøtte" doesn't exist in Tripletex
// "BRUKERSTØTTE IKT" is the same words reversed — likely the best match
// "KUNDESTØTTE (IKT)" is "customer support" vs "user support" — semantically different
