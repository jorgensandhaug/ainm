// Test: manual VAT split with 3 postings when expense account is vatLocked to 0
// Expense (NET) to 7100, VAT to input-VAT account, supplier (-GROSS) to 2400
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { "Content-Type": "application/json", Authorization: AUTH };

const SUPPLIER_NAME = "VATLock Test Ltd";
const ORG_NO = "933672905"; // valid mod11 org
const INVOICE_NO = "INV-VLOCK-01";
const GROSS = 8500;
const NET = 6800;
const VAT_AMT = 1700;
const INV_DATE = "2026-03-22";
const DUE_DATE = "2026-04-21";
const DESC = "office services";

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: any = { method, headers: H };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  const json = await r.json();
  if (!r.ok) {
    console.error(`${method} ${path} → ${r.status}`);
    console.error(JSON.stringify(json, null, 2));
    throw new Error(`${r.status}`);
  }
  console.log(`${method} ${path} → ${r.status}`);
  return json;
}

async function main() {
  // Step 1: Create supplier
  const supRes = await api("POST", "/supplier", {
    name: SUPPLIER_NAME,
    organizationNumber: ORG_NO,
    isSupplier: true,
  });
  const supplierId = supRes.value.id;
  const supplierLedgerAccountId = supRes.value.ledgerAccount.id;
  console.log(`Supplier: id=${supplierId}, ledgerAcct=${supplierLedgerAccountId}`);

  // Step 2: Get account IDs for 7100 and the input VAT account
  const acct7100 = await api("GET", "/ledger/account?number=7100&fields=id,number,name,vatType,vatLocked");
  const acct7100Id = acct7100.values[0].id;
  console.log(`Account 7100: id=${acct7100Id}, vatLocked=${acct7100.values[0].vatLocked}`);

  // Find the input VAT account — typically 2710 or 2711
  // 2710 = Inngående merverdiavgift (høy sats)
  const acct2710 = await api("GET", "/ledger/account?number=2710&fields=id,number,name,vatType,vatLocked");
  console.log(`Account 2710: count=${acct2710.count}`);
  if (acct2710.count > 0) {
    console.log(`  id=${acct2710.values[0].id}, name=${acct2710.values[0].name}`);
  }

  // Also check 2711
  const acct2711 = await api("GET", "/ledger/account?number=2711&fields=id,number,name,vatType,vatLocked");
  console.log(`Account 2711: count=${acct2711.count}`);
  if (acct2711.count > 0) {
    console.log(`  id=${acct2711.values[0].id}, name=${acct2711.values[0].name}`);
  }

  // Step 3: importDocument
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
         xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
         xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:CustomizationID>urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0</cbc:CustomizationID>
  <cbc:ProfileID>urn:fdc:peppol.eu:2017:poacc:billing:01:1.0</cbc:ProfileID>
  <cbc:ID>${INVOICE_NO}</cbc:ID>
  <cbc:IssueDate>${INV_DATE}</cbc:IssueDate>
  <cbc:DueDate>${DUE_DATE}</cbc:DueDate>
  <cbc:InvoiceTypeCode>380</cbc:InvoiceTypeCode>
  <cbc:DocumentCurrencyCode>NOK</cbc:DocumentCurrencyCode>
  <cac:AccountingSupplierParty>
    <cac:Party>
      <cbc:EndpointID schemeID="0192">${ORG_NO}</cbc:EndpointID>
      <cac:PartyName><cbc:Name>${SUPPLIER_NAME}</cbc:Name></cac:PartyName>
      <cac:PostalAddress>
        <cbc:StreetName>Test Street 1</cbc:StreetName>
        <cbc:CityName>Oslo</cbc:CityName>
        <cbc:PostalZone>0001</cbc:PostalZone>
        <cac:Country><cbc:IdentificationCode>NO</cbc:IdentificationCode></cac:Country>
      </cac:PostalAddress>
      <cac:PartyTaxScheme>
        <cbc:CompanyID>NO${ORG_NO}MVA</cbc:CompanyID>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:PartyTaxScheme>
      <cac:PartyLegalEntity><cbc:RegistrationName>${SUPPLIER_NAME}</cbc:RegistrationName><cbc:CompanyID>${ORG_NO}</cbc:CompanyID></cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty>
    <cac:Party>
      <cbc:EndpointID schemeID="0192">987654325</cbc:EndpointID>
      <cac:PartyName><cbc:Name>Buyer Company</cbc:Name></cac:PartyName>
      <cac:PostalAddress>
        <cbc:StreetName>Hovedgata 1</cbc:StreetName>
        <cbc:CityName>Oslo</cbc:CityName>
        <cbc:PostalZone>0001</cbc:PostalZone>
        <cac:Country><cbc:IdentificationCode>NO</cbc:IdentificationCode></cac:Country>
      </cac:PostalAddress>
      <cac:PartyTaxScheme>
        <cbc:CompanyID>NO987654325MVA</cbc:CompanyID>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:PartyTaxScheme>
      <cac:PartyLegalEntity><cbc:RegistrationName>Buyer Company</cbc:RegistrationName><cbc:CompanyID>987654325</cbc:CompanyID></cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingCustomerParty>
  <cac:PaymentMeans>
    <cbc:PaymentMeansCode>30</cbc:PaymentMeansCode>
    <cbc:PaymentID>${INVOICE_NO}</cbc:PaymentID>
    <cac:PayeeFinancialAccount>
      <cbc:ID>NO0000000000000</cbc:ID>
    </cac:PayeeFinancialAccount>
  </cac:PaymentMeans>
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="NOK">${VAT_AMT}.00</cbc:TaxAmount>
    <cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="NOK">${NET}.00</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="NOK">${VAT_AMT}.00</cbc:TaxAmount>
      <cac:TaxCategory>
        <cbc:ID>S</cbc:ID>
        <cbc:Percent>25</cbc:Percent>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:TaxCategory>
    </cac:TaxSubtotal>
  </cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="NOK">${NET}.00</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="NOK">${NET}.00</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="NOK">${GROSS}.00</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="NOK">${GROSS}.00</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
  <cac:InvoiceLine>
    <cbc:ID>1</cbc:ID>
    <cbc:InvoicedQuantity unitCode="EA">1</cbc:InvoicedQuantity>
    <cbc:LineExtensionAmount currencyID="NOK">${NET}.00</cbc:LineExtensionAmount>
    <cac:Item>
      <cbc:Name>${DESC}</cbc:Name>
      <cac:ClassifiedTaxCategory>
        <cbc:ID>S</cbc:ID>
        <cbc:Percent>25</cbc:Percent>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:ClassifiedTaxCategory>
    </cac:Item>
    <cac:Price><cbc:PriceAmount currencyID="NOK">${NET}.00</cbc:PriceAmount></cac:Price>
  </cac:InvoiceLine>
</Invoice>`;

  const formData = new FormData();
  formData.append("file", new Blob([xml], { type: "application/xml" }), `${INVOICE_NO}.xml`);

  const impRes = await fetch(`${BASE}/ledger/voucher/importDocument`, {
    method: "POST",
    headers: { Authorization: AUTH },
    body: formData,
  });
  const impJson = await impRes.json();
  if (!impRes.ok) {
    console.error("importDocument →", impRes.status);
    console.error(JSON.stringify(impJson, null, 2));
    throw new Error("importDocument failed");
  }
  console.log(`POST importDocument → ${impRes.status}`);
  const voucherId = impJson.values[0].id;
  const voucherVersion = impJson.values[0].version;
  console.log(`Voucher: id=${voucherId}, version=${voucherVersion}`);

  // Step 4: Verify SI
  const siRes = await api("GET", `/supplierInvoice?voucherId=${voucherId}&invoiceDateFrom=2026-01-01&invoiceDateTo=2026-12-31&fields=*`);
  if (siRes.count > 0) {
    const si = siRes.values[0];
    console.log(`SI: amount=${si.amount}, amountExcludingVat=${si.amountExcludingVat}, invoiceNumber=${si.invoiceNumber}`);
  }

  // Step 5: Try 3-posting approach — expense (NET, no VAT) + manual VAT + supplier (-GROSS)
  // But we don't know if a manual VAT posting is needed/accepted. Let me try with just the
  // expense account posting with no vatType.
  // The key question: does importDocument auto-create any postings?

  // First check current voucher state (postings from importDocument)
  const vState = await api("GET", `/ledger/voucher/${voucherId}?fields=*`);
  console.log(`\nCurrent voucher postings count: ${vState.value.postings?.length}`);
  console.log(`Current voucher: ${JSON.stringify(vState.value, null, 2)}`);

  // Get posting details
  if (vState.value.postings?.length > 0) {
    for (const p of vState.value.postings) {
      const pd = await api("GET", `/ledger/posting/${p.id}?fields=*`);
      console.log(`\nPosting ${p.id}:`);
      console.log(JSON.stringify(pd.value, null, 2));
    }
  }

  // Now try PUT with 3 postings: expense (NET) + VAT (VAT_AMT) + supplier (-GROSS)
  // Need the VAT input account id
  let vatAccountId: number;
  if (acct2710.count > 0) {
    vatAccountId = acct2710.values[0].id;
  } else if (acct2711.count > 0) {
    vatAccountId = acct2711.values[0].id;
  } else {
    // Search for any account starting with 27 that might be VAT input
    const vatAccts = await api("GET", "/ledger/account?numberFrom=2700&numberTo=2720&fields=id,number,name");
    console.log("\nVAT-range accounts:");
    for (const a of vatAccts.values || []) {
      console.log(`  ${a.number}: ${a.name} (id=${a.id})`);
    }
    throw new Error("Need VAT account");
  }
  console.log(`\nUsing VAT account id=${vatAccountId}`);

  // PUT postings with manual VAT split
  const putRes = await api("PUT", `/ledger/voucher/${voucherId}?sendToLedger=false`, {
    version: voucherVersion,
    postings: [
      {
        row: 1,
        date: INV_DATE,
        description: DESC,
        account: { id: acct7100Id },
        // no vatType — account is locked to 0
        amount: NET,
        amountCurrency: NET,
        amountGross: NET, // no gross inflation since no VAT on this posting
        amountGrossCurrency: NET,
      },
      {
        row: 2,
        date: INV_DATE,
        description: DESC,
        account: { id: vatAccountId },
        amount: VAT_AMT,
        amountCurrency: VAT_AMT,
        amountGross: VAT_AMT,
        amountGrossCurrency: VAT_AMT,
      },
      {
        row: 3,
        date: INV_DATE,
        description: DESC,
        account: { id: supplierLedgerAccountId },
        supplier: { id: supplierId },
        amount: -GROSS,
        amountCurrency: -GROSS,
        amountGross: -GROSS,
        amountGrossCurrency: -GROSS,
        invoiceNumber: INVOICE_NO,
        termOfPayment: DUE_DATE,
      },
    ],
  });
  const postingsVersion = putRes.value.version;
  console.log(`PUT postings done, version=${postingsVersion}`);

  // Step 6: Book
  const bookRes = await api("PUT", `/ledger/voucher/${voucherId}?sendToLedger=true`, {
    version: postingsVersion,
    voucherType: { name: "Leverandørfaktura" },
  });
  console.log(`Booked: number=${bookRes.value.number}`);

  // Step 7: Verify final voucher state
  const finalV = await api("GET", `/ledger/voucher/${voucherId}?fields=*`);
  console.log(`\nFinal voucher:`);
  console.log(JSON.stringify(finalV.value, null, 2));

  // Get all posting details
  for (const p of finalV.value.postings || []) {
    const pd = await api("GET", `/ledger/posting/${p.id}?fields=*`);
    console.log(`\nFinal posting ${p.id}:`);
    console.log(JSON.stringify(pd.value, null, 2));
  }
}

main().catch(e => { console.error(e); process.exit(1); });
