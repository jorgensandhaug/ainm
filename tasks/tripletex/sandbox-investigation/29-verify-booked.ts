const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa(`0:${TOKEN}`);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: RequestInit = { method, headers: H };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const json = await res.json();
  console.log(`${method} ${path} => ${res.status}`);
  if (res.status >= 400) console.log("  ERR:", JSON.stringify(json, null, 2).slice(0, 500));
  return { status: res.status, data: json };
}

async function main() {
  const projectId = 402032191;
  const suppId = 108409896;

  // Check if voucher 341 (609121403) was booked
  const v341 = await api("GET", "/ledger/voucher/609121403?fields=id,number,date,description,voucherType(name),postings(account(number),amount,supplier(id),project(id))");
  console.log("Voucher 341 (with sendToLedger=true, Leverandørfaktura + 2400 credit):");
  console.log(`  Postings:`, JSON.stringify(v341.data?.value?.postings, null, 2).slice(0, 600));

  // Check voucher 340 (609121120) - created without supplier
  const v340 = await api("GET", "/ledger/voucher/609121120?fields=id,number,date,description,voucherType(name),postings(account(number),amount,supplier(id),project(id))");
  console.log("\nVoucher 340 (with sendToLedger=true, Leverandørfaktura + 1920 credit, NO supplier):");
  console.log(`  Postings:`, JSON.stringify(v340.data?.value?.postings, null, 2).slice(0, 600));

  // Now test: create Leverandørfaktura WITHOUT sendToLedger
  console.log("\n=== TEST: Leverandørfaktura WITHOUT sendToLedger ===");
  const accRes = await api("GET", "/ledger/account?number=6590,2400&fields=id,number,name");
  const acc6590 = accRes.data?.values?.find((a: any) => a.number === 6590);
  const acc2400 = accRes.data?.values?.find((a: any) => a.number === 2400);

  const v = await api("POST", "/ledger/voucher", {
    date: "2026-03-21",
    description: "Test no-sendToLedger Leverandørfaktura",
    voucherType: { id: 9744845 },
    postings: [
      {
        row: 1, date: "2026-03-21", description: "Expense",
        account: { id: acc6590?.id },
        amount: 1000, amountCurrency: 1000,
        amountGross: 1000, amountGrossCurrency: 1000,
        project: { id: projectId },
      },
      {
        row: 2, date: "2026-03-21", description: "Payable",
        account: { id: acc2400?.id },
        amount: -1000, amountCurrency: -1000,
        amountGross: -1000, amountGrossCurrency: -1000,
        supplier: { id: suppId },
      },
    ],
  });
  console.log(`Without sendToLedger: status=${v.status} id=${v.data?.value?.id} number=${v.data?.value?.number}`);

  // Also test WITH sendToLedger
  const v2 = await api("POST", "/ledger/voucher?sendToLedger=true", {
    date: "2026-03-21",
    description: "Test WITH sendToLedger Leverandørfaktura",
    voucherType: { id: 9744845 },
    postings: [
      {
        row: 1, date: "2026-03-21", description: "Expense",
        account: { id: acc6590?.id },
        amount: 2000, amountCurrency: 2000,
        amountGross: 2000, amountGrossCurrency: 2000,
        project: { id: projectId },
      },
      {
        row: 2, date: "2026-03-21", description: "Payable",
        account: { id: acc2400?.id },
        amount: -2000, amountCurrency: -2000,
        amountGross: -2000, amountGrossCurrency: -2000,
        supplier: { id: suppId },
      },
    ],
  });
  console.log(`With sendToLedger: status=${v2.status} id=${v2.data?.value?.id} number=${v2.data?.value?.number}`);

  // Check if there's a difference in supplier invoice search
  console.log("\n--- Supplier invoice search ---");
  const siSearch = await api("GET", `/supplierInvoice?supplierId=${suppId}&invoiceDateFrom=2026-01-01&invoiceDateTo=2026-12-31&fields=id,invoiceNumber,amount,supplier(id,name)`);
  console.log(`Supplier invoices found: ${siSearch.data?.fullResultSize || siSearch.data?.values?.length || 0}`);
  for (const si of (siSearch.data?.values || [])) {
    console.log(`  SI: id=${si.id} invoiceNumber=${si.invoiceNumber} amount=${si.amount}`);
  }
}

main().catch(e => { console.error("FATAL:", e); process.exit(1); });
