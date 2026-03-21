// Test 1: Verify voucher fallback amounts
// Test 2: Verify the 9-call salary path
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + Buffer.from("0:" + TOKEN).toString("base64");
const H = { Authorization: AUTH, "Content-Type": "application/json" };

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: any = { method, headers: H };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const text = await res.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  console.log(`${method} ${path} → ${res.status}`);
  if (res.status >= 400) console.log(JSON.stringify(json, null, 2));
  return { status: res.status, data: json };
}

async function main() {
  // Test 1: Create a voucher with voucherType:null and check if amounts are stored
  console.log("=== TEST 1: Voucher fallback with voucherType:null ===");

  // Get account ids
  const acRes = await api("GET", "/ledger/account?number=5000,1920&count=10&fields=*");
  const accts = acRes.data.values || [];
  const a5000 = accts.find((a: any) => a.number === 5000);
  const a1920 = accts.find((a: any) => a.number === 1920);
  console.log(`Account 5000: id=${a5000?.id}, Account 1920: id=${a1920?.id}`);

  const vRes = await api("POST", "/ledger/voucher?sendToLedger=true", {
    voucherType: null,
    date: "2026-03-21",
    description: "Test voucher fallback amounts",
    postings: [
      { account: { id: a5000.id }, amount: 50400, description: "Test debit", row: 1 },
      { account: { id: a1920.id }, amount: -50400, description: "Test credit", row: 2 },
    ],
  });

  if (vRes.status === 201) {
    const voucherId = vRes.data.value?.id;
    console.log(`Voucher created: id=${voucherId}`);

    // Check postings in creation response
    const postings = vRes.data.value?.postings || [];
    console.log("Creation response postings:");
    for (const p of postings) {
      console.log(`  row=${p.row} amount=${p.amount} amountGross=${p.amountGross} amountCurrency=${p.amountCurrency}`);
    }

    // Read back the voucher to verify amounts
    const readRes = await api("GET", `/ledger/voucher/${voucherId}?fields=*,postings(*)`);
    if (readRes.status === 200) {
      const readPostings = readRes.data.value?.postings || [];
      console.log("Read-back postings:");
      for (const p of readPostings) {
        console.log(`  row=${p.row} account=${p.account?.id} amount=${p.amount} amountGross=${p.amountGross} amountCurrency=${p.amountCurrency}`);
      }
    }
  } else {
    console.log("Voucher creation failed - trying without sendToLedger");
    const vRes2 = await api("POST", "/ledger/voucher", {
      voucherType: null,
      date: "2026-03-21",
      description: "Test voucher fallback no sendToLedger",
      postings: [
        { account: { id: a5000.id }, amount: 50400, description: "Test debit", row: 1 },
        { account: { id: a1920.id }, amount: -50400, description: "Test credit", row: 2 },
      ],
    });
    if (vRes2.status === 201) {
      const voucherId = vRes2.data.value?.id;
      const readRes = await api("GET", `/ledger/voucher/${voucherId}?fields=*,postings(*)`);
      if (readRes.status === 200) {
        const readPostings = readRes.data.value?.postings || [];
        console.log("Read-back postings (no sendToLedger):");
        for (const p of readPostings) {
          console.log(`  row=${p.row} account=${p.account?.id} amount=${p.amount} amountGross=${p.amountGross}`);
        }
      }
    }
  }

  // Test 2: Try voucher with amountGross instead of amount
  console.log("\n=== TEST 2: Voucher with amountGross field ===");
  const vRes3 = await api("POST", "/ledger/voucher?sendToLedger=true", {
    voucherType: null,
    date: "2026-03-21",
    description: "Test voucher amountGross",
    postings: [
      { account: { id: a5000.id }, amountGross: 50400, description: "Test debit gross", row: 1 },
      { account: { id: a1920.id }, amountGross: -50400, description: "Test credit gross", row: 2 },
    ],
  });
  if (vRes3.status === 201) {
    const voucherId3 = vRes3.data.value?.id;
    const readRes3 = await api("GET", `/ledger/voucher/${voucherId3}?fields=*,postings(*)`);
    if (readRes3.status === 200) {
      const readPostings = readRes3.data.value?.postings || [];
      console.log("Read-back postings (amountGross):");
      for (const p of readPostings) {
        console.log(`  row=${p.row} account=${p.account?.id} amount=${p.amount} amountGross=${p.amountGross}`);
      }
    }
  }
}

main().catch(console.error);
