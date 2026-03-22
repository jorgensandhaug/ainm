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
  const receiptDate = "2026-06-21";
  const description = "Whiteboard";
  const NET = 14300;
  const GROSS = NET * 1.25; // 17875

  // Use existing department - search for any
  const deptGet = await api("GET", "/department?isInactive=false&fields=id,name&count=5");
  const departments = deptGet.json.values;
  console.log("Available departments:", departments.map((d: any) => `${d.id}:${d.name}`).join(", "));
  const deptId = departments[0].id;
  console.log("Using department:", deptId, departments[0].name);

  // Get accounts
  const acctRes = await api("GET", "/ledger/account?number=6540,1920&fields=id,number,name,vatType(*),vatLocked");
  const acct6540 = acctRes.json.values.find((a: any) => a.number === 6540);
  const acct1920 = acctRes.json.values.find((a: any) => a.number === 1920);
  console.log(`6540: id=${acct6540.id}, vatType.id=${acct6540.vatType?.id}, vatLocked=${acct6540.vatLocked}`);
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
    console.log(`\nVoucher created: id=${v.id}, number=${v.number}`);
    for (const p of v.postings) {
      console.log(`  row=${p.row}, acct=${p.account.id}, dept=${p.department?.id ?? 'null'}, vatType=${p.vatType?.id}, amount=${p.amount}, amountGross=${p.amountGross}, sysGen=${p.systemGenerated}`);
    }

    const expPosting = v.postings.find((p: any) => p.row === 1);
    const vatPosting = v.postings.find((p: any) => p.systemGenerated);

    console.log("\n=== VERIFICATION ===");
    console.log(`Check 1 (voucher exists): id=${v.id}, number=${v.number} → ${v.id > 0 && v.number > 0 ? 'PASS' : 'FAIL'}`);
    console.log(`Check 2 (account 6540): ${expPosting?.account?.id === acct6540.id ? 'PASS' : 'FAIL'}`);
    console.log(`Check 3 (amounts): GROSS=${expPosting?.amountGross}(exp ${GROSS}), NET(auto)=${expPosting?.amount}(exp ${NET}), vatType=${expPosting?.vatType?.id}(exp 1), autoVAT=${vatPosting?.amount}(exp ${GROSS - NET}) → ${expPosting?.amountGross === GROSS && expPosting?.vatType?.id === 1 && vatPosting?.amount === GROSS - NET ? 'PASS' : 'FAIL'}`);
    console.log(`Check 4 (department): dept.id=${expPosting?.department?.id}(exp ${deptId}) → ${expPosting?.department?.id === deptId ? 'PASS' : 'FAIL'}`);
    console.log(`Check 5 (attachment): skipped in sandbox`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
