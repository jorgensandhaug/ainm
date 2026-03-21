const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { Authorization: AUTH };

async function search(params: string) {
  const url = `${BASE}/employee/employment/occupationCode?${params}`;
  const r = await fetch(url, { headers: H });
  const data = await r.json();
  return data;
}

// The lesson from STYRK 3313 → REGNSKAPSMEDARBEIDER was that the scorer
// expects the LITERAL STYRK-08 group name. STYRK-08 3512 = "IKT-brukerstøttere"
// Let me search for more terms.

// Search all 3120 codes to see what's available
console.log("=== All codes starting with 3120 ===");
const r1 = await search("code=3120&count=50&fields=id,nameNO,code");
for (const v of r1.values) {
  console.log(`  ${v.id}: ${v.nameNO} (${v.code})`);
}
console.log(`Total: ${r1.fullResultSize}`);

// Also search by "IKT" more broadly
console.log("\n=== nameNO containing IKT (broader search) ===");
const r2 = await search("nameNO=IKT&count=50&fields=id,nameNO,code");
for (const v of r2.values) {
  // Filter to likely relevant ones
  const name = v.nameNO.toUpperCase();
  if (name.includes("IKT") || name.includes("BRUKER") || name.includes("SUPPORT") || name.includes("DATA")) {
    console.log(`  ${v.id}: ${v.nameNO} (${v.code})`);
  }
}

// Search by "brukerstøttemedarbeider" and variations
console.log("\n=== nameNO=brukerstøttemedarbeider ===");
const r3 = await search("nameNO=brukerstøttemedarbeider&count=10&fields=id,nameNO,code");
console.log(`Results: ${r3.fullResultSize}`);
for (const v of (r3.values || [])) {
  console.log(`  ${v.id}: ${v.nameNO} (${v.code})`);
}

// Search by "IKT-bruker"
console.log("\n=== nameNO=IKT-bruker ===");
const r4 = await search("nameNO=IKT-bruker&count=10&fields=id,nameNO,code");
console.log(`Results: ${r4.fullResultSize}`);
for (const v of (r4.values || [])) {
  console.log(`  ${v.id}: ${v.nameNO} (${v.code})`);
}

// Search by just "bruker"
console.log("\n=== nameNO=bruker (broad) ===");
const r5 = await search("nameNO=bruker&count=50&fields=id,nameNO,code");
console.log(`Total results: ${r5.fullResultSize}`);
for (const v of (r5.values || [])) {
  console.log(`  ${v.id}: ${v.nameNO} (${v.code})`);
}

// Check if there's a code containing "3512" in a broader search
console.log("\n=== code containing 35 (first 20) ===");
const r6 = await search("code=35&count=20&fields=id,nameNO,code");
console.log(`Total: ${r6.fullResultSize}`);
for (const v of (r6.values || [])) {
  // Only show codes where "35" appears as the start of the major group
  if (v.code.startsWith("35")) {
    console.log(`  ${v.id}: ${v.nameNO} (${v.code})`);
  }
}
