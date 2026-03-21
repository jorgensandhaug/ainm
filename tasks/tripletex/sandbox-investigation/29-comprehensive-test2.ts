// TASK 29 comprehensive test 2: fix division on employees, retry supplier invoice
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

  // Setup: get division, department, assignable manager
  const [deptRes, divRes, mgrRes] = await Promise.all([
    api("GET", "/department?isInactive=false&count=1&fields=*"),
    api("GET", "/division?count=1&fields=*"),
    api("GET", "/employee?assignableProjectManagers=true&count=1&fields=*"),
  ]);
  const deptId = deptRes.data?.values?.[0]?.id;
  const divId = divRes.data?.values?.[0]?.id;
  const mgrId = mgrRes.data?.values?.[0]?.id;
  console.log(`Dept=${deptId} Div=${divId} Mgr=${mgrId}`);

  // Create customer, supplier, 2 employees (with division)
  const [custRes, suppRes, emp1Res, emp2Res] = await Promise.all([
    api("POST", "/customer", { name: "Test29E Customer", isCustomer: true }),
    api("POST", "/supplier", { name: "Test29E Supplier", organizationNumber: "889264985", isSupplier: true }),
    api("POST", "/employee", {
      firstName: "Samuel", lastName: "Brown",
      email: "samuel.brown29e@example.org", dateOfBirth: "1985-06-15",
      userType: "NO_ACCESS", department: { id: deptId },
      employments: [{ startDate: TODAY, ...(divId ? { division: { id: divId } } : {}) }],
    }),
    api("POST", "/employee", {
      firstName: "Sarah", lastName: "Lewis",
      email: "sarah.lewis29e@example.org", dateOfBirth: "1990-03-20",
      userType: "NO_ACCESS", department: { id: deptId },
      employments: [{ startDate: TODAY, ...(divId ? { division: { id: divId } } : {}) }],
    }),
  ]);
  const custId = custRes.data?.value?.id;
  const suppId = suppRes.data?.value?.id;
  const emp1Id = emp1Res.data?.value?.id;
  const emp2Id = emp2Res.data?.value?.id;
  console.log(`Customer=${custId} Supplier=${suppId} Samuel=${emp1Id} Sarah=${emp2Id}`);

  // Create project with generic manager
  const projRes = await api("POST", "/project", {
    name: "Test29E Project",
    startDate: TODAY,
    customer: { id: custId },
    projectManager: { id: mgrId },
  });
  const projectId = projRes.data?.value?.id;
  const projVersion = projRes.data?.value?.version;
  console.log(`Project=${projectId} version=${projVersion}`);

  // ====== TEST 1: Project participants (with valid employee IDs) ======
  console.log("\n=== TEST 1: Project Participants ===");
  const [part1, part2] = await Promise.all([
    api("POST", "/project/participant", {
      project: { id: projectId },
      employee: { id: emp1Id },
      adminAccess: false,
    }),
    api("POST", "/project/participant", {
      project: { id: projectId },
      employee: { id: emp2Id },
      adminAccess: false,
    }),
  ]);
  console.log(`Participant Samuel: status=${part1.status} id=${part1.data?.value?.id}`);
  console.log(`Participant Sarah: status=${part2.status} id=${part2.data?.value?.id}`);

  // ====== TEST 2: PUT project to change projectManager ======
  console.log("\n=== TEST 2: Change project manager to Samuel ===");
  const putProj = await api("PUT", `/project/${projectId}`, {
    id: projectId,
    version: projVersion,
    name: "Test29E Project",
    startDate: TODAY,
    customer: { id: custId },
    projectManager: { id: emp1Id },
  });
  console.log(`PUT project PM=Samuel: status=${putProj.status}`);
  if (putProj.data?.value) {
    const pm = putProj.data.value.projectManager;
    console.log(`  PM: id=${pm?.id} "${pm?.firstName} ${pm?.lastName}"`);
  }

  // ====== TEST 3: Supplier Invoice ======
  console.log("\n=== TEST 3: Supplier Invoice ===");

  // Get accounts - try 6590 (other external services) and 2400 (leverandørgjeld)
  const accRes = await api("GET", "/ledger/account?number=6590,2400&fields=id,number,name,vatType(*)");
  const acc6590 = accRes.data?.values?.find((a: any) => a.number === 6590);
  const acc2400 = accRes.data?.values?.find((a: any) => a.number === 2400);
  console.log(`6590: id=${acc6590?.id}, 2400: id=${acc2400?.id}`);

  // 3a: Minimal supplier invoice with just the expense posting (let Tripletex balance)
  console.log("\n--- 3a: Minimal supplierInvoice ---");
  const si1 = await api("POST", "/supplierInvoice", {
    invoiceNumber: "SINV-29E-001",
    invoiceDate: TODAY,
    invoiceDueDate: "2026-04-21",
    supplier: { id: suppId },
    voucher: {
      date: TODAY,
      description: "Supplier cost from Test29E Supplier",
      postings: [
        {
          row: 1,
          date: TODAY,
          description: "Supplier cost",
          account: { id: acc6590?.id },
          amountGross: 56750,
          amountGrossCurrency: 56750,
        },
      ],
    },
  });
  console.log(`SI 3a: status=${si1.status} id=${si1.data?.value?.id}`);

  // 3b: With explicit 2400 counter-posting
  if (si1.status >= 400) {
    console.log("\n--- 3b: supplierInvoice with 2400 counter ---");
    const si2 = await api("POST", "/supplierInvoice", {
      invoiceNumber: "SINV-29E-002",
      invoiceDate: TODAY,
      invoiceDueDate: "2026-04-21",
      supplier: { id: suppId },
      voucher: {
        date: TODAY,
        description: "Supplier cost from Test29E Supplier",
        postings: [
          {
            row: 1,
            date: TODAY,
            description: "Supplier cost",
            account: { id: acc6590?.id },
            amountGross: 56750,
            amountGrossCurrency: 56750,
          },
          {
            row: 2,
            date: TODAY,
            description: "Leverandørgjeld",
            account: { id: acc2400?.id },
            amount: -56750,
            amountCurrency: -56750,
            amountGross: -56750,
            amountGrossCurrency: -56750,
          },
        ],
      },
    });
    console.log(`SI 3b: status=${si2.status} id=${si2.data?.value?.id}`);

    // 3c: Try amountCurrency on top-level instead of voucher postings
    if (si2.status >= 400) {
      console.log("\n--- 3c: supplierInvoice with amountCurrency ---");
      const si3 = await api("POST", "/supplierInvoice", {
        invoiceNumber: "SINV-29E-003",
        invoiceDate: TODAY,
        invoiceDueDate: "2026-04-21",
        supplier: { id: suppId },
        amountCurrency: 56750,
        voucher: {
          date: TODAY,
          description: "Supplier cost from Test29E Supplier",
          postings: [
            {
              row: 1,
              date: TODAY,
              description: "Supplier cost",
              account: { id: acc6590?.id },
              amountGross: 56750,
              amountGrossCurrency: 56750,
              project: { id: projectId },
            },
          ],
        },
      });
      console.log(`SI 3c: status=${si3.status} id=${si3.data?.value?.id}`);
    }
  }

  // ====== TEST 4: Can we use POST /ledger/voucher with voucherType=supplierInvoice? ======
  console.log("\n=== TEST 4: Voucher with supplier linkage ===");
  // Check available voucher types
  const vtRes = await api("GET", "/ledger/voucherType?count=20&fields=*");
  console.log("Voucher types:");
  for (const vt of (vtRes.data?.values || [])) {
    if (vt.name?.toLowerCase().includes('lev') || vt.name?.toLowerCase().includes('supp') || vt.name?.toLowerCase().includes('innk')) {
      console.log(`  id=${vt.id} name="${vt.name}"`);
    }
  }

  // ====== TEST 5: Check /project/orderline with vendor using Company ID ======
  // The vendor field is type Company, not Supplier. Check if supplier has a linked company.
  console.log("\n=== TEST 5: Supplier → Company linkage ===");
  const suppDetail = await api("GET", `/supplier/${suppId}?fields=*`);
  // The supplier's own ID might actually be a Company ID in disguise
  // Try using the supplier ID directly as a company reference
  console.log(`Supplier id=${suppId}`);

  // Also check /company endpoint
  const compRes = await api("GET", `/company?organizationNumber=889264985&fields=*`);
  console.log(`Company search: status=${compRes.status}`);
  if (compRes.data?.values) {
    for (const c of compRes.data.values) {
      console.log(`  company id=${c.id} name="${c.name}" orgNr=${c.organizationNumber}`);
    }
  }

  // Search for the company via customer/supplier endpoints
  const custSearch = await api("GET", `/customer?organizationNumber=889264985&fields=id,name,isCustomer,isSupplier`);
  console.log("Customer search for supplier org number:");
  for (const c of (custSearch.data?.values || [])) {
    console.log(`  id=${c.id} name="${c.name}" isCustomer=${c.isCustomer} isSupplier=${c.isSupplier}`);
  }

  console.log("\n=== DONE ===");
}

main().catch(e => { console.error("FATAL:", e); process.exit(1); });
