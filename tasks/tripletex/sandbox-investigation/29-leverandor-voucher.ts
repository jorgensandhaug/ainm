// TASK 29: Test Leverandørfaktura voucher with supplier on 2400 posting
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
  const projectId = 402032191;
  const suppId = 108409896;

  const accRes = await api("GET", "/ledger/account?number=6590,2400&fields=id,number,name");
  const acc6590 = accRes.data?.values?.find((a: any) => a.number === 6590);
  const acc2400 = accRes.data?.values?.find((a: any) => a.number === 2400);
  console.log(`6590=${acc6590?.id} 2400=${acc2400?.id}`);

  // Test A: Leverandørfaktura with supplier on 2400 credit posting
  console.log("\n--- A: supplier on 2400 posting ---");
  const vA = await api("POST", "/ledger/voucher?sendToLedger=true", {
    date: TODAY,
    description: "Leverandørkostnad fra Test29E Supplier",
    voucherType: { id: 9744845 },
    postings: [
      {
        row: 1,
        date: TODAY,
        description: "Leverandørkostnad",
        account: { id: acc6590?.id },
        amount: 56750,
        amountCurrency: 56750,
        amountGross: 56750,
        amountGrossCurrency: 56750,
        project: { id: projectId },
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
        supplier: { id: suppId },
      },
    ],
  });
  console.log(`Voucher A: status=${vA.status} id=${vA.data?.value?.id}`);
  if (vA.data?.value) {
    console.log(`  voucherNumber=${vA.data.value.number}`);
  }

  // Test B: supplier on BOTH postings
  if (vA.status >= 400) {
    console.log("\n--- B: supplier on BOTH postings ---");
    const vB = await api("POST", "/ledger/voucher?sendToLedger=true", {
      date: TODAY,
      description: "Leverandørkostnad fra Test29E Supplier v2",
      voucherType: { id: 9744845 },
      postings: [
        {
          row: 1,
          date: TODAY,
          description: "Leverandørkostnad",
          account: { id: acc6590?.id },
          amount: 56750,
          amountCurrency: 56750,
          amountGross: 56750,
          amountGrossCurrency: 56750,
          project: { id: projectId },
          supplier: { id: suppId },
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
          supplier: { id: suppId },
        },
      ],
    });
    console.log(`Voucher B: status=${vB.status} id=${vB.data?.value?.id}`);
  }

  // Read back voucher to verify project and supplier
  const voucherId = vA.data?.value?.id;
  if (voucherId) {
    console.log("\n=== Read back voucher ===");
    const vRead = await api("GET", `/ledger/voucher/${voucherId}?fields=*`);
    if (vRead.data?.value) {
      const v = vRead.data.value;
      console.log(`  type: ${v.voucherType?.name}`);
      console.log(`  number: ${v.number}`);
      if (v.postings) {
        for (const p of v.postings) {
          console.log(`  posting: acct=${p.account?.number} amount=${p.amount} project=${p.project?.id || 'null'} supplier=${p.supplier?.id || 'null'} customer=${p.customer?.id || 'null'}`);
        }
      }
    }

    // Also check if this shows up in supplierInvoice search
    console.log("\n--- Check if this appears as a supplierInvoice ---");
    const siSearch = await api("GET", `/supplierInvoice?supplierId=${suppId}&fields=*`);
    console.log(`Supplier invoice search: status=${siSearch.status} count=${siSearch.data?.fullResultSize || siSearch.data?.values?.length || 0}`);
    for (const si of (siSearch.data?.values || [])) {
      console.log(`  SI id=${si.id} invoiceNumber=${si.invoiceNumber} amount=${si.amount} supplier=${si.supplier?.id}`);
    }
  }

  // Also test: can we search vouchers by project?
  console.log("\n--- Vouchers for project ---");
  const vSearch = await api("GET", `/ledger/voucher?projectId=${projectId}&fields=id,number,description,voucherType(name)`);
  for (const v of (vSearch.data?.values || [])) {
    console.log(`  voucher id=${v.id} #${v.number} "${v.description}" type=${v.voucherType?.name}`);
  }

  console.log("\n=== DONE ===");
}

main().catch(e => { console.error("FATAL:", e); process.exit(1); });
