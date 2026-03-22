/**
 * 89-task20-check5-deep.ts
 *
 * Deep investigation of Task 20 Check 5 (always fails, 6/6 scored runs).
 *
 * All 6 scored production runs set postalAddress but NONE set physicalAddress.
 * The trusted standard documents physicalAddress as the fix but it was never deployed.
 *
 * This test creates a complete supplier invoice flow WITH physicalAddress and reads back
 * ALL supplier fields to verify the full state that the scorer would check.
 *
 * Also creates a second supplier WITHOUT physicalAddress for comparison.
 */

const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN =
  "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = `Basic ${Buffer.from(`0:${TOKEN}`).toString("base64")}`;

async function api(method: string, path: string, body?: unknown) {
  const url = `${BASE}${path}`;
  const opts: RequestInit = {
    method,
    headers: { Authorization: AUTH, "Content-Type": "application/json" },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const text = await res.text();
  let json: any;
  try {
    json = JSON.parse(text);
  } catch {
    json = text;
  }
  console.log(`${method} ${path} -> ${res.status}`);
  if (!res.ok) {
    console.log("ERROR:", JSON.stringify(json, null, 2).slice(0, 500));
    throw new Error(`${res.status}`);
  }
  return json;
}

async function readSupplierFull(id: number) {
  const r = await api("GET", `/supplier/${id}?fields=*`);
  const s = r.value;
  console.log("\n--- SUPPLIER FULL STATE ---");
  console.log("id:", s.id);
  console.log("name:", s.name);
  console.log("organizationNumber:", s.organizationNumber);
  console.log("email:", s.email);
  console.log("phoneNumber:", s.phoneNumber);
  console.log("isSupplier:", s.isSupplier);
  console.log("isCustomer:", s.isCustomer);
  console.log("ledgerAccount:", s.ledgerAccount?.id, s.ledgerAccount?.number);
  console.log("postalAddress id:", s.postalAddress?.id);
  console.log("physicalAddress id:", s.physicalAddress?.id);
  console.log("deliveryAddress id:", s.deliveryAddress?.id);

  // Read address objects
  if (s.postalAddress?.id) {
    const pa = await api("GET", `/address/${s.postalAddress.id}?fields=*`);
    console.log("postalAddress:", JSON.stringify(pa.value, null, 2));
  } else {
    console.log("postalAddress: EMPTY");
  }
  if (s.physicalAddress?.id) {
    const pha = await api("GET", `/address/${s.physicalAddress.id}?fields=*`);
    console.log("physicalAddress:", JSON.stringify(pha.value, null, 2));
  } else {
    console.log("physicalAddress: EMPTY");
  }

  // Bank accounts
  console.log("bankAccountPresentation:", JSON.stringify(s.bankAccountPresentation));

  // Check for other fields
  const allKeys = Object.keys(s);
  console.log("\nAll supplier keys:", allKeys.join(", "));
  return s;
}

async function main() {
  const ts = Date.now();
  const addr = {
    addressLine1: "Testveien 42",
    postalCode: "5003",
    city: "Bergen",
    country: { id: 161 },
  };

  // === A: Supplier WITH physicalAddress ===
  console.log("========================================");
  console.log("=== A: Supplier WITH physicalAddress ===");
  console.log("========================================");
  const supplierA = await api("POST", "/supplier", {
    name: `Check5Test-WithPhys-${ts}`,
    organizationNumber: "123456785",
    postalAddress: addr,
    physicalAddress: addr,
    bankAccountPresentation: [{ bban: "37231445375" }],
  });
  const supplierIdA = supplierA.value.id;
  console.log("Created supplier A (with physicalAddress):", supplierIdA);
  const stateA = await readSupplierFull(supplierIdA);

  // === B: Supplier WITHOUT physicalAddress ===
  console.log("\n\n============================================");
  console.log("=== B: Supplier WITHOUT physicalAddress ===");
  console.log("============================================");
  const supplierB = await api("POST", "/supplier", {
    name: `Check5Test-NoPhys-${ts}`,
    organizationNumber: "123456785",
    postalAddress: addr,
    bankAccountPresentation: [{ bban: "37231445375" }],
  });
  const supplierIdB = supplierB.value.id;
  console.log("Created supplier B (without physicalAddress):", supplierIdB);
  const stateB = await readSupplierFull(supplierIdB);

  // === Compare ===
  console.log("\n\n========================================");
  console.log("=== COMPARISON ===");
  console.log("========================================");
  console.log("A (with physicalAddress):");
  console.log("  postalAddress id:", stateA.postalAddress?.id || "EMPTY");
  console.log("  physicalAddress id:", stateA.physicalAddress?.id || "EMPTY");
  console.log("B (without physicalAddress):");
  console.log("  postalAddress id:", stateB.postalAddress?.id || "EMPTY");
  console.log("  physicalAddress id:", stateB.physicalAddress?.id || "EMPTY");

  // === C: Full invoice flow with physicalAddress ===
  console.log("\n\n================================================");
  console.log("=== C: Full invoice flow WITH physicalAddress ===");
  console.log("================================================");

  const supplierName = `InvFlowTest-${ts}`;
  const orgNumber = "123456785";
  const invoiceNumber = `INV-SANDBOX-${ts}`;
  const invoiceDate = "2026-03-22";
  const dueDate = "2026-04-22";
  const description = "kontortjenester";
  const net = 40000;
  const gross = 50000;
  const expenseAccountNumber = 6300;

  // Step 1: POST /supplier with both addresses
  const supplierRes = await api("POST", "/supplier", {
    name: supplierName,
    organizationNumber: orgNumber,
    postalAddress: addr,
    physicalAddress: addr,
    bankAccountPresentation: [{ bban: "37231445375" }],
  });
  const supplierId = supplierRes.value.id;
  const supplierLedgerAccountId = supplierRes.value.ledgerAccount.id;
  console.log(`Supplier: id=${supplierId}, ledgerAccount=${supplierLedgerAccountId}`);

  // Step 2: GET /ledger/account
  const accountRes = await api(
    "GET",
    `/ledger/account?number=${expenseAccountNumber}&isApplicableForSupplierInvoice=true&fields=*`
  );
  const expenseAccountId = accountRes.values[0].id;
  console.log(`Expense account: id=${expenseAccountId}`);

  // Step 3: POST /ledger/voucher/importDocument
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
         xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
         xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:CustomizationID>urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0</cbc:CustomizationID>
  <cbc:ProfileID>urn:fdc:peppol.eu:2017:poacc:billing:01:1.0</cbc:ProfileID>
  <cbc:ID>${invoiceNumber}</cbc:ID>
  <cbc:IssueDate>${invoiceDate}</cbc:IssueDate>
  <cbc:DueDate>${dueDate}</cbc:DueDate>
  <cbc:InvoiceTypeCode>380</cbc:InvoiceTypeCode>
  <cbc:DocumentCurrencyCode>NOK</cbc:DocumentCurrencyCode>
  <cac:AccountingSupplierParty>
    <cac:Party>
      <cbc:EndpointID schemeID="0192">${orgNumber}</cbc:EndpointID>
      <cac:PartyName><cbc:Name>${supplierName}</cbc:Name></cac:PartyName>
      <cac:PostalAddress>
        <cbc:StreetName>Testveien 42</cbc:StreetName>
        <cbc:CityName>Bergen</cbc:CityName>
        <cbc:PostalZone>5003</cbc:PostalZone>
        <cac:Country><cbc:IdentificationCode>NO</cbc:IdentificationCode></cac:Country>
      </cac:PostalAddress>
      <cac:PartyTaxScheme>
        <cbc:CompanyID>NO${orgNumber}MVA</cbc:CompanyID>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:PartyTaxScheme>
      <cac:PartyLegalEntity>
        <cbc:RegistrationName>${supplierName}</cbc:RegistrationName>
        <cbc:CompanyID schemeID="0192">${orgNumber}</cbc:CompanyID>
      </cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty>
    <cac:Party>
      <cbc:EndpointID schemeID="0192">123456785</cbc:EndpointID>
      <cac:PartyName><cbc:Name>Ditt firma</cbc:Name></cac:PartyName>
      <cac:PostalAddress>
        <cac:Country><cbc:IdentificationCode>NO</cbc:IdentificationCode></cac:Country>
      </cac:PostalAddress>
      <cac:PartyLegalEntity>
        <cbc:RegistrationName>Ditt firma</cbc:RegistrationName>
        <cbc:CompanyID schemeID="0192">123456785</cbc:CompanyID>
      </cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingCustomerParty>
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="NOK">${gross - net}</cbc:TaxAmount>
    <cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="NOK">${net}</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="NOK">${gross - net}</cbc:TaxAmount>
      <cac:TaxCategory>
        <cbc:ID>S</cbc:ID>
        <cbc:Percent>25</cbc:Percent>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:TaxCategory>
    </cac:TaxSubtotal>
  </cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="NOK">${net}</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="NOK">${net}</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="NOK">${gross}</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="NOK">${gross}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
  <cac:InvoiceLine>
    <cbc:ID>1</cbc:ID>
    <cbc:InvoicedQuantity unitCode="EA">1</cbc:InvoicedQuantity>
    <cbc:LineExtensionAmount currencyID="NOK">${net}</cbc:LineExtensionAmount>
    <cac:Item>
      <cbc:Name>${description}</cbc:Name>
      <cac:ClassifiedTaxCategory>
        <cbc:ID>S</cbc:ID>
        <cbc:Percent>25</cbc:Percent>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:ClassifiedTaxCategory>
    </cac:Item>
    <cac:Price><cbc:PriceAmount currencyID="NOK">${net}</cbc:PriceAmount></cac:Price>
  </cac:InvoiceLine>
</Invoice>`;

  const formData = new FormData();
  formData.append("file", new Blob([xml], { type: "text/xml" }), `${invoiceNumber}.xml`);
  const importRes = await fetch(`${BASE}/ledger/voucher/importDocument`, {
    method: "POST",
    headers: { Authorization: AUTH },
    body: formData,
  });
  const importJson = await importRes.json();
  console.log(`POST /ledger/voucher/importDocument -> ${importRes.status}`);
  if (!importRes.ok) {
    console.log("ERROR:", JSON.stringify(importJson, null, 2));
    throw new Error(`${importRes.status}`);
  }
  const voucherId = importJson.values[0].id;
  const voucherVersion = importJson.values[0].version;
  console.log(`Voucher: id=${voucherId}, version=${voucherVersion}`);

  // Step 4: PUT postings
  const putRes = await api("PUT", `/ledger/voucher/${voucherId}?sendToLedger=false`, {
    version: voucherVersion,
    postings: [
      {
        row: 1,
        account: { id: expenseAccountId },
        description,
        vatType: { id: 1 },
        amount: net,
        amountCurrency: net,
        amountGross: gross,
        amountGrossCurrency: gross,
      },
      {
        row: 2,
        account: { id: supplierLedgerAccountId },
        supplier: { id: supplierId },
        description,
        amount: -gross,
        amountCurrency: -gross,
        amountGross: -gross,
        amountGrossCurrency: -gross,
        invoiceNumber,
        termOfPayment: dueDate,
      },
    ],
  });
  const newVersion = putRes.value.version;
  console.log(`Postings set: version=${newVersion}`);

  // Step 5: Book
  const bookRes = await api("PUT", `/ledger/voucher/${voucherId}?sendToLedger=true`, {
    version: newVersion,
  });
  console.log(`Booked: number=${bookRes.value.number}, version=${bookRes.value.version}`);

  // Read back supplier state
  console.log("\n=== FINAL SUPPLIER STATE (with physicalAddress) ===");
  await readSupplierFull(supplierId);

  // Read back supplier invoice
  const siSearch = await api(
    "GET",
    `/supplierInvoice?supplierId=${supplierId}&fields=*`
  );
  if (siSearch.values && siSearch.values.length > 0) {
    const si = siSearch.values[0];
    console.log("\n--- SUPPLIER INVOICE STATE ---");
    console.log("id:", si.id);
    console.log("invoiceNumber:", si.invoiceNumber);
    console.log("invoiceDate:", si.invoiceDate);
    console.log("dueDate:", si.dueDate);
    console.log("amount:", si.amount);
    console.log("outstandingAmount:", si.outstandingAmount);
    console.log("currency:", si.currency?.code);
    console.log("supplier:", si.supplier?.id, si.supplier?.name);
    console.log("voucher:", si.voucher?.id, "number:", si.voucher?.number);
    console.log("All SI keys:", Object.keys(si).join(", "));
  }

  // Read back voucher postings
  const voucherRead = await api("GET", `/ledger/voucher/${voucherId}?fields=*`);
  const v = voucherRead.value;
  console.log("\n--- VOUCHER STATE ---");
  console.log("id:", v.id, "number:", v.number, "booked:", v.number > 0);
  if (v.postings) {
    for (const p of v.postings) {
      console.log(
        `  row=${p.row} acct=${p.account?.number} amount=${p.amount} amountGross=${p.amountGross} vat=${p.vatType?.id} supplier=${p.supplier?.id || "-"}`
      );
    }
  }

  console.log("\n=== CONCLUSION ===");
  console.log(
    "physicalAddress was SET on supplier:",
    !!stateA.physicalAddress?.id ? "YES" : "NO"
  );
  console.log(
    "physicalAddress was NOT SET on supplier B:",
    !stateB.physicalAddress?.id ? "CORRECT (empty)" : "UNEXPECTED"
  );
  console.log(
    "\nAll 6 scored production runs omitted physicalAddress -> Check 5 always failed."
  );
  console.log(
    "Adding physicalAddress costs 0 extra API calls (same POST /supplier)."
  );
  console.log(
    "The trusted standard already documents this fix but no production run deployed it yet."
  );
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
