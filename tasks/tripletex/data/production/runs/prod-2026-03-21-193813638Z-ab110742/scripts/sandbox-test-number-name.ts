// Test: can we post voucher with account { number, name } to skip the GET?
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: any = {
    method,
    headers: { Authorization: AUTH, "Content-Type": "application/json" },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const text = await res.text();
  let data: any;
  try { data = JSON.parse(text); } catch { data = text; }
  console.log(`${method} ${path} → ${res.status}`);
  if (!res.ok) console.error("  ERROR:", JSON.stringify(data).slice(0, 500));
  return { status: res.status, data, ok: res.ok };
}

async function main() {
  // Test 1: voucher with account { number, name } (no id)
  console.log("=== TEST 1: voucher with { number, name } ===");
  const t1 = await api("POST", "/ledger/voucher", {
    date: "2025-12-31",
    description: "Test voucher with number+name",
    postings: [
      { row: 1, account: { number: 6010, name: "Avskriving på transportmidler" }, amountGross: 1, amountGrossCurrency: 1, description: "test" },
      { row: 2, account: { number: 1209, name: "Akkumulerte avskrivninger maskiner og anlegg" }, amountGross: -1, amountGrossCurrency: -1, description: "test" },
    ],
  });
  if (t1.ok) {
    console.log("  SUCCESS! Voucher created:", JSON.stringify(t1.data.value?.id || t1.data));
    // Clean up - reverse the test voucher
    const vId = t1.data.value?.id;
    if (vId) {
      console.log(`  Reversing voucher ${vId}...`);
      await api("PUT", `/ledger/voucher/${vId}/:reverse`, null);
    }
  }

  // Test 2: voucher with account { id } only (no number, no name)
  console.log("\n=== TEST 2: voucher with { id } only ===");
  const t2 = await api("POST", "/ledger/voucher", {
    date: "2025-12-31",
    description: "Test voucher with id only",
    postings: [
      { row: 1, account: { id: 424191101 }, amountGross: 1, amountGrossCurrency: 1, description: "test" },
      { row: 2, account: { id: 462191297 }, amountGross: -1, amountGrossCurrency: -1, description: "test" },
    ],
  });
  if (t2.ok) {
    console.log("  SUCCESS! Voucher created:", t2.data.value?.id);
    const vId = t2.data.value?.id;
    if (vId) {
      console.log(`  Reversing voucher ${vId}...`);
      await api("PUT", `/ledger/voucher/${vId}/:reverse`, null);
    }
  }
}

main().catch(e => console.error("FATAL:", e));
