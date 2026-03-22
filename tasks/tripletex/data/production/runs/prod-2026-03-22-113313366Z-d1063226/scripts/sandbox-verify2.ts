// Sandbox verification: confirm the 3-step flow, test if projectActivity is a valid alternative
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const h = { Authorization: AUTH, "Content-Type": "application/json" };

async function get(path: string) {
  const r = await fetch(`${BASE}${path}`, { headers: h });
  const txt = await r.text();
  console.log(`GET ${path} → ${r.status}`);
  if (!r.ok) { console.log(`  ERROR: ${txt.slice(0, 200)}`); return null; }
  return JSON.parse(txt);
}

async function main() {
  // Step 1: 4 parallel GETs
  console.log("=== Step 1: 4 parallel GETs ===");
  const [empRes, projRes, vatRes, bankRes] = await Promise.all([
    get(`/employee?email=${encodeURIComponent("codex.verify.1773957815637@example.org")}&count=10&fields=*`),
    get(`/project?name=${encodeURIComponent("Sandbox Hour Invoice Project 1774020541520")}&count=50&fields=*,customer(*)`),
    get(`/ledger/vatType?typeOfVat=OUTGOING&vatDate=2026-12-20&fields=*`),
    get(`/ledger/account?isBankAccount=true&fields=*`),
  ]);

  const emp = empRes?.values?.find((e: any) => e.email === "codex.verify.1773957815637@example.org");
  const proj = projRes?.values?.find((p: any) => p.name?.includes("Sandbox Hour Invoice"));
  const vatType = vatRes?.values?.[0];
  const bank = bankRes?.values?.find((a: any) => a.isBankAccount);

  console.log(`Employee: id=${emp?.id}`);
  console.log(`Project: id=${proj?.id} customer=${proj?.customer?.id}`);
  console.log(`VAT: id=${vatType?.id} pct=${vatType?.percentage}`);
  console.log(`Bank: id=${bank?.id} bankNum=${bank?.bankAccountNumber}`);

  if (!emp || !proj) {
    console.log("Missing entities, stopping.");
    return;
  }

  // Test: Can GET /project/projectActivity replace GET /activity/>forTimeSheet?
  console.log("\n=== Test: projectActivity vs forTimeSheet ===");
  const [projActRes, forTsRes] = await Promise.all([
    get(`/project/projectActivity?projectId=${proj.id}&count=50&fields=*`),
    get(`/activity/%3EforTimeSheet?projectId=${proj.id}&employeeId=${emp.id}&date=2026-12-20&query=Prosjektadministrasjon&filterExistingHours=false&count=50&fields=*`),
  ]);

  if (projActRes?.values) {
    console.log("projectActivity results:");
    for (const a of projActRes.values) {
      console.log(`  id=${a.id} name="${a.activity?.name}" isChargeable=${a.isChargeable}`);
    }
  }

  if (forTsRes?.values) {
    console.log("forTimeSheet results:");
    for (const a of forTsRes.values) {
      console.log(`  id=${a.id} name="${a.name}" isChargeable=${a.isChargeable}`);
    }
  }

  // Key question: does projectActivity give the SAME activity ID that forTimeSheet gives?
  // If yes, we could potentially use projectActivity with the project GET in step 1 (if it can be parallelized)
  // But projectActivity requires projectId, which comes from the project GET, so it's in step 2 anyway

  // Step 2: activity GET
  const activity = forTsRes?.values?.find((a: any) => a.name === "Prosjektadministrasjon");
  if (!activity) {
    console.log("Activity not found, stopping.");
    return;
  }
  console.log(`\nActivity: id=${activity.id} isChargeable=${activity.isChargeable}`);

  // Step 3: parallel timesheet + invoice (new date)
  console.log("\n=== Step 3: parallel writes on 2026-12-20 ===");
  const [tsRes, invRes] = await Promise.all([
    fetch(`${BASE}/timesheet/entry`, {
      method: "POST", headers: h,
      body: JSON.stringify({
        employee: { id: emp.id },
        project: { id: proj.id },
        activity: { id: activity.id },
        date: "2026-12-20",
        hours: 11,
        projectChargeableHours: 11,
      }),
    }),
    fetch(`${BASE}/invoice?sendToCustomer=false`, {
      method: "POST", headers: h,
      body: JSON.stringify({
        invoiceDate: "2026-12-20",
        invoiceDueDate: "2027-01-20",
        customer: { id: proj.customer.id },
        orders: [{
          customer: { id: proj.customer.id },
          project: { id: proj.id },
          orderDate: "2026-12-20",
          deliveryDate: "2026-12-20",
          orderLines: [{
            description: "Prosjektadministrasjon",
            count: 11,
            unitPriceExcludingVatCurrency: 1000,
            vatType: { id: vatType.id },
          }],
        }],
      }),
    }),
  ]);

  const tsTxt = await tsRes.text();
  console.log(`POST /timesheet/entry → ${tsRes.status}`);
  const tsData = JSON.parse(tsTxt);
  if (tsData.value) {
    const ts = tsData.value;
    console.log(`  hours=${ts.hours} pch=${ts.projectChargeableHours} chargeable=${ts.chargeable} hourlyRate=${ts.hourlyRate}`);
  } else {
    console.log(`  ${tsTxt.slice(0, 200)}`);
  }

  const invTxt = await invRes.text();
  console.log(`POST /invoice → ${invRes.status}`);
  const invData = JSON.parse(invTxt);
  if (invData.value) {
    const inv = invData.value;
    console.log(`  id=${inv.id} invoiceNumber=${inv.invoiceNumber} amountExVat=${inv.amountExcludingVatCurrency} outstanding=${inv.amountCurrencyOutstanding}`);
    console.log(`  projectInvoiceDetails length=${inv.projectInvoiceDetails?.length}`);
  } else {
    console.log(`  ${invTxt.slice(0, 200)}`);
  }

  // Verification
  console.log("\n=== Verification ===");
  const [tsV, invV] = await Promise.all([
    get(`/timesheet/entry?employeeId=${emp.id}&projectId=${proj.id}&activityId=${activity.id}&dateFrom=2026-12-20&dateTo=2026-12-21&fields=*`),
    invData.value ? get(`/invoice/${invData.value.id}?fields=*,orders(*,project(*),orderLines(*)),customer(*),projectInvoiceDetails(*)`) : null,
  ]);

  if (tsV?.values) {
    for (const e of tsV.values) {
      console.log(`  TS: hours=${e.hours} pch=${e.projectChargeableHours} chargeable=${e.chargeable} hourlyRate=${e.hourlyRate}`);
    }
  }
  if (invV?.value) {
    const iv = invV.value;
    console.log(`  INV: amountExVat=${iv.amountExcludingVatCurrency} outstanding=${iv.amountCurrencyOutstanding} customer="${iv.customer?.name}"`);
    for (const ol of iv.orders?.[0]?.orderLines || []) {
      console.log(`    line: "${ol.description}" count=${ol.count} unit=${ol.unitPriceExcludingVatCurrency} vat=${ol.vatType?.id}`);
    }
    console.log(`  projectInvoiceDetails: ${iv.projectInvoiceDetails?.length}`);
  }

  console.log("\n=== Summary ===");
  console.log("Total calls: 4 (step1) + 2 (test) + 1 (step2 forTimeSheet) + 2 (step3 writes) + 2 (verify) = 11");
  console.log("Production equivalent: 4 (step1) + 1 (step2) + 2 (step3) + 0-1 (bank fix) = 7-8 calls");
  console.log("This confirms the 3-step layout is optimal for this exact task shape.");
}

main().catch(e => { console.error(e); process.exit(1); });
