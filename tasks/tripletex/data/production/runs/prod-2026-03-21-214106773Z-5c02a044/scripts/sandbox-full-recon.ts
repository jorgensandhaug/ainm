const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const headers: Record<string, string> = { Authorization: AUTH, "Content-Type": "application/json" };

async function get(path: string) {
  const url = `${BASE}/${path}`;
  const r = await fetch(url, { headers });
  return await r.json();
}

async function post(path: string, body: any) {
  const url = `${BASE}/${path}`;
  console.log("POST", url.replace(BASE, ""));
  const r = await fetch(url, { method: "POST", headers, body: JSON.stringify(body) });
  const j = await r.json();
  console.log("  ->", r.status, r.ok ? "OK" : JSON.stringify(j).slice(0, 300));
  return { data: j, ok: r.ok };
}

async function put(path: string, body: any) {
  const url = `${BASE}/${path}`;
  console.log("PUT", url.replace(BASE, ""));
  const r = await fetch(url, { method: "PUT", headers, body: JSON.stringify(body) });
  const j = await r.json();
  console.log("  ->", r.status, r.ok ? "OK" : JSON.stringify(j).slice(0, 300));
  return { data: j, ok: r.ok };
}

async function main() {
  // Get account IDs
  const acctRes = await get("ledger/account?number=1920,2400&fields=id,number");
  const acctMap: Record<number, number> = {};
  for (const a of (acctRes.values || [])) acctMap[a.number] = a.id;
  console.log("Accounts:", acctMap);

  // Get accounting period for January 2026
  const periodsRes = await get("ledger/accountingPeriod?count=100&fields=*");
  const janPeriod = (periodsRes.values || []).find((p: any) => p.start === "2026-01-01");
  console.log("Jan 2026 period:", janPeriod?.id);

  // Check current balance on 1920 for Jan period
  const balRes = await get(`balanceSheet?dateFrom=2026-01-01&dateTo=2026-01-31&accountNumberFrom=1920&accountNumberTo=1920&count=10&fields=*`);
  console.log("\n=== Balance Sheet for 1920 (Jan 2026) ===");
  console.log(JSON.stringify(balRes).slice(0, 500));

  // Create bank reconciliation
  console.log("\n=== Creating bank reconciliation ===");
  // Use a test closing balance matching the actual account balance
  // First get the actual balance
  const postingsRes = await get(`ledger/posting?dateFrom=2000-01-01&dateTo=2026-01-31&accountId=${acctMap[1920]}&count=1000&fields=amount`);
  const postings = postingsRes.values || [];
  let balance = 0;
  for (const p of postings) balance += p.amount;
  console.log(`Account 1920 balance (sum of postings): ${balance}`);

  // Create reconciliation with this balance
  const reconRes = await post("bank/reconciliation", {
    account: { id: acctMap[1920] },
    accountingPeriod: { id: janPeriod?.id },
    type: "MANUAL",
    bankAccountClosingBalanceCurrency: balance,
  });

  if (reconRes.ok) {
    const reconId = reconRes.data.value?.id;
    const reconVersion = reconRes.data.value?.version;
    console.log(`Reconciliation created: id=${reconId}, version=${reconVersion}`);

    // Now get all 1920 postings and try to match them all
    const postings1920 = await get(`ledger/posting?dateFrom=2026-01-01&dateTo=2026-01-31&accountId=${acctMap[1920]}&count=100&fields=id,amount,date,description`);
    const posts = postings1920.values || [];
    console.log(`\nFound ${posts.length} postings on 1920 for Jan 2026`);

    // Try matching postings in groups of balanced pairs
    for (let i = 0; i < Math.min(posts.length, 4); i += 2) {
      if (i + 1 < posts.length) {
        const p1 = posts[i];
        const p2 = posts[i + 1];
        console.log(`\nTrying match: posting ${p1.id} (${p1.amount}) + ${p2.id} (${p2.amount})`);
        // A match must sum to zero — but single postings won't. Let me try with just one posting.
      }
    }

    // Try to close it
    console.log("\n=== Trying to close the reconciliation ===");
    const closeRes = await put(`bank/reconciliation/${reconId}`, {
      id: reconId,
      version: reconVersion,
      account: { id: acctMap[1920] },
      accountingPeriod: { id: janPeriod?.id },
      type: "MANUAL",
      bankAccountClosingBalanceCurrency: balance,
      isClosed: true,
    });

    if (closeRes.ok) {
      console.log("Reconciliation CLOSED successfully!");
      // Read back the final state
      const finalRecon = await get(`bank/reconciliation/${reconId}?fields=*`);
      console.log("Final state:", JSON.stringify(finalRecon).slice(0, 500));
    } else {
      // Check what the approvable state is
      const reconState = await get(`bank/reconciliation/${reconId}?fields=*`);
      console.log("Current state:", JSON.stringify(reconState.value).slice(0, 300));
    }
  }
}

main().catch(e => console.error("FATAL:", e.message));
