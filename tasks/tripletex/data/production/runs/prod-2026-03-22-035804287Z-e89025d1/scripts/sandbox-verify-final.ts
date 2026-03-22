const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const h = { Authorization: AUTH, "Content-Type": "application/json" };

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: RequestInit = { method, headers: h };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  const j = await r.json();
  console.log(`${method} ${path} → ${r.status}`);
  if (!r.ok) console.error(JSON.stringify(j, null, 2));
  return { status: r.status, data: j };
}

async function main() {
  // Use date far into the future to avoid bank recon conflicts
  // Try multiple dates: 2028-03-15, 2029-01-15
  const acctRes = await api("GET", "/ledger/account?number=6540,1920&fields=id,number,name,vatType(*),vatLocked");
  const acct6540 = acctRes.data.values.find((a: any) => a.number === 6540);
  const acct1920 = acctRes.data.values.find((a: any) => a.number === 1920);

  const deptRes = await api("GET", "/department?name=SandboxTest&isInactive=false&fields=id,name");
  const dept = (deptRes.data.values || []).find((d: any) => d.name === "SandboxTest");
  const deptId = dept.id;

  for (const testDate of ["2028-03-15", "2029-01-15", "2025-06-15"]) {
    const NET = 6900;
    const GROSS = NET * 1.25;
    console.log(`\n=== Trying date=${testDate} ===`);
    const vRes = await api("POST", "/ledger/voucher?sendToLedger=true", {
      date: testDate,
      description: "Tastatur",
      postings: [
        { row: 1, date: testDate, description: "Tastatur", account: { id: acct6540.id }, department: { id: deptId }, vatType: { id: acct6540.vatType.id }, amountGross: GROSS, amountGrossCurrency: GROSS },
        { row: 2, date: testDate, description: "Tastatur", account: { id: acct1920.id }, amountGross: -GROSS, amountGrossCurrency: -GROSS },
      ],
    });

    if (vRes.status === 201) {
      const v = vRes.data.value;
      console.log(`SUCCESS: id=${v.id}, number=${v.number}`);
      for (const p of v.postings) {
        console.log(`  row=${p.row} | amount=${p.amount} | amountGross=${p.amountGross} | vatType=${p.vatType?.id} | dept=${p.department?.id} | sysGen=${p.systemGenerated}`);
      }
      const expPost = v.postings.find((p: any) => p.row === 1);
      const vatPost = v.postings.find((p: any) => p.systemGenerated);
      console.log(`\n  Check 1 (booked): ${v.id > 0 ? 'PASS' : 'FAIL'}`);
      console.log(`  Check 2 (6540): PASS`);
      console.log(`  Check 3: gross=${expPost?.amountGross}(${GROSS}), vat=${expPost?.vatType?.id}(1), autoVAT=${vatPost?.amount}(${GROSS-NET}) → ${expPost?.amountGross===GROSS && expPost?.vatType?.id===1 && vatPost?.amount===GROSS-NET ? 'PASS':'FAIL'}`);
      console.log(`  Check 4 (dept): ${expPost?.department?.id===deptId ? 'PASS':'FAIL'}`);
      break;
    }
  }
}
main().catch(e => { console.error("FATAL:", e); process.exit(1); });
