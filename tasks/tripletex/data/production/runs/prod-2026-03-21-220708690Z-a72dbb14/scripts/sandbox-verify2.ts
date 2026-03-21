const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa(`0:${TOKEN}`);
const H = { "Authorization": AUTH, "Content-Type": "application/json" };

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: any = { method, headers: H };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  const text = await r.text();
  console.log(`\n${method} ${path} → ${r.status}`);
  if (!r.ok) console.log("ERROR:", text);
  return { status: r.status, data: r.ok ? JSON.parse(text) : text };
}

async function main() {
  // Get account IDs
  const accts = await api("GET", "/ledger/account?number=7360,1920&fields=id,number");
  const a7360 = accts.data.values.find((a: any) => a.number === 7360);
  const a1920 = accts.data.values.find((a: any) => a.number === 1920);
  console.log("7360 id:", a7360.id, "1920 id:", a1920.id);

  // Get dept
  const depts = await api("GET", "/department?name=Drift&isInactive=false&fields=id,name");
  const drift = depts.data.values?.find((d: any) => d.name === "Drift");
  const deptId = drift!.id;
  console.log("Dept Drift:", deptId);

  const GROSS = 14050 * 1.25; // 17562.50
  const date = "2026-12-15"; // far-future date, no reconciled statements

  // Test: WITH row fields
  console.log("\n=== TEST: voucher with row fields, far-future date ===");
  const r1 = await api("POST", "/ledger/voucher?sendToLedger=true", {
    date,
    description: "Kundemøte lunsj sandbox test",
    postings: [
      {
        row: 1, date, description: "Kundemøte lunsj sandbox test",
        account: { id: a7360.id }, department: { id: deptId },
        amount: GROSS, amountCurrency: GROSS, amountGross: GROSS, amountGrossCurrency: GROSS,
      },
      {
        row: 2, date, description: "Kundemøte lunsj sandbox test",
        account: { id: a1920.id },
        amount: -GROSS, amountCurrency: -GROSS, amountGross: -GROSS, amountGrossCurrency: -GROSS,
      },
    ],
  });
  console.log("Status:", r1.status);
  if (r1.status === 201) {
    const v = r1.data.value;
    console.log("Voucher id:", v.id, "number:", v.number);
    console.log("Postings:");
    for (const p of v.postings) {
      console.log(`  row=${p.row} acct=${p.account.id} dept=${p.department?.id} amount=${p.amount} amountGross=${p.amountGross} vatType=${p.vatType?.id}`);
    }
  }
}

main().catch(e => { console.error(e); process.exit(1); });
