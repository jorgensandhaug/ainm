const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "-rHVrOGpPem22gl0PCjJW3VneJCtP3U__e1mFKOoJW4";
const AUTH = "Basic " + btoa("0:" + TOKEN);

const PROJECT_NAME = "ERP-implementering";
const ORG_NR = "834214261";
const MANAGER_EMAIL = "marit.kvamme@example.org";
const FIXED_PRICE = 429500;
const MILESTONE_FRACTION = 0.33;
const PARTIAL_AMOUNT = FIXED_PRICE * MILESTONE_FRACTION; // 141735
const TODAY = "2026-03-21";

const headers = { Authorization: AUTH, "Content-Type": "application/json" };

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  console.log(`\n>>> ${method} ${url}`);
  if (body) console.log("BODY:", JSON.stringify(body, null, 2));
  const res = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data: any;
  try { data = JSON.parse(text); } catch { data = text; }
  console.log(`<<< ${res.status}`);
  console.log(JSON.stringify(data, null, 2));
  if (!res.ok) throw new Error(`${method} ${path} => ${res.status}: ${JSON.stringify(data)}`);
  return data;
}

async function main() {
  // Step 1: GET project with expanded customer and projectManager
  const projSearch = await api("GET",
    `/project?name=${encodeURIComponent(PROJECT_NAME)}&count=50&fields=*,customer(*),projectManager(*)`);

  const projects = (projSearch.values || []).filter(
    (p: any) => p.name === PROJECT_NAME
  );
  if (projects.length === 0) throw new Error("Project not found");

  // Find the one whose customer.organizationNumber matches
  let project = projects.find(
    (p: any) => p.customer?.organizationNumber === ORG_NR
  );
  if (!project) {
    // If only one project with that name, use it
    if (projects.length === 1) project = projects[0];
    else throw new Error("Cannot resolve project by org number");
  }

  const projectId = project.id;
  const customerId = project.customer?.id;
  const startDate = project.startDate;

  // Check if manager already matches
  const managerAlreadyMatches =
    project.projectManager?.email === MANAGER_EMAIL;
  const fixedPriceAlreadyMatches =
    project.isFixedPrice === true && project.fixedprice === FIXED_PRICE;

  let managerId: number;

  if (managerAlreadyMatches) {
    managerId = project.projectManager.id;
  } else {
    // Need to resolve manager
    const empSearch = await api("GET",
      `/employee?email=${encodeURIComponent(MANAGER_EMAIL)}&assignableProjectManagers=true&count=10&fields=*`);
    const emp = (empSearch.values || []).find(
      (e: any) => e.email === MANAGER_EMAIL
    );
    if (!emp) throw new Error("Manager not found");
    managerId = emp.id;
  }

  // Step 2: PUT project if needed
  if (!fixedPriceAlreadyMatches || !managerAlreadyMatches) {
    const putBody: any = {
      id: projectId,
      name: PROJECT_NAME,
      startDate: startDate || TODAY,
      customer: { id: customerId },
      projectManager: { id: managerId },
      isFixedPrice: true,
      fixedprice: FIXED_PRICE,
      invoiceOnAccountVatHigh: false,
    };
    await api("PUT", `/project/${projectId}`, putBody);
  }

  // Step 3: GET VAT type
  const vatSearch = await api("GET",
    `/ledger/vatType?typeOfVat=OUTGOING&vatDate=${TODAY}&fields=*`);

  const vatValues = vatSearch.values || [];
  // Prefer 25% row for normal taxable service
  let vatRow = vatValues.find((v: any) => v.percentage === 25);
  if (!vatRow) {
    // Fall back to 0% if that's the only option
    vatRow = vatValues.find((v: any) => v.percentage === 0);
  }
  if (!vatRow) throw new Error("No suitable VAT type found");
  const vatTypeId = vatRow.id;

  // Step 4: POST order
  const orderBody = {
    customer: { id: customerId },
    project: { id: projectId },
    orderDate: TODAY,
    deliveryDate: TODAY,
    orderLines: [
      {
        description: `Delbetaling 33% av fastpris – ${PROJECT_NAME}`,
        count: 1,
        unitPriceExcludingVatCurrency: PARTIAL_AMOUNT,
        vatType: { id: vatTypeId },
      },
    ],
  };
  const orderRes = await api("POST", "/order", orderBody);
  const orderId = orderRes.value.id;

  // Step 5: PUT order/:invoice
  const invoiceRes = await api("PUT",
    `/order/${orderId}/:invoice?invoiceDate=${TODAY}&sendToCustomer=false`);

  console.log("\n=== DONE ===");
  console.log("Invoice ID:", invoiceRes.value?.id);
  console.log("Amount excl VAT:", invoiceRes.value?.amountExcludingVatCurrency);
  console.log("Amount outstanding:", invoiceRes.value?.amountCurrencyOutstanding);
}

main().catch((e) => {
  console.error("FATAL:", e.message || e);
  process.exit(1);
});
