/**
 * 307-task23-supplier-invoice-test.ts
 *
 * HYPOTHESIS: Check 1 requires supplier invoices as ENTITIES (via importDocument),
 * paid via :addPayment — not manual voucher postings (DR 2400 / CR 1920).
 */

const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + Buffer.from("0:" + TOKEN).toString("base64");

async function api(method: string, path: string, body?: any, isForm = false): Promise<any> {
  const url = `${BASE}/${path}`;
  const headers: Record<string, string> = { Authorization: AUTH };
  if (body && !isForm) headers["Content-Type"] = "application/json";
  const opts: RequestInit = { method, headers };
  if (body) opts.body = isForm ? body : JSON.stringify(body);
  const res = await fetch(url, opts);
  const text = await res.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  const status = res.ok ? "OK " : "ERR";
  console.log(`${status} ${res.status} ${method} /${path.split("?")[0]}`);
  if (!res.ok) {
    const errText = typeof json === "string" ? json.slice(0, 500) : JSON.stringify(json).slice(0, 500);
    console.error(`    ${errText}`);
  }
  return json;
}

function makeEhfXml(p: {
  invoiceNumber: string; issueDate: string; dueDate: string;
  supplierName: string; supplierOrgNr: string;
  buyerName: string; buyerOrgNr: string;
  lineDescription: string; lineAmount: number; vatPercent: number;
}): string {
  const vatAmt = Math.round(p.lineAmount * p.vatPercent / 100 * 100) / 100;
  const total = p.lineAmount + vatAmt;
  return `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
         xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
         xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:CustomizationID>urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0</cbc:CustomizationID>
  <cbc:ProfileID>urn:fdc:peppol.eu:2017:poacc:billing:01:1.0</cbc:ProfileID>
  <cbc:ID>${p.invoiceNumber}</cbc:ID>
  <cbc:IssueDate>${p.issueDate}</cbc:IssueDate>
  <cbc:DueDate>${p.dueDate}</cbc:DueDate>
  <cbc:InvoiceTypeCode>380</cbc:InvoiceTypeCode>
  <cbc:DocumentCurrencyCode>NOK</cbc:DocumentCurrencyCode>
  <cac:AccountingSupplierParty>
    <cac:Party>
      <cbc:EndpointID schemeID="0192">${p.supplierOrgNr}</cbc:EndpointID>
      <cac:PartyIdentification><cbc:ID schemeID="0192">${p.supplierOrgNr}</cbc:ID></cac:PartyIdentification>
      <cac:PartyName><cbc:Name>${p.supplierName}</cbc:Name></cac:PartyName>
      <cac:PostalAddress>
        <cbc:StreetName>Testveien 1</cbc:StreetName>
        <cbc:CityName>Oslo</cbc:CityName>
        <cbc:PostalZone>0001</cbc:PostalZone>
        <cac:Country><cbc:IdentificationCode>NO</cbc:IdentificationCode></cac:Country>
      </cac:PostalAddress>
      <cac:PartyTaxScheme>
        <cbc:CompanyID>NO${p.supplierOrgNr}MVA</cbc:CompanyID>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:PartyTaxScheme>
      <cac:PartyLegalEntity><cbc:RegistrationName>${p.supplierName}</cbc:RegistrationName></cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty>
    <cac:Party>
      <cbc:EndpointID schemeID="0192">${p.buyerOrgNr}</cbc:EndpointID>
      <cac:PartyIdentification><cbc:ID schemeID="0192">${p.buyerOrgNr}</cbc:ID></cac:PartyIdentification>
      <cac:PartyName><cbc:Name>${p.buyerName}</cbc:Name></cac:PartyName>
      <cac:PostalAddress>
        <cbc:StreetName>Testgata 1</cbc:StreetName>
        <cbc:CityName>Oslo</cbc:CityName>
        <cbc:PostalZone>0001</cbc:PostalZone>
        <cac:Country><cbc:IdentificationCode>NO</cbc:IdentificationCode></cac:Country>
      </cac:PostalAddress>
      <cac:PartyLegalEntity><cbc:RegistrationName>${p.buyerName}</cbc:RegistrationName></cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingCustomerParty>
  <cac:PaymentMeans>
    <cbc:PaymentMeansCode>30</cbc:PaymentMeansCode>
    <cbc:PaymentID>${p.invoiceNumber}</cbc:PaymentID>
    <cac:PayeeFinancialAccount>
      <cbc:ID>12345678903</cbc:ID>
    </cac:PayeeFinancialAccount>
  </cac:PaymentMeans>
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="NOK">${vatAmt.toFixed(2)}</cbc:TaxAmount>
    <cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="NOK">${p.lineAmount.toFixed(2)}</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="NOK">${vatAmt.toFixed(2)}</cbc:TaxAmount>
      <cac:TaxCategory>
        <cbc:ID>S</cbc:ID>
        <cbc:Percent>${p.vatPercent}</cbc:Percent>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:TaxCategory>
    </cac:TaxSubtotal>
  </cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="NOK">${p.lineAmount.toFixed(2)}</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="NOK">${p.lineAmount.toFixed(2)}</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="NOK">${total.toFixed(2)}</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="NOK">${total.toFixed(2)}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
  <cac:InvoiceLine>
    <cbc:ID>1</cbc:ID>
    <cbc:InvoicedQuantity unitCode="EA">1</cbc:InvoicedQuantity>
    <cbc:LineExtensionAmount currencyID="NOK">${p.lineAmount.toFixed(2)}</cbc:LineExtensionAmount>
    <cac:Item>
      <cbc:Name>${p.lineDescription}</cbc:Name>
      <cac:ClassifiedTaxCategory>
        <cbc:ID>S</cbc:ID>
        <cbc:Percent>${p.vatPercent}</cbc:Percent>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:ClassifiedTaxCategory>
    </cac:Item>
    <cac:Price>
      <cbc:PriceAmount currencyID="NOK">${p.lineAmount.toFixed(2)}</cbc:PriceAmount>
    </cac:Price>
  </cac:InvoiceLine>
</Invoice>`;
}

