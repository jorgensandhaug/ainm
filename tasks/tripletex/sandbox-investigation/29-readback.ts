// Read back the Leverandørfaktura voucher and supplier invoice search
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa(`0:${TOKEN}`);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

async function api(method: string, path: string) {
  const url = `${BASE}${path}`;
  const res = await fetch(url, { method, headers: H });
  const json = await res.json();
  console.log(`${method} ${path} => ${res.status}`);
  return { status: res.status, data: json };
}

async function main() {
  // Read back voucher 609121403 with deep expansion
  const v = await api("GET", "/ledger/voucher/609121403?fields=id,number,date,description,voucherType(*),postings(*)");
  if (v.data?.value) {
    const voucher = v.data.value;
    console.log(`Voucher: id=${voucher.id} #${voucher.number} date=${voucher.date} desc="${voucher.description}"`);
    console.log(`  type: ${JSON.stringify(voucher.voucherType)}`);
    for (const p of (voucher.postings || [])) {
      console.log(`  posting: ${JSON.stringify(p).slice(0, 400)}`);
    }
  }

  // Search supplier invoices with date range
  const si = await api("GET", "/supplierInvoice?supplierId=108409896&invoiceDateFrom=2026-01-01&invoiceDateTo=2026-12-31&fields=*");
  console.log(`Supplier invoices: count=${si.data?.fullResultSize || si.data?.values?.length || 0}`);
  for (const s of (si.data?.values || [])) {
    console.log(`  SI: id=${s.id} invoiceNumber=${s.invoiceNumber} amount=${s.amount} supplier=${s.supplier?.id}`);
  }

  // Search vouchers by project with date range
  const vSearch = await api("GET", "/ledger/voucher?dateFrom=2026-01-01&dateTo=2026-12-31&fields=id,number,description,voucherType(name),postings(account(number),amount,project(id,name),supplier(id,name))");
  console.log(`\nVouchers: count=${vSearch.data?.fullResultSize}`);
  for (const v of (vSearch.data?.values || [])) {
    const hasProject = v.postings?.some((p: any) => p.project?.id);
    const hasSupplier = v.postings?.some((p: any) => p.supplier?.id);
    if (hasProject || hasSupplier) {
      console.log(`  #${v.number} "${v.description}" type=${v.voucherType?.name}`);
      for (const p of v.postings) {
        if (p.project?.id || p.supplier?.id) {
          console.log(`    acct=${p.account?.number} amt=${p.amount} proj=${p.project?.id || '-'} supp=${p.supplier?.id || '-'} suppName="${p.supplier?.name || '-'}"`);
        }
      }
    }
  }

  // Also check: read back voucher 1b (609121120) — the one without supplier
  const v1b = await api("GET", "/ledger/voucher/609121120?fields=id,number,date,description,voucherType(*),postings(account(number),amount,project(id),supplier(id))");
  if (v1b.data?.value) {
    console.log(`\nVoucher 1b: #${v1b.data.value.number} "${v1b.data.value.description}"`);
    for (const p of (v1b.data.value.postings || [])) {
      console.log(`  acct=${p.account?.number} amt=${p.amount} proj=${p.project?.id || '-'} supp=${p.supplier?.id || '-'}`);
    }
  }
}

main().catch(e => { console.error("FATAL:", e); process.exit(1); });
