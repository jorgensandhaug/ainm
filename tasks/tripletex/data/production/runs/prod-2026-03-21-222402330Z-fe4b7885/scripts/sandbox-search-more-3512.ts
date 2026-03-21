const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { "Content-Type": "application/json", Authorization: AUTH };

async function api(path: string) {
  const url = `${BASE}${path}`;
  const r = await fetch(url, { headers: H });
  const data = await r.json();
  return data;
}

// STYRK-08 3512 = "IKT-brukerstøttere" — search various related terms
const terms = ["driftstekniker", "IKT", "servicetekniker", "support", "helpdesk"];

for (const term of terms) {
  console.log(`\n=== Search: ${term} ===`);
  const data = await api(`/employee/employment/occupationCode?nameNO=${encodeURIComponent(term)}&count=20&fields=id,nameNO,code`);
  if (data.values?.length > 0) {
    for (const v of data.values) {
      console.log(`  ${v.id}: ${v.nameNO} (${v.code})`);
    }
  } else {
    console.log("  (no results)");
  }
}

// Let's also check what code 3512xxx looks like with broader search
console.log("\n=== Code prefix exploration ===");
for (const prefix of ["3512", "35121", "351"]) {
  const data = await api(`/employee/employment/occupationCode?code=${prefix}&count=5&fields=id,nameNO,code`);
  console.log(`code=${prefix}: ${data.count} results`);
  for (const v of (data.values || [])) {
    console.log(`  ${v.id}: ${v.nameNO} (${v.code})`);
  }
}
