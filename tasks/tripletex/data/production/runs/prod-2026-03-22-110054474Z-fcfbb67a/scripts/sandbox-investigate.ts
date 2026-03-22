// Investigate the sandbox state from earlier runs to understand postings structure
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { "Content-Type": "application/json", Authorization: AUTH };

async function api(method: string, path: string) {
  const url = `${BASE}${path}`;
  const r = await fetch(url, { method, headers: H });
  const json = await r.json();
  if (!r.ok) { console.error(`${method} ${path} → ${r.status}`); return null; }
  return json;
}

async function main() {
  // Check the voucher 609300371 from earlier sandbox run - look at postings in detail
  const v = await api("GET", "/ledger/voucher/609300371?fields=*");
  if (v) {
    console.log("=== VOUCHER 609300371 ===");
    console.log("number:", v.value.number);
    console.log("description:", v.value.description);
    console.log("voucherType:", v.value.voucherType);
    console.log("postings count:", v.value.postings?.length);
    if (v.value.postings) {
      for (const p of v.value.postings) {
        console.log("  Posting:", JSON.stringify(p, null, 2));
      }
    }
  }

  // Check what a full voucher GET returns with explicit posting expansion
  const v2 = await api("GET", "/ledger/voucher/609300371?fields=id,number,description,voucherType(name),postings(*)");
  if (v2) {
    console.log("\n=== WITH POSTINGS EXPANSION ===");
    if (v2.value.postings) {
      for (const p of v2.value.postings) {
        console.log("  Posting:", JSON.stringify(p, null, 2));
      }
    }
  }

  // Also check the supplierInvoice for this voucher
  const si = await api("GET", "/supplierInvoice?voucherId=609300371&invoiceDateFrom=2026-01-01&invoiceDateTo=2026-12-31&fields=*");
  if (si && si.count > 0) {
    const s = si.values[0];
    console.log("\n=== SUPPLIER INVOICE ===");
    console.log(JSON.stringify(s, null, 2));
  }
}

main().catch(e => { console.error("FATAL:", e); process.exit(1); });
