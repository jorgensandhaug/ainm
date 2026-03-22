// Sandbox verification: test if there's any lower-call path for existing-entity project hours + invoice
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);

const h = { Authorization: AUTH, "Content-Type": "application/json" };

async function get(path: string) {
  const r = await fetch(`${BASE}${path}`, { headers: h });
  const txt = await r.text();
  console.log(`GET ${path} → ${r.status}`);
  if (!r.ok) { console.log(`  ERROR: ${txt}`); return null; }
  return JSON.parse(txt);
}

async function main() {
  // Test 1: Can we get activities expanded from the project GET to save the activity GET?
  console.log("=== Test 1: Project with activities expansion ===");
  const projRes = await get(`/project?name=${encodeURIComponent("Sandbox Hour Invoice Project")}&count=50&fields=*,customer(*),activities(*)`);
  if (projRes?.values?.[0]) {
    const p = projRes.values[0];
    console.log(`Project: id=${p.id} name="${p.name}"`);
    console.log(`  activities: ${JSON.stringify(p.activities)}`);
    console.log(`  customer: id=${p.customer?.id} name="${p.customer?.name}"`);
  }

  // Test 2: Can we get activities from project directly?
  console.log("\n=== Test 2: Project activities via projectActivity ===");
  const projId = projRes?.values?.[0]?.id;
  if (projId) {
    const actRes = await get(`/project/projectActivity?projectId=${projId}&count=50&fields=*`);
    if (actRes?.values) {
      for (const a of actRes.values) {
        console.log(`  activity: id=${a.id} name="${a.activity?.name || a.name}" isChargeable=${a.isChargeable}`);
      }
    }
  }

  // Test 3: Check if GET /ledger/account with number=1920 is more targeted than isBankAccount=true
  console.log("\n=== Test 3: Targeted bank account GET ===");
  const bankRes = await get(`/ledger/account?number=1920&fields=id,number,name,isBankAccount,bankAccountNumber`);
  if (bankRes?.values) {
    for (const a of bankRes.values) {
      console.log(`  account: id=${a.id} number=${a.number} name="${a.name}" isBankAccount=${a.isBankAccount} bankAccountNumber=${a.bankAccountNumber}`);
    }
  }

  // Test 4: Check the existing sandbox employee/project/activity that we've been using
  console.log("\n=== Test 4: Existing sandbox entities ===");
  const empRes = await get(`/employee?email=${encodeURIComponent("codex.verify.1773957815637@example.org")}&count=10&fields=*`);
  const emp = empRes?.values?.find((e: any) => e.email === "codex.verify.1773957815637@example.org");
  console.log(`Employee: id=${emp?.id} email=${emp?.email}`);

  const projFull = projRes?.values?.find((p: any) => p.name?.includes("Sandbox Hour Invoice"));
  if (projFull && emp) {
    console.log("\n=== Test 5: Activity forTimeSheet ===");
    const actRes2 = await get(`/activity/%3EforTimeSheet?projectId=${projFull.id}&employeeId=${emp.id}&date=2026-12-15&query=Prosjektadministrasjon&filterExistingHours=false&count=50&fields=*`);
    if (actRes2?.values) {
      for (const a of actRes2.values) {
        console.log(`  activity: id=${a.id} name="${a.name}" isChargeable=${a.isChargeable}`);
      }
    }

    // Test 6: Try the full 3-step flow on sandbox with a new date
    const activity = actRes2?.values?.find((a: any) => a.name === "Prosjektadministrasjon");
    if (activity) {
      console.log("\n=== Test 6: Full 3-step flow on sandbox date 2026-12-15 ===");
      const vatRes = await get(`/ledger/vatType?typeOfVat=OUTGOING&vatDate=2026-12-15&fields=*`);
      const vatType = vatRes?.values?.[0];
      console.log(`VAT type: id=${vatType?.id} name="${vatType?.name}" pct=${vatType?.percentage}`);

      // Parallel timesheet + invoice
      const tsPost = await fetch(`${BASE}/timesheet/entry`, {
        method: "POST", headers: h,
        body: JSON.stringify({
          employee: { id: emp.id },
          project: { id: projFull.id },
          activity: { id: activity.id },
          date: "2026-12-15",
          hours: 11,
          projectChargeableHours: 11,
        }),
      });
      const tsTxt = await tsPost.text();
      console.log(`POST /timesheet/entry → ${tsPost.status}`);
      const tsData = JSON.parse(tsTxt);
      if (tsData.value) {
        const ts = tsData.value;
        console.log(`  Timesheet: id=${ts.id} hours=${ts.hours} pch=${ts.projectChargeableHours} chargeable=${ts.chargeable} hourlyRate=${ts.hourlyRate}`);
      } else {
        console.log(`  ${tsTxt}`);
      }

      const invPost = await fetch(`${BASE}/invoice?sendToCustomer=false`, {
        method: "POST", headers: h,
        body: JSON.stringify({
          invoiceDate: "2026-12-15",
          invoiceDueDate: "2027-01-15",
          customer: { id: projFull.customer.id },
          orders: [{
            customer: { id: projFull.customer.id },
            project: { id: projFull.id },
            orderDate: "2026-12-15",
            deliveryDate: "2026-12-15",
            orderLines: [{
              description: "Prosjektadministrasjon",
              count: 11,
              unitPriceExcludingVatCurrency: 1000,
              vatType: { id: vatType?.id },
            }],
          }],
        }),
      });
      const invTxt = await invPost.text();
      console.log(`POST /invoice → ${invPost.status}`);
      const invData = JSON.parse(invTxt);
      if (invData.value) {
        const inv = invData.value;
        console.log(`  Invoice: id=${inv.id} invoiceNumber=${inv.invoiceNumber} amountExVat=${inv.amountExcludingVatCurrency} outstanding=${inv.amountCurrencyOutstanding}`);
        console.log(`  projectInvoiceDetails: ${inv.projectInvoiceDetails?.length}`);
      } else {
        console.log(`  ${invTxt}`);
      }
    }
  }

  console.log("\nDone.");
}

main().catch(e => { console.error(e); process.exit(1); });
