// Sandbox test: can we combine the postings PUT and booking PUT into one call?
// Also test: can we skip GET /ledger/account by using account: { number: N, name: "..." }?

const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa(`0:${TOKEN}`);
const headers = { Authorization: AUTH, "Content-Type": "application/json" };

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: any = { method, headers: { ...headers } };
  if (body !== undefined) opts.body = typeof body === "string" ? body : JSON.stringify(body);
  const res = await fetch(url, opts);
  const text = await res.text();
  console.log(`${method} ${path} → ${res.status}`);
  if (!res.ok) console.log("ERROR:", text.slice(0, 500));
  return { ok: res.ok, status: res.status, data: text ? JSON.parse(text) : null };
}

async function apiFormData(path: string, formData: FormData) {
  const url = `${BASE}${path}`;
  const res = await fetch(url, { method: "POST", headers: { Authorization: AUTH }, body: formData });
  const text = await res.text();
  console.log(`POST ${path} → ${res.status}`);
  if (!res.ok) console.log("ERROR:", text.slice(0, 500));
  return { ok: res.ok, status: res.status, data: text ? JSON.parse(text) : null };
}

const TS = Date.now();
const SUPPLIER_NAME = `Sandbox4call ${TS}`;
const ORG_NR = "927720523";
const INVOICE_NR = `INV-SB4-${TS}`;
const DATE = "2026-03-21";
const DESC = "Bürodienstleistungen";
const GROSS = 55950;
const NET = 44760;
const VAT = 11190;

