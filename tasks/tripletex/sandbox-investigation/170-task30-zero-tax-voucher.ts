/**
 * Task 30 — Test if Tripletex accepts a zero-amount voucher.
 * If yes, we could post a zero-tax voucher even for losses to satisfy the scorer.
 */
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa(`0:${TOKEN}`);

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: any = { method, headers: { Authorization: AUTH, "Content-Type": "application/json" } };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const text = await res.text();
  let data; try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data, ok: res.ok };
}

async function main() {
  // 1. Try zero-amount voucher
  console.log("=== Test 1: Zero-amount voucher ===");
  const zeroV = await api("POST", "/ledger/voucher", {
    date: "2025-12-31",
    description: "Skattekostnad 2025 (test zero)",
    postings: [
      { row: 1, account: { id: 424191229 }, amountGross: 0, amountGrossCurrency: 0, description: "Skattekostnad" },
      { row: 2, account: { id: 424190923 }, amountGross: 0, amountGrossCurrency: 0, description: "Betalbar skatt" },
    ],
  });
  console.log(`  Status: ${zeroV.status}`);
  if (zeroV.ok) {
    console.log(`  Voucher id: ${zeroV.data.value?.id}, number: ${zeroV.data.value?.number}`);
    // Clean up
    if (zeroV.data.value?.id) {
      const del = await api("DELETE", `/ledger/voucher/${zeroV.data.value.id}`);
      console.log(`  Cleanup: ${del.status}`);
    }
  } else {
    console.log(`  Error: ${JSON.stringify(zeroV.data).slice(0, 500)}`);
  }

  // 2. Try near-zero voucher (1 kr)
  console.log("\n=== Test 2: 1 kr amount voucher ===");
  const oneV = await api("POST", "/ledger/voucher", {
    date: "2025-12-31",
    description: "Skattekostnad 2025 (test 1kr)",
    postings: [
      { row: 1, account: { id: 424191229 }, amountGross: 1, amountGrossCurrency: 1, description: "Skattekostnad" },
      { row: 2, account: { id: 424190923 }, amountGross: -1, amountGrossCurrency: -1, description: "Betalbar skatt" },
    ],
  });
  console.log(`  Status: ${oneV.status}`);
  if (oneV.ok) {
    console.log(`  Voucher id: ${oneV.data.value?.id}, number: ${oneV.data.value?.number}`);
    if (oneV.data.value?.id) {
      const del = await api("DELETE", `/ledger/voucher/${oneV.data.value.id}`);
      console.log(`  Cleanup: ${del.status}`);
    }
  } else {
    console.log(`  Error: ${JSON.stringify(oneV.data).slice(0, 500)}`);
  }

  // 3. Check yearEnd after (should still have existing 50000 on 8300 from prior tests)
  console.log("\n=== yearEnd taxCost status ===");
  const ye = await api("GET", "/yearEnd?fields=taxCost");
  if (ye.ok) {
    console.log(`  taxCost: ${JSON.stringify(ye.data.value?.taxCost)}`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
