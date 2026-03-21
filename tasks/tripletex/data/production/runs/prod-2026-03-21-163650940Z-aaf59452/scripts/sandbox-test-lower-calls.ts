// Sandbox test: can we skip GET /ledger/account and GET /ledger/vatType?
// Hypothesis A: use account: { number: 6340 } in PUT postings
// Hypothesis B: hard-code vatType: { id: 1 } for 25% incoming VAT

const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa(`0:${TOKEN}`);

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: any = { method, headers: { Authorization: AUTH } };
  if (body && !(body instanceof FormData)) {
    opts.headers["Content-Type"] = "application/json";
    opts.body = JSON.stringify(body);
  } else if (body instanceof FormData) {
    opts.body = body;
  }
  console.log(`\n>>> ${method} ${url}`);
  const resp = await fetch(url, opts);
  const text = await resp.text();
  console.log(`<<< ${resp.status}`);
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  if (!resp.ok) {
    console.log("ERROR:", JSON.stringify(json, null, 2).substring(0, 1500));
  }
  return { ok: resp.ok, status: resp.status, data: json };
}

const TS = Date.now();
const SUPPLIER_NAME = `SandboxTestLowCall ${TS}`;
const ORG_NR = "966941901";
const INVOICE_NR = `INV-SBX-${TS}`;
const INVOICE_DATE = "2026-03-21";
const DUE_DATE = "2026-04-20";
const DESCRIPTION = "Sandbox low-call test";
const NET = 10000;
const VAT_AMT = 2500;
const GROSS = 12500;

