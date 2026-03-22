/**
 * Recreate the 0b6fe5b8 prod run in sandbox, then audit ALL state.
 * Original: importDocument + PUT postings with sendToLedger=false
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
  console.log(`${method} ${path.substring(0, 80)} → ${res.status}`);
  return { status: res.status, ok: res.ok, data };
}

async function main() {
  // Same params as prod run
  const runDate = "2026-03-22";
  const supplierName = "Lumière SARL";
  const orgNumber = "913175212";
  const invoiceNumber = "INV-2026-7606";
  const description = "services de bureau";
  const expenseAccountNumber = "6300";
  const vatPercentage = 25;
  const gross = 72350;
  const net = Math.round((gross * 100) / (100 + vatPercentage)); // 57880
  const vat = gross - net; // 14470

  // CALL 1: GET /supplier
  const supSearch = await api("GET", `/supplier?organizationNumber=${orgNumber}&fields=*`);
  let supplierId: number;
  let supplierLedger: number;
  if (supSearch.data.fullResultSize > 0) {
    const s = supSearch.data.values[0];
    supplierId = s.id;
    supplierLedger = s.ledgerAccount.id;
    console.log(`  Found supplier: id=${supplierId}`);
  } else {
    // CALL 2: POST /supplier
    const sRes = await api("POST", "/supplier", { name: supplierName, organizationNumber: orgNumber });
    supplierId = sRes.data.value.id;
    supplierLedger = sRes.data.value.ledgerAccount.id;
    console.log(`  Created supplier: id=${supplierId}`);
  }

  // CALL 3: GET /ledger/account
  const acctRes = await api("GET", `/ledger/account?number=${expenseAccountNumber}&isApplicableForSupplierInvoice=true&fields=*`);
  const expAcctId = acctRes.data.values.find((a: any) => String(a.number) === expenseAccountNumber).id;
  console.log(`  Account ${expenseAccountNumber}: id=${expAcctId}`);

  // CALL 4: GET /ledger/vatType
  const vatRes = await api("GET", `/ledger/vatType?typeOfVat=INCOMING&vatDate=${runDate}&fields=*`);
  const vatTypes = vatRes.data.values.filter((v: any) => v.percentage === vatPercentage);
  const vatType = vatTypes.find((v: any) => String(v.number) === "1") || vatTypes[0];
  const vatTypeId = vatType.id;
  console.log(`  VatType: id=${vatTypeId} number=${vatType.number} name="${vatType.name}"`);

  // CALL 5: POST /ledger/voucher/importDocument
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
         xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
         xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:CustomizationID>urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0</cbc:CustomizationID>
  <cbc:ProfileID>urn:fdc:peppol.eu:2017:poacc:billing:01:1.0</cbc:ProfileID>
  <cbc:ID>${invoiceNumber}</cbc:ID>
  <cbc:IssueDate>${runDate}</cbc:IssueDate>
  <cbc:DueDate>${runDate}</cbc:DueDate>
  <cbc:InvoiceTypeCode>380</cbc:InvoiceTypeCode>
  <cbc:DocumentCurrencyCode>NOK</cbc:DocumentCurrencyCode>
  <cac:AccountingSupplierParty><cac:Party>
    <cbc:EndpointID schemeID="0192">${orgNumber}</cbc:EndpointID>
    <cac:PartyIdentification><cbc:ID schemeID="0192">${orgNumber}</cbc:ID></cac:PartyIdentification>
    <cac:PartyName><cbc:Name>${supplierName}</cbc:Name></cac:PartyName>
    <cac:PostalAddress><cbc:StreetName>Storgata 1</cbc:StreetName><cbc:CityName>Oslo</cbc:CityName><cbc:PostalZone>0155</cbc:PostalZone><cac:Country><cbc:IdentificationCode>NO</cbc:IdentificationCode></cac:Country></cac:PostalAddress>
    <cac:PartyTaxScheme><cbc:CompanyID>NO${orgNumber}MVA</cbc:CompanyID><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:PartyTaxScheme>
    <cac:PartyLegalEntity><cbc:RegistrationName>${supplierName}</cbc:RegistrationName><cbc:CompanyID schemeID="0192">${orgNumber}</cbc:CompanyID></cac:PartyLegalEntity>
  </cac:Party></cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty><cac:Party>
    <cbc:EndpointID schemeID="0192">999999999</cbc:EndpointID>
    <cac:PartyName><cbc:Name>Debug Buyer AS</cbc:Name></cac:PartyName>
    <cac:PostalAddress><cbc:StreetName>Testveien 2</cbc:StreetName><cbc:CityName>Oslo</cbc:CityName><cbc:PostalZone>0155</cbc:PostalZone><cac:Country><cbc:IdentificationCode>NO</cbc:IdentificationCode></cac:Country></cac:PostalAddress>
    <cac:PartyLegalEntity><cbc:RegistrationName>Debug Buyer AS</cbc:RegistrationName><cbc:CompanyID schemeID="0192">999999999</cbc:CompanyID></cac:PartyLegalEntity>
  </cac:Party></cac:AccountingCustomerParty>
  <cac:TaxTotal><cbc:TaxAmount currencyID="NOK">${vat.toFixed(2)}</cbc:TaxAmount><cac:TaxSubtotal><cbc:TaxableAmount currencyID="NOK">${net.toFixed(2)}</cbc:TaxableAmount><cbc:TaxAmount currencyID="NOK">${vat.toFixed(2)}</cbc:TaxAmount><cac:TaxCategory><cbc:ID>S</cbc:ID><cbc:Percent>${vatPercentage}</cbc:Percent><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:TaxCategory></cac:TaxSubtotal></cac:TaxTotal>
  <cac:LegalMonetaryTotal><cbc:LineExtensionAmount currencyID="NOK">${net.toFixed(2)}</cbc:LineExtensionAmount><cbc:TaxExclusiveAmount currencyID="NOK">${net.toFixed(2)}</cbc:TaxExclusiveAmount><cbc:TaxInclusiveAmount currencyID="NOK">${gross.toFixed(2)}</cbc:TaxInclusiveAmount><cbc:PayableAmount currencyID="NOK">${gross.toFixed(2)}</cbc:PayableAmount></cac:LegalMonetaryTotal>
  <cac:InvoiceLine><cbc:ID>1</cbc:ID><cbc:InvoicedQuantity unitCode="EA">1</cbc:InvoicedQuantity><cbc:LineExtensionAmount currencyID="NOK">${net.toFixed(2)}</cbc:LineExtensionAmount><cac:Item><cbc:Name>${description}</cbc:Name><cac:ClassifiedTaxCategory><cbc:ID>S</cbc:ID><cbc:Percent>${vatPercentage}</cbc:Percent><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:ClassifiedTaxCategory></cac:Item><cac:Price><cbc:PriceAmount currencyID="NOK">${net.toFixed(2)}</cbc:PriceAmount></cac:Price></cac:InvoiceLine>
</Invoice>`;

  const form = new FormData();
  form.append("description", `import-${invoiceNumber}`);
  form.append("file", new Blob([xml], { type: "application/xml" }), `${invoiceNumber}.xml`);
  const impRes = await api("POST", "/ledger/voucher/importDocument", form, true);
  if (!impRes.ok) { console.error("IMPORT FAIL:", JSON.stringify(impRes.data).substring(0, 500)); return; }
  const importedVoucher = impRes.data.values[0];
  const voucherId = importedVoucher.id;
  console.log(`  Imported voucher: id=${voucherId} version=${importedVoucher.version}`);

  // CALL 6: PUT /ledger/voucher with sendToLedger=false
  const putRes = await api("PUT", `/ledger/voucher/${voucherId}?sendToLedger=false`, {
    version: importedVoucher.version,
    postings: [
      { row: 1, date: runDate, description, account: { id: expAcctId }, vatType: { id: vatTypeId }, amount: net, amountCurrency: net, amountGross: gross, amountGrossCurrency: gross },
      { row: 2, date: runDate, description, account: { id: supplierLedger }, supplier: { id: supplierId }, amount: -gross, amountCurrency: -gross, amountGross: -gross, amountGrossCurrency: -gross, invoiceNumber, termOfPayment: runDate },
    ],
  });
  if (!putRes.ok) { console.error("PUT FAIL:", JSON.stringify(putRes.data).substring(0, 500)); return; }
  console.log(`  PUT OK: number=${putRes.data.value.number}`);

  // ============ FULL STATE AUDIT ============
  console.log("\n========== FULL STATE AUDIT ==========");

  // 1. Voucher
  const vRead = await api("GET", `/ledger/voucher/${voucherId}?fields=*`);
  const v = vRead.data.value;
  console.log("\n--- VOUCHER ---");
  console.log(`  id=${v.id} number=${v.number} tempNumber=${v.tempNumber}`);
  console.log(`  description="${v.description}"`);
  console.log(`  date=${v.date}`);
  console.log(`  voucherType=${JSON.stringify(v.voucherType)}`);
  console.log(`  vendorInvoiceNumber="${v.vendorInvoiceNumber}"`);
  console.log(`  supplierVoucherType=${v.supplierVoucherType}`);
  console.log(`  numberAsString="${v.numberAsString}"`);
  console.log(`  version=${v.version}`);

  // Postings with full detail
  const vPostings = await api("GET", `/ledger/voucher/${voucherId}?fields=postings(*)`);
  for (const p of vPostings.data.value.postings || []) {
    console.log(`  posting: row=${p.row} acct=${p.account?.id}(#${p.account?.number}) amt=${p.amount} amtCurr=${p.amountCurrency} gross=${p.amountGross} grossCurr=${p.amountGrossCurrency} vatType=${p.vatType?.id}(#${p.vatType?.number}) supplier=${p.supplier?.id||'-'} inv="${p.invoiceNumber||''}" term=${p.termOfPayment||'-'} desc="${p.description}"`);
  }

  // 2. SupplierInvoice
  const siRes2 = await api("GET", `/supplierInvoice?voucherId=${voucherId}&fields=*`);
  if (siRes2.data.values?.length) {
    const si = siRes2.data.values[0];
    console.log("\n--- SUPPLIERINVOICE ---");
    for (const [k, val] of Object.entries(si)) {
      if (val !== null && val !== undefined) {
        console.log(`  ${k} = ${typeof val === 'object' ? JSON.stringify(val) : val}`);
      }
    }
  } else {
    console.log("\n--- NO SUPPLIERINVOICE FOUND ---");
    // Try broader search
    const siAll = await api("GET", `/supplierInvoice?invoiceDateFrom=${runDate}&invoiceDateTo=2026-03-23&fields=*`);
    const match = siAll.data.values?.find((s: any) => s.voucher?.id === voucherId);
    if (match) {
      console.log("--- SUPPLIERINVOICE (by date) ---");
      for (const [k, val] of Object.entries(match)) {
        if (val !== null && val !== undefined) {
          console.log(`  ${k} = ${typeof val === 'object' ? JSON.stringify(val) : val}`);
        }
      }
    } else {
      console.log("  TRULY NO SI ENTITY");
    }
  }

  // 3. Supplier
  const supRead = await api("GET", `/supplier/${supplierId}?fields=*`);
  const sup = supRead.data.value;
  console.log("\n--- SUPPLIER ---");
  console.log(`  id=${sup.id} name="${sup.name}" orgNumber=${sup.organizationNumber}`);
  console.log(`  ledgerAccount=${JSON.stringify(sup.ledgerAccount)}`);
  console.log(`  postalAddress=${JSON.stringify(sup.postalAddress)}`);
  console.log(`  physicalAddress=${JSON.stringify(sup.physicalAddress)}`);
  console.log(`  bankAccountPresentation=${JSON.stringify(sup.bankAccountPresentation)}`);
}

main().catch(console.error);
