// TASK 29 comprehensive investigation: test supplier invoice, project participants, budget
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
  if (res.status >= 400) console.log("  ERR:", JSON.stringify(json, null, 2).slice(0, 800));
  return { status: res.status, data: json };
}

async function main() {
  const TODAY = "2026-03-21";

  // Setup
  const [deptRes, mgrRes] = await Promise.all([
    api("GET", "/department?isInactive=false&count=1&fields=*"),
    api("GET", "/employee?assignableProjectManagers=true&count=1&fields=*"),
  ]);
  const deptId = deptRes.data?.values?.[0]?.id;
  const mgrId = mgrRes.data?.values?.[0]?.id;
  console.log(`Dept=${deptId} Mgr=${mgrId}`);

  // Create customer + supplier + 2 employees
  const [custRes, suppRes, emp1Res, emp2Res] = await Promise.all([
    api("POST", "/customer", { name: "Test29D Customer", isCustomer: true }),
    api("POST", "/supplier", { name: "Test29D Supplier", organizationNumber: "889264985", isSupplier: true }),
    api("POST", "/employee", {
      firstName: "Samuel", lastName: "Brown",
      email: "samuel.brown29d@example.org", dateOfBirth: "1985-06-15",
      userType: "NO_ACCESS", department: { id: deptId },
      employments: [{ startDate: TODAY }],
    }),
    api("POST", "/employee", {
      firstName: "Sarah", lastName: "Lewis",
      email: "sarah.lewis29d@example.org", dateOfBirth: "1990-03-20",
      userType: "NO_ACCESS", department: { id: deptId },
      employments: [{ startDate: TODAY }],
    }),
  ]);
  const custId = custRes.data?.value?.id;
  const suppId = suppRes.data?.value?.id;
  const emp1Id = emp1Res.data?.value?.id;
  const emp2Id = emp2Res.data?.value?.id;
  console.log(`Customer=${custId} Supplier=${suppId} Emp1=${emp1Id} Emp2=${emp2Id}`);

  // Create project (with generic manager since that's the only option)
  const projRes = await api("POST", "/project", {
    name: "Test29D Project",
    startDate: TODAY,
    customer: { id: custId },
    projectManager: { id: mgrId },
  });
  const projectId = projRes.data?.value?.id;
  console.log(`Project=${projectId}`);

  // ====== TEST 1: Project participants ======
  console.log("\n=== TEST 1: Project Participants ===");

  // Try adding employees as project participants
  const part1 = await api("POST", "/project/participant", {
    project: { id: projectId },
    employee: { id: emp1Id },
    adminAccess: false,
  });
  console.log(`Participant 1 (Samuel): status=${part1.status} id=${part1.data?.value?.id}`);
  if (part1.data?.value) {
    console.log(`  ${JSON.stringify(part1.data.value).slice(0, 300)}`);
  }

  const part2 = await api("POST", "/project/participant", {
    project: { id: projectId },
    employee: { id: emp2Id },
    adminAccess: false,
  });
  console.log(`Participant 2 (Sarah): status=${part2.status} id=${part2.data?.value?.id}`);

  // Read back participants
  const partsRes = await api("GET", `/project/participant?projectId=${projectId}&fields=*`);
  console.log("Participants on project:");
  for (const p of (partsRes.data?.values || [])) {
    console.log(`  id=${p.id} employee=${p.employee?.id} "${p.employee?.firstName} ${p.employee?.lastName}" admin=${p.adminAccess}`);
  }

  // ====== TEST 2: Supplier Invoice with invoiceDueDate ======
  console.log("\n=== TEST 2: Supplier Invoice ===");

  // Get accounts
  const accRes = await api("GET", "/ledger/account?number=6590,2400&fields=id,number,name,vatType(*)");
  const acc6590 = accRes.data?.values?.find((a: any) => a.number === 6590);
  const acc2400 = accRes.data?.values?.find((a: any) => a.number === 2400);
  console.log(`6590: id=${acc6590?.id}, 2400: id=${acc2400?.id}`);

  // Get incoming VAT
  const vatRes = await api("GET", "/ledger/vatType?typeOfVat=INCOMING&count=5&fields=*");
  const vat25In = vatRes.data?.values?.find((v: any) => v.percentage === 25 && v.id > 0);
  console.log(`Incoming 25% VAT: id=${vat25In?.id}`);

  // Test 2a: POST /supplierInvoice with invoiceDueDate and project on postings
  console.log("\n--- 2a: supplierInvoice with invoiceDueDate ---");
  const si1 = await api("POST", "/supplierInvoice", {
    invoiceNumber: "SINV-29D-001",
    invoiceDate: TODAY,
    invoiceDueDate: "2026-04-21",
    supplier: { id: suppId },
    voucher: {
      date: TODAY,
      description: "Supplier cost from Test29D Supplier",
      postings: [
        {
          row: 1,
          date: TODAY,
          description: "Supplier cost",
          account: { id: acc6590?.id },
          amountGross: 56750,
          amountGrossCurrency: 56750,
          vatType: { id: vat25In?.id },
          project: { id: projectId },
        },
        {
          row: 2,
          date: TODAY,
          description: "Supplier cost",
          account: { id: acc2400?.id },
          amount: -56750,
          amountCurrency: -56750,
          amountGross: -56750,
          amountGrossCurrency: -56750,
        },
      ],
    },
  });
  console.log(`SupplierInvoice 2a: status=${si1.status} id=${si1.data?.value?.id}`);
  if (si1.data?.value) {
    console.log(`  voucherId=${si1.data.value.voucher?.id}`);
    console.log(`  amount=${si1.data.value.amount} amountCurrency=${si1.data.value.amountCurrency}`);
  }

  // If failed, try without project on postings
  if (si1.status >= 400) {
    console.log("\n--- 2b: supplierInvoice without project ---");
    const si2 = await api("POST", "/supplierInvoice", {
      invoiceNumber: "SINV-29D-002",
      invoiceDate: TODAY,
      invoiceDueDate: "2026-04-21",
      supplier: { id: suppId },
      voucher: {
        date: TODAY,
        description: "Supplier cost from Test29D Supplier",
        postings: [
          {
            row: 1,
            date: TODAY,
            description: "Supplier cost",
            account: { id: acc6590?.id },
            amountGross: 56750,
            amountGrossCurrency: 56750,
            vatType: { id: vat25In?.id },
          },
          {
            row: 2,
            date: TODAY,
            description: "Supplier cost",
            account: { id: acc2400?.id },
            amount: -56750,
            amountCurrency: -56750,
            amountGross: -56750,
            amountGrossCurrency: -56750,
          },
        ],
      },
    });
    console.log(`SupplierInvoice 2b: status=${si2.status} id=${si2.data?.value?.id}`);
    if (si2.data?.value) {
      console.log(`  voucherId=${si2.data.value.voucher?.id}`);
    }
  }

  // ====== TEST 3: Read back supplier invoice to verify project linkage ======
  if (si1.status < 400 && si1.data?.value?.id) {
    console.log("\n=== TEST 3: Read back supplier invoice ===");
    const siRead = await api("GET", `/supplierInvoice/${si1.data.value.id}?fields=*`);
    if (siRead.data?.value) {
      const si = siRead.data.value;
      console.log(`  supplier: id=${si.supplier?.id} name="${si.supplier?.name}"`);
      console.log(`  amount=${si.amount} amountCurrency=${si.amountCurrency}`);
      console.log(`  invoiceDueDate=${si.invoiceDueDate}`);
    }
    // Also read the voucher to check project on postings
    const vId = si1.data.value.voucher?.id;
    if (vId) {
      const vRead = await api("GET", `/ledger/voucher/${vId}?fields=*`);
      if (vRead.data?.value?.postings) {
        console.log("Voucher postings:");
        for (const p of vRead.data.value.postings) {
          console.log(`  row=${p.row} acct=${p.account?.number} amount=${p.amount} project=${p.project?.id || 'null'}`);
        }
      }
    }
  }

  // ====== TEST 4: PUT project to update projectManager ======
  console.log("\n=== TEST 4: Try PUT /project to change projectManager to Samuel ===");
  const putProj = await api("PUT", `/project/${projectId}`, {
    id: projectId,
    version: projRes.data?.value?.version,
    name: "Test29D Project",
    startDate: TODAY,
    customer: { id: custId },
    projectManager: { id: emp1Id }, // Try Samuel Brown
  });
  console.log(`PUT project with PM=Samuel: status=${putProj.status}`);
  if (putProj.data?.value) {
    console.log(`  projectManager: id=${putProj.data.value.projectManager?.id} name="${putProj.data.value.projectManager?.firstName}"`);
  }

  // ====== TEST 5: Check project fields for budget ======
  console.log("\n=== TEST 5: Budget field investigation ===");

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
  console.log(`Activity: id=${actRes.data?.value?.id} budgetFee=${actRes.data?.value?.budgetFeeCurrency}`);

  // Read project with all fields
  const projDetail = await api("GET", `/project/${projectId}?fields=*`);
  const p = projDetail.data?.value;
  if (p) {
    console.log("Budget-related project fields:");
    for (const [k, v] of Object.entries(p)) {
      if (k.toLowerCase().includes('budget') || k.toLowerCase().includes('amount') || k.toLowerCase().includes('cost')) {
        console.log(`  ${k}: ${JSON.stringify(v)}`);
      }
    }
  }

  // Try PUT project with budget amount
  console.log("\n--- Try PUT /project with budgetAmount ---");
  const putProj2 = await api("PUT", `/project/${projectId}`, {
    ...p,
    budgetAmount: 396900,
  });
  console.log(`PUT project with budgetAmount: status=${putProj2.status}`);

  console.log("\n=== DONE ===");
}

main().catch(e => { console.error("FATAL:", e); process.exit(1); });
