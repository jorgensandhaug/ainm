const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "6gsryrbZIHb0dDw3N3SBoZpdG1yrXP1O5dMNMJezfeo";
const AUTH = "Basic " + btoa("0:" + TOKEN);

async function api(method: string, path: string) {
  const url = `${BASE}${path}`;
  const r = await fetch(url, { method, headers: { "Authorization": AUTH, "Content-Type": "application/json" } });
  const text = await r.text();
  if (!r.ok) { console.log(`ERROR ${r.status}: ${text}`); throw new Error(`${r.status}`); }
  const json = JSON.parse(text);
  if (json.values !== undefined) return json.values;
  if (json.value !== undefined) return json.value;
  return json;
}

async function main() {
  const vouchers: any[] = await api("GET",
    "/ledger/voucher?dateFrom=2026-01-01&dateTo=2026-02-28&fields=id,date,description,postings(id,account(id,number),amount,amountGross,amountGrossCurrency,vatType(id),supplier(id),description)&count=1000"
  );

  // Show all vouchers with 6500 postings
  for (const v of vouchers) {
    if (!v.postings) continue;
    const has6500 = v.postings.some((p: any) => p.account?.number === 6500);
    if (has6500) {
      console.log(`\nVoucher ${v.id} (${v.date}): ${v.description}`);
      for (const p of v.postings) {
        console.log(`  acct=${p.account?.number} amount=${p.amount} gross=${p.amountGross} vatType=${p.vatType?.id} supplier=${p.supplier?.id} desc="${p.description}"`);
      }
    }
  }

  // Also show all vouchers with 6590 postings for duplicate detection
  console.log("\n\n--- 6590 postings ---");
  for (const v of vouchers) {
    if (!v.postings) continue;
    const has6590 = v.postings.some((p: any) => p.account?.number === 6590);
    if (has6590) {
      console.log(`\nVoucher ${v.id} (${v.date}): ${v.description}`);
      for (const p of v.postings) {
        console.log(`  acct=${p.account?.number} amount=${p.amount} gross=${p.amountGross} vatType=${p.vatType?.id} supplier=${p.supplier?.id} desc="${p.description}"`);
      }
    }
  }
}

main().catch(e => { console.error(e); process.exit(1); });
