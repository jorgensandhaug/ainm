// Sandbox verification: confirm Tastatur maps to account 6540 (Branch B) and 4-call minimum
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
  // 1. Check what accounts exist for IT/office equipment keywords
  // Check 6540, 6560, 6300 to see which are available
  const acctRes = await api("GET", "/ledger/account?number=6540,6560,6300,1920&fields=id,number,name,vatType(*),vatLocked");
  console.log("\n=== Available accounts ===");
  for (const a of acctRes.data.values || []) {
    console.log(`  ${a.number}: ${a.name} | vatType=${a.vatType?.id} (${a.vatType?.name || 'n/a'}) | vatLocked=${a.vatLocked}`);
  }

  // 2. Create a test department
  const deptRes = await api("GET", "/department?name=SandboxTest&isInactive=false&fields=*");
  let deptId: number;
  const exactDept = (deptRes.data.values || []).filter((d: any) => d.name === "SandboxTest");
  if (exactDept.length > 0) {
    deptId = exactDept[0].id;
    console.log("\nUsing existing dept:", deptId);
  } else {
    const newDept = await api("POST", "/department", { name: "SandboxTest", departmentNumber: -1 });
    deptId = newDept.data.value.id;
    console.log("\nCreated dept:", deptId);
  }

  // 3. Book voucher for Tastatur on 6540 (Branch B)
  const acct6540 = (acctRes.data.values || []).find((a: any) => a.number === 6540);
  const acct1920 = (acctRes.data.values || []).find((a: any) => a.number === 1920);
  if (!acct6540 || !acct1920) { console.error("Missing accounts!"); return; }

  const NET = 6900;
  const GROSS = NET * 1.25; // 8625
  const vatTypeId = acct6540.vatType?.id ?? 1;

  console.log(`\n=== Booking Tastatur: NET=${NET}, GROSS=${GROSS}, vatType=${vatTypeId} ===`);

  const voucherRes = await api("POST", "/ledger/voucher?sendToLedger=true", {
    date: "2026-05-19",
    description: "Tastatur",
    postings: [
      {
        row: 1, date: "2026-05-19", description: "Tastatur",
        account: { id: acct6540.id },
        department: { id: deptId },
        vatType: { id: vatTypeId },
        amountGross: GROSS, amountGrossCurrency: GROSS,
      },
      {
        row: 2, date: "2026-05-19", description: "Tastatur",
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
      const acctNum = p.account?.id;
      console.log(`  row=${p.row} | account=${acctNum} | amount=${p.amount} | amountGross=${p.amountGross} | vatType=${p.vatType?.id} | dept=${p.department?.id} | sysGen=${p.systemGenerated}`);
    }
    // Verify the auto-VAT posting
    const vatPosting = v.postings.find((p: any) => p.systemGenerated);
    if (vatPosting) {
      console.log(`\nAuto-VAT posting: amount=${vatPosting.amount} on account ${vatPosting.account?.id}`);
    }
  }

  // 4. Readback to verify
  const readback = await api("GET", `/ledger/voucher/${voucherRes.data.value?.id}?fields=*,postings(*)`);
  if (readback.status === 200) {
    const v = readback.data.value;
    console.log(`\n=== Readback ===`);
    console.log(`Voucher ${v.id}: number=${v.number}, date=${v.date}, desc="${v.description}"`);
    for (const p of v.postings || []) {
      console.log(`  row=${p.row} | account=${p.account?.id} | amount=${p.amount} | amountGross=${p.amountGross} | vatType=${p.vatType?.id} | dept=${p.department?.id} | sysGen=${p.systemGenerated}`);
    }
  }

  console.log("\n=== Sandbox verification complete ===");
}

main().catch(e => { console.error("FATAL:", e); process.exit(1); });
