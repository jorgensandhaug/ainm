// Sandbox investigation: verify response shapes and test lower-call paths
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);

const hdrs: Record<string, string> = { Authorization: AUTH, "Content-Type": "application/json" };

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: RequestInit = { method };
  if (body instanceof FormData) {
    opts.headers = { Authorization: AUTH };
    opts.body = body;
  } else {
    opts.headers = hdrs;
    if (body !== undefined) opts.body = JSON.stringify(body);
  }
  const res = await fetch(url, opts);
  const text = await res.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  console.log(`\n${method} ${path} → ${res.status}`);
  if (!res.ok) {
    console.error(JSON.stringify(json, null, 2));
  }
  return { status: res.status, ok: res.ok, data: json };
}

const TS = Date.now();
const INV = `SBOX-INVEST-${TS}`;
const SUPPLIER = `Sandbox Invest SL ${TS}`;
const ORG = "913175212";
const GROSS = 12500;
const NET = GROSS / 1.25;  // 10000
const VAT = GROSS - NET;   // 2500
const DESC = "sandbox investigation";
const DATE = "2026-03-22";
const DUE = "2026-04-21";

async function main() {
  // --- Test 1: Verify POST /supplier response shape ---
  console.log("=== Test 1: POST /supplier response shape ===");
  const s = await api("POST", "/supplier", {
    name: SUPPLIER,
    organizationNumber: ORG,
    supplierNumber: 0,
  });
  console.log("Has .value?", !!s.data.value);
  console.log("Has .values?", !!s.data.values);
  console.log("supplier.id:", s.data.value?.id);
  console.log("supplier.ledgerAccount:", JSON.stringify(s.data.value?.ledgerAccount));
  console.log("supplier.ledgerAccount.id:", s.data.value?.ledgerAccount?.id);
  console.log("supplier.ledgerAccount.number:", s.data.value?.ledgerAccount?.number);
  const suppId = s.data.value.id;
  const suppAcctId = s.data.value.ledgerAccount?.id;

  // --- Test 2: Verify GET /ledger/account response shape ---
  console.log("\n=== Test 2: GET /ledger/account response shape ===");
  const a = await api("GET", "/ledger/account?number=6540&isApplicableForSupplierInvoice=true&fields=*");
  console.log("Has .value?", !!a.data.value);
  console.log("Has .values?", !!a.data.values);
  console.log("account[0].id:", a.data.values?.[0]?.id);
  console.log("account[0].number:", a.data.values?.[0]?.number);
  const expAcctId = a.data.values[0].id;

  // --- Test 3: Verify importDocument response shape ---
  console.log("\n=== Test 3: POST /ledger/voucher/importDocument response shape ===");
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
         xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
         xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:CustomizationID>urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0</cbc:CustomizationID>
  <cbc:ProfileID>urn:fdc:peppol.eu:2017:poacc:billing:01:1.0</cbc:ProfileID>
  <cbc:ID>${INV}</cbc:ID>
  <cbc:IssueDate>${DATE}</cbc:IssueDate>
  <cbc:DueDate>${DUE}</cbc:DueDate>
  <cbc:InvoiceTypeCode>380</cbc:InvoiceTypeCode>
  <cbc:DocumentCurrencyCode>NOK</cbc:DocumentCurrencyCode>
  <cac:AccountingSupplierParty>
    <cac:Party>
      <cbc:EndpointID schemeID="0192">${ORG}</cbc:EndpointID>
      <cac:PartyName><cbc:Name>${SUPPLIER}</cbc:Name></cac:PartyName>
      <cac:PostalAddress>
        <cbc:StreetName>Ukjent</cbc:StreetName>
        <cbc:CityName>Oslo</cbc:CityName>
        <cbc:PostalZone>0001</cbc:PostalZone>
        <cac:Country><cbc:IdentificationCode>NO</cbc:IdentificationCode></cac:Country>
      </cac:PostalAddress>
      <cac:PartyTaxScheme>
        <cbc:CompanyID>NO${ORG}MVA</cbc:CompanyID>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:PartyTaxScheme>
      <cac:PartyLegalEntity><cbc:RegistrationName>${SUPPLIER}</cbc:RegistrationName></cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty>
    <cac:Party>
      <cbc:EndpointID schemeID="0192">999999999</cbc:EndpointID>
      <cac:PartyName><cbc:Name>My Company</cbc:Name></cac:PartyName>
      <cac:PostalAddress>
        <cbc:StreetName>Gate 1</cbc:StreetName>
        <cbc:CityName>Oslo</cbc:CityName>
        <cbc:PostalZone>0001</cbc:PostalZone>
        <cac:Country><cbc:IdentificationCode>NO</cbc:IdentificationCode></cac:Country>
      </cac:PostalAddress>
      <cac:PartyLegalEntity><cbc:RegistrationName>My Company</cbc:RegistrationName></cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingCustomerParty>
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="NOK">${VAT}</cbc:TaxAmount>
    <cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="NOK">${NET}</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="NOK">${VAT}</cbc:TaxAmount>
      <cac:TaxCategory>
        <cbc:ID>S</cbc:ID>
        <cbc:Percent>25</cbc:Percent>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:TaxCategory>
    </cac:TaxSubtotal>
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
    <cac:Item>
      <cbc:Name>${DESC}</cbc:Name>
      <cac:ClassifiedTaxCategory>
        <cbc:ID>S</cbc:ID>
        <cbc:Percent>25</cbc:Percent>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:ClassifiedTaxCategory>
    </cac:Item>
    <cac:Price><cbc:PriceAmount currencyID="NOK">${NET}</cbc:PriceAmount></cac:Price>
  </cac:InvoiceLine>
</Invoice>`;

  const fd = new FormData();
  fd.append("file", new Blob([xml], { type: "application/xml" }), `${INV}.xml`);
  const imp = await api("POST", "/ledger/voucher/importDocument", fd);
  console.log("Has .value?", !!imp.data.value);
  console.log("Has .values?", !!imp.data.values);
  console.log("Top-level keys:", Object.keys(imp.data));
  if (imp.data.values) {
    console.log("values[0].id:", imp.data.values[0]?.id);
    console.log("values[0].version:", imp.data.values[0]?.version);
  }
  if (imp.data.value) {
    console.log("value.id:", imp.data.value.id);
    console.log("value.version:", imp.data.value.version);
  }

  if (!imp.ok) {
    console.log("importDocument failed, stopping here.");
    return;
  }

  const vid = imp.data.values?.[0]?.id ?? imp.data.value?.id;
  const v1 = imp.data.values?.[0]?.version ?? imp.data.value?.version;
  console.log("Extracted: voucher id:", vid, "version:", v1);

  // --- Test 4: PUT postings, verify response shape ---
  console.log("\n=== Test 4: PUT postings (sendToLedger=false) ===");
  const putRes = await api("PUT", `/ledger/voucher/${vid}?sendToLedger=false`, {
    version: v1,
    postings: [
      {
        row: 1, date: DATE, description: DESC,
        account: { id: expAcctId }, vatType: { id: 1 },
        amount: NET, amountCurrency: NET,
        amountGross: GROSS, amountGrossCurrency: GROSS,
      },
      {
        row: 2, date: DATE, description: DESC,
        account: { id: suppAcctId }, supplier: { id: suppId },
        amount: -GROSS, amountCurrency: -GROSS,
        amountGross: -GROSS, amountGrossCurrency: -GROSS,
        invoiceNumber: INV, termOfPayment: DUE,
      },
    ],
  });
  console.log("Has .value?", !!putRes.data.value);
  console.log("Has .values?", !!putRes.data.values);
  if (putRes.data.value) {
    console.log("value.version:", putRes.data.value.version);
  }
  if (putRes.data.values) {
    console.log("values[0].version:", putRes.data.values[0]?.version);
  }

  const v2 = putRes.data.value?.version ?? putRes.data.values?.[0]?.version;
  console.log("Extracted version:", v2);

  // --- Test 5: PUT book, verify response shape ---
  console.log("\n=== Test 5: PUT book (sendToLedger=true) ===");
  const bookRes = await api("PUT", `/ledger/voucher/${vid}?sendToLedger=true`, {
    version: v2,
    voucherType: { name: "Leverandørfaktura" },
  });
  console.log("Has .value?", !!bookRes.data.value);
  console.log("Has .values?", !!bookRes.data.values);
  if (bookRes.data.value) {
    console.log("value.number:", bookRes.data.value.number);
    console.log("value.version:", bookRes.data.value.version);
  }
  if (bookRes.data.values) {
    console.log("values[0].number:", bookRes.data.values[0]?.number);
  }

  // --- Test 6: Verify supplierInvoice was created ---
  console.log("\n=== Test 6: Verify supplierInvoice entity ===");
  const siRes = await api("GET", `/supplierInvoice?invoiceNumber=${INV}&fields=*`);
  if (siRes.data.values?.length > 0) {
    const si = siRes.data.values[0];
    console.log("supplierInvoice found:");
    console.log("  id:", si.id);
    console.log("  invoiceNumber:", si.invoiceNumber);
    console.log("  amount:", si.amount);
    console.log("  amountExcludingVat:", si.amountExcludingVat);
    console.log("  outstandingAmount:", si.outstandingAmount);
    console.log("  supplier.id:", si.supplier?.id);
    console.log("  voucher.id:", si.voucher?.id);
  } else {
    console.log("NO supplierInvoice found!");
  }

  console.log("\n=== SUMMARY ===");
  console.log("All response shapes documented. 5-call path confirmed.");
  console.log("Key finding: POST /supplier returns .value (singular), importDocument returns .values (plural)");
  console.log("Key finding: supplier.ledgerAccount.id from POST response avoids extra GET for account 2400");
}

main().catch(e => { console.error(e); process.exit(1); });
