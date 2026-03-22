const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

async function api(path: string) {
  const url = `${BASE}${path}`;
  const res = await fetch(url, { method: "GET", headers: H });
  return JSON.parse(await res.text());
}

async function main() {
  // Search for ALL codes in the 1231xxx range (STYRK-98 category for Økonomidirektører og -sjefer)
  console.log("=== All codes starting with 1231 ===");
  const r1 = await api("/employee/employment/occupationCode?code=1231&count=100&fields=id,nameNO,code");
  const codes1231 = (r1.values || []).filter((o: any) => String(o.code).startsWith("1231"));
  console.log(`Found ${codes1231.length} codes starting with 1231:`);
  for (const o of codes1231) {
    console.log(`  id=${o.id} code=${o.code} name=${o.nameNO}`);
  }

  // Also check codes starting with 1211 more thoroughly
  // Try different approach: iterate through the full database and look for code prefix 1211
  console.log("\n=== Codes starting with 1211 (different search) ===");
  // Try searching by individual names related to STYRK 1211
  const names = [
    "finans- og økonomi",
    "finans og økonomi",
    "finans-",
    "økonomi- og finans",
  ];
  for (const n of names) {
    const r = await api(`/employee/employment/occupationCode?nameNO=${encodeURIComponent(n)}&count=10&fields=id,nameNO,code`);
    if (r.values?.length > 0) {
      console.log(`nameNO=${n}:`);
      for (const o of r.values) {
        console.log(`  id=${o.id} code=${o.code} name=${o.nameNO}`);
      }
    } else {
      console.log(`nameNO=${n}: 0 results`);
    }
  }

  // Check: is there a STYRK code 1211 in the Norwegian SSB database?
  // The Tripletex occupation code might store the SSB STYRK code as a separate field
  // Let's check the full field list for the occupationCode endpoint
  console.log("\n=== Full field list for occupationCode ===");
  const r2 = await api("/employee/employment/occupationCode/1577?fields=*");
  console.log("FINANSSJEF fields:", JSON.stringify(r2.value));
  const r3 = await api("/employee/employment/occupationCode/6538?fields=*");
  console.log("ØKONOMISJEF fields:", JSON.stringify(r3.value));

  // Search for "FINANS- OG ØKONOMISJEF" as an exact name
  console.log("\n=== Looking for combined 'finans- og økonomisjef' ===");
  const r4 = await api("/employee/employment/occupationCode?nameNO=finans-%20og%20%C3%B8konomisjef&count=10&fields=id,nameNO,code");
  console.log(`Results: ${r4.count}`);
  for (const o of (r4.values || [])) {
    console.log(`  id=${o.id} code=${o.code} name=${o.nameNO}`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
