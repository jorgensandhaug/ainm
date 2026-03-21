const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const headers: Record<string, string> = { Authorization: AUTH, "Content-Type": "application/json" };

async function post(path: string, body: any) {
  const url = `${BASE}/${path}`;
  console.log("POST", path);
  const r = await fetch(url, { method: "POST", headers, body: JSON.stringify(body) });
  const j = await r.json();
  console.log("  ->", r.status, JSON.stringify(j).slice(0, 500));
  return { data: j, ok: r.ok };
}

async function put(path: string, body: any) {
  const url = `${BASE}/${path}`;
  console.log("PUT", path);
  const r = await fetch(url, { method: "PUT", headers, body: JSON.stringify(body) });
  const j = await r.json();
  console.log("  ->", r.status, JSON.stringify(j).slice(0, 500));
  return { data: j, ok: r.ok };
}

async function del(path: string) {
  const url = `${BASE}/${path}`;
  const r = await fetch(url, { method: "DELETE", headers });
  console.log("DELETE", path, "->", r.status);
}

async function get(path: string) {
  const url = `${BASE}/${path}`;
  const r = await fetch(url, { headers });
  return await r.json();
}

async function main() {
  // Clean up existing reconciliation
  await del("bank/reconciliation/12705468");

  const acctId = 424190862; // 1920

  // Get periods
  const periodsRes = await get("ledger/accountingPeriod?count=100&fields=*");
  const janPeriod = (periodsRes.values || []).find((p: any) => p.start === "2026-01-01");
  console.log("Jan period:", janPeriod?.id);

  // Test 1: POST with isClosed=true directly
  console.log("\n=== Test 1: POST with isClosed=true ===");
  const r1 = await post("bank/reconciliation", {
    account: { id: acctId },
    accountingPeriod: { id: janPeriod?.id },
    type: "MANUAL",
    bankAccountClosingBalanceCurrency: -60712.5,
    isClosed: true,
  });

  if (r1.ok) {
    console.log("Directly closed via POST!");
    const id1 = r1.data.value?.id;
    const detail = await get(`bank/reconciliation/${id1}?fields=*`);
    console.log("isClosed:", detail.value?.isClosed);
    await del(`bank/reconciliation/${id1}`);
  } else {
    console.log("POST with isClosed=true failed, trying 2-step");
    // Test 2: POST then PUT
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
      const close = await put(`bank/reconciliation/${id2}`, {
        id: id2,
        version: v2,
        account: { id: acctId },
        accountingPeriod: { id: janPeriod?.id },
        type: "MANUAL",
        bankAccountClosingBalanceCurrency: -60712.5,
        isClosed: true,
      });
      if (close.ok) {
        console.log("Closed via 2-step!");
      }
      await del(`bank/reconciliation/${id2}`);
    }
  }

  // Test 3: Try with WRONG balance (to confirm error)
  console.log("\n=== Test 3: POST+PUT with wrong balance ===");
  const r3 = await post("bank/reconciliation", {
    account: { id: acctId },
    accountingPeriod: { id: janPeriod?.id },
    type: "MANUAL",
    bankAccountClosingBalanceCurrency: 999999,
  });
  if (r3.ok) {
    const id3 = r3.data.value?.id;
    const v3 = r3.data.value?.version;
    const closeWrong = await put(`bank/reconciliation/${id3}`, {
      id: id3,
      version: v3,
      account: { id: acctId },
      accountingPeriod: { id: janPeriod?.id },
      type: "MANUAL",
      bankAccountClosingBalanceCurrency: 999999,
      isClosed: true,
    });
    console.log("Wrong balance close result:", closeWrong.ok ? "CLOSED!" : "Failed (expected)");
    await del(`bank/reconciliation/${id3}`);
  }

  // Test 4: What if we DON'T close — just create open reconciliation?
  console.log("\n=== Test 4: Create open reconciliation ===");
  const r4 = await post("bank/reconciliation", {
    account: { id: acctId },
    accountingPeriod: { id: janPeriod?.id },
    type: "MANUAL",
    bankAccountClosingBalanceCurrency: -60712.5,
  });
  if (r4.ok) {
    const id4 = r4.data.value?.id;
    console.log("Open reconciliation created:", id4);
    // Leave it open — just check state
    const detail = await get(`bank/reconciliation/${id4}?fields=*`);
    console.log("State:", JSON.stringify(detail.value).slice(0, 300));
    await del(`bank/reconciliation/${id4}`);
  }

  // Test 5: What about Feb period?
  console.log("\n=== Test 5: Check if we need Feb period too ===");
  const febPeriod = (periodsRes.values || []).find((p: any) => p.start === "2026-02-01");
  console.log("Feb period:", febPeriod?.id);
  // The CSV has a Feb 01 entry, so we might need reconciliation for both months
}

main().catch(e => console.error("FATAL:", e.message));
