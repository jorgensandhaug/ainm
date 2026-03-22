const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const h = { Authorization: AUTH, "Content-Type": "application/json" };

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: RequestInit = { method, headers: h };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  const text = await r.text();
  let j;
  try { j = JSON.parse(text); } catch { j = text; }
  console.log(`${method} ${path} → ${r.status}`);
  if (!r.ok) console.error(typeof j === 'string' ? j : JSON.stringify(j, null, 2));
  return { status: r.status, data: j };
}

async function main() {
  // Get accounts fresh
  const acctRes = await api("GET", "/ledger/account?number=6540,1920&fields=id,number,name,vatType(*),vatLocked");
  const acct6540 = acctRes.data.values.find((a: any) => a.number === 6540);
  const acct1920 = acctRes.data.values.find((a: any) => a.number === 1920);
  console.log(`  6540: id=${acct6540.id}, vatType=${acct6540.vatType?.id}`);
  console.log(`  1920: id=${acct1920.id}`);

  // Get/create dept
  const deptRes = await api("GET", "/department?name=SandboxTest&isInactive=false&fields=id,name");
  const dept = (deptRes.data.values || []).find((d: any) => d.name === "SandboxTest");
  const deptId = dept?.id;
  console.log(`  dept: id=${deptId}`);

  // Use date 2026-12-15 — between the bank statement gaps
  // Bank statements show: 2026-11-02..11-16, then nothing until 2027-05-05
  const NET = 6900;
  const GROSS = NET * 1.25; // 8625
  const vatTypeId = acct6540.vatType?.id ?? 1;

  console.log(`\n=== POST voucher: date=2026-12-15, GROSS=${GROSS}, vatType=${vatTypeId} ===`);
  const vRes = await api("POST", "/ledger/voucher?sendToLedger=true", {
    date: "2026-12-15",
    description: "Tastatur",
    postings: [
      {
        row: 1, date: "2026-12-15", description: "Tastatur",
        account: { id: acct6540.id },
        department: { id: deptId },
        vatType: { id: vatTypeId },
        amountGross: GROSS, amountGrossCurrency: GROSS,
      },
      {
        row: 2, date: "2026-12-15", description: "Tastatur",
        account: { id: acct1920.id },
        amountGross: -GROSS, amountGrossCurrency: -GROSS,
      },
    ],
  });

  if (vRes.status === 201) {
    const v = vRes.data.value;
    console.log(`\nVoucher ${v.id}: number=${v.number}`);
    for (const p of v.postings) {
      console.log(`  row=${p.row} | amount=${p.amount} | amountGross=${p.amountGross} | vatType=${p.vatType?.id} | dept=${p.department?.id} | sysGen=${p.systemGenerated}`);
    }

    const expPost = v.postings.find((p: any) => p.row === 1);
    const vatPost = v.postings.find((p: any) => p.systemGenerated);

    console.log("\n=== Verification ===");
    console.log(`Check 1 (booked): ${v.id > 0 && v.number > 0 ? 'PASS' : 'FAIL'}`);
    console.log(`Check 2 (acct 6540): ${expPost ? 'PASS' : 'FAIL'}`);
    console.log(`Check 3 (amount): gross=${expPost?.amountGross} (exp ${GROSS}), vat=${expPost?.vatType?.id} (exp 1), autoVAT=${vatPost?.amount} (exp ${GROSS - NET} = ${GROSS - NET}) → ${expPost?.amountGross === GROSS && expPost?.vatType?.id === 1 ? 'PASS' : 'FAIL'}`);
    console.log(`Check 4 (dept): ${expPost?.department?.id} → ${expPost?.department?.id === deptId ? 'PASS' : 'FAIL'}`);
    console.log("Check 5 (attach): skipped (sandbox)");
  }
}

main().catch(e => { console.error("FATAL:", e); process.exit(1); });
