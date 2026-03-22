/**
 * Test POST /incomingInvoice endpoint.
 * This creates a supplier invoice with structured fields (description, vendor, order lines).
 * Marked as [BETA] — may return 403 if not enabled.
 */

const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = `Basic ${btoa("0:" + TOKEN)}`;

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const headers: Record<string, string> = { Authorization: AUTH, "Content-Type": "application/json" };
  const res = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let data; try { data = JSON.parse(text); } catch { data = text; }
  console.log(`${method} ${path.substring(0, 80)} → ${res.status}`);
  return { status: res.status, ok: res.ok, data };
}

async function main() {
  const date = "2026-03-22";
  const supplierName = "IncomingTest AS";
  const orgNumber = "867890123";
  const invoiceNumber = "INV-INC-001";
  const description = "kontortjenester";
  const gross = 12500;
  const net = 10000;

  // Step 1: Create supplier
  const sRes = await api("POST", "/supplier", { name: supplierName, organizationNumber: orgNumber });
  if (!sRes.ok) { console.error("Supplier fail:", JSON.stringify(sRes.data).substring(0, 300)); return; }
  const supplierId = sRes.data.value.id;
  const supplierLedgerAcctId = sRes.data.value.ledgerAccount.id;
  console.log(`  Supplier: id=${supplierId}, ledgerAcct=${supplierLedgerAcctId}`);

  // Step 2: Get expense account
  const acctRes = await api("GET", "/ledger/account?number=7140&isApplicableForSupplierInvoice=true&fields=*");
  const expAcctId = acctRes.data.values[0].id;

  // Step 3: Try POST /incomingInvoice
  console.log("\n=== POST /incomingInvoice ===");
  const payload = {
    invoiceHeader: {
      vendorId: supplierId,
      invoiceDate: date,
      dueDate: "2026-04-21",
      currencyId: 1,
      invoiceAmount: gross,
      description: description,
      invoiceNumber: invoiceNumber,
    },
    orderLines: [
      {
        row: 1,
        description: description,
        accountId: expAcctId,
        count: 1,
        amountInclVat: gross,
        vatTypeId: 1,
      },
    ],
  };
  console.log("Payload:", JSON.stringify(payload, null, 2));

  // Try with sendTo=ledger (auto-book)
  const incRes = await api("POST", "/incomingInvoice?sendTo=ledger", payload);
  console.log(`  Result: status=${incRes.status}`);
  if (incRes.ok) {
    console.log("  SUCCESS:", JSON.stringify(incRes.data, null, 2).substring(0, 500));
  } else {
    console.log("  FAIL:", JSON.stringify(incRes.data, null, 2).substring(0, 500));
  }

  // If ledger fails, try without sendTo (default=inbox)
  if (!incRes.ok) {
    console.log("\n  Trying without sendTo (default=inbox)...");
    const incRes2 = await api("POST", "/incomingInvoice", payload);
    console.log(`  Result: status=${incRes2.status}`);
    if (incRes2.ok) {
      console.log("  SUCCESS:", JSON.stringify(incRes2.data, null, 2).substring(0, 500));
    } else {
      console.log("  FAIL:", JSON.stringify(incRes2.data, null, 2).substring(0, 500));
    }
  }

  // If both fail, try sendTo=nonPosted
  if (!incRes.ok) {
    console.log("\n  Trying sendTo=nonPosted...");
    const incRes3 = await api("POST", "/incomingInvoice?sendTo=nonPosted", payload);
    console.log(`  Result: status=${incRes3.status}`);
    if (incRes3.ok) {
      console.log("  SUCCESS:", JSON.stringify(incRes3.data, null, 2).substring(0, 500));
    } else {
      console.log("  FAIL:", JSON.stringify(incRes3.data, null, 2).substring(0, 500));
    }
  }
}

main().catch(console.error);
