const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const AUTH = "Basic " + btoa("0:eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9");
const h = { "Content-Type": "application/json", Authorization: AUTH };
const TODAY = new Date().toISOString().slice(0, 10);

async function get(path: string) {
  const r = await fetch(`${BASE}${path}`, { headers: h });
  const b = await r.json();
  console.log(`GET ${path} → ${r.status}`);
  if (!r.ok) { console.log("  ERROR:", JSON.stringify(b).slice(0, 400)); return null; }
  return b;
}
async function post(path: string, body: any) {
  const r = await fetch(`${BASE}${path}`, { method: "POST", headers: h, body: JSON.stringify(body) });
  const b = await r.json();
  console.log(`POST ${path} → ${r.status}`);
  if (!r.ok) { console.log("  ERROR:", JSON.stringify(b).slice(0, 400)); return null; }
  return b;
}
async function put(path: string, body?: any) {
  const r = await fetch(`${BASE}${path}`, { method: "PUT", headers: h, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
  const b = await r.json();
  console.log(`PUT ${path} → ${r.status}`);
  if (!r.ok) { console.log("  ERROR:", JSON.stringify(b).slice(0, 400)); return null; }
  return b;
}

async function main() {
  const TS = Date.now();

  // Setup
  const [dept, pmAss, acct, vtRes] = await Promise.all([
    get("/department?isInactive=false&count=1&fields=id"),
    get("/employee?assignableProjectManagers=true&count=1&fields=id"),
    get("/ledger/account?number=6590,2400&fields=id,number"),
    get("/ledger/voucherType?name=Leverand%C3%B8rfaktura&count=1&fields=id,name"),
  ]);
  const deptId = dept!.values[0].id;
  const pmId = pmAss!.values[0].id;
  const acc6590 = acct!.values.find((a: any) => a.number === 6590);
  const acc2400 = acct!.values.find((a: any) => a.number === 2400);
  const vtId = vtRes!.values[0].id;

  // Create supplier
  const supp = await post("/supplier", { name: `ImportDoc Supplier ${TS}`, organizationNumber: "804473823", isSupplier: true });
  const suppId = supp!.value.id;

  // Create project
  const cust = await post("/customer", { name: `ImportDoc Customer ${TS}`, organizationNumber: "970096531", isCustomer: true });
  const custId = cust!.value.id;
  const proj = await post("/project", {
    name: `ImportDoc Project ${TS}`,
    startDate: TODAY,
    customer: { id: custId },
    projectManager: { id: pmId },
    isFixedPrice: true,
    fixedprice: 265000,
  });
  const pId = proj!.value.id;

  // Now try /ledger/voucher/importDocument with EHF XML
  console.log("\n=== importDocument TEST ===");
  const invoiceNumber = `INV-${TS}`;
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
         xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
         xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:ID>${invoiceNumber}</cbc:ID>
  <cbc:IssueDate>${TODAY}</cbc:IssueDate>
  <cbc:DueDate>${TODAY}</cbc:DueDate>
  <cbc:InvoiceTypeCode>380</cbc:InvoiceTypeCode>
  <cbc:DocumentCurrencyCode>NOK</cbc:DocumentCurrencyCode>
  <cac:AccountingSupplierParty>
    <cac:Party>
      <cac:PartyName><cbc:Name>ImportDoc Supplier ${TS}</cbc:Name></cac:PartyName>
      <cac:PartyIdentification><cbc:ID schemeID="NO:ORGNR">804473823</cbc:ID></cac:PartyIdentification>
      <cac:PostalAddress>
        <cbc:StreetName>Testgate 1</cbc:StreetName>
        <cbc:CityName>Oslo</cbc:CityName>
        <cbc:PostalZone>0150</cbc:PostalZone>
        <cac:Country><cbc:IdentificationCode>NO</cbc:IdentificationCode></cac:Country>
      </cac:PostalAddress>
      <cac:PartyTaxScheme>
        <cbc:CompanyID>NO804473823MVA</cbc:CompanyID>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:PartyTaxScheme>
    </cac:Party>
  </cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty>
    <cac:Party>
      <cac:PartyName><cbc:Name>Our Company</cbc:Name></cac:PartyName>
    </cac:Party>
  </cac:AccountingCustomerParty>
  <cac:PaymentMeans>
    <cbc:PaymentMeansCode>30</cbc:PaymentMeansCode>
    <cbc:PaymentID>${invoiceNumber}</cbc:PaymentID>
  </cac:PaymentMeans>
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="NOK">0.00</cbc:TaxAmount>
    <cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="NOK">26800.00</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="NOK">0.00</cbc:TaxAmount>
      <cac:TaxCategory>
        <cbc:ID>Z</cbc:ID>
        <cbc:Percent>0</cbc:Percent>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:TaxCategory>
    </cac:TaxSubtotal>
  </cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="NOK">26800.00</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="NOK">26800.00</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="NOK">26800.00</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="NOK">26800.00</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
  <cac:InvoiceLine>
    <cbc:ID>1</cbc:ID>
    <cbc:InvoicedQuantity unitCode="EA">1</cbc:InvoicedQuantity>
    <cbc:LineExtensionAmount currencyID="NOK">26800.00</cbc:LineExtensionAmount>
    <cac:Item>
      <cbc:Name>Leverandørkostnad prosjekt</cbc:Name>
      <cac:ClassifiedTaxCategory>
        <cbc:ID>Z</cbc:ID>
        <cbc:Percent>0</cbc:Percent>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:ClassifiedTaxCategory>
    </cac:Item>
    <cac:Price><cbc:PriceAmount currencyID="NOK">26800.00</cbc:PriceAmount></cac:Price>
  </cac:InvoiceLine>
</Invoice>`;

  const formData = new FormData();
  const blob = new Blob([xml], { type: "application/xml" });
  formData.append("file", blob, "invoice.xml");

  const impRes = await fetch(`${BASE}/ledger/voucher/importDocument`, {
    method: "POST",
    headers: { Authorization: AUTH },
    body: formData,
  });
  const impBody = await impRes.json();
  console.log(`POST /ledger/voucher/importDocument → ${impRes.status}`);
  console.log("Response:", JSON.stringify(impBody, null, 2).slice(0, 2000));

  if (impRes.ok) {
    const voucherId = impBody.values?.[0]?.id;
    const voucherVersion = impBody.values?.[0]?.version;
    console.log("Voucher ID:", voucherId, "Version:", voucherVersion);

    // Check for supplier invoice
    const siRes = await get(`/supplierInvoice?voucherId=${voucherId}&fields=*`);
    console.log("SI for voucher:", JSON.stringify(siRes?.values?.slice(0, 2), null, 2).slice(0, 1000));

    if (siRes?.values?.[0]) {
      const si = siRes.values[0];
      console.log("SI id:", si.id, "project:", si.project, "supplier:", si.supplier?.id);

      // Try to set project on SI
      console.log("\n=== PUT SI with project ===");
      const putSi = await put(`/supplierInvoice/${si.id}`, {
        ...si,
        project: { id: pId },
      });
      if (putSi) {
        console.log("SI project after PUT:", putSi.value?.project);
      }
    }

    // Now update the voucher postings to include project and supplier references
    console.log("\n=== UPDATE VOUCHER POSTINGS WITH PROJECT ===");
    const vch = await get(`/ledger/voucher/${voucherId}?fields=*,postings(*)`);
    if (vch?.value?.postings) {
      console.log("Current postings:", JSON.stringify(vch.value.postings, null, 2).slice(0, 1000));

      // Update postings to include project reference on the expense posting
      const updatedPostings = vch.value.postings.map((p: any) => {
        if (p.amount > 0) {
          // Expense posting - add project reference
          return {
            ...p,
            project: { id: pId },
            account: { id: acc6590!.id },
          };
        } else {
          // AP posting - add supplier reference
          return {
            ...p,
            supplier: { id: suppId },
            account: { id: acc2400!.id },
          };
        }
      });

      const putVch = await put(`/ledger/voucher/${voucherId}?sendToLedger=false`, {
        ...vch.value,
        postings: updatedPostings,
      });
      if (putVch) {
        console.log("Updated voucher version:", putVch.value?.version);

        // Book it
        const bookVch = await put(`/ledger/voucher/${voucherId}?sendToLedger=true`, {
          ...putVch.value,
          voucherType: { name: "Leverandørfaktura" },
        });
        if (bookVch) {
          console.log("Booked voucher:", bookVch.value?.id, "number:", bookVch.value?.number);
        }
      }
    }
  }
}

main().catch(e => console.error("FATAL:", e.message));
