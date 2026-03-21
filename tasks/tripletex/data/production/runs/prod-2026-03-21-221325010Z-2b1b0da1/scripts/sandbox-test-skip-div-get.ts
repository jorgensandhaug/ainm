/**
 * Test: Can we skip GET /division and directly POST /division?
 * If POST succeeds even when a division already exists, we save 1 call.
 */
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

function generateOrgNumber(): string {
  while (true) {
    const digits = [9];
    for (let i = 0; i < 7; i++) digits.push(Math.floor(Math.random() * 10));
    const weights = [3, 2, 7, 6, 5, 4, 3, 2];
    const sum = digits.reduce((s, d, i) => s + d * weights[i], 0);
    const remainder = 11 - (sum % 11);
    if (remainder === 10) continue;
    const check = remainder === 11 ? 0 : remainder;
    digits.push(check);
    return digits.join("");
  }
}

async function main() {
  // First check how many divisions already exist
  const divRes = await fetch(`${BASE}/division?count=100&fields=*`, { headers: H });
  const divData = await divRes.json();
  console.log(`Existing divisions: ${divData.values?.length || 0}`);
  for (const d of (divData.values || [])) {
    console.log(`  id=${d.id} name=${d.name} orgNum=${d.organizationNumber}`);
  }

  // Now try to create another division (duplicate)
  const orgNum = generateOrgNumber();
  console.log(`\nAttempting POST /division with orgNum=${orgNum}...`);
  const createRes = await fetch(`${BASE}/division`, {
    method: "POST",
    headers: H,
    body: JSON.stringify({
      name: "Hovudavdeling",
      organizationNumber: orgNum,
      startDate: "2026-01-01",
      municipalityDate: "2026-01-01",
      municipality: { id: 1 }
    })
  });
  const createData = await createRes.json();
  if (createRes.ok) {
    console.log(`  OK ${createRes.status}: id=${createData.value?.id} name=${createData.value?.name}`);
  } else {
    console.log(`  ERROR ${createRes.status}:`, JSON.stringify(createData).slice(0, 500));
  }

  // Check total divisions now
  const divRes2 = await fetch(`${BASE}/division?count=100&fields=*`, { headers: H });
  const divData2 = await divRes2.json();
  console.log(`\nDivisions after create: ${divData2.values?.length || 0}`);
  for (const d of (divData2.values || [])) {
    console.log(`  id=${d.id} name=${d.name} orgNum=${d.organizationNumber}`);
  }
}

main().catch(e => { console.error("FATAL:", e.message); process.exit(1); });
