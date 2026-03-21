// Sandbox verification: prove the 16-call optimized path
// Key things to verify:
// 1. Employees without employments[] can register timesheet entries
// 2. Combined GET /ledger/account?number=1920,6590,2400 returns all 3 accounts with bankAccountNumber
// 3. Full lower-call path works end-to-end

const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const TODAY = "2026-03-21";
const UNIQ = Date.now().toString().slice(-8);

const h = { "Content-Type": "application/json", Authorization: AUTH };
let callCount = 0;

async function get(path: string) {
  callCount++;
  const r = await fetch(`${BASE}${path}`, { headers: h });
  const txt = await r.text();
  if (!r.ok) throw new Error(`GET ${path} → ${r.status} ${txt}`);
  return JSON.parse(txt);
}

async function post(path: string, body: any) {
  callCount++;
  const r = await fetch(`${BASE}${path}`, { method: "POST", headers: h, body: JSON.stringify(body) });
  const txt = await r.text();
  if (!r.ok) throw new Error(`POST ${path} → ${r.status} ${txt}`);
  return JSON.parse(txt);
}

async function put(path: string, body: any) {
  callCount++;
  const r = await fetch(`${BASE}${path}`, { method: "PUT", headers: h, body: JSON.stringify(body) });
  const txt = await r.text();
  if (!r.ok) throw new Error(`PUT ${path} → ${r.status} ${txt}`);
  return JSON.parse(txt);
}

function splitHours(total: number, startDate: string): { date: string; hours: number }[] {
  const [y, m, d] = startDate.split("-").map(Number);
  const entries: { date: string; hours: number }[] = [];
  let remaining = total;
  let offset = 0;
  while (remaining > 0) {
    const chunk = Math.min(remaining, 24);
    const dt = new Date(Date.UTC(y, m - 1, d + offset));
    entries.push({ date: dt.toISOString().slice(0, 10), hours: chunk });
    remaining -= chunk;
    offset++;
  }
  return entries;
}