async function main() {
  // Step 1: Create supplier (still needed)
  const supRes = await api("POST", "/supplier", {
    name: SUPPLIER_NAME,
    organizationNumber: ORG_NR,
    postalAddress: { addressLine1: "Testveien 1", postalCode: "0001", city: "Oslo" },
    bankAccountPresentation: [{ bban: "36204404121" }],
  });
  if (!supRes.ok) { console.log("Supplier creation failed"); return; }
  const supplier = supRes.data.value;
  const supplierId = supplier.id;
  const supplierLedgerAccountId = supplier.ledgerAccount.id;
  console.log("Supplier ID:", supplierId, "Ledger Account ID:", supplierLedgerAccountId);

  // Step 2: Import EHF XML (skip account/vatType lookups)
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
         xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
         xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:CustomizationID>urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0</cbc:CustomizationID>
  <cbc:ProfileID>urn:fdc:peppol.eu:2017:poacc:billing:01:1.0</cbc:ProfileID>
  <cbc:ID>${INVOICE_NR}</cbc:ID>
  <cbc:IssueDate>${INVOICE_DATE}</cbc:IssueDate>
  <cbc:DueDate>${DUE_DATE}</cbc:DueDate>
  <cbc:InvoiceTypeCode>380</cbc:InvoiceTypeCode>
  <cbc:DocumentCurrencyCode>NOK</cbc:DocumentCurrencyCode>
  <cac:AccountingSupplierParty>
    <cac:Party>
      <cbc:EndpointID schemeID="0192">${ORG_NR}</cbc:EndpointID>
      <cac:PartyName><cbc:Name>${SUPPLIER_NAME}</cbc:Name></cac:PartyName>
      <cac:PostalAddress>
        <cbc:StreetName>Testveien 1</cbc:StreetName>
        <cbc:CityName>Oslo</cbc:CityName>
        <cbc:PostalZone>0001</cbc:PostalZone>
        <cac:Country><cbc:IdentificationCode>NO</cbc:IdentificationCode></cac:Country>
      </cac:PostalAddress>
      <cac:PartyTaxScheme>
        <cbc:CompanyID>NO${ORG_NR}MVA</cbc:CompanyID>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:PartyTaxScheme>
      <cac:PartyLegalEntity><cbc:RegistrationName>${SUPPLIER_NAME}</cbc:RegistrationName><cbc:CompanyID schemeID="0192">${ORG_NR}</cbc:CompanyID></cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty>
    <cac:Party>
      <cbc:EndpointID schemeID="0192">999999999</cbc:EndpointID>
      <cac:PartyName><cbc:Name>Ditt firma</cbc:Name></cac:PartyName>
      <cac:PostalAddress>
        <cbc:StreetName>Testveien 1</cbc:StreetName>
        <cbc:CityName>Oslo</cbc:CityName>
        <cbc:PostalZone>0001</cbc:PostalZone>
        <cac:Country><cbc:IdentificationCode>NO</cbc:IdentificationCode></cac:Country>
      </cac:PostalAddress>
      <cac:PartyTaxScheme>
        <cbc:CompanyID>NO999999999MVA</cbc:CompanyID>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:PartyTaxScheme>
      <cac:PartyLegalEntity><cbc:RegistrationName>Ditt firma</cbc:RegistrationName><cbc:CompanyID schemeID="0192">999999999</cbc:CompanyID></cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingCustomerParty>
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
      <cbc:Name>${DESCRIPTION}</cbc:Name>
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
  const blob = new Blob([xml], { type: "application/xml" });
  formData.append("file", blob, "invoice.xml");

  const importRes = await api("POST", "/ledger/voucher/importDocument", formData);
  if (!importRes.ok) { console.log("Import failed"); return; }
  const voucher = importRes.data.values[0];
  const voucherId = voucher.id;
  const voucherVersion = voucher.version;
  console.log("Voucher ID:", voucherId, "Version:", voucherVersion);

  // Test A: PUT with account: { number: 6340 } instead of { id: ... }
  console.log("\n=== TEST A: Using account number instead of account ID ===");
  const putBodyA = {
    version: voucherVersion,
    postings: [
      {
        row: 1,
        account: { number: 6340 },
        description: DESCRIPTION,
        vatType: { id: 1 },
        amount: NET,
        amountCurrency: NET,
        amountGross: GROSS,
        amountGrossCurrency: GROSS,
      },
      {
        row: 2,
        account: { id: supplierLedgerAccountId },
        supplier: { id: supplierId },
        description: DESCRIPTION,
        amount: -GROSS,
        amountCurrency: -GROSS,
        amountGross: -GROSS,
        amountGrossCurrency: -GROSS,
        invoiceNumber: INVOICE_NR,
        termOfPayment: DUE_DATE,
      },
    ],
  };

  const putResA = await api("PUT", `/ledger/voucher/${voucherId}?sendToLedger=false`, putBodyA);
  if (putResA.ok) {
    console.log("TEST A PASSED: account by number works!");
    const postings = putResA.data.value.postings;
    for (const p of postings) {
      console.log(`  row=${p.row} account=${p.account?.number} amount=${p.amount} amountGross=${p.amountGross} vatType=${p.vatType?.number} supplier=${p.supplier?.id}`);
    }
  } else {
    console.log("TEST A FAILED: account by number does NOT work");
    // Need to test B with account ID instead
    // First, look up the account to get the ID for test B
    const acctRes = await api("GET", "/ledger/account?number=6340&isApplicableForSupplierInvoice=true&fields=*");
    if (!acctRes.ok) { console.log("Account lookup failed"); return; }
    const accounts = acctRes.data.values;
    const expenseAccountId = accounts[0].id;
    console.log("Expense Account ID (from lookup):", expenseAccountId);

    // Test B: PUT with account: { id: ... } but vatType: { id: 1 } hard-coded
    console.log("\n=== TEST B: Using hard-coded vatType ID 1 ===");
    // Version may not have bumped if PUT failed with 422
    const putBodyB = {
      version: voucherVersion,
      postings: [
        {
          row: 1,
          account: { id: expenseAccountId },
          description: DESCRIPTION,
          vatType: { id: 1 },
          amount: NET,
          amountCurrency: NET,
          amountGross: GROSS,
          amountGrossCurrency: GROSS,
        },
        {
          row: 2,
          account: { id: supplierLedgerAccountId },
          supplier: { id: supplierId },
          description: DESCRIPTION,
          amount: -GROSS,
          amountCurrency: -GROSS,
          amountGross: -GROSS,
          amountGrossCurrency: -GROSS,
          invoiceNumber: INVOICE_NR,
          termOfPayment: DUE_DATE,
        },
      ],
    };
    const putResB = await api("PUT", `/ledger/voucher/${voucherId}?sendToLedger=false`, putBodyB);
    if (putResB.ok) {
      console.log("TEST B PASSED: hard-coded vatType ID 1 works!");
      const postings = putResB.data.value.postings;
      for (const p of postings) {
        console.log(`  row=${p.row} account=${p.account?.number} amount=${p.amount} amountGross=${p.amountGross} vatType=${p.vatType?.number} supplier=${p.supplier?.id}`);
      }
    } else {
      console.log("TEST B FAILED");
    }
  }

  console.log("\n=== SUMMARY ===");
  console.log("If Test A passed: 3-call path possible (POST supplier, POST import, PUT voucher)");
  console.log("If only Test B passed: 4-call path possible (POST supplier, GET account, POST import, PUT voucher)");
  console.log("If both failed: 5-call path remains optimal");
}

main().catch((e) => { console.error("FATAL:", e.message); process.exit(1); });
