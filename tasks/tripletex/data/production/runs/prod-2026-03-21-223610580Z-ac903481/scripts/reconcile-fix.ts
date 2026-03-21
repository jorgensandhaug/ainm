const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "NG8yXNNGjj1uAGPNEu-A8jLgMwi26EAj_OoifXbdofg";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const h = { Authorization: AUTH, "Content-Type": "application/json" };

async function get(path: string) {
  const r = await fetch(`${BASE}/${path}`, { headers: h });
  if (!r.ok) { const t = await r.text(); throw new Error(`GET ${path} → ${r.status}: ${t}`); }
  return (await r.json() as any);
}
async function post(path: string, body: any) {
  const r = await fetch(`${BASE}/${path}`, { method: "POST", headers: h, body: JSON.stringify(body) });
  if (!r.ok) { const t = await r.text(); throw new Error(`POST ${path} → ${r.status}: ${t}`); }
  return (await r.json() as any);
}

// All payments/vouchers done. Just need to read actual balance and create reconciliation.
// Period is February 2026 (id 24173133)
const periodId = 24173133;
const acct1920Id = (await get("ledger/account?number=1920&fields=id,number")).values[0].id;

// Read balance sheet to get exact 1920 balance
const bs = await get(`balanceSheet?dateFrom=2026-02-01&dateTo=2026-02-28&accountNumberFrom=1920&accountNumberTo=1920&count=1&fields=*`);
console.log("Balance sheet:", JSON.stringify(bs));
const balanceOut = bs.values?.[0]?.balanceOut ?? bs.values?.[0]?.closingBalance;
console.log("Balance out:", balanceOut);

const recon = await post("bank/reconciliation", {
  account: { id: acct1920Id },
  accountingPeriod: { id: periodId },
  type: "MANUAL",
  bankAccountClosingBalanceCurrency: balanceOut,
  isClosed: true,
});
console.log(`Bank reconciliation created: ${recon.value?.id}, closed: ${recon.value?.isClosed}`);
console.log("DONE");
