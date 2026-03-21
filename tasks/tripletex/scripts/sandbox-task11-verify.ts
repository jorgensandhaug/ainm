// Verify the supplier invoice created by the previous script
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa(`0:${TOKEN}`);

async function api(method: string, path: string) {
  const res = await fetch(`${BASE}${path}`, { method, headers: { Authorization: AUTH } });
  const text = await res.text();
  let data: any;
  try { data = JSON.parse(text); } catch { data = text; }
  console.log(`${method} ${path} → ${res.status}`);
  if (!res.ok) console.error("  ERROR:", JSON.stringify(data).slice(0, 400));
  return { ok: res.ok, data };
}

async function main() {
  // 1. Search supplier invoices with required date params
  console.log("=== ALL SUPPLIER INVOICES ===");
  const si = await api("GET", "/supplierInvoice?invoiceDateFrom=2020-01-01&invoiceDateTo=2027-01-01&fields=id,invoiceNumber,invoiceDate,dueDate,amount,amountCurrency,outstandingAmount,supplier(id,name,organizationNumber),voucher(id,number,date,description),description,currency(code)&count=50");
  if (si.ok) {
    for (const s of si.data.values || []) {
      console.log(`\n  SI id=${s.id}`);
      console.log(`    invoiceNumber="${s.invoiceNumber}" invoiceDate=${s.invoiceDate} dueDate=${s.dueDate}`);
      console.log(`    amount=${s.amount} amountCurrency=${s.amountCurrency} outstanding=${s.outstandingAmount}`);
      console.log(`    supplier: id=${s.supplier?.id} name="${s.supplier?.name}" org="${s.supplier?.organizationNumber}"`);
      console.log(`    voucher: id=${s.voucher?.id} number=${s.voucher?.number} date=${s.voucher?.date} desc="${s.voucher?.description}"`);
      console.log(`    description="${s.description}"`);
      console.log(`    currency=${s.currency?.code}`);
    }
    console.log(`\n  Total: ${si.data.fullResultSize}`);
  }

  // 2. Read voucher 609125366 with expanded postings
  console.log("\n=== VOUCHER WITH EXPANDED POSTINGS ===");
  const v = await api("GET", "/ledger/voucher/609125366?fields=id,number,date,description,voucherType(id,name),postings(row,account(id,number,name),amount,amountCurrency,amountGross,amountGrossCurrency,vatType(id,name,percentage),description,invoiceNumber,supplier(id,name),termOfPayment)");
  if (v.ok) {
    const val = v.data.value;
    console.log(`  id=${val.id} number=${val.number} date=${val.date}`);
    console.log(`  description="${val.description}"`);
    console.log(`  voucherType: id=${val.voucherType?.id} name="${val.voucherType?.name}"`);
    for (const p of val.postings || []) {
      console.log(`  posting row=${p.row}:`);
      console.log(`    account: ${p.account?.number} (${p.account?.name})`);
      console.log(`    amount=${p.amount} amountGross=${p.amountGross} vatType=${p.vatType?.id}(${p.vatType?.name} ${p.vatType?.percentage}%)`);
      console.log(`    desc="${p.description}" invoiceNumber="${p.invoiceNumber}" supplier=${p.supplier?.id}(${p.supplier?.name})`);
      console.log(`    termOfPayment=${p.termOfPayment}`);
    }
  }

  // 3. Read ledger postings with date params
  console.log("\n=== LEDGER POSTINGS ===");
  const lp = await api("GET", "/ledger/posting?dateFrom=2026-03-01&dateTo=2026-04-01&voucherId=609125366&fields=id,row,account(id,number,name),amount,amountGross,description,invoiceNumber,supplier(id,name),vatType(id,name,percentage)&count=20");
  if (lp.ok) {
    for (const p of lp.data.values || []) {
      console.log(`  row=${p.row} acct=${p.account?.number}(${p.account?.name}) amount=${p.amount} gross=${p.amountGross} vat=${p.vatType?.id}(${p.vatType?.percentage}%) desc="${p.description}" inv="${p.invoiceNumber}" sup=${p.supplier?.id}`);
    }
  }

  // 4. Check if there's a specific supplierInvoice linked to our voucher
  console.log("\n=== SUPPLIER INVOICE BY VOUCHER ID ===");
  const siv = await api("GET", "/supplierInvoice?invoiceDateFrom=2020-01-01&invoiceDateTo=2027-01-01&voucherId=609125366&fields=*&count=10");
  if (siv.ok) {
    console.log(`  Results: ${siv.data.fullResultSize}`);
    for (const s of siv.data.values || []) {
      console.log(`  FULL OBJECT: ${JSON.stringify(s, null, 2).slice(0, 3000)}`);
    }
  }
}

main().catch(e => { console.error("FATAL:", e); process.exit(1); });
