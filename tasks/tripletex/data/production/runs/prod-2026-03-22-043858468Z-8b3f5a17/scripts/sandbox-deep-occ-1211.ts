const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

async function api(path: string) {
  const url = `${BASE}${path}`;
  const res = await fetch(url, { method: "GET", headers: H });
  const text = await res.text();
  return JSON.parse(text);
}

async function main() {
  // The pattern with other STYRK codes shows the Tripletex code prefix matches STYRK:
  // STYRK 3313 → REGNSKAPSMEDARBEIDER (id 4677) — what's its Tripletex code prefix?
  // STYRK 3323 → INNKJØPSASSISTENT (id 2507) — what's its Tripletex code prefix?
  // STYRK 2511 → AUTORISERT REGNSKAPSFØRER (id 301) — what's its Tripletex code?

  // First, let's check the known-correct mappings to understand the pattern
  console.log("=== CHECKING KNOWN-CORRECT MAPPINGS ===");
  const knownIds = [4677, 2507, 301, 752, 2951, 4930, 4679, 4169, 5935, 2610, 3544];
  for (const id of knownIds) {
    const r = await api(`/employee/employment/occupationCode/${id}?fields=id,nameNO,code`);
    const v = r.value;
    console.log(`id=${v.id} code=${v.code} name=${v.nameNO}`);
  }

  // Now search for codes with "1211" in the code field, using a higher count
  console.log("\n=== SEARCHING code=1211 with count=500 ===");
  const r1 = await api("/employee/employment/occupationCode?code=1211&count=500&fields=id,nameNO,code");
  console.log(`Total: ${r1.fullCount} returned: ${r1.count}`);
  // Filter for codes starting with 1211
  const starting1211 = (r1.values || []).filter((o: any) => String(o.code).startsWith("1211"));
  console.log(`Codes starting with 1211: ${starting1211.length}`);
  if (starting1211.length > 0) {
    for (const o of starting1211) {
      console.log(`  id=${o.id} code=${o.code} name=${o.nameNO}`);
    }
  }

  // Also try alternative names that might map to STYRK 1211
  // STYRK 1211 = Finance managers / Finans- og økonomisjef
  const searches = [
    "finans",
    "økonomi",
    "forvaltnings",
    "forvaltning",
    "administrerende",
    "avdelingssjef",
  ];

  for (const s of searches) {
    console.log(`\n=== nameNO=${s} ===`);
    const r = await api(`/employee/employment/occupationCode?nameNO=${encodeURIComponent(s)}&count=20&fields=id,nameNO,code`);
    for (const o of (r.values || [])) {
      // Highlight codes starting with 1211 or containing "finans"
      const mark = String(o.code).startsWith("1211") ? " <<< STARTS WITH 1211" : "";
      console.log(`  id=${o.id} code=${o.code} name=${o.nameNO}${mark}`);
    }
  }
}

main().catch(e => { console.error(e); process.exit(1); });
