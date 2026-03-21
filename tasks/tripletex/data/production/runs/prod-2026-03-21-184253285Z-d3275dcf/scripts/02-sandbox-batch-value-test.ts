// Test if POST /ledger/accountingDimensionValue/list can batch-create values
// Also test if POST /ledger/accountingDimensionValue can accept multiple values in one call

const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { "Content-Type": "application/json", Authorization: AUTH };

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const res = await fetch(url, {
    method,
    headers: H,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  console.log(`\n${method} ${path} → ${res.status}`);
  console.log(JSON.stringify(json, null, 2));
  return { status: res.status, json };
}

async function main() {
  // First check existing dimensions
  const existing = await api("GET", "/ledger/accountingDimensionName/search?fields=*");

  // Try POST /ledger/accountingDimensionValue/list with array body to batch-create
  // Use a known dimension index from existing dimensions
  const dims = existing.json?.values || [];
  let testDimIndex: number | null = null;
  if (dims.length > 0) {
    testDimIndex = dims[0].dimensionIndex;
    console.log(`\nUsing existing dimensionIndex=${testDimIndex} for batch test`);
  }

  if (testDimIndex !== null) {
    // Try POST (not PUT) to /ledger/accountingDimensionValue/list
    const batchPayload = [
      { dimensionIndex: testDimIndex, displayName: "BatchTest1_" + Date.now(), active: true, showInVoucherRegistration: true },
      { dimensionIndex: testDimIndex, displayName: "BatchTest2_" + Date.now(), active: true, showInVoucherRegistration: true },
    ];

    console.log("\n=== TEST 1: POST /ledger/accountingDimensionValue/list (batch create attempt) ===");
    const postList = await api("POST", "/ledger/accountingDimensionValue/list", batchPayload);

    // Also try if the single POST endpoint accepts an array
    console.log("\n=== TEST 2: POST /ledger/accountingDimensionValue with array body ===");
    const postArray = await api("POST", "/ledger/accountingDimensionValue", batchPayload);
  } else {
    console.log("No existing dimensions found, skipping batch tests");
  }
}

main().catch(e => { console.error(e); process.exit(1); });
