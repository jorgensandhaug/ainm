const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const headers: Record<string, string> = { Authorization: AUTH, "Content-Type": "application/json" };

async function get(path: string) {
  const url = `${BASE}/${path}`;
  console.log("GET", url);
  const r = await fetch(url, { headers });
  const j = await r.json();
  console.log("  ->", r.status);
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

async function main() {
  // 1. Check company bank account settings
  console.log("\n=== Company bank account / ledger account 1920 ===");
  const acctRes = await get("ledger/account?number=1920&fields=*");
  const acct1920 = acctRes.data.values?.[0];
  console.log("Account 1920 id:", acct1920?.id);

  // 2. Check if there's a company bank account linked to 1920
  console.log("\n=== Company with bank account ===");
  const companyRes = await get("company/1?fields=*");
  console.log("Company:", JSON.stringify(companyRes.data.value || companyRes.data).slice(0, 1000));

  // 3. Check accounting periods for Jan 2026
  console.log("\n=== Accounting Periods ===");
  const periodsRes = await get("ledger/accountingPeriod?count=100&fields=*");
  const periods = periodsRes.data.values || [];
  const janPeriod = periods.find((p: any) => p.start === "2026-01-01" || (p.start && p.start.includes("2026-01")));
  console.log("Jan 2026 period:", JSON.stringify(janPeriod));
  console.log("Total periods:", periods.length);
  // Show first few
  for (const p of periods.slice(0, 15)) {
    console.log(`  Period ${p.id}: ${p.start} - ${p.end} (number: ${p.number})`);
  }

  // 4. Try creating a bank reconciliation
  if (acct1920 && janPeriod) {
    console.log("\n=== Try POST /bank/reconciliation ===");
    const reconcRes = await post("bank/reconciliation", {
      account: { id: acct1920.id },
      accountingPeriod: { id: janPeriod.id },
      type: "MANUAL",
      bankAccountClosingBalanceCurrency: 161348.59,
    });
  }
}

main().catch(e => console.error("FATAL:", e.message));
