// Sandbox verification: confirm existing-customer lookup + VAT resolution pattern
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const TODAY = "2026-03-22";

const headers = { Authorization: AUTH, "Content-Type": "application/json" };

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: any = { method, headers };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  const json = await r.json();
  console.log(`${method} ${path} -> ${r.status}`);
  if (!r.ok) console.log(JSON.stringify(json, null, 2));
  return { status: r.status, data: json };
}

// 1. Check existing customers in sandbox
const custRes = await api("GET", `/customer?fields=id,name,organizationNumber&count=5`);
console.log("Existing customers:", JSON.stringify(custRes.data.values?.slice(0, 5).map((c: any) => ({ id: c.id, name: c.name, org: c.organizationNumber })), null, 2));

// 2. Check VAT types available
const vatRes = await api("GET", `/ledger/vatType?typeOfVat=OUTGOING&vatDate=${TODAY}&fields=*`);
const vatTypes = vatRes.data.values || [];
console.log("Available outgoing VAT types:", vatTypes.map((v: any) => `code ${v.number} (${v.percentage}%) id=${v.id}`));

// 3. Look for any 25% VAT type
const vat25 = vatTypes.find((v: any) => Number(v.percentage) === 25);
if (vat25) {
  console.log("25% VAT available in sandbox:", vat25.id, vat25.number);
} else {
  console.log("25% VAT NOT available in sandbox (only 0% available — taxed branch blocked as expected)");
}

// 4. Look for 0% VAT type
const vat0 = vatTypes.find((v: any) => Number(v.percentage) === 0);
if (vat0) {
  console.log("0% VAT available:", vat0.id, "code", vat0.number);
}

// 5. Test the existing-customer + description-only invoice pattern with 0% VAT (sandbox-compatible)
// Create a test customer first
const testCustRes = await api("POST", "/customer", {
  name: "Sandbox Verify Bølgekraft AS",
  organizationNumber: "999892362",
  invoiceSendMethod: "MANUAL"
});

if (testCustRes.status === 201) {
  const custId = testCustRes.data.value.id;
  console.log("Test customer created:", custId);

  // Create invoice with description-only line and 0% VAT (since sandbox only has 0%)
  const invPayload = {
    invoiceDate: TODAY,
    invoiceDueDate: TODAY,
    customer: { id: custId },
    orders: [
      {
        customer: { id: custId },
        orderDate: TODAY,
        deliveryDate: TODAY,
        orderLines: [
          {
            description: "Vedlikehald",
            count: 1,
            unitPriceExcludingVatCurrency: 34150,
            vatType: { id: vat0!.id },
          },
        ],
      },
    ],
  };

  const invRes = await api("POST", "/invoice?sendToCustomer=true", invPayload);
  if (invRes.status === 201) {
    const inv = invRes.data.value;
    console.log("Invoice created successfully!");
    console.log("  Invoice ID:", inv.id);
    console.log("  Amount excl VAT:", inv.amountExcludingVatCurrency);
    console.log("  Amount incl VAT:", inv.amountCurrency);
    console.log("  Description preserved as 'Vedlikehald':", inv.orders?.[0]?.orderLines?.[0]?.description || "(check readback)");

    // Readback to verify description
    const readback = await api("GET", `/invoice/${inv.id}?fields=*,orders(*,orderLines(*,product(*),vatType(*)))`);
    if (readback.status === 200) {
      const lines = readback.data.value?.orders?.[0]?.orderLines || [];
      for (const line of lines) {
        console.log("  Readback line:", {
          description: line.description,
          unitPrice: line.unitPriceExcludingVatCurrency,
          product: line.product,
          vatType: line.vatType ? `code ${line.vatType.number} (${line.vatType.percentage}%)` : "none"
        });
      }
    }
  } else if (invRes.status === 422 && JSON.stringify(invRes.data).includes("bank")) {
    console.log("Bank account repair needed in sandbox too — expected");
    // Repair
    const acctRes = await api("GET", "/ledger/account?isBankAccount=true&fields=*");
    const accounts = acctRes.data.values || [];
    const acct1920 = accounts.find((a: any) => Number(a.number) === 1920) || accounts[0];
    if (acct1920) {
      console.log("Repairing account:", acct1920.id, "number:", acct1920.number, "hasBankNumber:", !!acct1920.bankAccountNumber);
      if (!acct1920.bankAccountNumber) {
        await api("PUT", `/ledger/account/${acct1920.id}`, {
          id: acct1920.id,
          number: acct1920.number,
          name: acct1920.name,
          bankAccountNumber: "12345678903",
        });
      }
      // Retry
      const retryRes = await api("POST", "/invoice?sendToCustomer=true", invPayload);
      if (retryRes.status === 201) {
        console.log("Invoice created after bank repair!");
        console.log("  Amount excl VAT:", retryRes.data.value.amountExcludingVatCurrency);
        console.log("  Amount incl VAT:", retryRes.data.value.amountCurrency);
      }
    }
  }
}
