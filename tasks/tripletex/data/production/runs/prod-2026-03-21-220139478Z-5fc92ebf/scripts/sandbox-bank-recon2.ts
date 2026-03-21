// Sandbox: check 2026 accounting periods and test bank reconciliation POST
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

async function get(path: string) {
  const r = await fetch(`${BASE}${path}`, { headers: H });
  if (!r.ok) { const t = await r.text(); console.error(`GET ${path} → ${r.status}: ${t}`); return null; }
  return r.json();
}

async function post(path: string, body: any) {
  const r = await fetch(`${BASE}${path}`, { method: "POST", headers: H, body: JSON.stringify(body) });
  const t = await r.text();
  console.log(`POST ${path} → ${r.status}: ${t}`);
  return { status: r.status, text: t };
}

async function main() {
  // 1. Get 2026 accounting periods
  const periods = await get("/ledger/accountingPeriod?count=50&fields=*");
  const p2026 = (periods?.values || []).filter((p: any) => p.start?.startsWith("2026-"));
  console.log("2026 Accounting periods:");
  for (const p of p2026) {
    console.log(`  id=${p.id} start=${p.start} end=${p.end}`);
  }

  if (p2026.length === 0) {
    console.log("No 2026 periods found. Checking all periods...");
    for (const p of (periods?.values || []).slice(-6)) {
      console.log(`  id=${p.id} start=${p.start} end=${p.end}`);
    }
    return;
  }

  // Find the period containing 2026-02-08 (last CSV entry date)
  const lastDate = "2026-02-08";
  const period = p2026.find((p: any) => p.start <= lastDate && p.end > lastDate);
  console.log(`\nPeriod for ${lastDate}: id=${period?.id} start=${period?.start} end=${period?.end}`);

  // 2. Get account 1920 balance for that period
  const acc = await get("/ledger/account?number=1920&fields=*");
  const acc1920 = acc?.values?.[0];

  if (period) {
    const bal = await get(`/balanceSheet?dateFrom=${period.start}&dateTo=${period.end}&accountNumberFrom=1920&accountNumberTo=1920&count=1&fields=*`);
    if (bal?.values?.length) {
      const b = bal.values[0];
      console.log(`Balance 1920 for period ${period.start}-${period.end}: balanceIn=${b.balanceIn} balanceOut=${b.balanceOut}`);

      // 3. Try creating bank reconciliation
      console.log("\nAttempting POST /bank/reconciliation...");
      await post("/bank/reconciliation", {
        account: { id: acc1920.id },
        accountingPeriod: { id: period.id },
        type: "MANUAL",
        bankAccountClosingBalanceCurrency: b.balanceOut,
        isClosed: true,
      });
    }
  }
}

main().catch(e => { console.error(e); process.exit(1); });
