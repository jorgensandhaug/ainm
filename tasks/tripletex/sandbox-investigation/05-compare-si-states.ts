// Compare supplierInvoice states: look at ALL supplierInvoices, find booked vs unbooked
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa(`0:${TOKEN}`);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

async function api(method: string, path: string) {
  const url = `${BASE}${path}`;
  const res = await fetch(url, { method, headers: H });
  const data = await res.json();
  if (res.status >= 400) console.log(`${method} ${path} => ${res.status}`, JSON.stringify(data, null, 2).slice(0, 300));
  return { status: res.status, data };
}

async function main() {
  // Get all supplierInvoices from March 2026
  const siRes = await api("GET", "/supplierInvoice?invoiceDateFrom=2026-03-01&invoiceDateTo=2026-04-01&count=50&fields=*&sorting=id&order=desc");
  console.log("Total SIs:", siRes.data?.fullResultSize);

  const sis = siRes.data?.values || [];
  for (const si of sis.slice(0, 10)) {
    // Check the linked voucher
    const vRes = await api("GET", `/ledger/voucher/${si.voucher?.id}?fields=id,number,numberAsString,date`);
    const v = vRes.data?.value;
    console.log(`\nSI id=${si.id} invoiceNumber="${si.invoiceNumber}" amount=${si.amount} amountExclVat=${si.amountExcludingVat}`);
    console.log(`  supplier=${si.supplier?.id} voucher=${si.voucher?.id} voucherNumber=${v?.number} voucherStr="${v?.numberAsString}"`);
    console.log(`  invoiceDate=${si.invoiceDate} dueDate=${si.invoiceDueDate} isCreditNote=${si.isCreditNote}`);
    console.log(`  outstandingAmount=${si.outstandingAmount} orderLines=${si.orderLines?.length} payments=${si.payments?.length}`);
  }

  // Now try to find if there's a way to book/approve
  console.log("\n\n=== Checking approval/booking endpoints ===");

  // Try POST /supplierInvoice/:approve (from Tripletex API docs)
  if (sis.length > 0) {
    const testSiId = sis[0].id;
    console.log(`\nTrying to approve SI ${testSiId}...`);
    const approveRes = await fetch(`${BASE}/supplierInvoice/${testSiId}/:approve`, {
      method: "PUT",
      headers: H,
    });
    const approveData = await approveRes.text();
    console.log("Approve:", approveRes.status, approveData.slice(0, 500));
  }

  // Check PUT /supplierInvoice/:reject
  // Check PUT /supplierInvoice/:addRecipient
  // Check GET /supplierInvoice/forApproval

  const forApproval = await api("GET", "/supplierInvoice/forApproval?count=10&fields=*");
  console.log("\nSupplierInvoices for approval:", forApproval.data?.fullResultSize);

  // Check what travelExpense looks like (for task 13 comparison)
  console.log("\n\n=== Task 13: Travel expense state ===");
  const teRes = await api("GET", "/travelExpense?count=10&fields=*&sorting=id&order=desc");
  console.log("Travel expenses:", teRes.data?.fullResultSize);
  for (const te of (teRes.data?.values || []).slice(0, 3)) {
    console.log(`\nTE id=${te.id} title="${te.title}" state=${te.state}`);
    console.log(`  employee=${te.employee?.id} department=${te.department?.id}`);
    console.log(`  travelDetails.departureDate=${te.travelDetails?.departureDate} returnDate=${te.travelDetails?.returnDate}`);
    console.log(`  travelDetails.departureFrom="${te.travelDetails?.departureFrom}" destination="${te.travelDetails?.destination}"`);
    console.log(`  costs=${te.costs?.length} perDiemCompensations=${te.perDiemCompensations?.length} mileageAllowances=${te.mileageAllowances?.length}`);

    // Check cost details
    if (te.costs?.length > 0) {
      for (const c of te.costs) {
        const costDetail = await api("GET", `/travelExpense/cost/${c.id}?fields=*`);
        const cd = costDetail.data?.value;
        console.log(`  cost id=${cd?.id} category=${cd?.costCategory?.id} amount=${cd?.amountCurrencyIncVat} paymentType=${cd?.paymentType?.id} date=${cd?.date} comments="${cd?.comments}"`);
      }
    }
    if (te.perDiemCompensations?.length > 0) {
      for (const p of te.perDiemCompensations) {
        const pdDetail = await api("GET", `/travelExpense/perDiemCompensation/${p.id}?fields=*`);
        const pd = pdDetail.data?.value;
        console.log(`  perDiem id=${pd?.id} location="${pd?.location}" count=${pd?.count} rate=${pd?.rate} amount=${pd?.amount} rateType=${pd?.rateType?.id} accommodation="${pd?.overnightAccommodation}"`);
      }
    }
  }

  // Also check salary state for task 12
  console.log("\n\n=== Task 12: Salary/payroll state ===");
  const salaryRes = await api("GET", "/salary/transaction?count=10&fields=*&sorting=id&order=desc");
  console.log("Salary transactions:", salaryRes.data?.fullResultSize);
  for (const st of (salaryRes.data?.values || []).slice(0, 5)) {
    console.log(`  id=${st.id} employee=${st.employee?.id} year=${st.year} month=${st.month} amount=${st.amount} description="${st.description}"`);
  }

  // Check payslips
  const payslipRes = await api("GET", "/salary/payslip?count=10&fields=*&sorting=id&order=desc");
  console.log("\nPayslips:", payslipRes.data?.fullResultSize);
  for (const ps of (payslipRes.data?.values || []).slice(0, 5)) {
    console.log(`  id=${ps.id} employee=${ps.employee?.id} year=${ps.year} month=${ps.month} grossAmount=${ps.grossAmount} netAmount=${ps.netAmount}`);
  }

  // Check salary/compilation
  const compRes = await api("GET", "/salary/compilation?count=10&fields=*");
  console.log("\nSalary compilations:", compRes.data?.fullResultSize);
}

main().catch(e => { console.error("FATAL:", e); process.exit(1); });
