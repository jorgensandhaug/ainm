// TASK 22 investigation: receipt prices are NET, not GROSS
// All 3 receipts confirm: total × 0.25 = stated MVA → prices are NET
// Test: correct gross = NET × 1.25, plus sendToLedger
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa(`0:${TOKEN}`);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: RequestInit = { method, headers: H };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const text = await res.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  console.log(`${method} ${path} => ${res.status}`);
  if (res.status >= 400) console.log("  ERR:", JSON.stringify(json, null, 2).slice(0, 500));
  return { status: res.status, data: json };
}

async function main() {
  // ============================================
  // 1. Get specific accounts
  // ============================================
  console.log("=== Step 1: Get accounts ===\n");

  const accRes = await api("GET", "/ledger/account?number=7360,7140,7100,1920&fields=id,number,name,vatType(*),vatLocked");
  const accounts = accRes.data?.values || [];
  for (const a of accounts) {
    console.log(`  ${a.number} "${a.name}" vatLocked=${a.vatLocked} vatType.id=${a.vatType?.id} vatType.name="${a.vatType?.name}"`);
  }

  const acc7360 = accounts.find((a: any) => a.number === 7360);
  const acc7140 = accounts.find((a: any) => a.number === 7140);
  const acc7100 = accounts.find((a: any) => a.number === 7100);
  const acc1920 = accounts.find((a: any) => a.number === 1920);

  console.log(`\n7360: id=${acc7360?.id} vatType.id=${acc7360?.vatType?.id}`);
  console.log(`7140: id=${acc7140?.id} vatType.id=${acc7140?.vatType?.id}`);
  console.log(`7100: id=${acc7100?.id} vatType.id=${acc7100?.vatType?.id}`);
  console.log(`1920: id=${acc1920?.id}`);

  // Create department
  const deptRes = await api("POST", "/department", { name: "Test22b", departmentNumber: 823 });
  const deptId = deptRes.data?.value?.id;
  console.log(`\nDepartment: id=${deptId}`);

  // Get incoming VAT types
  const vatTypes = await api("GET", "/ledger/vatType?typeOfVat=INCOMING&count=50&fields=*");
  console.log("\nIncoming VAT types:");
  for (const vt of (vatTypes.data?.values || [])) {
    console.log(`  id=${vt.id} number=${vt.number} name="${vt.name}" percentage=${vt.percentage}`);
  }

  const vatType25 = (vatTypes.data?.values || []).find((vt: any) => vt.percentage === 25);
  const vatType12 = (vatTypes.data?.values || []).find((vt: any) => vt.percentage === 12);
  console.log(`\n25% incoming: id=${vatType25?.id}`);
  console.log(`12% incoming: id=${vatType12?.id}`);

  // ============================================
  // TEST A: Non-deductible representation (Kundemøte lunsj)
  // NET=14050, GROSS=14050×1.25=17562.50
  // ============================================
  console.log("\n=== TEST A: Branch A - Kundemøte lunsj ===\n");
  const NET_LUNCH = 14050;
  const GROSS_LUNCH = NET_LUNCH * 1.25;
  console.log(`NET=${NET_LUNCH} GROSS=${GROSS_LUNCH}`);

  // A1: sendToLedger=true, GROSS amount
  const vA1 = await api("POST", "/ledger/voucher?sendToLedger=true", {
    date: "2026-04-26",
    description: "Kundemøte lunsj",
    postings: [
      {
        row: 1, date: "2026-04-26", description: "Kundemøte lunsj",
        account: { id: acc7360.id }, department: { id: deptId },
        amount: GROSS_LUNCH, amountCurrency: GROSS_LUNCH,
        amountGross: GROSS_LUNCH, amountGrossCurrency: GROSS_LUNCH,
      },
      {
        row: 2, date: "2026-04-26", description: "Kundemøte lunsj",
        account: { id: acc1920.id },
        amount: -GROSS_LUNCH, amountCurrency: -GROSS_LUNCH,
        amountGross: -GROSS_LUNCH, amountGrossCurrency: -GROSS_LUNCH,
      },
    ],
  });
  const vA1Id = vA1.data?.value?.id;
  console.log(`A1 (gross, booked): id=${vA1Id} number=${vA1.data?.value?.number}`);

  if (vA1Id) {
    const d = await api("GET", `/ledger/voucher/${vA1Id}?fields=*,postings(*)`);
    const v = d.data?.value;
    console.log(`  date=${v?.date} description="${v?.description}" number=${v?.number}`);
    for (const p of (v?.postings || [])) {
      console.log(`  posting: acct=${p.account?.number} amount=${p.amount} amountGross=${p.amountGross} dept=${p.department?.id} vatType=${p.vatType?.id}`);
    }
  }

  // ============================================
  // TEST B: Togbillett - deductible travel, 25% VAT
  // NET=11350, GROSS=11350×1.25=14187.50
  // ============================================
  console.log("\n=== TEST B: Togbillett - 7140 with 25% VAT ===\n");
  const NET_TRAIN = 11350;
  const GROSS_TRAIN = NET_TRAIN * 1.25;
  console.log(`NET=${NET_TRAIN} GROSS=${GROSS_TRAIN}`);

  const vB = await api("POST", "/ledger/voucher?sendToLedger=true", {
    date: "2026-04-13",
    description: "Togbillett",
    postings: [
      {
        row: 1, date: "2026-04-13", description: "Togbillett",
        account: { id: acc7140.id }, department: { id: deptId },
        vatType: { id: vatType25.id },
        amountGross: GROSS_TRAIN, amountGrossCurrency: GROSS_TRAIN,
      },
      {
        row: 2, date: "2026-04-13", description: "Togbillett",
        account: { id: acc1920.id },
        amount: -GROSS_TRAIN, amountCurrency: -GROSS_TRAIN,
        amountGross: -GROSS_TRAIN, amountGrossCurrency: -GROSS_TRAIN,
      },
    ],
  });
  const vBId = vB.data?.value?.id;
  console.log(`B (7140, 25%, booked): id=${vBId}`);

  if (vBId) {
    const d = await api("GET", `/ledger/voucher/${vBId}?fields=*,postings(*)`);
    const v = d.data?.value;
    console.log(`  date=${v?.date} description="${v?.description}" number=${v?.number}`);
    for (const p of (v?.postings || [])) {
      console.log(`  posting: acct=${p.account?.number} amount=${p.amount} amountGross=${p.amountGross} dept=${p.department?.id} vatType=${p.vatType?.id}`);
    }
  }

  // ============================================
  // TEST C: Overnatting - 25% VAT (receipt-stated rate)
  // NET=4850, GROSS=4850×1.25=6062.50
  // ============================================
  console.log("\n=== TEST C: Overnatting - 7140 with 25% VAT ===\n");
  const NET_HOTEL = 4850;
  const GROSS_HOTEL = NET_HOTEL * 1.25;
  console.log(`NET=${NET_HOTEL} GROSS=${GROSS_HOTEL}`);

  const vC = await api("POST", "/ledger/voucher?sendToLedger=true", {
    date: "2026-06-20",
    description: "Overnatting",
    postings: [
      {
        row: 1, date: "2026-06-20", description: "Overnatting",
        account: { id: acc7140.id }, department: { id: deptId },
        vatType: { id: vatType25.id },
        amountGross: GROSS_HOTEL, amountGrossCurrency: GROSS_HOTEL,
      },
      {
        row: 2, date: "2026-06-20", description: "Overnatting",
        account: { id: acc1920.id },
        amount: -GROSS_HOTEL, amountCurrency: -GROSS_HOTEL,
        amountGross: -GROSS_HOTEL, amountGrossCurrency: -GROSS_HOTEL,
      },
    ],
  });
  const vCId = vC.data?.value?.id;
  console.log(`C (7140, 25%, booked): id=${vCId}`);

  if (vCId) {
    const d = await api("GET", `/ledger/voucher/${vCId}?fields=*,postings(*)`);
    const v = d.data?.value;
    console.log(`  date=${v?.date} description="${v?.description}" number=${v?.number}`);
    for (const p of (v?.postings || [])) {
      console.log(`  posting: acct=${p.account?.number} amount=${p.amount} amountGross=${p.amountGross} dept=${p.department?.id} vatType=${p.vatType?.id}`);
    }
  }

  // ============================================
  // TEST D: Also check what account Togbillett should use
  // Could be 7100 (Billettkostnader) instead of 7140
  // ============================================
  console.log("\n=== TEST D: Check 7100 Billettkostnader ===\n");
  if (acc7100) {
    console.log(`7100: "${acc7100.name}" vatType.id=${acc7100.vatType?.id}`);
    const vD = await api("POST", "/ledger/voucher?sendToLedger=true", {
      date: "2026-04-13",
      description: "Togbillett",
      postings: [
        {
          row: 1, date: "2026-04-13", description: "Togbillett",
          account: { id: acc7100.id }, department: { id: deptId },
          vatType: { id: vatType25.id },
          amountGross: GROSS_TRAIN, amountGrossCurrency: GROSS_TRAIN,
        },
        {
          row: 2, date: "2026-04-13", description: "Togbillett",
          account: { id: acc1920.id },
          amount: -GROSS_TRAIN, amountCurrency: -GROSS_TRAIN,
          amountGross: -GROSS_TRAIN, amountGrossCurrency: -GROSS_TRAIN,
        },
      ],
    });
    const vDId = vD.data?.value?.id;
    console.log(`D (7100, 25%, booked): id=${vDId}`);
    if (vDId) {
      const d = await api("GET", `/ledger/voucher/${vDId}?fields=*,postings(*)`);
      const v = d.data?.value;
      for (const p of (v?.postings || [])) {
        console.log(`  posting: acct=${p.account?.number} amount=${p.amount} amountGross=${p.amountGross} vatType=${p.vatType?.id}`);
      }
    }
  } else {
    console.log("Account 7100 not found in chart of accounts");
  }

  // ============================================
  // TEST E: What about Forretningslunsj? Check receipt
  // The 2nd task 22 run (timeout) was for Forretningslunsj
  // ============================================
  console.log("\n=== TEST E: Check 6800 series (Møter/kurs accounts) ===\n");
  const acc6800 = await api("GET", "/ledger/account?numberFrom=6800&numberTo=6899&count=50&fields=id,number,name,vatType(*),vatLocked");
  for (const a of (acc6800.data?.values || [])) {
    console.log(`  ${a.number} "${a.name}" vatLocked=${a.vatLocked} vatType.id=${a.vatType?.id}`);
  }

  // Also check 7350 (not expected to work based on standard)
  const acc7350 = await api("GET", "/ledger/account?number=7350&fields=id,number,name,vatType(*),vatLocked");
  console.log(`\n7350: ${JSON.stringify(acc7350.data?.values?.[0])}`);

  console.log("\n=== SUMMARY ===");
  console.log(`Branch A (Kundemøte lunsj): 7360, no VAT, amount = NET × 1.25 = ${GROSS_LUNCH}`);
  console.log(`Branch B (Togbillett): 7140, vatType 25%, amountGross = NET × 1.25 = ${GROSS_TRAIN}`);
  console.log(`Branch C (Overnatting): 7140, vatType 25%, amountGross = NET × 1.25 = ${GROSS_HOTEL}`);
}

main().catch(e => { console.error("FATAL:", e); process.exit(1); });
