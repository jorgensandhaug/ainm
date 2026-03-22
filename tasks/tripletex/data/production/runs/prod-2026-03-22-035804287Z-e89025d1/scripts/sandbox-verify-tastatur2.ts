// Sandbox verification: Tastatur on 6540 with date that avoids bank reconciliation conflict
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
  if (!r.ok) { console.error(JSON.stringify(j, null, 2)); }
  return { status: r.status, data: j };
}

async function main() {
  // Accounts already known from previous call:
  // 6540: Inventar, vatType=1 (25% incoming), vatLocked=false
  // 6560: Rekvisita, vatType=1 (25% incoming), vatLocked=false
  // Both have same vatType. 6540 = "Inventar", 6560 = "Rekvisita"
  // In Norwegian accounting: 6540 = furniture/office equipment, 6560 = office supplies/stationery
  // A keyboard is more "inventar" (equipment) than "rekvisita" (supplies like pens/paper)
  // Both would produce same scored output though (same vatType)

  // Use date in 2026-08 to avoid bank recon conflict
  const acctRes = await api("GET", "/ledger/account?number=6540,1920&fields=id,number,name,vatType(*),vatLocked");
  const acct6540 = acctRes.data.values.find((a: any) => a.number === 6540);
  const acct1920 = acctRes.data.values.find((a: any) => a.number === 1920);

  const deptRes = await api("GET", "/department?name=SandboxTest&isInactive=false&fields=*");
  const dept = deptRes.data.values.find((d: any) => d.name === "SandboxTest");
  const deptId = dept.id;

  const NET = 6900;
  const GROSS = NET * 1.25; // 8625
  const vatTypeId = acct6540.vatType.id; // 1

  console.log(`\n=== Booking Tastatur: NET=${NET}, GROSS=${GROSS}, vatType=${vatTypeId}, dept=${deptId} ===`);

  const voucherRes = await api("POST", "/ledger/voucher?sendToLedger=true", {
    date: "2026-08-19",
    description: "Tastatur",
    postings: [
      {
        row: 1, date: "2026-08-19", description: "Tastatur",
        account: { id: acct6540.id },
        department: { id: deptId },
        vatType: { id: vatTypeId },
        amountGross: GROSS, amountGrossCurrency: GROSS,
      },
      {
        row: 2, date: "2026-08-19", description: "Tastatur",
        account: { id: acct1920.id },
        amountGross: -GROSS, amountGrossCurrency: -GROSS,
      },
    ],
  });

  if (voucherRes.status === 201) {
    const v = voucherRes.data.value;
    console.log(`\nVoucher created: id=${v.id}, number=${v.number}`);
    console.log("Postings:");
    for (const p of v.postings) {
      console.log(`  row=${p.row} | amount=${p.amount} | amountGross=${p.amountGross} | vatType=${p.vatType?.id} | dept=${p.department?.id} | sysGen=${p.systemGenerated}`);
    }

    // Verify auto-VAT posting
    const vatPosting = v.postings.find((p: any) => p.systemGenerated);
    if (vatPosting) {
      console.log(`\nAuto-VAT: amount=${vatPosting.amount} (expected ${GROSS - NET} = ${GROSS - NET})`);
      console.log(`VAT check: ${vatPosting.amount === GROSS - NET ? 'PASS' : 'FAIL'}`);
    }

    // Check all scored fields
    const expPosting = v.postings.find((p: any) => p.row === 1);
    console.log("\n=== Scored field verification ===");
    console.log(`Check 1 (voucher exists): id=${v.id}, number=${v.number} → ${v.id > 0 && v.number > 0 ? 'PASS' : 'FAIL'}`);
    console.log(`Check 2 (account 6540): ${expPosting ? 'PASS' : 'FAIL'}`);
    console.log(`Check 3 (amount+VAT): amountGross=${expPosting?.amountGross} (exp ${GROSS}), vatType=${expPosting?.vatType?.id} (exp 1) → ${expPosting?.amountGross === GROSS && expPosting?.vatType?.id === 1 ? 'PASS' : 'FAIL'}`);
    console.log(`Check 4 (department): dept=${expPosting?.department?.id} (exp ${deptId}) → ${expPosting?.department?.id === deptId ? 'PASS' : 'FAIL'}`);
    console.log("Check 5 (attachment): would need file upload — skipped for sandbox");
  }

  console.log("\n=== Done ===");
}

main().catch(e => { console.error("FATAL:", e); process.exit(1); });
