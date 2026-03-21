const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const headers: Record<string, string> = { Authorization: AUTH, "Content-Type": "application/json" };

async function get(path: string) {
  const url = `${BASE}/${path}`;
  const r = await fetch(url, { headers });
  return await r.json();
}

async function put(path: string, body: any) {
  const url = `${BASE}/${path}`;
  console.log("PUT", path);
  const r = await fetch(url, { method: "PUT", headers, body: JSON.stringify(body) });
  const j = await r.json();
  console.log("  ->", r.status, JSON.stringify(j).slice(0, 300));
  return { data: j, ok: r.ok };
}

async function del(path: string) {
  const url = `${BASE}/${path}`;
  console.log("DELETE", path);
  const r = await fetch(url, { method: "DELETE", headers });
  try { const j = await r.json(); console.log("  ->", r.status, JSON.stringify(j).slice(0, 300)); }
  catch { console.log("  ->", r.status); }
}

async function post(path: string, body: any) {
  const url = `${BASE}/${path}`;
  console.log("POST", path);
  const r = await fetch(url, { method: "POST", headers, body: JSON.stringify(body) });
  const j = await r.json();
  console.log("  ->", r.status, JSON.stringify(j).slice(0, 500));
  return { data: j, ok: r.ok };
}

async function main() {
  // Find all existing reconciliations
  const reconRes = await get("bank/reconciliation?count=100&fields=*");
  console.log("Existing reconciliations:", (reconRes.values || []).length);

  for (const r of (reconRes.values || [])) {
    console.log(`  Recon ${r.id}: closed=${r.isClosed} period=${r.accountingPeriod?.id} balance=${r.bankAccountClosingBalanceCurrency} version=${r.version}`);

    // Reopen closed ones
    if (r.isClosed) {
      console.log("  -> Trying to reopen...");
      const reopenRes = await put(`bank/reconciliation/${r.id}`, {
        id: r.id,
        version: r.version,
        account: r.account,
        accountingPeriod: r.accountingPeriod,
        type: r.type,
        bankAccountClosingBalanceCurrency: r.bankAccountClosingBalanceCurrency,
        isClosed: false,
      });
      if (reopenRes.ok) {
        console.log("  -> Reopened! Now deleting...");
        await del(`bank/reconciliation/${r.id}`);
      }
    } else {
      await del(`bank/reconciliation/${r.id}`);
    }
  }

  // Verify cleanup
  const reconRes2 = await get("bank/reconciliation?count=100&fields=id,isClosed");
  console.log("\nAfter cleanup:", (reconRes2.values || []).length, "reconciliations remain");

  // Now test: can we create+close in one POST?
  const acctId = 424190862;
  const periodsRes = await get("ledger/accountingPeriod?count=100&fields=*");
  const janPeriod = (periodsRes.values || []).find((p: any) => p.start === "2026-01-01");

  console.log("\n=== Test 1: POST with isClosed=true ===");
  const r1 = await post("bank/reconciliation", {
    account: { id: acctId },
    accountingPeriod: { id: janPeriod?.id },
    type: "MANUAL",
    bankAccountClosingBalanceCurrency: -60712.5,
    isClosed: true,
  });

  if (r1.ok) {
    console.log("Direct close worked:", r1.data.value?.isClosed);
    // Reopen and delete
    const rId = r1.data.value?.id;
    const rVer = r1.data.value?.version;
    await put(`bank/reconciliation/${rId}`, {
      id: rId, version: rVer,
      account: { id: acctId },
      accountingPeriod: { id: janPeriod?.id },
      type: "MANUAL",
      bankAccountClosingBalanceCurrency: -60712.5,
      isClosed: false,
    });
    await del(`bank/reconciliation/${rId}`);
  } else {
    // 2-step approach
    console.log("\n=== Test 2: POST then PUT ===");
    const r2 = await post("bank/reconciliation", {
      account: { id: acctId },
      accountingPeriod: { id: janPeriod?.id },
      type: "MANUAL",
      bankAccountClosingBalanceCurrency: -60712.5,
    });
    if (r2.ok) {
      const id2 = r2.data.value?.id;
      const v2 = r2.data.value?.version;
      console.log("\nClosing via PUT...");
      const close = await put(`bank/reconciliation/${id2}`, {
        id: id2, version: v2,
        account: { id: acctId },
        accountingPeriod: { id: janPeriod?.id },
        type: "MANUAL",
        bankAccountClosingBalanceCurrency: -60712.5,
        isClosed: true,
      });
      console.log("Close result: isClosed =", close.data.value?.isClosed);

      // Test: can we just use POST with isClosed?
      // Cleanup
      const newVer = close.data.value?.version;
      await put(`bank/reconciliation/${id2}`, {
        id: id2, version: newVer,
        account: { id: acctId },
        accountingPeriod: { id: janPeriod?.id },
        type: "MANUAL",
        bankAccountClosingBalanceCurrency: -60712.5,
        isClosed: false,
      });
      await del(`bank/reconciliation/${id2}`);
    }
  }
}

main().catch(e => console.error("FATAL:", e.message));
