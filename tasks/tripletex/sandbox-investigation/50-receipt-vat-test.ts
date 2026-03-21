// Test: receipt voucher with 12% vs 25% VAT on account 7140 (travel)
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
  // Get accounts
  const acctRes = await api("GET", "/ledger/account?number=7140,1920&fields=id,number,name,vatType(*)");
  const acct7140 = acctRes.data.values.find((a: any) => a.number === 7140);
  const acct1920 = acctRes.data.values.find((a: any) => a.number === 1920);
  console.log("7140 default vatType:", JSON.stringify(acct7140.vatType));

  // Check what vatType id=12 and id=1 are
  const vt1 = await api("GET", "/ledger/vatType/1?fields=*");
  console.log("vatType 1:", JSON.stringify({id:vt1.data?.value?.id, name:vt1.data?.value?.name, percentage:vt1.data?.value?.percentage}));
  
  const vt12 = await api("GET", "/ledger/vatType/12?fields=*");
  console.log("vatType 12:", JSON.stringify({id:vt12.data?.value?.id, name:vt12.data?.value?.name, percentage:vt12.data?.value?.percentage}));
  
  // Also check vatType 3 (incoming 12%)
  const vt3 = await api("GET", "/ledger/vatType/3?fields=*");
  console.log("vatType 3:", JSON.stringify({id:vt3.data?.value?.id, name:vt3.data?.value?.name, percentage:vt3.data?.value?.percentage}));

  // List all incoming vatTypes
  const vtAll = await api("GET", "/ledger/vatType?typeOfVat=INCOMING&vatDate=2026-02-27&fields=id,name,percentage,deductionPercentage&count=50");
  console.log("\nAll INCOMING vatTypes:");
  for (const vt of (vtAll.data?.values || [])) {
    console.log(`  id=${vt.id} name=${vt.name} pct=${vt.percentage} deduct=${vt.deductionPercentage}`);
  }

  // Test 1: voucher with 25% VAT (id=1)
  console.log("\n=== Test 1: 25% VAT (vatType id=1) ===");
  const GROSS25 = 8750 * 1.25; // 10937.50
  const v1 = await api("POST", "/ledger/voucher?sendToLedger=true", {
    date: "2026-02-27",
    description: "Togbillett 25% test",
    postings: [
      { row: 1, date: "2026-02-27", description: "Togbillett", account: { id: acct7140.id }, vatType: { id: 1 }, amountGross: GROSS25, amountGrossCurrency: GROSS25 },
      { row: 2, date: "2026-02-27", description: "Togbillett", account: { id: acct1920.id }, amount: -GROSS25, amountCurrency: -GROSS25, amountGross: -GROSS25, amountGrossCurrency: -GROSS25 }
    ]
  });
  if (v1.status === 201) {
    console.log("Voucher 25%:", JSON.stringify(v1.data.value.postings?.map((p:any) => ({
      account: p.account?.id, amount: p.amount, amountGross: p.amountGross, vatType: p.vatType?.id
    })), null, 2));
  }

  // Test 2: voucher with 12% VAT (vatType id=12 or the correct incoming 12% id)
  console.log("\n=== Test 2: 12% VAT (vatType id=12) ===");
  const GROSS12 = 8750 * 1.12; // 9800
  const v2 = await api("POST", "/ledger/voucher?sendToLedger=true", {
    date: "2026-02-27",
    description: "Togbillett 12% test",
    postings: [
      { row: 1, date: "2026-02-27", description: "Togbillett", account: { id: acct7140.id }, vatType: { id: 12 }, amountGross: GROSS12, amountGrossCurrency: GROSS12 },
      { row: 2, date: "2026-02-27", description: "Togbillett", account: { id: acct1920.id }, amount: -GROSS12, amountCurrency: -GROSS12, amountGross: -GROSS12, amountGrossCurrency: -GROSS12 }
    ]
  });
  if (v2.status === 201) {
    console.log("Voucher 12%:", JSON.stringify(v2.data.value.postings?.map((p:any) => ({
      account: p.account?.id, amount: p.amount, amountGross: p.amountGross, vatType: p.vatType?.id
    })), null, 2));
  }

  // Test 3: What if we use GROSS = 8750 * 1.12 with vatType=1 (25%)? 
  console.log("\n=== Test 3: GROSS=9800 with vatType=1 (25%) ===");
  const v3 = await api("POST", "/ledger/voucher?sendToLedger=true", {
    date: "2026-02-27",
    description: "Togbillett mixed test",
    postings: [
      { row: 1, date: "2026-02-27", description: "Togbillett", account: { id: acct7140.id }, vatType: { id: 1 }, amountGross: 9800, amountGrossCurrency: 9800 },
      { row: 2, date: "2026-02-27", description: "Togbillett", account: { id: acct1920.id }, amount: -9800, amountCurrency: -9800, amountGross: -9800, amountGrossCurrency: -9800 }
    ]
  });
  if (v3.status === 201) {
    console.log("Voucher mixed:", JSON.stringify(v3.data.value.postings?.map((p:any) => ({
      account: p.account?.id, amount: p.amount, amountGross: p.amountGross, vatType: p.vatType?.id
    })), null, 2));
  }
}

main().catch(e => { console.error("FATAL:", e); process.exit(1); });
