const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = `Basic ${btoa("0:" + TOKEN)}`;

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const headers: Record<string, string> = { Authorization: AUTH, "Content-Type": "application/json" };
  const res = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let data; try { data = JSON.parse(text); } catch { data = text; }
  console.log(`${method} ${path.substring(0, 100)} → ${res.status}`);
  return { status: res.status, ok: res.ok, data };
}

async function main() {
  const date = "2026-03-22";
  const gross = 12500;
  const net = 10000;

  const sRes = await api("POST", "/supplier", { name: "PutAmtSI AS", organizationNumber: "823456786" });
  const supplierId = sRes.data.value.id;
  const supplierLedger = sRes.data.value.ledgerAccount.id;
  const acctRes = await api("GET", "/ledger/account?number=7140&isApplicableForSupplierInvoice=true&fields=id");
  const expAcctId = acctRes.data.values[0].id;
  const vtRes = await api("GET", "/ledger/voucherType?name=Leverand%C3%B8rfaktura&fields=id");
  const vtId = vtRes.data.values[0].id;

  // Create SI
  const si = await api("POST", "/supplierInvoice", {
    invoiceDate: date,
    invoiceNumber: "INV-PAMT-001",
    supplier: { id: supplierId },
    amount: gross,
    amountExcludingVat: net,
    currency: { id: 1 },
    voucher: {
      date, description: "kontortjenester",
      voucherType: { id: vtId },
      postings: [
        { row: 1, date, description: "kontortjenester", account: { id: expAcctId }, vatType: { id: 1 }, amount: net, amountCurrency: net, amountGross: gross, amountGrossCurrency: gross },
        { row: 2, date, description: "kontortjenester", account: { id: supplierLedger }, supplier: { id: supplierId }, amount: -gross, amountCurrency: -gross, amountGross: -gross, amountGrossCurrency: -gross, invoiceNumber: "INV-PAMT-001", termOfPayment: date },
      ],
    },
  });
  const siId = si.data.value.id;
  const siVersion = si.data.value.version;
  const voucherId = si.data.value.voucher.id;
  console.log(`  SI id=${siId} v=${siVersion} voucher=${voucherId} amount=${si.data.value.amount}`);

  // Try 1: PUT /supplierInvoice to set amounts
  console.log("\n=== PUT supplierInvoice ===");
  const put1 = await api("PUT", `/supplierInvoice/${siId}`, {
    id: siId,
    version: siVersion,
    invoiceDate: date,
    invoiceNumber: "INV-PAMT-001",
    supplier: { id: supplierId },
    amount: gross,
    amountExcludingVat: net,
    currency: { id: 1 },
    voucher: { id: voucherId },
  });
  console.log("  PUT result:", put1.status, JSON.stringify(put1.data).substring(0, 500));

  // Try 2: PUT without voucher
  if (!put1.ok) {
    const put2 = await api("PUT", `/supplierInvoice/${siId}`, {
      id: siId,
      version: siVersion,
      invoiceDate: date,
      invoiceNumber: "INV-PAMT-001",
      supplier: { id: supplierId },
      amount: gross,
      amountExcludingVat: net,
    });
    console.log("  PUT2 result:", put2.status, JSON.stringify(put2.data).substring(0, 500));
  }

  // Also: Compare with importDocument to see what amounts look like
  console.log("\n=== importDocument comparison ===");
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
         xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
         xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:CustomizationID>urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0</cbc:CustomizationID>
  <cbc:ProfileID>urn:fdc:peppol.eu:2017:poacc:billing:01:1.0</cbc:ProfileID>
  <cbc:ID>INV-CMP-001</cbc:ID>
  <cbc:IssueDate>${date}</cbc:IssueDate>
  <cbc:DueDate>${date}</cbc:DueDate>
  <cbc:InvoiceTypeCode>380</cbc:InvoiceTypeCode>
  <cbc:DocumentCurrencyCode>NOK</cbc:DocumentCurrencyCode>
  <cac:AccountingSupplierParty><cac:Party>
    <cbc:EndpointID schemeID="0192">823456786</cbc:EndpointID>
    <cac:PartyName><cbc:Name>PutAmtSI AS</cbc:Name></cac:PartyName>
    <cac:PostalAddress><cbc:StreetName>T 1</cbc:StreetName><cbc:CityName>Oslo</cbc:CityName><cbc:PostalZone>0001</cbc:PostalZone><cac:Country><cbc:IdentificationCode>NO</cbc:IdentificationCode></cac:Country></cac:PostalAddress>
    <cac:PartyTaxScheme><cbc:CompanyID>NO823456786MVA</cbc:CompanyID><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:PartyTaxScheme>
    <cac:PartyLegalEntity><cbc:RegistrationName>PutAmtSI AS</cbc:RegistrationName><cbc:CompanyID schemeID="0192">823456786</cbc:CompanyID></cac:PartyLegalEntity>
  </cac:Party></cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty><cac:Party>
    <cbc:EndpointID schemeID="0192">999999999</cbc:EndpointID>
    <cac:PartyName><cbc:Name>My Co</cbc:Name></cac:PartyName>
    <cac:PostalAddress><cbc:StreetName>S 1</cbc:StreetName><cbc:CityName>Oslo</cbc:CityName><cbc:PostalZone>0001</cbc:PostalZone><cac:Country><cbc:IdentificationCode>NO</cbc:IdentificationCode></cac:Country></cac:PostalAddress>
    <cac:PartyLegalEntity><cbc:RegistrationName>My Co</cbc:RegistrationName></cac:PartyLegalEntity>
  </cac:Party></cac:AccountingCustomerParty>
  <cac:TaxTotal><cbc:TaxAmount currencyID="NOK">2500</cbc:TaxAmount><cac:TaxSubtotal><cbc:TaxableAmount currencyID="NOK">10000</cbc:TaxableAmount><cbc:TaxAmount currencyID="NOK">2500</cbc:TaxAmount><cac:TaxCategory><cbc:ID>S</cbc:ID><cbc:Percent>25</cbc:Percent><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:TaxCategory></cac:TaxSubtotal></cac:TaxTotal>
  <cac:LegalMonetaryTotal><cbc:LineExtensionAmount currencyID="NOK">10000</cbc:LineExtensionAmount><cbc:TaxExclusiveAmount currencyID="NOK">10000</cbc:TaxExclusiveAmount><cbc:TaxInclusiveAmount currencyID="NOK">12500</cbc:TaxInclusiveAmount><cbc:PayableAmount currencyID="NOK">12500</cbc:PayableAmount></cac:LegalMonetaryTotal>
  <cac:InvoiceLine><cbc:ID>1</cbc:ID><cbc:InvoicedQuantity unitCode="EA">1</cbc:InvoicedQuantity><cbc:LineExtensionAmount currencyID="NOK">10000</cbc:LineExtensionAmount><cac:Item><cbc:Name>kontortjenester</cbc:Name><cac:ClassifiedTaxCategory><cbc:ID>S</cbc:ID><cbc:Percent>25</cbc:Percent><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:ClassifiedTaxCategory></cac:Item><cac:Price><cbc:PriceAmount currencyID="NOK">10000</cbc:PriceAmount></cac:Price></cac:InvoiceLine>
</Invoice>`;
  const form = new FormData();
  form.append("file", new Blob([xml], { type: "application/xml" }), "inv.xml");
  const imp = await api("POST", "/ledger/voucher/importDocument", form as any);
  if (imp.ok) {
    const impVoucherId = imp.data.values[0].id;
    // Get SI for this import
    const siImp = await api("GET", `/supplierInvoice?invoiceDateFrom=${date}&invoiceDateTo=2026-03-23&fields=id,invoiceNumber,amount,amountExcludingVat,amountCurrency,amountExcludingVatCurrency,outstandingAmount,supplier(id,name),voucher(id,number)`);
    for (const s of siImp.data.values || []) {
      if (s.voucher?.id === impVoucherId) {
        console.log(`  importDoc SI: id=${s.id} amount=${s.amount} amountExVat=${s.amountExcludingVat} outstanding=${s.outstandingAmount} invoiceNum="${s.invoiceNumber}"`);
        console.log(`    supplier: ${s.supplier?.id} ${s.supplier?.name}`);
      }
    }
  }

  // Now compare: read the POST /supplierInvoice one after booking  
  // First book it
  const vRead = await api("GET", `/ledger/voucher/${voucherId}?fields=id,version,date,voucherType(id),postings(id,version,row,date,account(id),vatType(id),supplier(id))`);
  const vd = vRead.data.value;
  const updatedPostings = vd.postings.map((p: any, i: number) => {
    if (p.account.id === expAcctId) return { ...p, description: "kontortjenester", amount: net, amountCurrency: net, amountGross: gross, amountGrossCurrency: gross };
    return { ...p, description: "kontortjenester", amount: -gross, amountCurrency: -gross, amountGross: -gross, amountGrossCurrency: -gross, invoiceNumber: "INV-PAMT-001", termOfPayment: date };
  });
  const book = await api("PUT", `/ledger/voucher/${voucherId}`, {
    id: vd.id, version: vd.version, date: vd.date, voucherType: vd.voucherType, postings: updatedPostings,
  });
  console.log(`  Book: ${book.status} ${book.ok ? 'OK num=' + book.data.value?.number : ''}`);

  // Read SI after booking
  const siAfter = await api("GET", `/supplierInvoice/${siId}?fields=id,invoiceNumber,amount,amountExcludingVat,amountCurrency,amountExcludingVatCurrency,outstandingAmount,supplier(id,name),voucher(id,number)`);
  if (siAfter.ok) {
    const s = siAfter.data.value;
    console.log(`\n  POST SI after book: id=${s.id} amount=${s.amount} amountExVat=${s.amountExcludingVat} outstanding=${s.outstandingAmount}`);
    console.log(`    supplier: ${s.supplier?.id} ${s.supplier?.name}`);
    console.log(`    voucher: num=${s.voucher?.number}`);
  }
}

main().catch(console.error);
