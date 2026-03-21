// Setup fixture in persistent sandbox for verification
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa(`0:${TOKEN}`);
const HEADERS = { Authorization: AUTH, "Content-Type": "application/json" };
const TODAY = "2026-03-21";
const FIXTURE_SUFFIX = "Reflection 9aa6f4d7";

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  console.log(`${method} ${url}`);
  const r = await fetch(url, {
    method,
    headers: HEADERS,
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await r.json();
  console.log(`  status=${r.status}`);
  if (!r.ok) { console.log(JSON.stringify(data, null, 2)); throw new Error(`${method} failed ${r.status}`); }
  return data;
}

async function main() {
  // 1. Find or create customer
  const custSearch = await api("GET", `/customer?name=${encodeURIComponent("Stormberg " + FIXTURE_SUFFIX)}&count=10&fields=*`);
  let customerId: number;
  if ((custSearch.values ?? []).length > 0) {
    customerId = custSearch.values[0].id;
    console.log(`  Reusing customer ${customerId}`);
  } else {
    const custCreate = await api("POST", "/customer", {
      name: "Stormberg " + FIXTURE_SUFFIX,
      organizationNumber: "957353681",
      invoiceSendMethod: "MANUAL",
    });
    customerId = custCreate.value.id;
    console.log(`  Created customer ${customerId}`);
  }

  // 2. Find manager employee
  const empSearch = await api("GET", "/employee?count=10&fields=*");
  const emp = empSearch.values[0]; // use first available employee as manager
  const managerId = emp.id;
  console.log(`  Using manager: id=${managerId} email=${emp.email}`);

  // 3. Find or create project with NO fixed price (simulating update-needed)
  const projSearch = await api("GET", `/project?name=${encodeURIComponent("Skymigrering " + FIXTURE_SUFFIX)}&count=10&fields=*`);
  let projectId: number;
  if ((projSearch.values ?? []).length > 0) {
    projectId = projSearch.values[0].id;
    console.log(`  Reusing project ${projectId}`);
    // Reset to no fixed price
    await api("PUT", `/project/${projectId}`, {
      id: projectId,
      name: "Skymigrering " + FIXTURE_SUFFIX,
      startDate: TODAY,
      customer: { id: customerId },
      projectManager: { id: managerId },
      isFixedPrice: false,
      fixedprice: 0,
      invoiceOnAccountVatHigh: false,
    });
    console.log(`  Reset project to fixedprice=0`);
  } else {
    const projCreate = await api("POST", "/project", {
      name: "Skymigrering " + FIXTURE_SUFFIX,
      startDate: TODAY,
      customer: { id: customerId },
      projectManager: { id: managerId },
      isFixedPrice: false,
      fixedprice: 0,
      invoiceOnAccountVatHigh: false,
    });
    projectId = projCreate.value.id;
    console.log(`  Created project ${projectId}`);
  }

  console.log(`\nFixture ready:`);
  console.log(`  customerId=${customerId}`);
  console.log(`  managerId=${managerId} email=${emp.email}`);
  console.log(`  projectId=${projectId}`);
  console.log(`  Project has fixedprice=0, isFixedPrice=false (update-needed branch)`);
}

main().catch(e => { console.error(e); process.exit(1); });
