// Test: PUT /supplierInvoice/voucher/{id}/postings with OrderLinePosting[] body
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa(`0:${TOKEN}`);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

async function api(method: string, path: string, body?: any, extraHeaders?: Record<string, string>) {
  const url = `${BASE}${path}`;
  const opts: RequestInit = {
    method,
    headers: extraHeaders ? { ...H, ...extraHeaders } : H,
  };
  if (body && !(body instanceof FormData)) opts.body = JSON.stringify(body);
  if (body instanceof FormData) {
    opts.body = body;
    opts.headers = { Authorization: AUTH };
  }
  const res = await fetch(url, opts);
  const text = await res.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  return { status: res.status, data: json };
}

function printFull(label: string, status: number, data: any) {
  console.log(`\n${"=".repeat(80)}`);
  console.log(`${label} => ${status}`);
  console.log("=".repeat(80));
  console.log(JSON.stringify(data, null, 2));
}

function buildEhfXml(opts: {
  invoiceNr: string;
  issueDate: string;
  supplierName: string;
  supplierOrg: string;
  grossAmount: number;
  netAmount: number;
  vatAmount: number;
}): string {
  const { invoiceNr, issueDate, supplierName, supplierOrg, grossAmount, netAmount, vatAmount } = opts;
  return `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
         xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
         xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:CustomizationID>urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0</cbc:CustomizationID>
  <cbc:ProfileID>urn:fdc:peppol.eu:2017:poacc:billing:01:1.0</cbc:ProfileID>
  <cbc:ID>${invoiceNr}</cbc:ID>
  <cbc:IssueDate>${issueDate}</cbc:IssueDate>
  <cbc:DueDate>${issueDate}</cbc:DueDate>
  <cbc:InvoiceTypeCode>380</cbc:InvoiceTypeCode>
  <cbc:DocumentCurrencyCode>NOK</cbc:DocumentCurrencyCode>
  <cac:AccountingSupplierParty>
    <cac:Party>
      <cbc:EndpointID schemeID="0192">${supplierOrg}</cbc:EndpointID>
      <cac:PartyIdentification>
        <cbc:ID schemeID="0192">${supplierOrg}</cbc:ID>
      </cac:PartyIdentification>
      <cac:PartyName>
        <cbc:Name>${supplierName}</cbc:Name>
      </cac:PartyName>
      <cac:PostalAddress>
        <cbc:StreetName>Testveien 1</cbc:StreetName>
        <cbc:CityName>Oslo</cbc:CityName>
        <cbc:PostalZone>0001</cbc:PostalZone>
        <cac:Country><cbc:IdentificationCode>NO</cbc:IdentificationCode></cac:Country>
      </cac:PostalAddress>
      <cac:PartyTaxScheme>
        <cbc:CompanyID>NO${supplierOrg}MVA</cbc:CompanyID>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:PartyTaxScheme>
      <cac:PartyLegalEntity>
        <cbc:RegistrationName>${supplierName}</cbc:RegistrationName>
        <cbc:CompanyID schemeID="0192">${supplierOrg}</cbc:CompanyID>
      </cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty>
    <cac:Party>
      <cbc:EndpointID schemeID="0192">999999999</cbc:EndpointID>
      <cac:PartyIdentification><cbc:ID schemeID="0192">999999999</cbc:ID></cac:PartyIdentification>
      <cac:PartyName>
        <cbc:Name>Test Buyer AS</cbc:Name>
      </cac:PartyName>
      <cac:PostalAddress>
        <cbc:StreetName>Testveien 2</cbc:StreetName>
        <cbc:CityName>Oslo</cbc:CityName>
        <cbc:PostalZone>0155</cbc:PostalZone>
        <cac:Country><cbc:IdentificationCode>NO</cbc:IdentificationCode></cac:Country>
      </cac:PostalAddress>
      <cac:PartyLegalEntity>
        <cbc:RegistrationName>Test Buyer AS</cbc:RegistrationName>
        <cbc:CompanyID schemeID="0192">999999999</cbc:CompanyID>
      </cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingCustomerParty>
  <cac:PaymentMeans>
    <cbc:PaymentMeansCode>30</cbc:PaymentMeansCode>
    <cac:PayeeFinancialAccount>
      <cbc:ID>NO1234567890123</cbc:ID>
    </cac:PayeeFinancialAccount>
  </cac:PaymentMeans>
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="NOK">${vatAmount.toFixed(2)}</cbc:TaxAmount>
    <cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="NOK">${netAmount.toFixed(2)}</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="NOK">${vatAmount.toFixed(2)}</cbc:TaxAmount>
      <cac:TaxCategory>
        <cbc:ID>S</cbc:ID>
        <cbc:Percent>25</cbc:Percent>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:TaxCategory>
    </cac:TaxSubtotal>
  </cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="NOK">${netAmount.toFixed(2)}</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="NOK">${netAmount.toFixed(2)}</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="NOK">${grossAmount.toFixed(2)}</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="NOK">${grossAmount.toFixed(2)}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
  <cac:InvoiceLine>
    <cbc:ID>1</cbc:ID>
    <cbc:InvoicedQuantity unitCode="EA">1</cbc:InvoicedQuantity>
    <cbc:LineExtensionAmount currencyID="NOK">${netAmount.toFixed(2)}</cbc:LineExtensionAmount>
    <cac:Item>
      <cbc:Name>kontortjenester</cbc:Name>
      <cac:ClassifiedTaxCategory>
        <cbc:ID>S</cbc:ID>
        <cbc:Percent>25</cbc:Percent>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:ClassifiedTaxCategory>
    </cac:Item>
    <cac:Price>
      <cbc:PriceAmount currencyID="NOK">${netAmount.toFixed(2)}</cbc:PriceAmount>
    </cac:Price>
  </cac:InvoiceLine>
</Invoice>`;
}

