// End-to-end sandbox verification of the NOK fallback path:
// 1. Create a NOK customer invoice
// 2. Register simple payment
// 3. Look up account IDs
// 4. Create manual agio voucher
// 5. Verify the final state

const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const DATE = "2026-03-21";

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  console.log(`${method} ${url}`);
  const opts: RequestInit = {
    method,
    headers: { "Authorization": AUTH, "Content-Type": "application/json" },
  };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  const text = await r.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  console.log(`  Status: ${r.status}`);
  if (!r.ok) {
    console.log(`  Error: ${JSON.stringify(json)}`);
    throw new Error(`${method} ${path}: ${r.status}`);
  }
  return json;
}

async function main() {
  // Step 0: Create a test customer and NOK invoice
  console.log("=== Setup: Create customer ===");
  const cust = await api("POST", "/customer", {
    name: "Sandbox FX Test 86050544 AS",
    organizationNumber: "999860544",
    isCustomer: true
  });
  const custId = cust.value.id;
  console.log(`  Customer ID: ${custId}`);

  console.log("\n=== Setup: Create NOK invoice (simulating EUR amount as NOK) ===");
  const inv = await api("POST", "/invoice", {
    invoiceDate: DATE,
    invoiceDueDate: "2026-04-21",
    customer: { id: custId },
    orders: [],
    lines: [
      {
        product: null,
        description: "Test product EUR-as-NOK",
        count: 1,
        unitCostCurrency: 5000,
        vatType: { id: 3 }
      }
    ]
  });
  const invId = inv.value.id;
  const amtOutstanding = inv.value.amountOutstanding;
  console.log(`  Invoice ID: ${invId}, amountOutstanding: ${amtOutstanding}`);
  console.log(`  amountExcludingVat: ${inv.value.amountExcludingVat}`);
  console.log(`  amount === amountCurrency: ${inv.value.amount === inv.value.amountCurrency}`);

  // Step 1: Get payment type
  console.log("\n=== Step 1: Get payment type ===");
  const pts = await api("GET", "/invoice/paymentType?fields=*,debitAccount(*)");
  const pt = (pts.values || []).find((p: any) =>
    p.debitAccount?.number >= 1900 && p.debitAccount?.number < 2000
  );
  console.log(`  Payment type: id=${pt.id}, desc="${pt.description}", account=${pt.debitAccount.number}`);

  // Step 2: Register simple payment (NOK path)
  console.log("\n=== Step 2: Register simple payment ===");
  const payResult = await api("PUT",
    `/invoice/${invId}/:payment?paymentDate=${DATE}&paymentTypeId=${pt.id}&paidAmount=${amtOutstanding}`
  );
  console.log(`  amountOutstanding after payment: ${payResult.value.amountOutstanding}`);

  // Step 3: Look up account IDs
  const agioAmount = 5000; // simulated agio
  console.log(`\n=== Step 3: Look up account IDs for 1920, 8060 ===`);
  const accts = await api("GET", "/ledger/account?number=1920,8060&fields=id,number");
  const bankAcct = (accts.values || []).find((a: any) => a.number === 1920);
  const agioAcct = (accts.values || []).find((a: any) => a.number === 8060);
  console.log(`  1920 id=${bankAcct.id}, 8060 id=${agioAcct.id}`);

  // Step 4: Create manual agio voucher
  console.log(`\n=== Step 4: Create agio voucher (${agioAmount} NOK) ===`);
  const voucher = await api("POST", "/ledger/voucher?sendToLedger=true", {
    date: DATE,
    description: "Valutagevinst (agio) - sandbox test",
    postings: [
      {
        row: 1, date: DATE,
        account: { id: bankAcct.id },
        amountGross: agioAmount, amountGrossCurrency: agioAmount,
        vatType: { id: 0 },
        description: "Kursgevinst innbetaling"
      },
      {
        row: 2, date: DATE,
        account: { id: agioAcct.id },
        amountGross: -agioAmount, amountGrossCurrency: -agioAmount,
        vatType: { id: 0 },
        description: "Valutagevinst (agio)"
      }
    ]
  });
  console.log(`  Voucher ID: ${voucher.value.id}`);

  // Step 5: Verify final state
  console.log("\n=== Step 5: Verify final state ===");
  const finalInv = await api("GET", `/invoice/${invId}?fields=*`);
  console.log(`  Invoice ${invId}: amountOutstanding=${finalInv.value.amountOutstanding}`);

  // Verify voucher postings
  const voucherId = voucher.value.id;
  const vDetail = await api("GET", `/ledger/voucher/${voucherId}?fields=*,postings(*)`);
  const postings = vDetail.value.postings || [];
  console.log(`  Voucher ${voucherId} postings:`);
  for (const p of postings) {
    console.log(`    account=${p.account?.id} amount=${p.amountGross} desc="${p.description}"`);
  }

  console.log("\n=== SANDBOX VERIFICATION COMPLETE ===");
  console.log("NOK fallback path works: payment registered + manual agio voucher created");
}

main().catch(e => { console.error(e); process.exit(1); });