async function main() {
  console.log("=== Sandbox Verification: Optimized 16-call path ===\n");

  // STEP 1 (3 calls, parallel): GET department + POST customer + GET assignable PM
  const [deptRes, custRes, mgrRes] = await Promise.all([
    get("/department?isInactive=false&count=1&fields=*"),
    post("/customer", { name: `Sandbox Elvdal ${UNIQ} AS`, organizationNumber: "894208848" }),
    get("/employee?assignableProjectManagers=true&count=1&fields=*"),
  ]);
  const deptId = deptRes.values?.[0]?.id;
  const customerId = custRes.value.id;
  const mgrId = mgrRes.values[0].id;
  console.log(`Step 1 (3 calls): dept=${deptId} customer=${customerId} mgr=${mgrId}`);

  // STEP 2 (3 calls, parallel): POST employee x2 + POST project
  // KEY: No employments[], no division read needed
  const [emp1Res, emp2Res, projRes] = await Promise.all([
    post("/employee", {
      firstName: "Knut",
      lastName: `Brekke ${UNIQ}`,
      email: `knut.brekke.${UNIQ}@example.org`,
      dateOfBirth: "1985-01-15",
      userType: "NO_ACCESS",
      department: { id: deptId },
    }),
    post("/employee", {
      firstName: "Svein",
      lastName: `Aasen ${UNIQ}`,
      email: `svein.aasen.${UNIQ}@example.org`,
      dateOfBirth: "1985-01-15",
      userType: "NO_ACCESS",
      department: { id: deptId },
    }),
    post("/project", {
      name: `Dataplattform Elvdal ${UNIQ}`,
      startDate: TODAY,
      customer: { id: customerId },
      projectManager: { id: mgrId },
    }),
  ]);
  const emp1Id = emp1Res.value.id;
  const emp2Id = emp2Res.value.id;
  const projectId = projRes.value.id;
  console.log(`Step 2 (3 calls): emp1=${emp1Id} emp2=${emp2Id} project=${projectId}`);
  console.log(`  emp1 has employments: ${JSON.stringify(emp1Res.value.employments)}`);

  // STEP 3 (3 calls, parallel): POST projectActivity + POST participant x2
  const [actRes, part1Res, part2Res] = await Promise.all([
    post("/project/projectActivity", {
      project: { id: projectId },
      startDate: TODAY,
      budgetFeeCurrency: 331100,
      activity: {
        name: "Prosjektaktivitet",
        activityType: "PROJECT_SPECIFIC_ACTIVITY",
        isChargeable: false,
      },
    }),
    post("/project/participant", {
      project: { id: projectId },
      employee: { id: emp1Id },
      adminAccess: false,
    }),
    post("/project/participant", {
      project: { id: projectId },
      employee: { id: emp2Id },
      adminAccess: false,
    }),
  ]);
  const activityId = actRes.value.activity.id;
  console.log(`Step 3 (3 calls): activity=${activityId} budget=${actRes.value.budgetFeeCurrency} p1=${part1Res.value.id} p2=${part2Res.value.id}`);

  // Prepare timesheet entries
  const knutEntries = splitHours(43, TODAY).map(e => ({
    employee: { id: emp1Id }, project: { id: projectId }, activity: { id: activityId }, date: e.date, hours: e.hours,
  }));
  const sveinEntries = splitHours(100, TODAY).map(e => ({
    employee: { id: emp2Id }, project: { id: projectId }, activity: { id: activityId }, date: e.date, hours: e.hours,
  }));
  const allEntries = [...knutEntries, ...sveinEntries];

  // STEP 4 (4 calls, parallel): POST timesheet/entry/list + POST supplier + GET accounts(1920,6590,2400) + GET voucherType
  const [tsRes, suppRes, accRes, vtRes] = await Promise.all([
    post("/timesheet/entry/list", allEntries),
    post("/supplier", { name: `Fossekraft ${UNIQ} AS`, organizationNumber: "979871783" }),
    get("/ledger/account?number=1920,6590,2400&fields=id,number,name,isBankAccount,bankAccountNumber"),
    get("/ledger/voucherType?name=Leverand%C3%B8rfaktura&count=1&fields=id,name"),
  ]);
  console.log(`Step 4 (4 calls): timesheet=${tsRes.values.length} entries, supplier=${suppRes.value.id}`);

  const acc1920 = accRes.values.find((a: any) => a.number === 1920);
  const acc6590 = accRes.values.find((a: any) => a.number === 6590);
  const acc2400 = accRes.values.find((a: any) => a.number === 2400);
  console.log(`  acc1920=${acc1920?.id} (bankAcctNum=${acc1920?.bankAccountNumber})`);
  console.log(`  acc6590=${acc6590?.id} acc2400=${acc2400?.id}`);
  console.log(`  voucherType=${vtRes.values[0].id} (${vtRes.values[0].name})`);

  if (!acc6590 || !acc2400) throw new Error("Missing accounts 6590/2400");
  const suppId = suppRes.value.id;
  const voucherTypeId = vtRes.values[0].id;

  // STEP 5 (2 calls, parallel): POST voucher + GET vatType
  const [vouchRes, vatRes] = await Promise.all([
    post("/ledger/voucher", {
      date: TODAY,
      description: `Leverandørkostnad frå Fossekraft ${UNIQ} AS`,
      voucherType: { id: voucherTypeId },
      postings: [
        {
          row: 1, date: TODAY, description: "Leverandørkostnad",
          account: { id: acc6590.id },
          amount: 61650, amountCurrency: 61650, amountGross: 61650, amountGrossCurrency: 61650,
          project: { id: projectId },
        },
        {
          row: 2, date: TODAY, description: "Leverandørgjeld",
          account: { id: acc2400.id },
          amount: -61650, amountCurrency: -61650, amountGross: -61650, amountGrossCurrency: -61650,
          supplier: { id: suppId },
        },
      ],
    }),
    get("/ledger/vatType?typeOfVat=OUTGOING&vatDate=" + TODAY + "&fields=*"),
  ]);
  console.log(`Step 5 (2 calls): voucher=${vouchRes.value.id}`);
  const vatType = vatRes.values.find((v: any) => v.percentage > 0) || vatRes.values[0];
  console.log(`  vatType=${vatType.id} (${vatType.name} ${vatType.percentage}%)`);

  // STEP 6 (conditional): bank account fix
  let bankFixCalls = 0;
  if (acc1920 && !acc1920.bankAccountNumber) {
    console.log(`Step 6: Bank account 1920 (${acc1920.id}) needs bankAccountNumber fix`);
    await put("/ledger/account/" + acc1920.id, {
      id: acc1920.id, name: acc1920.name, number: acc1920.number,
      bankAccountNumber: "12345678903",
    });
    bankFixCalls = 1;
    console.log("Step 6: Fixed");
  } else if (acc1920) {
    console.log(`Step 6: Bank account 1920 OK (bankAccountNumber=${acc1920.bankAccountNumber})`);
  } else {
    console.log("Step 6: WARNING — account 1920 not found in combined read!");
  }

  // STEP 7 (1 call): POST invoice
  const lastTsDate = sveinEntries[sveinEntries.length - 1].date;
  const dueDate = new Date(Date.UTC(2026, 2, 21 + 14)).toISOString().slice(0, 10);
  const invoiceRes = await post("/invoice?sendToCustomer=false", {
    invoiceDate: TODAY,
    invoiceDueDate: dueDate,
    customer: { id: customerId },
    orders: [{
      customer: { id: customerId },
      project: { id: projectId },
      orderDate: TODAY,
      deliveryDate: lastTsDate,
      orderLines: [{
        description: `Dataplattform Elvdal ${UNIQ}`,
        count: 1,
        unitPriceExcludingVatCurrency: 331100,
        vatType: { id: vatType.id },
      }],
    }],
  });
  console.log(`Step 7 (1 call): invoice=${invoiceRes.value.id} number=${invoiceRes.value.invoiceNumber}`);
  console.log(`  amountExcludingVat=${invoiceRes.value.amountExcludingVatCurrency}`);
  console.log(`  projectInvoiceDetails=${invoiceRes.value.projectInvoiceDetails?.length}`);

  console.log(`\n=== COMPLETE ===`);
  console.log(`Total API calls: ${callCount} (${bankFixCalls ? "including 1 bank fix" : "no bank fix needed"})`);
  console.log(`Expected: ${16 + bankFixCalls} calls`);
  console.log(`Errors: 0`);
}

main().catch(e => { console.error("FATAL:", e.message); process.exit(1); });