async function main() {
  const TS = Date.now();

  // STEP 1: Create supplier
  console.log("\n>>> STEP 1: Create supplier");
  const supplierBody = {
    name: `OLP Test AS ${TS}`,
    supplierNumber: 80000 + Math.floor(Math.random() * 10000),
    organizationNumber: "987654325",
    phoneNumber: "12345678",
    isSupplier: true,
  };
  const s1 = await api("POST", "/supplier", supplierBody);
  printFull("POST /supplier", s1.status, s1.data);
  if (s1.status >= 400) { console.log("ABORT: supplier creation failed"); return; }
  const supplierId = s1.data?.value?.id;
  console.log(`supplierId = ${supplierId}`);

  // STEP 2: Get expense account 6540
  console.log("\n>>> STEP 2: Get expense account 6540");
  const s2 = await api("GET", "/ledger/account?number=6540&isApplicableForSupplierInvoice=true&fields=*");
  printFull("GET /ledger/account?number=6540", s2.status, s2.data);
  const acct6540 = s2.data?.values?.[0];
  if (!acct6540) { console.log("ABORT: no account 6540 found"); return; }
  const expenseAcctId = acct6540.id;
  console.log(`expenseAcctId = ${expenseAcctId}`);

  // STEP 3: Import EHF document
  console.log("\n>>> STEP 3: Import EHF document via /ledger/voucher/importDocument");
  const xml = buildEhfXml({
    invoiceNr: `INV-OLP-${TS}`,
    issueDate: "2026-03-21",
    supplierName: `OLP Test AS ${TS}`,
    supplierOrg: "987654325",
    grossAmount: 42100,
    netAmount: 33680,
    vatAmount: 8420,
  });

  const formData = new FormData();
  const blob = new Blob([xml], { type: "application/xml" });
  formData.append("file", blob, "invoice.xml");

  const s3 = await api("POST", "/ledger/voucher/importDocument", formData);
  printFull("POST /ledger/voucher/importDocument", s3.status, s3.data);
  if (s3.status >= 400) { console.log("ABORT: import failed"); return; }
  // importDocument returns values[] array, not value
  const voucherId = s3.data?.values?.[0]?.id ?? s3.data?.value?.id;
  console.log(`voucherId = ${voucherId}`);
  if (!voucherId) { console.log("ABORT: no voucherId extracted"); return; }

  // STEP 4: Find the supplier invoice
  console.log("\n>>> STEP 4: Find SI by voucherId");
  // Try multiple approaches
  const s4a = await api("GET", `/supplierInvoice?voucherId=${voucherId}&invoiceDateFrom=2026-01-01&invoiceDateTo=2026-12-31&fields=*`);
  printFull("GET /supplierInvoice?voucherId=... (approach 1)", s4a.status, s4a.data);

  let si = s4a.data?.values?.[0];
  if (!si) {
    // Try without date filter
    const s4b = await api("GET", `/supplierInvoice?voucherId=${voucherId}&fields=*`);
    printFull("GET /supplierInvoice?voucherId=... (no date filter)", s4b.status, s4b.data);
    si = s4b.data?.values?.[0];
  }
  if (!si) {
    // Try searching by invoiceNumber
    const s4c = await api("GET", `/supplierInvoice?invoiceNumber=INV-OLP-${TS}&fields=*`);
    printFull("GET /supplierInvoice?invoiceNumber=... (approach 3)", s4c.status, s4c.data);
    si = s4c.data?.values?.[0];
  }
  if (!si) {
    // Try listing all recent SIs
    const s4d = await api("GET", `/supplierInvoice?invoiceDateFrom=2026-03-21&invoiceDateTo=2026-03-21&fields=*&count=5&sorting=id&order=desc`);
    printFull("GET /supplierInvoice (recent, approach 4)", s4d.status, s4d.data);
    // Find the one matching our voucher
    si = s4d.data?.values?.find((v: any) => v.voucher?.id === voucherId) ?? s4d.data?.values?.[0];
  }
  if (!si) { console.log("ABORT: no SI found by any method"); return; }
  const siId = si.id;
  console.log(`siId = ${siId}`);

  // Check existing orderLine structure
  console.log("\n>>> STEP 4b: Check existing orderLine");
  const orderLineId = si.orderLines?.[0]?.id;
  if (orderLineId) {
    const s4ol = await api("GET", `/order/orderline/${orderLineId}?fields=*`);
    printFull("GET /order/orderline/{id}?fields=*", s4ol.status, s4ol.data);
  }

  // STEP 5: PUT postings — the working format: no vatType, let account default handle it
  // Then immediately sendToLedger=true on the SAME call
  console.log("\n>>> STEP 5: PUT postings with sendToLedger=true (no vatType, clean voucher)");
  const body5 = [
    {
      posting: {
        date: "2026-03-21",
        description: "kontortjenester",
        account: { id: expenseAcctId },
        amount: 33680,
        amountCurrency: 33680,
        amountGross: 42100,
        amountGrossCurrency: 42100,
      },
    },
  ];
  console.log("Request body:", JSON.stringify(body5, null, 2));
  const s5 = await api("PUT", `/supplierInvoice/voucher/${voucherId}/postings?sendToLedger=true`, body5);
  printFull("PUT postings sendToLedger=true", s5.status, s5.data);

  // STEP 6: Check SI state
  console.log("\n>>> STEP 6: Check SI state after postings+sendToLedger");
  const s6 = await api("GET", `/supplierInvoice/${siId}?fields=*`);
  printFull("GET /supplierInvoice/{siId}?fields=*", s6.status, s6.data);

  // STEP 7: Check voucher state
  console.log("\n>>> STEP 7: Check voucher state");
  const s7 = await api("GET", `/ledger/voucher/${voucherId}?fields=*`);
  printFull("GET /ledger/voucher/{voucherId}?fields=*", s7.status, s7.data);

  // STEP 7b: Get individual postings details
  if (s7.data?.value?.postings?.length) {
    console.log("\n>>> STEP 7b: Get posting details");
    for (const p of s7.data.value.postings) {
      const rp = await api("GET", `/ledger/posting/${p.id}?fields=*`);
      printFull(`Posting ${p.id}`, rp.status, rp.data);
    }
  }

  // STEP 8: Now test with vatType — use a fresh voucher
  console.log("\n\n========== FRESH INVOICE: testing vatType approaches ==========\n");

  // Create a 2nd EHF invoice
  const xml2 = buildEhfXml({
    invoiceNr: `INV-OLP2-${TS}`,
    issueDate: "2026-03-21",
    supplierName: `OLP Test AS ${TS}`,
    supplierOrg: "987654325",
    grossAmount: 42100,
    netAmount: 33680,
    vatAmount: 8420,
  });
  const fd2 = new FormData();
  fd2.append("file", new Blob([xml2], { type: "application/xml" }), "invoice2.xml");
  const imp2 = await api("POST", "/ledger/voucher/importDocument", fd2);
  printFull("Import 2nd invoice", imp2.status, imp2.data);
  const vid2 = imp2.data?.values?.[0]?.id;
  if (!vid2) { console.log("ABORT: 2nd import failed"); return; }

  const si2r = await api("GET", `/supplierInvoice?voucherId=${vid2}&invoiceDateFrom=2026-01-01&invoiceDateTo=2026-12-31&fields=*`);
  const si2 = si2r.data?.values?.[0];
  if (!si2) { console.log("ABORT: no SI2 found"); return; }
  console.log(`SI2 id=${si2.id}, voucher=${vid2}`);

  // Try with vatType but using amountGross = amountNet (let the system compute VAT)
  console.log("\n>>> STEP 8a: PUT with vatType {id:1} but amount=amountGross (same value)");
  const body8a = [
    {
      posting: {
        date: "2026-03-21",
        description: "kontortjenester",
        account: { id: expenseAcctId },
        vatType: { id: 1 },
        amount: 42100,
        amountCurrency: 42100,
        amountGross: 42100,
        amountGrossCurrency: 42100,
      },
    },
  ];
  const s8a = await api("PUT", `/supplierInvoice/voucher/${vid2}/postings?sendToLedger=false`, body8a);
  printFull("Attempt: vatType id:1, amount=gross", s8a.status, s8a.data);

  if (s8a.status >= 400) {
    // Try with vatType but amountGross only, no amount
    console.log("\n>>> STEP 8b: PUT with vatType {id:1}, only amountGross fields");
    const body8b = [
      {
        posting: {
          date: "2026-03-21",
          description: "kontortjenester",
          account: { id: expenseAcctId },
          vatType: { id: 1 },
          amountGross: 42100,
          amountGrossCurrency: 42100,
        },
      },
    ];
    const s8b = await api("PUT", `/supplierInvoice/voucher/${vid2}/postings?sendToLedger=false`, body8b);
    printFull("Attempt: vatType id:1, amountGross only", s8b.status, s8b.data);
  }

  if (s8a.status >= 400) {
    // Try with currency wrapper
    console.log("\n>>> STEP 8c: PUT with vatType {id:1} + currency");
    const body8c = [
      {
        posting: {
          date: "2026-03-21",
          description: "kontortjenester",
          account: { id: expenseAcctId },
          vatType: { id: 1 },
          amount: 33680,
          amountCurrency: 33680,
          amountGross: 42100,
          amountGrossCurrency: 42100,
          currency: { id: 1 },
        },
      },
    ];
    const s8c = await api("PUT", `/supplierInvoice/voucher/${vid2}/postings?sendToLedger=false`, body8c);
    printFull("Attempt: vatType id:1 + currency", s8c.status, s8c.data);
  }

  // Check final state of 2nd voucher
  console.log("\n>>> Final voucher2 state:");
  const fv2 = await api("GET", `/ledger/voucher/${vid2}?fields=*`);
  printFull("Voucher2 final", fv2.status, fv2.data);
  if (fv2.data?.value?.postings?.length) {
    for (const p of fv2.data.value.postings) {
      const rp = await api("GET", `/ledger/posting/${p.id}?fields=*`);
      printFull(`Posting2 ${p.id}`, rp.status, rp.data);
    }
  }

  console.log("\n>>> DONE");
}

main().catch(console.error);
