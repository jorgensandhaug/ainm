const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "Snq67udmCac79giB_ogxKu9sNbTM6zOL0b-B-eInbk4";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const TODAY = "2026-03-21";
const H = { Authorization: AUTH, "Content-Type": "application/json" };
let calls = 0;

async function get(p: string) {
  calls++;
  const r = await fetch(`${BASE}${p}`, { headers: H });
  const t = await r.text();
  if (!r.ok) throw new Error(`GET ${p}: ${r.status} ${t}`);
  return JSON.parse(t);
}

async function post(p: string, body: any) {
  calls++;
  const r = await fetch(`${BASE}${p}`, { method: "POST", headers: H, body: JSON.stringify(body) });
  const t = await r.text();
  if (!r.ok) throw new Error(`POST ${p}: ${r.status} ${t}`);
  return JSON.parse(t);
}

async function put(p: string, body: any) {
  calls++;
  const r = await fetch(`${BASE}${p}`, { method: "PUT", headers: H, body: JSON.stringify(body) });
  const t = await r.text();
  if (!r.ok) throw new Error(`PUT ${p}: ${r.status} ${t}`);
  return JSON.parse(t);
}

// Step 1 (3 calls): GET dept + POST customer + GET assignable PM
const [deptRes, custRes, pmRes] = await Promise.all([
  get("/department?isInactive=false&count=1&fields=*"),
  post("/customer", {
    name: "Brückentor GmbH",
    organizationNumber: "800357314",
    isCustomer: true,
  }),
  get("/employee?assignableProjectManagers=true&count=1&fields=*"),
]);

let deptId: number;
if (deptRes.count > 0) {
  deptId = deptRes.values[0].id;
} else {
  const nd = await post("/department", { name: "Avdeling" });
  deptId = nd.value.id;
}
const customerId = custRes.value.id;
const pmId = pmRes.values[0].id;
console.log(`Step 1 done: dept=${deptId}, customer=${customerId}, pm=${pmId}`);

// Step 2 (2 calls): POST employee Felix + POST project
const [empRes, projRes] = await Promise.all([
  post("/employee", {
    firstName: "Felix",
    lastName: "Fischer",
    email: "felix.fischer@example.org",
    dateOfBirth: "1985-01-15",
    userType: "NO_ACCESS",
    department: { id: deptId },
  }),
  post("/project", {
    name: "E-Commerce-Entwicklung",
    startDate: TODAY,
    customer: { id: customerId },
    projectManager: { id: pmId },
    isFixedPrice: true,
    fixedprice: 292550,
  }),
]);

const felixId = empRes.value.id;
const projectId = projRes.value.id;
console.log(`Step 2 done: felix=${felixId}, project=${projectId}, fixedprice=${projRes.value.fixedprice}`);

// Step 3 (3 calls): POST participant + GET vatType + GET account 1920
const [participantRes, vatRes, accRes] = await Promise.all([
  post("/project/participant", {
    project: { id: projectId },
    employee: { id: felixId },
    adminAccess: true,
  }),
  get(`/ledger/vatType?typeOfVat=OUTGOING&vatDate=${TODAY}&fields=*`),
  get("/ledger/account?number=1920&fields=id,number,name,isBankAccount,bankAccountNumber"),
]);

const vatTypeId = vatRes.values[0].id;
const acc1920 = accRes.values.find((a: any) => a.number === 1920);
console.log(`Step 3 done: participant=${participantRes.value.id}, vatType=${vatTypeId}, acc1920=${acc1920?.id}, bankNum=${acc1920?.bankAccountNumber}`);

// Step 4 (0-1 calls): conditional bank fix
if (acc1920 && !acc1920.bankAccountNumber) {
  console.log("Bank account 1920 needs bankAccountNumber fix");
  await put(`/ledger/account/${acc1920.id}`, { bankAccountNumber: "12345678903" });
  console.log("Bank fix done");
}

// Step 5 (1 call): POST invoice — 33% of 292550 = 96541.50
const milestoneAmount = 292550 * 0.33; // 96541.5
const invoiceRes = await post("/invoice?sendToCustomer=false", {
  invoiceDate: TODAY,
  invoiceDueDate: "2026-04-04",
  customer: { id: customerId },
  orders: [
    {
      customer: { id: customerId },
      project: { id: projectId },
      orderDate: TODAY,
      deliveryDate: TODAY,
      orderLines: [
        {
          description: "Meilensteinzahlung E-Commerce-Entwicklung (33%)",
          count: 1,
          unitPriceExcludingVatCurrency: milestoneAmount,
          vatType: { id: vatTypeId },
        },
      ],
    },
  ],
});

console.log("Invoice created:", JSON.stringify({
  id: invoiceRes.value.id,
  invoiceNumber: invoiceRes.value.invoiceNumber,
  amount: invoiceRes.value.amount,
  amountExcludingVat: invoiceRes.value.amountExcludingVat,
  amountExcludingVatCurrency: invoiceRes.value.amountExcludingVatCurrency,
  projectInvoiceDetails: invoiceRes.value.projectInvoiceDetails?.length,
}, null, 2));

console.log(`\nDONE — ${calls} API calls, 0 errors`);
