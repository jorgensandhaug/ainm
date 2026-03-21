// Test: can we skip GET /municipality and hardcode municipality id=1 in POST /division?
// If yes, this saves 1 call in the no-division branch (7 instead of 8).

const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa(`0:${TOKEN}`);

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: RequestInit = {
    method,
    headers: { "Authorization": AUTH, "Content-Type": "application/json" },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const text = await res.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  console.log(`${method} ${path} => ${res.status}`);
  if (res.status >= 400) console.log("ERROR:", JSON.stringify(json, null, 2));
  return { status: res.status, data: json };
}

function generateNorwegianOrgNumber(): string {
  const weights = [3, 2, 7, 6, 5, 4, 3, 2];
  while (true) {
    const digits = [9];
    for (let i = 0; i < 7; i++) digits.push(Math.floor(Math.random() * 10));
    let sum = 0;
    for (let i = 0; i < 8; i++) sum += digits[i] * weights[i];
    const remainder = sum % 11;
    if (remainder === 1) continue;
    const checkDigit = remainder === 0 ? 0 : 11 - remainder;
    digits.push(checkDigit);
    return digits.join("");
  }
}

async function main() {
  // Test 1: Try POST /division with hardcoded municipality id=1 (no GET /municipality)
  const orgNum = generateNorwegianOrgNumber();
  console.log("=== Test: POST /division with hardcoded municipality id=1 ===");
  console.log(`Using org number: ${orgNum}`);

  const divRes = await api("POST", "/division", {
    name: "TestDiv-SkipMunRead",
    organizationNumber: orgNum,
    startDate: "2026-01-01",
    municipalityDate: "2026-01-01",
    municipality: { id: 1 },
  });

  if (divRes.status === 201) {
    console.log("SUCCESS: Division created without GET /municipality!");
    console.log("Division:", JSON.stringify(divRes.data?.value, null, 2));
  } else {
    console.log("FAILED: Cannot skip GET /municipality");
  }

  // Test 2: Also verify what GET /municipality returns to confirm id=1
  console.log("\n=== Verify: GET /municipality?count=1&fields=* ===");
  const munRes = await api("GET", "/municipality?count=1&fields=*");
  console.log("Municipality values:", JSON.stringify(munRes.data?.values?.slice(0, 3), null, 2));
}

main().catch(console.error);
