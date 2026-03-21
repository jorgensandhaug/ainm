// Read back voucher details to find what fields the scorer might check
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa(`0:${TOKEN}`);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: RequestInit = { method, headers: H };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const json = await res.json();
  console.log(`${method} ${path} => ${res.status}`);
  if (res.status >= 400) console.log("  ERR:", JSON.stringify(json, null, 2).slice(0, 500));
  return { status: res.status, data: json };
}

async function main() {
  // Create dept
  const deptRes = await api("POST", "/department", { name: "Check3Test" });
  const deptId = deptRes.data?.value?.id;
  
  // Get accounts  
  const acctRes = await api("GET", "/ledger/account?number=7140,1920&fields=id,number,name,vatType(*)");
  const acct7140 = acctRes.data.values.find((a: any) => a.number === 7140);
  const acct1920 = acctRes.data.values.find((a: any) => a.number === 1920);

  // Create voucher with 25% VAT (what we currently do)
  const GROSS = 8750 * 1.25;
  const v1 = await api("POST", "/ledger/voucher?sendToLedger=true", {
    date: "2026-02-27",
    description: "Togbillett",
    postings: [
      { row: 1, date: "2026-02-27", description: "Togbillett", account: { id: acct7140.id }, department: { id: deptId }, vatType: { id: 1 }, amountGross: GROSS, amountGrossCurrency: GROSS },
      { row: 2, date: "2026-02-27", description: "Togbillett", account: { id: acct1920.id }, amount: -GROSS, amountCurrency: -GROSS, amountGross: -GROSS, amountGrossCurrency: -GROSS }
    ]
  });
  const vId = v1.data?.value?.id;
  
  // Read back the FULL voucher object
  console.log("\n=== Full voucher readback ===");
  const readback = await api("GET", `/ledger/voucher/${vId}?fields=*`);
  const v = readback.data?.value;
  if (v) {
    console.log("Voucher fields:");
    for (const [k, val] of Object.entries(v)) {
      if (k !== 'postings' && k !== 'url' && val !== null && val !== undefined && val !== '' && val !== 0 && val !== false) {
        console.log(`  ${k}: ${JSON.stringify(val)}`);
      }
    }
    console.log(`  type: ${JSON.stringify(v.type)}`);
    console.log(`  voucherType: ${JSON.stringify(v.voucherType)}`);
  }
  
  // Read back with posting expansion
  console.log("\n=== Full postings readback ===");
  const readback2 = await api("GET", `/ledger/voucher/${vId}?fields=*,postings(*,account(id,number,name),department(id,name),vatType(id,name,percentage))`);
  const v2 = readback2.data?.value;
  if (v2?.postings) {
    for (const p of v2.postings) {
      console.log(`\n  Posting row=${p.row}:`);
      console.log(`    account: ${p.account?.number} (${p.account?.name})`);
      console.log(`    amount: ${p.amount}`);
      console.log(`    amountGross: ${p.amountGross}`);
      console.log(`    vatType: ${p.vatType?.id} (${p.vatType?.name} ${p.vatType?.percentage}%)`);
      console.log(`    department: ${p.department?.id} (${p.department?.name})`);
      console.log(`    description: ${p.description}`);
    }
  }

  // Now create with 12% VAT and compare
  console.log("\n\n=== 12% VAT voucher ===");
  const GROSS12 = 8750 * 1.12;
  const v3 = await api("POST", "/ledger/voucher?sendToLedger=true", {
    date: "2026-02-27",
    description: "Togbillett",
    postings: [
      { row: 1, date: "2026-02-27", description: "Togbillett", account: { id: acct7140.id }, department: { id: deptId }, vatType: { id: 12 }, amountGross: GROSS12, amountGrossCurrency: GROSS12 },
      { row: 2, date: "2026-02-27", description: "Togbillett", account: { id: acct1920.id }, amount: -GROSS12, amountCurrency: -GROSS12, amountGross: -GROSS12, amountGrossCurrency: -GROSS12 }
    ]
  });
  const vId3 = v3.data?.value?.id;
  
  const readback3 = await api("GET", `/ledger/voucher/${vId3}?fields=*,postings(*,account(id,number,name),department(id,name),vatType(id,name,percentage))`);
  const v3d = readback3.data?.value;
  if (v3d?.postings) {
    for (const p of v3d.postings) {
      console.log(`\n  Posting row=${p.row}:`);
      console.log(`    account: ${p.account?.number} (${p.account?.name})`);
      console.log(`    amount: ${p.amount}`);
      console.log(`    amountGross: ${p.amountGross}`);
      console.log(`    vatType: ${p.vatType?.id} (${p.vatType?.name} ${p.vatType?.percentage}%)`);
      console.log(`    department: ${p.department?.id} (${p.department?.name})`);
    }
  }
  
  // Check voucher types
  console.log("\n=== Available voucher types ===");
  const vtRes = await api("GET", "/ledger/voucherType?count=20&fields=id,name");
  for (const vt of (vtRes.data?.values || [])) {
    console.log(`  id=${vt.id} name=${vt.name}`);
  }
}

main().catch(e => { console.error("FATAL:", e); process.exit(1); });
