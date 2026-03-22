/**
 * importDocument + book the voucher. Full E2E + audit.
 * Test both: sendToLedger=true on PUT, and separate booking step.
 */

const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = `Basic ${btoa("0:" + TOKEN)}`;

async function api(method: string, path: string, body?: any, isForm = false) {
  const url = `${BASE}${path}`;
  const headers: Record<string, string> = { Authorization: AUTH };
  if (!isForm) headers["Content-Type"] = "application/json";
  const res = await fetch(url, { method, headers, body: isForm ? body : body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let data; try { data = JSON.parse(text); } catch { data = text; }
  console.log(`${method} ${path.substring(0, 90)} → ${res.status}`);
  return { status: res.status, ok: res.ok, data };
}

function buildXml(p: { invoiceNumber: string; date: string; dueDate: string; supplierName: string; orgNumber: string; description: string; net: number; gross: number; vat: number; vatPct: number }) {
  const m = (n: number) => n.toFixed(2);
  return `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
         xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
         xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:CustomizationID>urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0</cbc:CustomizationID>
  <cbc:ProfileID>urn:fdc:peppol.eu:2017:poacc:billing:01:1.0</cbc:ProfileID>
  <cbc:ID>${p.invoiceNumber}</cbc:ID>
  <cbc:IssueDate>${p.date}</cbc:IssueDate>
  <cbc:DueDate>${p.dueDate}</cbc:DueDate>
  <cbc:InvoiceTypeCode>380</cbc:InvoiceTypeCode>
  <cbc:DocumentCurrencyCode>NOK</cbc:DocumentCurrencyCode>
  <cac:AccountingSupplierParty><cac:Party>
    <cbc:EndpointID schemeID="0192">${p.orgNumber}</cbc:EndpointID>
    <cac:PartyName><cbc:Name>${p.supplierName}</cbc:Name></cac:PartyName>
    <cac:PostalAddress><cbc:StreetName>Storgata 1</cbc:StreetName><cbc:CityName>Oslo</cbc:CityName><cbc:PostalZone>0155</cbc:PostalZone><cac:Country><cbc:IdentificationCode>NO</cbc:IdentificationCode></cac:Country></cac:PostalAddress>
    <cac:PartyTaxScheme><cbc:CompanyID>NO${p.orgNumber}MVA</cbc:CompanyID><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:PartyTaxScheme>
    <cac:PartyLegalEntity><cbc:RegistrationName>${p.supplierName}</cbc:RegistrationName><cbc:CompanyID schemeID="0192">${p.orgNumber}</cbc:CompanyID></cac:PartyLegalEntity>
  </cac:Party></cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty><cac:Party>
    <cbc:EndpointID schemeID="0192">514295328</cbc:EndpointID>
    <cac:PartyName><cbc:Name>NM i AI Beastmodegutta</cbc:Name></cac:PartyName>
    <cac:PostalAddress><cbc:StreetName>Testveien 2</cbc:StreetName><cbc:CityName>Oslo</cbc:CityName><cbc:PostalZone>0155</cbc:PostalZone><cac:Country><cbc:IdentificationCode>NO</cbc:IdentificationCode></cac:Country></cac:PostalAddress>
    <cac:PartyLegalEntity><cbc:RegistrationName>NM i AI Beastmodegutta</cbc:RegistrationName><cbc:CompanyID schemeID="0192">514295328</cbc:CompanyID></cac:PartyLegalEntity>
  </cac:Party></cac:AccountingCustomerParty>
  <cac:TaxTotal><cbc:TaxAmount currencyID="NOK">${m(p.vat)}</cbc:TaxAmount><cac:TaxSubtotal><cbc:TaxableAmount currencyID="NOK">${m(p.net)}</cbc:TaxableAmount><cbc:TaxAmount currencyID="NOK">${m(p.vat)}</cbc:TaxAmount><cac:TaxCategory><cbc:ID>S</cbc:ID><cbc:Percent>${p.vatPct}</cbc:Percent><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:TaxCategory></cac:TaxSubtotal></cac:TaxTotal>
  <cac:LegalMonetaryTotal><cbc:LineExtensionAmount currencyID="NOK">${m(p.net)}</cbc:LineExtensionAmount><cbc:TaxExclusiveAmount currencyID="NOK">${m(p.net)}</cbc:TaxExclusiveAmount><cbc:TaxInclusiveAmount currencyID="NOK">${m(p.gross)}</cbc:TaxInclusiveAmount><cbc:PayableAmount currencyID="NOK">${m(p.gross)}</cbc:PayableAmount></cac:LegalMonetaryTotal>
  <cac:InvoiceLine><cbc:ID>1</cbc:ID><cbc:InvoicedQuantity unitCode="EA">1</cbc:InvoicedQuantity><cbc:LineExtensionAmount currencyID="NOK">${m(p.net)}</cbc:LineExtensionAmount><cac:Item><cbc:Name>${p.description}</cbc:Name><cac:ClassifiedTaxCategory><cbc:ID>S</cbc:ID><cbc:Percent>${p.vatPct}</cbc:Percent><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:ClassifiedTaxCategory></cac:Item><cac:Price><cbc:PriceAmount currencyID="NOK">${m(p.net)}</cbc:PriceAmount></cac:Price></cac:InvoiceLine>
</Invoice>`;
}

async function audit(voucherId: number, label: string) {
  console.log(`\n========== AUDIT: ${label} ==========`);

  // Voucher
  const vRead = await api("GET", `/ledger/voucher/${voucherId}?fields=id,number,tempNumber,description,date,version,numberAsString,vendorInvoiceNumber,voucherType(*),postings(*)`);
  const v = vRead.data.value;
  console.log(`\n  VOUCHER: id=${v.id} number=${v.number} tempNumber=${v.tempNumber} numberAsString="${v.numberAsString}"`);
  console.log(`  description="${v.description}"`);
  console.log(`  date=${v.date} vendorInvoiceNumber="${v.vendorInvoiceNumber}"`);
  console.log(`  voucherType: id=${v.voucherType?.id} name="${v.voucherType?.name}"`);
  console.log(`  BOOKED: ${v.number > 0 ? 'YES' : 'NO'}`);
  for (const p of v.postings || []) {
    console.log(`  posting: row=${p.row} acct=#${p.account?.number}(id=${p.account?.id}) amt=${p.amount} gross=${p.amountGross} vatType=#${p.vatType?.number}(id=${p.vatType?.id}) supplier=${p.supplier?.id||'-'} inv="${p.invoiceNumber||''}" term=${p.termOfPayment||'-'} desc="${p.description}"`);
  }

  // SupplierInvoice
  const siRes = await api("GET", `/supplierInvoice?invoiceDateFrom=2026-03-22&invoiceDateTo=2026-03-23&fields=*`);
  const si = siRes.data.values?.find((s: any) => s.voucher?.id === voucherId);
  if (si) {
    console.log(`\n  SUPPLIERINVOICE: id=${si.id}`);
    console.log(`  invoiceNumber="${si.invoiceNumber}" invoiceDate=${si.invoiceDate} invoiceDueDate=${si.invoiceDueDate}`);
    console.log(`  supplier: id=${si.supplier?.id}`);
    console.log(`  amount=${si.amount} amountCurrency=${si.amountCurrency}`);
    console.log(`  amountExcludingVat=${si.amountExcludingVat} amountExcludingVatCurrency=${si.amountExcludingVatCurrency}`);
    console.log(`  outstandingAmount=${si.outstandingAmount}`);
    console.log(`  isCreditNote=${si.isCreditNote}`);
    console.log(`  orderLines=${JSON.stringify(si.orderLines)}`);
    console.log(`  payments=${JSON.stringify(si.payments)}`);
    console.log(`  approvalListElements count=${si.approvalListElements?.length || 0}`);
    // Read orderline details
    if (si.orderLines?.length) {
      const olId = si.orderLines[0].id;
      const olRes = await api("GET", `/order/orderline/${olId}?fields=*`);
      if (olRes.ok) {
        const ol = olRes.data.value;
        console.log(`  orderLine[0]: id=${ol.id} description="${ol.description}" count=${ol.count} unitPriceExcludingVatCurrency=${ol.unitPriceExcludingVatCurrency} amountExcludingVatCurrency=${ol.amountExcludingVatCurrency} vatType=${JSON.stringify(ol.vatType)}`);
      }
    }
  } else {
    console.log(`\n  NO SUPPLIERINVOICE for voucher ${voucherId}`);
  }
}

async function main() {
  const date = "2026-03-22";
  const dueDate = "2026-04-21";
  const supplierName = "Lumière SARL";
  const orgNumber = "913175212";
  const invoiceNumber = "INV-BOOK-TEST";
  const description = "services de bureau";
  const gross = 72350;
  const net = Math.round((gross * 100) / 125); // 57880
  const vat = gross - net; // 14470

  // Resolve supplier
  const supSearch = await api("GET", `/supplier?organizationNumber=${orgNumber}&fields=*`);
  const sup = supSearch.data.values[0];
  const supplierId = sup.id;
  const supplierLedger = sup.ledgerAccount.id;

  // Resolve account
  const acctRes = await api("GET", `/ledger/account?number=6300&isApplicableForSupplierInvoice=true&fields=*`);
  const expAcctId = acctRes.data.values.find((a: any) => String(a.number) === "6300").id;

  const xml = buildXml({ invoiceNumber, date, dueDate, supplierName, orgNumber, description, net, gross, vat, vatPct: 25 });

  // ===== TEST A: importDocument + PUT sendToLedger=true =====
  console.log("\n===== TEST A: importDocument + PUT sendToLedger=true =====");
  const form1 = new FormData();
  form1.append("file", new Blob([xml], { type: "application/xml" }), `${invoiceNumber}-A.xml`);
  const imp1 = await api("POST", "/ledger/voucher/importDocument", form1, true);
  if (!imp1.ok) { console.error("IMPORT FAIL:", JSON.stringify(imp1.data).substring(0, 300)); return; }
  const v1 = imp1.data.values[0];
  const vId1 = v1.id;
  console.log(`  Imported: id=${vId1} version=${v1.version}`);

  const put1 = await api("PUT", `/ledger/voucher/${vId1}?sendToLedger=true`, {
    version: v1.version,
    postings: [
      { row: 1, date, description, account: { id: expAcctId }, vatType: { id: 1 }, amount: net, amountCurrency: net, amountGross: gross, amountGrossCurrency: gross },
      { row: 2, date, description, account: { id: supplierLedger }, supplier: { id: supplierId }, amount: -gross, amountCurrency: -gross, amountGross: -gross, amountGrossCurrency: -gross, invoiceNumber, termOfPayment: dueDate },
    ],
  });
  if (!put1.ok) {
    console.error("PUT A FAIL:", JSON.stringify(put1.data).substring(0, 300));
    // If sendToLedger=true fails, try without and then book separately
  } else {
    console.log(`  PUT OK: number=${put1.data.value.number}`);
  }
  await audit(vId1, "A: sendToLedger=true");

  // ===== TEST B: importDocument + PUT sendToLedger=false + separate PUT to book =====
  console.log("\n\n===== TEST B: importDocument + PUT postings + separate book =====");
  const xml2 = buildXml({ invoiceNumber: "INV-BOOK-B", date, dueDate, supplierName, orgNumber, description, net, gross, vat, vatPct: 25 });
  const form2 = new FormData();
  form2.append("file", new Blob([xml2], { type: "application/xml" }), `INV-BOOK-B.xml`);
  const imp2 = await api("POST", "/ledger/voucher/importDocument", form2, true);
  if (!imp2.ok) { console.error("IMPORT B FAIL:", JSON.stringify(imp2.data).substring(0, 300)); return; }
  const v2 = imp2.data.values[0];
  const vId2 = v2.id;

  // PUT postings with sendToLedger=false
  const put2 = await api("PUT", `/ledger/voucher/${vId2}?sendToLedger=false`, {
    version: v2.version,
    postings: [
      { row: 1, date, description, account: { id: expAcctId }, vatType: { id: 1 }, amount: net, amountCurrency: net, amountGross: gross, amountGrossCurrency: gross },
      { row: 2, date, description, account: { id: supplierLedger }, supplier: { id: supplierId }, amount: -gross, amountCurrency: -gross, amountGross: -gross, amountGrossCurrency: -gross, invoiceNumber: "INV-BOOK-B", termOfPayment: dueDate },
    ],
  });
  if (!put2.ok) { console.error("PUT B FAIL:", JSON.stringify(put2.data).substring(0, 300)); return; }
  console.log(`  PUT B (postings): number=${put2.data.value.number} version=${put2.data.value.version}`);

  // Now book it with a separate PUT
  const bookPut = await api("PUT", `/ledger/voucher/${vId2}?sendToLedger=true`, {
    version: put2.data.value.version,
    voucherType: { name: "Leverandørfaktura" },
  });
  if (!bookPut.ok) {
    console.error("BOOK FAIL:", JSON.stringify(bookPut.data).substring(0, 300));
    // Maybe need to include postings again?
    const getV = await api("GET", `/ledger/voucher/${vId2}?fields=version,postings(*)`);
    const curV = getV.data.value;
    console.log(`  current version=${curV.version} number of postings=${curV.postings?.length}`);
    const bookPut2 = await api("PUT", `/ledger/voucher/${vId2}?sendToLedger=true`, {
      version: curV.version,
      voucherType: { name: "Leverandørfaktura" },
    });
    if (bookPut2.ok) {
      console.log(`  BOOK retry OK: number=${bookPut2.data.value.number}`);
    } else {
      console.error("  BOOK retry FAIL:", JSON.stringify(bookPut2.data).substring(0, 300));
    }
  } else {
    console.log(`  BOOK OK: number=${bookPut.data.value.number}`);
  }
  await audit(vId2, "B: separate book step");

  // ===== TEST C: importDocument + PUT postings+sendToLedger=true in ONE call =====
  console.log("\n\n===== TEST C: single PUT with postings + sendToLedger=true =====");
  const xml3 = buildXml({ invoiceNumber: "INV-BOOK-C", date, dueDate, supplierName, orgNumber, description, net, gross, vat, vatPct: 25 });
  const form3 = new FormData();
  form3.append("file", new Blob([xml3], { type: "application/xml" }), `INV-BOOK-C.xml`);
  const imp3 = await api("POST", "/ledger/voucher/importDocument", form3, true);
  if (!imp3.ok) { console.error("IMPORT C FAIL"); return; }
  const v3 = imp3.data.values[0];
  const vId3 = v3.id;

  // Single PUT with postings AND sendToLedger=true
  const put3 = await api("PUT", `/ledger/voucher/${vId3}?sendToLedger=true`, {
    version: v3.version,
    postings: [
      { row: 1, date, description, account: { id: expAcctId }, vatType: { id: 1 }, amount: net, amountCurrency: net, amountGross: gross, amountGrossCurrency: gross },
      { row: 2, date, description, account: { id: supplierLedger }, supplier: { id: supplierId }, amount: -gross, amountCurrency: -gross, amountGross: -gross, amountGrossCurrency: -gross, invoiceNumber: "INV-BOOK-C", termOfPayment: dueDate },
    ],
  });
  if (!put3.ok) { console.error("PUT C FAIL:", JSON.stringify(put3.data).substring(0, 300)); return; }
  console.log(`  PUT C: number=${put3.data.value.number}`);
  await audit(vId3, "C: postings+sendToLedger=true in one PUT");
}

main().catch(console.error);
