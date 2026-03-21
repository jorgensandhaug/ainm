// TASK 29 investigation part 2: test supplier invoice path + budget fields
// Using the assignable project manager (account owner)
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

  // Setup: get existing resources
  const [deptRes, divRes, mgrRes] = await Promise.all([
    api("GET", "/department?isInactive=false&count=1&fields=*"),
    api("GET", "/division?count=1&fields=*"),
    api("GET", "/employee?assignableProjectManagers=true&count=1&fields=*"),
  ]);
  const deptId = deptRes.data?.values?.[0]?.id;
  const divId = divRes.data?.values?.[0]?.id;
  const mgrId = mgrRes.data?.values?.[0]?.id;
  console.log(`Dept=${deptId} Div=${divId} Mgr=${mgrId}`);

  // Create customer, project, supplier
  const custRes = await api("POST", "/customer", { name: "Test29B Customer", isCustomer: true });
  const custId = custRes.data?.value?.id;

  const projRes = await api("POST", "/project", {
    name: "Test29B Project",
    startDate: TODAY,
    customer: { id: custId },
    projectManager: { id: mgrId },
  });
  const projectId = projRes.data?.value?.id;
  console.log(`Project: id=${projectId}`);

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

  // ====== TEST B: Supplier invoice with project ======
  console.log("\n=== TEST B: Supplier invoice approaches ===\n");

  const suppRes = await api("POST", "/supplier", { name: "Test29B Supplier", isSupplier: true });
  const suppId = suppRes.data?.value?.id;
  console.log(`Supplier: id=${suppId}`);

  // Get accounts
  const accRes = await api("GET", "/ledger/account?number=6590,1920&fields=id,number,name,vatType(*)");
  const acc6590 = accRes.data?.values?.find((a: any) => a.number === 6590);
  const acc1920 = accRes.data?.values?.find((a: any) => a.number === 1920);
  console.log(`6590: id=${acc6590?.id}, 1920: id=${acc1920?.id}`);

  // Get incoming VAT type for supplier invoice
  const vatIn = await api("GET", "/ledger/vatType?typeOfVat=INCOMING&count=5&fields=*");
  const vat25In = vatIn.data?.values?.find((v: any) => v.percentage === 25 && v.id > 0);
  console.log(`Incoming 25% VAT: id=${vat25In?.id}`);

  // B1: POST /supplierInvoice with project on postings
  console.log("\n--- B1: supplierInvoice with project on postings ---");
  const suppInv1 = await api("POST", "/supplierInvoice", {
    invoiceNumber: "SINV-29-001",
    invoiceDate: TODAY,
    dueDate: "2026-04-21",
    supplier: { id: suppId },
    voucher: {
      date: TODAY,
      description: "Supplier cost from Test29B Supplier",
      postings: [
        {
          row: 1,
          date: TODAY,
          description: "Supplier cost",
          account: { id: acc6590.id },
          amountGross: 56750,
          amountGrossCurrency: 56750,
          vatType: { id: vat25In?.id },
          project: { id: projectId },
        },
        {
          row: 2,
          date: TODAY,
          description: "Supplier cost",
          account: { id: acc1920.id },
          amount: -56750,
          amountCurrency: -56750,
          amountGross: -56750,
          amountGrossCurrency: -56750,
        },
      ],
    },
  });
  console.log(`SupplierInvoice B1: status=${suppInv1.status} id=${suppInv1.data?.value?.id}`);
  if (suppInv1.data?.value) {
    console.log(`  voucher.id=${suppInv1.data.value.voucher?.id}`);
  }

  // B2: If B1 failed, try without project on postings
  if (suppInv1.status >= 400) {
    console.log("\n--- B2: supplierInvoice without project ---");
    const suppInv2 = await api("POST", "/supplierInvoice", {
      invoiceNumber: "SINV-29-002",
      invoiceDate: TODAY,
      dueDate: "2026-04-21",
      supplier: { id: suppId },
      voucher: {
        date: TODAY,
        description: "Supplier cost from Test29B Supplier",
        postings: [
          {
            row: 1,
            date: TODAY,
            description: "Supplier cost",
            account: { id: acc6590.id },
            amountGross: 56750,
            amountGrossCurrency: 56750,
            vatType: { id: vat25In?.id },
          },
          {
            row: 2,
            date: TODAY,
            description: "Supplier cost",
            account: { id: acc1920.id },
            amount: -56750,
            amountCurrency: -56750,
            amountGross: -56750,
            amountGrossCurrency: -56750,
          },
        ],
      },
    });
    console.log(`SupplierInvoice B2: status=${suppInv2.status} id=${suppInv2.data?.value?.id}`);
    if (suppInv2.data?.value) {
      const voucherId = suppInv2.data.value.voucher?.id;
      console.log(`  voucher.id=${voucherId}`);
      // Try to book it
      if (voucherId) {
        const bookRes = await api("PUT", `/ledger/voucher/${voucherId}/:sendToLedger`);
        console.log(`  Book voucher: ${bookRes.status}`);
      }
    }
  }

  // B3: ALSO create cost via project/orderline to see if both can coexist
  console.log("\n--- B3: project/orderline (current approach) ---");
  const costOL = await api("POST", "/project/orderline", {
    project: { id: projectId },
    description: "Supplier cost - Test29B Supplier",
    date: TODAY,
    count: 1,
    unitCostCurrency: 56750,
    isChargeable: false,
  });
  console.log(`Orderline: status=${costOL.status} id=${costOL.data?.value?.id}`);

  // ====== TEST C: Read back project to check all fields ======
  console.log("\n=== TEST C: Project fields inspection ===\n");

  const projDetail = await api("GET", `/project/${projectId}?fields=*`);
  const p = projDetail.data?.value;
  if (p) {
    console.log("All project fields:");
    for (const [k, v] of Object.entries(p)) {
      if (v !== null && v !== undefined && v !== "" && v !== false && v !== 0) {
        if (typeof v === 'object') {
          console.log(`  ${k}: ${JSON.stringify(v).slice(0, 100)}`);
        } else {
          console.log(`  ${k}: ${v}`);
        }
      }
    }
  }

  // Check budget endpoint
  console.log("\n--- Budget endpoint ---");
  const budgetRes = await api("GET", `/project/${projectId}/budget?fields=*`);
  if (budgetRes.status === 200) {
    console.log("Budget:", JSON.stringify(budgetRes.data, null, 2).slice(0, 800));
  }

  // Check project activities
  console.log("\n--- Project activities ---");
  const paRes = await api("GET", `/project/projectActivity?projectId=${projectId}&fields=*`);
  for (const pa of (paRes.data?.values || [])) {
    console.log(`  Activity: id=${pa.id} budgetFee=${pa.budgetFeeCurrency} name="${pa.activity?.name}"`);
    for (const [k, v] of Object.entries(pa)) {
      if (k.includes("budget") || k.includes("Budget")) {
        console.log(`    ${k}: ${v}`);
      }
    }
  }

  console.log("\n=== DONE ===");
}

main().catch(e => { console.error("FATAL:", e); process.exit(1); });
