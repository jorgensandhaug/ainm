const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const headers = { Authorization: AUTH, "Content-Type": "application/json" };

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: any = { method, headers };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const json = await res.json();
  console.log(`${method} ${path} → ${res.status}`);
  if (!res.ok) console.error(JSON.stringify(json, null, 2));
  return { status: res.status, json };
}

async function main() {
  // Use a date far from any reconciled period
  const receiptDate = "2026-12-15";
  const description = "Whiteboard";
  const NET = 14300;
  const GROSS = NET * 1.25; // 17875

  // Use existing department
  const deptGet = await api("GET", "/department?isInactive=false&fields=id,name&count=5");
  const deptId = deptGet.json.values[0].id;
  console.log("Department:", deptId, deptGet.json.values[0].name);

  // Get accounts
  const acctRes = await api("GET", "/ledger/account?number=6540,1920&fields=id,number,name,vatType(*),vatLocked");
  const acct6540 = acctRes.json.values.find((a: any) => a.number === 6540);
  const acct1920 = acctRes.json.values.find((a: any) => a.number === 1920);
  console.log(`6540: id=${acct6540.id}, vatType.id=${acct6540.vatType?.id}`);
  console.log(`1920: id=${acct1920.id}`);

  // Create voucher
  const voucherRes = await api("POST", "/ledger/voucher?sendToLedger=true", {
    date: receiptDate,
    description,
    postings: [
      {
        row: 1, date: receiptDate, description,
        account: { id: acct6540.id },
        department: { id: deptId },
        vatType: { id: acct6540.vatType.id },
        amountGross: GROSS, amountGrossCurrency: GROSS,
      },
      {
        row: 2, date: receiptDate, description,
        account: { id: acct1920.id },
        amountGross: -GROSS, amountGrossCurrency: -GROSS,
      },
    ],
  });

  if (voucherRes.status === 201) {
    const v = voucherRes.json.value;
    console.log(`\nVoucher: id=${v.id}, number=${v.number}`);
    for (const p of v.postings) {
      console.log(`  row=${p.row}, acct=${p.account.id}, dept=${p.department?.id ?? 'null'}, vatType=${p.vatType?.id}, amt=${p.amount}, amtGross=${p.amountGross}, sysGen=${p.systemGenerated}`);
    }

    const exp = v.postings.find((p: any) => p.row === 1);
    const vat = v.postings.find((p: any) => p.systemGenerated);

    console.log("\n=== VERIFICATION ===");
    console.log(`Check 1: voucher id=${v.id}, number=${v.number} → ${v.id > 0 && v.number > 0 ? 'PASS' : 'FAIL'}`);
    console.log(`Check 2: account=${acct6540.id} → ${exp?.account?.id === acct6540.id ? 'PASS' : 'FAIL'}`);
    console.log(`Check 3: GROSS=${exp?.amountGross}(${GROSS}), NET=${exp?.amount}(${NET}), vatType=${exp?.vatType?.id}(1), VAT=${vat?.amount}(${GROSS-NET}) → ${exp?.amountGross === GROSS && exp?.vatType?.id === 1 && vat?.amount === GROSS-NET ? 'PASS' : 'FAIL'}`);
    console.log(`Check 4: dept=${exp?.department?.id}(${deptId}) → ${exp?.department?.id === deptId ? 'PASS' : 'FAIL'}`);
    console.log(`Check 5: attachment → skipped`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
