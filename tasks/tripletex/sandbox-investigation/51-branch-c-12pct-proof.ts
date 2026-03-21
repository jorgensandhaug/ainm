// Branch C sandbox proof: Togbillett with 12% VAT (lav sats) instead of 25%
// This verifies the corrected approach after production run 3373fbc9 failed Check 3 with 25%
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
  if (res.status >= 400) console.log("  ERR:", JSON.stringify(json, null, 2).slice(0, 800));
  return { status: res.status, data: json };
}

async function main() {
  // Step 1: Get account IDs and vatType info for 7140 and 1920
  console.log("=== Step 1: GET /ledger/account ===");
  const acctRes = await api("GET", "/ledger/account?number=7140,1920&fields=id,number,name,vatType(*)");
  const accounts = acctRes.data?.values || [];
  const acct7140 = accounts.find((a: any) => a.number === 7140);
  const acct1920 = accounts.find((a: any) => a.number === 1920);

  console.log(`  7140: id=${acct7140?.id}, vatType.id=${acct7140?.vatType?.id}, vatType.name="${acct7140?.vatType?.name}", vatType.percentage=${acct7140?.vatType?.percentage}`);
  console.log(`  1920: id=${acct1920?.id}, vatType.id=${acct1920?.vatType?.id}`);

  if (!acct7140 || !acct1920) { console.log("FATAL: accounts not found"); return; }

  const vatTypeId = acct7140.vatType.id; // Should be 12 (incoming 12%)
  console.log(`  Using vatType.id=${vatTypeId} from account 7140 response`);

  // Step 2: Get or create a test department
  console.log("\n=== Step 2: Department ===");
  const deptRes = await api("GET", "/department?name=Administrasjon&isInactive=false&fields=*");
  let deptId: number;
  const depts = (deptRes.data?.values || []).filter((d: any) => d.name === "Administrasjon");
  if (depts.length > 0) {
    deptId = depts[0].id;
    console.log(`  Found existing dept: id=${deptId}`);
  } else {
    const newDept = await api("POST", "/department", { name: "Administrasjon" });
    deptId = newDept.data?.value?.id;
    console.log(`  Created dept: id=${deptId}`);
  }

  // Step 3: Post voucher with 12% VAT (the corrected approach)
  // Togbillett NET = 8750, GROSS = 8750 × 1.12 = 9800
  const NET = 8750;
  const GROSS = NET * 1.12; // = 9800
  console.log(`\n=== Step 3: POST voucher with 12% VAT ===`);
  console.log(`  NET=${NET}, GROSS=${GROSS} (NET × 1.12)`);

  const voucherRes = await api("POST", "/ledger/voucher?sendToLedger=true", {
    date: "2026-02-27",
    description: "Togbillett",
    postings: [
      {
        row: 1,
        date: "2026-02-27",
        description: "Togbillett",
        account: { id: acct7140.id },
        department: { id: deptId },
        vatType: { id: vatTypeId }, // 12 = incoming 12%
        amountGross: GROSS,
        amountGrossCurrency: GROSS
      },
      {
        row: 2,
        date: "2026-02-27",
        description: "Togbillett",
        account: { id: acct1920.id },
        amount: -GROSS,
        amountCurrency: -GROSS,
        amountGross: -GROSS,
        amountGrossCurrency: -GROSS
      }
    ]
  });

  if (voucherRes.status === 201) {
    const v = voucherRes.data?.value;
    console.log(`\n  Voucher id=${v?.id}, number=${v?.number}`);
    console.log(`  Postings:`);
    for (const p of (v?.postings || [])) {
      console.log(`    row=${p.row} account=${p.account?.id} (${p.account?.number || '?'}) amount=${p.amount} amountGross=${p.amountGross} vatType=${p.vatType?.id}`);
    }

    // Step 4: Read back the voucher with full expansion
    console.log(`\n=== Step 4: Read back voucher with full field expansion ===`);
    const readRes = await api("GET", `/ledger/voucher/${v?.id}?fields=id,number,date,description,postings(id,row,account(id,number,name),amount,amountGross,amountGrossCurrency,vatType(id,name,percentage),department(id,name),description)`);
    const rv = readRes.data?.value;
    if (rv) {
      console.log(`  Voucher: id=${rv.id}, number=${rv.number}, date=${rv.date}, desc="${rv.description}"`);
      for (const p of (rv.postings || [])) {
        console.log(`    row=${p.row}: acct=${p.account?.number} (${p.account?.name}) | amount=${p.amount} amountGross=${p.amountGross} | vatType=${p.vatType?.id} (${p.vatType?.name}, ${p.vatType?.percentage}%) | dept=${p.department?.name || 'none'}`);
      }
    }

    // Also test: compare with what 25% would look like
    console.log(`\n=== Comparison: what 25% would produce ===`);
    const GROSS25 = NET * 1.25; // = 10937.50
    console.log(`  If 25%: NET=${NET}, GROSS=${GROSS25} (NET × 1.25)`);
    console.log(`  12% voucher: amountGross=${GROSS}, auto-VAT=${GROSS - NET} on 2712`);
    console.log(`  25% voucher: amountGross=${GROSS25}, auto-VAT=${GROSS25 - NET} on 2710`);
    console.log(`  Difference: GROSS diff=${GROSS25 - GROSS}, VAT diff=${(GROSS25-NET)-(GROSS-NET)}`);
  } else {
    console.log("  FAILED to create voucher!");
    console.log(JSON.stringify(voucherRes.data, null, 2));
  }
}

main().catch(e => { console.error("FATAL:", e); process.exit(1); });
