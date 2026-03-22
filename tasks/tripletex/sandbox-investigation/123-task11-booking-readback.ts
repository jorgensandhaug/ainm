/**
 * Read back the booked voucher 609273317 with proper field expansion
 * to see if postings survived booking.
 */

const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = `Basic ${btoa("0:" + TOKEN)}`;

async function api(method: string, path: string) {
  const url = `${BASE}${path}`;
  const res = await fetch(url, { method, headers: { Authorization: AUTH } });
  const text = await res.text();
  let data; try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, ok: res.ok, data };
}

async function main() {
  const voucherId = 609273317;

  // Method 1: GET voucher with posting expansion
  console.log("=== GET /ledger/voucher with postings(*) ===");
  const r1 = await api("GET", `/ledger/voucher/${voucherId}?fields=id,number,description,date,postings(*)`);
  if (r1.ok) {
    const v = r1.data.value;
    console.log(`Voucher: id=${v.id} number=${v.number} desc="${v.description}"`);
    for (const p of (v.postings || [])) {
      console.log(`  row=${p.row} acct=${p.account?.id}(${p.account?.number}) amount=${p.amount} amountGross=${p.amountGross} vatType=${p.vatType?.id} supplier=${p.supplier?.id||'-'} invoiceNum=${p.invoiceNumber||'-'} desc="${p.description||'-'}" sysGen=${p.systemGenerated}`);
    }
  }

  // Method 2: GET postings via /ledger/posting endpoint
  console.log("\n=== GET /ledger/posting?voucherId ===");
  const r2 = await api("GET", `/ledger/posting?voucherId=${voucherId}&fields=*`);
  if (r2.ok) {
    console.log(`Count: ${r2.data.count}`);
    for (const p of (r2.data.values || [])) {
      console.log(`  row=${p.row} acct=${p.account?.number} amount=${p.amount} amountGross=${p.amountGross} vatType=${p.vatType?.id} supplier=${p.supplier?.id||'-'} invoiceNum=${p.invoiceNumber||'-'} desc="${p.description||'-'}" sysGen=${p.systemGenerated}`);
    }
  }

  // Method 3: Check supplierInvoice for this voucher
  console.log("\n=== GET /supplierInvoice for this voucher ===");
  const r3 = await api("GET", `/supplierInvoice?invoiceDateFrom=2026-03-22&invoiceDateTo=2026-03-22&fields=*`);
  if (r3.ok) {
    const matches = r3.data.values.filter((si: any) => si.voucher?.id === voucherId);
    console.log(`Total supplierInvoices for date: ${r3.data.count}, matching voucher: ${matches.length}`);
    for (const si of matches) {
      console.log(`  supplierInvoice id=${si.id} invoiceNumber=${si.invoiceNumber} amount=${si.amount} supplier=${si.supplier?.id} isApproved=${si.isApproved}`);
    }
  }
}

main().catch(console.error);
