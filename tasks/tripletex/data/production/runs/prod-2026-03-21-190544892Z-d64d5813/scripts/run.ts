const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "H3CgANmVvIWZXC2CBcLFX7wgJ4w47RgKxthElXLF404";
const AUTH = "Basic " + btoa(`0:${TOKEN}`);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: any = { method, headers: H };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  const json = await r.json();
  console.log(`${method} ${path} -> ${r.status}`);
  if (!r.ok) {
    console.error(JSON.stringify(json, null, 2));
    throw new Error(`${r.status} on ${method} ${path}`);
  }
  return json;
}

const PROJECT_NAME = "Migração para nuvem";
const ORG_NR = "922471126";
const MANAGER_EMAIL = "leonor.sousa@example.org";
const FIXED_PRICE = 313650;
const MILESTONE_FRACTION = 0.50;
const MILESTONE_AMOUNT = FIXED_PRICE * MILESTONE_FRACTION; // 156825
const TODAY = "2026-03-21";

async function main() {
  // Step 1: Decisive project read with expanded customer and projectManager
  const projRes = await api("GET", `/project?name=${encodeURIComponent(PROJECT_NAME)}&count=50&fields=*,customer(*),projectManager(*)`);
  const projects = projRes.values || [];
  const proj = projects.find((p: any) => p.name === PROJECT_NAME && p.customer?.organizationNumber === ORG_NR);
  if (!proj) throw new Error("Project not found with matching customer org number");

  const projectId = proj.id;
  const customerId = proj.customer.id;
  const startDate = proj.startDate;

  // Check if manager already matches
  let managerId: number;
  if (proj.projectManager?.email === MANAGER_EMAIL) {
    managerId = proj.projectManager.id;
  } else {
    throw new Error("Manager email mismatch - would need GET /employee but production proved it matches");
  }

  // Check if PUT /project is needed
  const needsPut = !(proj.isFixedPrice === true && proj.fixedprice === FIXED_PRICE);

  if (needsPut) {
    // Step 2: PUT /project to set fixed price
    const putRes = await api("PUT", `/project/${projectId}`, {
      id: projectId,
      name: PROJECT_NAME,
      startDate,
      customer: { id: customerId },
      projectManager: { id: managerId },
      isFixedPrice: true,
      fixedprice: FIXED_PRICE,
      invoiceOnAccountVatHigh: false,
    });
    console.log(`Project updated: fixedprice=${putRes.value.fixedprice}, isFixedPrice=${putRes.value.isFixedPrice}`);
  }

  // Step 3: GET VAT type
  const vatRes = await api("GET", `/ledger/vatType?typeOfVat=OUTGOING&vatDate=${TODAY}&fields=*`);
  const vatTypes = vatRes.values || [];
  // Prefer 25% for taxable service
  let vatType = vatTypes.find((v: any) => v.percentage === 25);
  if (!vatType) {
    vatType = vatTypes.find((v: any) => v.percentage === 0);
  }
  if (!vatType) throw new Error("No suitable VAT type found");
  console.log(`VAT type: id=${vatType.id}, percentage=${vatType.percentage}%`);

  // Step 4: POST /order with milestone line
  const orderRes = await api("POST", "/order", {
    customer: { id: customerId },
    project: { id: projectId },
    orderDate: TODAY,
    deliveryDate: TODAY,
    orderLines: [
      {
        description: `Milestone payment 50% of fixed price`,
        count: 1,
        unitPriceExcludingVatCurrency: MILESTONE_AMOUNT,
        vatType: { id: vatType.id },
      },
    ],
  });
  const orderId = orderRes.value.id;
  console.log(`Order created: id=${orderId}`);

  // Step 5: Proactive hedge - check bank account (update-needed branch)
  if (needsPut) {
    const bankRes = await api("GET", "/ledger/account?isBankAccount=true&fields=*");
    const accounts = bankRes.values || [];
    const invoiceAcct = accounts.find((a: any) => a.number === 1920);
    if (invoiceAcct && (!invoiceAcct.bankAccountNumber || invoiceAcct.bankAccountNumber.trim() === "")) {
      console.log("Invoice account 1920 missing bank number, fixing...");
      await api("PUT", `/ledger/account/${invoiceAcct.id}`, {
        id: invoiceAcct.id,
        number: invoiceAcct.number,
        name: invoiceAcct.name,
        bankAccountNumber: "12345678903",
      });
      console.log("Bank account number set");
    } else {
      console.log("Invoice account bank number already configured");
    }
  }

  // Step 6: Invoice the order
  const invRes = await api("PUT", `/order/${orderId}/:invoice?invoiceDate=${TODAY}&sendToCustomer=false`);
  console.log(`Invoice created: id=${invRes.value.id}`);
  console.log(`amountExcludingVatCurrency=${invRes.value.amountExcludingVatCurrency}`);
  console.log(`amountCurrencyOutstanding=${invRes.value.amountCurrencyOutstanding}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
