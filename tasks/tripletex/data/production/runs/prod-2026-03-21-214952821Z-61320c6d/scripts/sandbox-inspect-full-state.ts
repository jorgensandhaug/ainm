// Full state inspection: what does the scorer likely see?
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);

const VOUCHER_ID = 609180889;
const SUPPLIER_ID = 108439395;

async function api(path: string) {
  const url = `${BASE}${path}`;
  const r = await fetch(url, { headers: { Authorization: "Basic " + btoa("0:" + TOKEN) } });
  const text = await r.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  console.log(`GET ${path} → ${r.status}`);
  if (!r.ok) console.log("ERROR:", JSON.stringify(json).slice(0, 500));
  return json;
}

async function main() {
  // 1. Full supplierInvoice details
  console.log("=== supplierInvoice for voucher ===");
  const si = await api(`/supplierInvoice?invoiceDateFrom=2026-03-01&invoiceDateTo=2026-04-30&voucherId=${VOUCHER_ID}&fields=*`);
  if (si.values?.length > 0) {
    const inv = si.values[0];
    console.log(JSON.stringify(inv, null, 2));
  }

  // 2. Full supplier details
  console.log("\n=== supplier ===");
  const supp = await api(`/supplier/${SUPPLIER_ID}?fields=*`);
  if (supp.value) {
    // Only log key fields
    const s = supp.value;
    console.log(`id: ${s.id}`);
    console.log(`name: ${s.name}`);
    console.log(`organizationNumber: ${s.organizationNumber}`);
    console.log(`supplierNumber: ${s.supplierNumber}`);
    console.log(`phoneNumber: ${s.phoneNumber}`);
    console.log(`phoneNumberMobile: ${s.phoneNumberMobile}`);
    console.log(`email: ${s.email}`);
    console.log(`postalAddress.addressLine1: ${s.postalAddress?.addressLine1}`);
    console.log(`postalAddress.postalCode: ${s.postalAddress?.postalCode}`);
    console.log(`postalAddress.city: ${s.postalAddress?.city}`);
    console.log(`physicalAddress.addressLine1: ${s.physicalAddress?.addressLine1}`);
    console.log(`physicalAddress.postalCode: ${s.physicalAddress?.postalCode}`);
    console.log(`physicalAddress.city: ${s.physicalAddress?.city}`);
    console.log(`bankAccountPresentation: ${JSON.stringify(s.bankAccountPresentation)}`);
    console.log(`isSupplier: ${s.isSupplier}`);
    console.log(`isCustomer: ${s.isCustomer}`);
    console.log(`ledgerAccount: ${JSON.stringify(s.ledgerAccount)}`);
  }

  // 3. Full voucher with postings
  console.log("\n=== voucher with postings ===");
  const v = await api(`/ledger/voucher/${VOUCHER_ID}?fields=id,number,version,date,description,postings`);
  if (v.value) {
    console.log(`number: ${v.value.number}`);
    console.log(`date: ${v.value.date}`);
    console.log(`description: ${v.value.description}`);
    console.log(`postings count: ${v.value.postings?.length}`);
    if (v.value.postings) {
      for (const p of v.value.postings) {
        console.log(`  row=${p.row} date=${p.date} desc="${p.description}" acct=${p.account?.number}/${p.account?.name} amount=${p.amount} amountGross=${p.amountGross} supplier=${p.supplier?.id} invoiceNumber=${p.invoiceNumber} termOfPayment=${p.termOfPayment} vatType=${p.vatType?.id}/${p.vatType?.number}`);
      }
    }
  }

  // 4. Try getting posting details via explicit posting endpoint
  console.log("\n=== postings via /ledger/voucher/${VOUCHER_ID}/posting ===");
  const postings = await api(`/ledger/voucher/${VOUCHER_ID}/posting?fields=*`);
  if (postings.values) {
    for (const p of postings.values) {
      console.log(`  row=${p.row} date=${p.date} desc="${p.description}" acct=${p.account?.number}/${p.account?.name} amount=${p.amount} amountGross=${p.amountGross} supplier=${JSON.stringify(p.supplier)} invoiceNumber=${p.invoiceNumber} termOfPayment=${p.termOfPayment}`);
    }
  }
}

main().catch(e => { console.error("FATAL:", e.message); process.exit(1); });
