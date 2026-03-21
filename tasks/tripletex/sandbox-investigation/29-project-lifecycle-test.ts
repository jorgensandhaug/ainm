// TASK 29 investigation: project lifecycle — what causes 5/7 checks to fail?
// Hypotheses: (A) project manager identity, (B) supplier invoice vs orderline, (C) budget fields
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
  const TODAY = "2026-03-21";

  // ====== HYPOTHESIS A: Can a NO_ACCESS employee be projectManager? ======
  console.log("=== TEST A: Employee as project manager ===\n");

  // Get department
  const deptRes = await api("GET", "/department?isInactive=false&count=1&fields=*");
  const deptId = deptRes.data?.values?.[0]?.id;
  console.log(`Department: id=${deptId}`);

  const divRes = await api("GET", "/division?count=1&fields=*");
  const divId = divRes.data?.values?.[0]?.id;
  console.log(`Division: id=${divId}`);

  // Create an employee
  const emp1 = await api("POST", "/employee", {
    firstName: "Test29",
    lastName: "Manager",
    email: "test29mgr@example.org",
    dateOfBirth: "1985-06-15",
    userType: "NO_ACCESS",
    department: { id: deptId },
    employments: [{ startDate: TODAY, ...(divId ? { division: { id: divId } } : {}) }],
  });
  const emp1Id = emp1.data?.value?.id;
  console.log(`Employee created: id=${emp1Id}`);

  // A1: Try to use NO_ACCESS employee directly as projectManager
  console.log("\n--- A1: NO_ACCESS employee as projectManager ---");
  const custRes = await api("POST", "/customer", {
    name: "Test29 Customer",
    isCustomer: true,
  });
  const custId = custRes.data?.value?.id;

  const projA1 = await api("POST", "/project", {
    name: "Test29 Project A1",
    startDate: TODAY,
    customer: { id: custId },
    projectManager: { id: emp1Id },
  });
  console.log(`Project A1: status=${projA1.status} id=${projA1.data?.value?.id}`);
  if (projA1.data?.value) {
    const pm = projA1.data.value.projectManager;
    console.log(`  projectManager: id=${pm?.id} name="${pm?.firstName} ${pm?.lastName}"`);
  }

  // A2: Check what assignableProjectManagers returns
  console.log("\n--- A2: Assignable project managers ---");
  const assignable = await api("GET", "/employee?assignableProjectManagers=true&count=10&fields=id,firstName,lastName,email,userType");
  for (const e of (assignable.data?.values || [])) {
    console.log(`  id=${e.id} "${e.firstName} ${e.lastName}" email=${e.email} userType=${e.userType}`);
  }

  // A3: If A1 failed, try with STANDARD userType
  if (projA1.status >= 400) {
    console.log("\n--- A3: Try STANDARD userType ---");
    const emp2 = await api("POST", "/employee", {
      firstName: "Test29",
      lastName: "StdMgr",
      email: "test29stdmgr@example.org",
      dateOfBirth: "1985-06-15",
      userType: "STANDARD",
      department: { id: deptId },
      employments: [{ startDate: TODAY, ...(divId ? { division: { id: divId } } : {}) }],
    });
    const emp2Id = emp2.data?.value?.id;
    console.log(`STANDARD employee: id=${emp2Id}`);

    const projA3 = await api("POST", "/project", {
      name: "Test29 Project A3",
      startDate: TODAY,
      customer: { id: custId },
      projectManager: { id: emp2Id },
    });
    console.log(`Project A3: status=${projA3.status} id=${projA3.data?.value?.id}`);
    if (projA3.data?.value) {
      const pm = projA3.data.value.projectManager;
      console.log(`  projectManager: id=${pm?.id} name="${pm?.firstName} ${pm?.lastName}"`);
    }
  }

  // ====== HYPOTHESIS B: Supplier invoice vs orderline ======
  console.log("\n=== TEST B: Supplier invoice with project linkage ===\n");

  // Create supplier
  const suppRes = await api("POST", "/supplier", {
    name: "Test29 Supplier",
    organizationNumber: "889264985",
    isSupplier: true,
  });
  const suppId = suppRes.data?.value?.id;
  console.log(`Supplier: id=${suppId}`);

  // Get the project ID (use A1 if it succeeded, otherwise fall back)
  const projectId = projA1.data?.value?.id;
  if (!projectId) {
    console.log("No project ID available, skipping supplier invoice test");
    return;
  }

  // B1: Check if POST /supplierInvoice exists and what it needs
  // First, check what accounts we need
  const acc6590 = await api("GET", "/ledger/account?number=6590&fields=id,number,name,vatType(*)");
  const acc1920 = await api("GET", "/ledger/account?number=1920&fields=id,number,name");
  const acct6590Id = acc6590.data?.values?.[0]?.id;
  const acct1920Id = acc1920.data?.values?.[0]?.id;
  console.log(`Accounts: 6590=${acct6590Id} 1920=${acct1920Id}`);

  // B1: Try POST /supplierInvoice with project linkage
  console.log("\n--- B1: POST /supplierInvoice ---");
  const suppInv = await api("POST", "/supplierInvoice", {
    invoiceNumber: "SINV-29-001",
    invoiceDate: TODAY,
    dueDate: "2026-04-21",
    supplier: { id: suppId },
    voucher: {
      date: TODAY,
      description: "Supplier cost - Test29 Supplier",
      postings: [
        {
          row: 1,
          date: TODAY,
          description: "Supplier cost",
          account: { id: acct6590Id },
          amountGross: 56750,
          amountGrossCurrency: 56750,
        },
        {
          row: 2,
          date: TODAY,
          description: "Supplier payment",
          account: { id: acct1920Id },
          amount: -56750,
          amountCurrency: -56750,
          amountGross: -56750,
          amountGrossCurrency: -56750,
        },
      ],
    },
  });
  console.log(`SupplierInvoice: status=${suppInv.status} id=${suppInv.data?.value?.id}`);
  if (suppInv.data?.value) {
    console.log(`  voucherId=${suppInv.data.value.voucher?.id}`);
  }

  // B2: Also still create the project/orderline as a cost entry
  console.log("\n--- B2: POST /project/orderline (for comparison) ---");
  const costOL = await api("POST", "/project/orderline", {
    project: { id: projectId },
    description: "Supplier cost - Test29 Supplier",
    date: TODAY,
    count: 1,
    unitCostCurrency: 56750,
    isChargeable: false,
  });
  console.log(`Orderline: status=${costOL.status} id=${costOL.data?.value?.id}`);

  // ====== HYPOTHESIS C: Project budget fields ======
  console.log("\n=== TEST C: Project budget fields ===\n");

  // Create activity with budget
  const actRes = await api("POST", "/project/projectActivity", {
    project: { id: projectId },
    startDate: TODAY,
    budgetFeeCurrency: 396900,
    activity: {
      name: "Prosjektaktivitet",
      activityType: "PROJECT_SPECIFIC_ACTIVITY",
      isChargeable: false,
    },
  });
  console.log(`Activity: id=${actRes.data?.value?.id} budget=${actRes.data?.value?.budgetFeeCurrency}`);

  // Read back the project to check budget fields
  const projDetail = await api("GET", `/project/${projectId}?fields=*`);
  const p = projDetail.data?.value;
  console.log(`\nProject detail:`);
  console.log(`  id=${p?.id} name="${p?.name}"`);
  console.log(`  projectManager: id=${p?.projectManager?.id}`);
  console.log(`  budget fields on project:`);
  // Log all numeric fields that might be budget-related
  for (const [k, v] of Object.entries(p || {})) {
    if (typeof v === 'number' && v !== 0 && k !== 'id' && k !== 'version') {
      console.log(`    ${k} = ${v}`);
    }
  }

  // Also check project/budget endpoint
  console.log("\n--- Check project budget endpoint ---");
  const budgetRes = await api("GET", `/project/${projectId}/budget?fields=*`);
  if (budgetRes.status === 200) {
    console.log("Budget:", JSON.stringify(budgetRes.data, null, 2).slice(0, 500));
  }

  console.log("\n=== DONE ===");
}

main().catch(e => { console.error("FATAL:", e); process.exit(1); });