async function main() {
  console.log("=== 307: SUPPLIER INVOICE ENTITY + :addPayment TEST ===\n");

  // Step 0: Get our company info
  const session = await api("GET", "token/session/>whoAmI?fields=*");
  const companyId = session.value?.companyId;
  const companyData = await api("GET", `company/${companyId}?fields=id,name,organizationNumber`);
  const companyOrg = companyData.value?.organizationNumber;
  const companyName = companyData.value?.name;
  console.log(`Company: ${companyName} (${companyOrg})\n`);

  // Step 1: Get accounts
  const accts = await api("GET", "ledger/account?number=1920,2400,2710,6340&fields=id,number,vatLocked");
  const acctMap: Record<number, number> = {};
  for (const a of (accts.values || [])) acctMap[a.number] = a.id;
  console.log("Accounts:", JSON.stringify(acctMap));

  // Step 2: Find or create test supplier (valid MOD11 org: 987654325)
  const SUPPLIER_ORG = "987654325";
  let supplierSearch = await api("GET", `supplier?organizationNumber=${SUPPLIER_ORG}&count=1&fields=*`);
  let supplierId: number;
  if (supplierSearch.values?.length > 0) {
    supplierId = supplierSearch.values[0].id;
    console.log(`Supplier already exists: id=${supplierId}`);
  } else {
    const supplierRes = await api("POST", "supplier", {
      name: "Test Supplier 307 AS",
      organizationNumber: SUPPLIER_ORG,
      email: "test307@example.com",
      postalAddress: { addressLine1: "Testveien 307", postalCode: "0001", city: "Oslo" },
      physicalAddress: { addressLine1: "Testveien 307", postalCode: "0001", city: "Oslo" },
    });
    supplierId = supplierRes?.value?.id;
    console.log(`Supplier created: id=${supplierId}, orgNr=${SUPPLIER_ORG}`);
  }

  // Step 3: Create supplier invoice via importDocument
  const xml = makeEhfXml({
    invoiceNumber: "SI-307-001",
    issueDate: "2027-01-05",
    dueDate: "2027-02-04",
    supplierName: "Test Supplier 307 AS",
    supplierOrgNr: SUPPLIER_ORG,
    buyerName: companyName,
    buyerOrgNr: companyOrg,
    lineDescription: "Consulting services",
    lineAmount: 2000,
    vatPercent: 25,
  });

  const formData = new FormData();
  formData.append("file", new Blob([xml], { type: "application/xml" }), "invoice.xml");
  const importRes = await api("POST", "ledger/voucher/importDocument", formData, true);
  console.log(`importDocument: ${JSON.stringify(importRes).slice(0, 500)}`);

  const voucherId = importRes?.values?.[0]?.id;
  const voucherVersion = importRes?.values?.[0]?.version;
  console.log(`Voucher: id=${voucherId}, version=${voucherVersion}`);
  if (!voucherId) { console.error("ABORT: no voucher from importDocument"); return; }

  // Step 4: Find the supplier invoice entity
  const siAll = await api("GET", `supplierInvoice?invoiceDateFrom=2027-01-01&invoiceDateTo=2027-12-31&count=100&fields=*,supplier(*)`);
  console.log(`\nAll supplier invoices: ${siAll.values?.length || 0}`);
  const ourSI = siAll.values?.find((si: any) => si.voucher?.id === voucherId);
  const siId = ourSI?.id;
  console.log(`Our SI: id=${siId}, invoiceNumber=${ourSI?.invoiceNumber}, amount=${ourSI?.amount}`);

  // Step 5: Set postings (sendToLedger=false) — 2 postings: expense + supplier liability
  const putRes1 = await api("PUT", `ledger/voucher/${voucherId}?sendToLedger=false`, {
    id: voucherId,
    version: voucherVersion,
    postings: [
      {
        row: 1, date: "2027-01-05", description: "Consulting services",
        account: { id: acctMap[6340] },
        amount: 2000, amountCurrency: 2000, amountGross: 2500, amountGrossCurrency: 2500,
        vatType: { id: 1 },  // 25% incoming VAT — auto-generates VAT posting on 2710
      },
      {
        row: 2, date: "2027-01-05", description: "Consulting services",
        account: { id: acctMap[2400] },  // supplier ledger account
        supplier: { id: supplierId },
        amount: -2500, amountCurrency: -2500, amountGross: -2500, amountGrossCurrency: -2500,
        invoiceNumber: "SI-307-001",
        termOfPayment: "2027-02-04",
      },
    ],
  });
  console.log(`PUT postings: ${JSON.stringify(putRes1).slice(0, 300)}`);

  // Step 6: Book (sendToLedger=true)
  const freshV = await api("GET", `ledger/voucher/${voucherId}?fields=*`);
  const bookRes = await api("PUT", `ledger/voucher/${voucherId}?sendToLedger=true`, {
    id: voucherId,
    version: freshV.value?.version,
  });
  console.log(`Book: ${JSON.stringify(bookRes).slice(0, 300)}`);

  // Step 7: Verify booked state
  const booked = await api("GET", `ledger/voucher/${voucherId}?fields=*,postings(*,account(*))`);
  console.log(`\nBooked voucher: number=${booked.value?.number}`);
  for (const p of (booked.value?.postings || [])) {
    console.log(`  acct=${p.account?.number} amount=${p.amount} desc="${p.description}"`);
  }

  // Step 8: Check SI state
  if (siId) {
    const siState = await api("GET", `supplierInvoice/${siId}?fields=*`);
    console.log(`\nSI state: amount=${siState.value?.amount} amountCurrency=${siState.value?.amountCurrency}`);
    console.log(`  Full SI: ${JSON.stringify(siState.value).slice(0, 500)}`);
  }

  // Step 9: Try :addPayment
  console.log("\n\n=== :addPayment TESTS ===\n");
  if (siId) {
    // Test A: paymentType=0
    console.log("--- Test A: paymentType=0 ---");
    const payA = await api("POST", `supplierInvoice/${siId}/:addPayment?paymentType=0&amount=2500&paymentDate=2027-01-15`);
    console.log(`Result: ${JSON.stringify(payA).slice(0, 500)}`);

    // If that fails, test different approaches
    if (payA.status && payA.status >= 400) {
      // Test B: useDefaultPaymentType=true
      console.log("\n--- Test B: useDefaultPaymentType=true ---");
      const payB = await api("POST", `supplierInvoice/${siId}/:addPayment?paymentType=0&amount=2500&paymentDate=2027-01-15&useDefaultPaymentType=true`);
      console.log(`Result: ${JSON.stringify(payB).slice(0, 500)}`);
    }

    // Check SI after payment
    const siAfter = await api("GET", `supplierInvoice/${siId}?fields=*`);
    console.log(`\nSI after payment: ${JSON.stringify(siAfter.value).slice(0, 300)}`);
  }

  // Also explore: what if we use the bank/reconciliation paymentType IDs?
  console.log("\n\n=== BANK RECON PAYMENT TYPES ===");
  const reconPT = await api("GET", "bank/reconciliation/paymentType?count=100&fields=*");
  for (const pt of (reconPT.values || [])) {
    console.log(`  id=${pt.id} desc="${pt.description}" debit=${pt.debitAccount?.number} credit=${pt.creditAccount?.number}`);
  }

  // Try with the "Leverandørbetaling" payment type if it exists
  const levPT = reconPT.values?.find((pt: any) => pt.description?.includes("Leverandør"));
  if (levPT && siId) {
    console.log(`\n--- Test C: paymentType=${levPT.id} (${levPT.description}) ---`);
    const payC = await api("POST", `supplierInvoice/${siId}/:addPayment?paymentType=${levPT.id}&amount=2500&paymentDate=2027-01-15`);
    console.log(`Result: ${JSON.stringify(payC).slice(0, 500)}`);
  }

  console.log("\n=== DONE ===");
}

main().catch(console.error);