async function main() {
  // Step 1: Create supplier
  const s = await api("POST", "/supplier", { name: SUPPLIER_NAME, organizationNumber: ORG_NR });
  if (!s.ok) return;
  const supplierId = s.data.value.id;
  const supplierLedgerAccountId = s.data.value.ledgerAccount.id;
  console.log(`Supplier: id=${supplierId}, ledgerAcct=${supplierLedgerAccountId}`);

  // Step 2: GET account — but first, let's see the account 7000 details
  const acct = await api("GET", "/ledger/account?number=7000&isApplicableForSupplierInvoice=true&fields=*");
  if (!acct.ok) return;
  const acctId = acct.data.values[0].id;
  const acctName = acct.data.values[0].name;
  console.log(`Account 7000: id=${acctId}, name="${acctName}"`);

  // Step 3: Import EHF XML
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
         xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
         xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:CustomizationID>urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0</cbc:CustomizationID>
  <cbc:ProfileID>urn:fdc:peppol.eu:2017:poacc:billing:01:1.0</cbc:ProfileID>
  <cbc:ID>${INVOICE_NR}</cbc:ID>
  <cbc:IssueDate>${DATE}</cbc:IssueDate>
  <cbc:DueDate>${DATE}</cbc:DueDate>
  <cbc:InvoiceTypeCode>380</cbc:InvoiceTypeCode>
  <cbc:DocumentCurrencyCode>NOK</cbc:DocumentCurrencyCode>
  <cac:AccountingSupplierParty>
    <cac:Party>
      <cbc:EndpointID schemeID="0192">${ORG_NR}</cbc:EndpointID>
      <cac:PartyName><cbc:Name>${SUPPLIER_NAME}</cbc:Name></cac:PartyName>
      <cac:PostalAddress><cbc:StreetName>Test</cbc:StreetName><cbc:CityName>Oslo</cbc:CityName><cbc:PostalZone>0001</cbc:PostalZone><cac:Country><cbc:IdentificationCode>NO</cbc:IdentificationCode></cac:Country></cac:PostalAddress>
      <cac:PartyTaxScheme><cbc:CompanyID>NO${ORG_NR}MVA</cbc:CompanyID><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:PartyTaxScheme>
      <cac:PartyLegalEntity><cbc:RegistrationName>${SUPPLIER_NAME}</cbc:RegistrationName><cbc:CompanyID schemeID="0192">${ORG_NR}</cbc:CompanyID></cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty>
    <cac:Party>
      <cbc:EndpointID schemeID="0192">999999999</cbc:EndpointID>
      <cac:PartyName><cbc:Name>Buyer AS</cbc:Name></cac:PartyName>
      <cac:PostalAddress><cbc:StreetName>St</cbc:StreetName><cbc:CityName>Oslo</cbc:CityName><cbc:PostalZone>0001</cbc:PostalZone><cac:Country><cbc:IdentificationCode>NO</cbc:IdentificationCode></cac:Country></cac:PostalAddress>
      <cac:PartyLegalEntity><cbc:RegistrationName>Buyer AS</cbc:RegistrationName><cbc:CompanyID schemeID="0192">999999999</cbc:CompanyID></cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingCustomerParty>
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="NOK">${VAT}</cbc:TaxAmount>
    <cac:TaxSubtotal><cbc:TaxableAmount currencyID="NOK">${NET}</cbc:TaxableAmount><cbc:TaxAmount currencyID="NOK">${VAT}</cbc:TaxAmount><cac:TaxCategory><cbc:ID>S</cbc:ID><cbc:Percent>25</cbc:Percent><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:TaxCategory></cac:TaxSubtotal>
  </cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="NOK">${NET}</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="NOK">${NET}</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="NOK">${GROSS}</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="NOK">${GROSS}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
  <cac:InvoiceLine>
    <cbc:ID>1</cbc:ID>
    <cbc:InvoicedQuantity unitCode="EA">1</cbc:InvoicedQuantity>
    <cbc:LineExtensionAmount currencyID="NOK">${NET}</cbc:LineExtensionAmount>
    <cac:Item><cbc:Name>${DESC}</cbc:Name><cac:ClassifiedTaxCategory><cbc:ID>S</cbc:ID><cbc:Percent>25</cbc:Percent><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:ClassifiedTaxCategory></cac:Item>
    <cac:Price><cbc:PriceAmount currencyID="NOK">${NET}</cbc:PriceAmount></cac:Price>
  </cac:InvoiceLine>
</Invoice>`;

  const blob = new Blob([xml], { type: "application/xml" });
  const fd = new FormData();
  fd.append("file", blob, `${INVOICE_NR}.xml`);
  const imp = await apiFormData("/ledger/voucher/importDocument", fd);
  if (!imp.ok) return;
  const vId = imp.data.values[0].id;
  let vVer = imp.data.values[0].version;
  console.log(`Imported: id=${vId}, version=${vVer}`);

  // TEST A: Can we do PUT with postings + sendToLedger=true in one call?
  console.log("\n--- TEST A: Single PUT with postings + sendToLedger=true ---");
  const testA = await api("PUT", `/ledger/voucher/${vId}?sendToLedger=true`, {
    version: vVer,
    postings: [
      { row: 1, date: DATE, description: DESC, account: { id: acctId }, vatType: { id: 1 }, amount: NET, amountCurrency: NET, amountGross: GROSS, amountGrossCurrency: GROSS },
      { row: 2, date: DATE, description: DESC, account: { id: supplierLedgerAccountId }, supplier: { id: supplierId }, amount: -GROSS, amountCurrency: -GROSS, amountGross: -GROSS, amountGrossCurrency: -GROSS, invoiceNumber: INVOICE_NR, termOfPayment: DATE },
    ],
  });
  if (testA.ok) {
    console.log("TEST A SUCCEEDED! Number:", testA.data.value?.number);
    console.log("Postings:", JSON.stringify(testA.data.value?.postings?.map((p: any) => ({ row: p.row, acct: p.account?.number, amt: p.amount, amtGross: p.amountGross, vat: p.vatType?.id }))));
  } else {
    console.log("TEST A FAILED (expected). Continuing with two-step...");
    // Now do the standard two-step
    const putA = await api("PUT", `/ledger/voucher/${vId}?sendToLedger=false`, {
      version: vVer,
      postings: [
        { row: 1, date: DATE, description: DESC, account: { id: acctId }, vatType: { id: 1 }, amount: NET, amountCurrency: NET, amountGross: GROSS, amountGrossCurrency: GROSS },
        { row: 2, date: DATE, description: DESC, account: { id: supplierLedgerAccountId }, supplier: { id: supplierId }, amount: -GROSS, amountCurrency: -GROSS, amountGross: -GROSS, amountGrossCurrency: -GROSS, invoiceNumber: INVOICE_NR, termOfPayment: DATE },
      ],
    });
    if (putA.ok) {
      vVer = putA.data.value.version;
      const bookA = await api("PUT", `/ledger/voucher/${vId}?sendToLedger=true`, { version: vVer });
      if (bookA.ok) console.log("Two-step booking succeeded, number:", bookA.data.value?.number);
    }
  }

  // TEST B: Can we skip GET /ledger/account by using account: { number: 7000, name: "..." }?
  // Create a second supplier+import for this test
  console.log("\n--- TEST B: Skip GET account, use number+name ---");
  const s2 = await api("POST", "/supplier", { name: `SB4call-B ${TS}`, organizationNumber: "910079457" });
  if (!s2.ok) return;
  const sid2 = s2.data.value.id;
  const slid2 = s2.data.value.ledgerAccount.id;

  const xml2 = xml.replace(INVOICE_NR, `INV-SB4B-${TS}`).replace(SUPPLIER_NAME, `SB4call-B ${TS}`);
  const blob2 = new Blob([xml2], { type: "application/xml" });
  const fd2 = new FormData();
  fd2.append("file", blob2, `INV-SB4B-${TS}.xml`);
  const imp2 = await apiFormData("/ledger/voucher/importDocument", fd2);
  if (!imp2.ok) return;
  const vId2 = imp2.data.values[0].id;
  let vVer2 = imp2.data.values[0].version;

  const testB = await api("PUT", `/ledger/voucher/${vId2}?sendToLedger=false`, {
    version: vVer2,
    postings: [
      { row: 1, date: DATE, description: DESC, account: { number: 7000, name: acctName }, vatType: { id: 1 }, amount: NET, amountCurrency: NET, amountGross: GROSS, amountGrossCurrency: GROSS },
      { row: 2, date: DATE, description: DESC, account: { id: slid2 }, supplier: { id: sid2 }, amount: -GROSS, amountCurrency: -GROSS, amountGross: -GROSS, amountGrossCurrency: -GROSS, invoiceNumber: `INV-SB4B-${TS}`, termOfPayment: DATE },
    ],
  });
  if (testB.ok) {
    console.log("TEST B SUCCEEDED! Using number+name works — can skip GET /ledger/account");
    vVer2 = testB.data.value.version;
    console.log("Postings:", JSON.stringify(testB.data.value?.postings?.map((p: any) => ({ row: p.row, acct: p.account?.number, amt: p.amount }))));
    // Book it
    const bookB = await api("PUT", `/ledger/voucher/${vId2}?sendToLedger=true`, { version: vVer2 });
    if (bookB.ok) console.log("TEST B booked, number:", bookB.data.value?.number);
  } else {
    console.log("TEST B FAILED — number+name does NOT work, GET /ledger/account is required");
  }
}

main().catch(e => console.error("FATAL:", e.message));
