const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const headers: Record<string, string> = { Authorization: AUTH, "Content-Type": "application/json" };

async function get(path: string) {
  const url = `${BASE}/${path}`;
  console.log("GET", url);
  const r = await fetch(url, { headers });
  const j = await r.json();
  console.log("  ->", r.status, JSON.stringify(j).slice(0, 500));
  return { status: r.status, data: j, ok: r.ok };
}

async function post(path: string, body: any) {
  const url = `${BASE}/${path}`;
  console.log("POST", url);
  const r = await fetch(url, { method: "POST", headers, body: JSON.stringify(body) });
  const j = await r.json();
  console.log("  ->", r.status, JSON.stringify(j).slice(0, 800));
  return { status: r.status, data: j, ok: r.ok };
}

async function put(path: string, body: any) {
  const url = `${BASE}/${path}`;
  console.log("PUT", url);
  const r = await fetch(url, { method: "PUT", headers, body: JSON.stringify(body) });
  const j = await r.json();
  console.log("  ->", r.status, JSON.stringify(j).slice(0, 800));
  return { status: r.status, data: j, ok: r.ok };
}

async function del(path: string) {
  const url = `${BASE}/${path}`;
  console.log("DELETE", url);
  const r = await fetch(url, { method: "DELETE", headers });
  console.log("  ->", r.status);
  try { const j = await r.json(); return { status: r.status, data: j, ok: r.ok }; }
  catch { return { status: r.status, data: null, ok: r.ok }; }
}

async function main() {
  const reconId = 12705463;

  // First, check the reconciliation details
  console.log("\n=== Reconciliation details ===");
  const reconRes = await get(`bank/reconciliation/${reconId}?fields=*`);

  // Check existing postings on 1920 that we could match
  console.log("\n=== Existing 1920 postings ===");
  const postingsRes = await get("ledger/posting?dateFrom=2026-01-01&dateTo=2026-01-31&accountId=424190862&count=5&fields=*");
  const postings = postingsRes.data.values || [];

  if (postings.length > 0) {
    // Try creating a manual match with one posting
    console.log("\n=== Try creating a match ===");
    const matchRes = await post("bank/reconciliation/match", {
      bankReconciliation: { id: reconId },
      type: "MANUAL",
      transactions: [],
      postings: [{ id: postings[0].id }],
    });
  }

  // Try to close the reconciliation by updating isClosed
  console.log("\n=== Try closing the reconciliation ===");
  const closeRes = await put(`bank/reconciliation/${reconId}`, {
    id: reconId,
    version: reconRes.data.value?.version || 0,
    account: { id: 424190862 },
    accountingPeriod: { id: 23726300 },
    type: "MANUAL",
    bankAccountClosingBalanceCurrency: 161348.59,
    isClosed: true,
  });

  // Check if it closed
  console.log("\n=== Final reconciliation state ===");
  await get(`bank/reconciliation/${reconId}?fields=*`);
}

main().catch(e => console.error("FATAL:", e.message));
