const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);

async function api(method: string, endpoint: string, body?: any) {
  const url = `${BASE}${endpoint}`;
  const opts: RequestInit = {
    method,
    headers: { "Authorization": AUTH, "Content-Type": "application/json" },
  };
  if (body) opts.body = JSON.stringify(body);
  console.log(`\n>>> ${method} ${url}`);
  const res = await fetch(url, opts);
  const text = await res.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  console.log(`<<< ${res.status}`);
  if (!res.ok) {
    console.log("ERROR:", JSON.stringify(json, null, 2));
  }
  return { status: res.status, ok: res.ok, data: json };
}

async function main() {
  // Test 1: Check current bank account state
  console.log("=== TEST 1: Bank account state ===");
  const acctResp = await api("GET", "/ledger/account?isBankAccount=true&fields=*");
  if (acctResp.ok) {
    const accounts = acctResp.data.values || [];
    for (const a of accounts) {
      console.log(`  Account ${a.number} (id=${a.id}): isInvoiceAccount=${a.isInvoiceAccount}, bankAccountNumber=${a.bankAccountNumber}`);
    }
  }

  // Test 2: Check VAT types
  console.log("\n=== TEST 2: Current VAT types ===");
  const vatResp = await api("GET", "/ledger/vatType?typeOfVat=OUTGOING&vatDate=2026-03-21&fields=*");
  if (vatResp.ok) {
    const vats = vatResp.data.values || [];
    for (const v of vats) {
      console.log(`  VAT id=${v.id}, code=${v.number}, pct=${v.percentage}%`);
    }
  }

  // Test 3: Parallel POST /customer + GET /ledger/vatType
  console.log("\n=== TEST 3: Parallel customer create + vatType read ===");
  const ts = Date.now();
  const [custResult, vatResult] = await Promise.all([
    api("POST", "/customer", {
      name: "Sandbox Parallel Test AS",
      organizationNumber: "999888001",
      invoiceSendMethod: "MANUAL",
    }),
    api("GET", "/ledger/vatType?typeOfVat=OUTGOING&vatDate=2026-03-21&fields=*"),
  ]);
  const elapsed = Date.now() - ts;
  console.log(`Parallel calls completed in ${elapsed}ms`);

  if (custResult.ok) {
    console.log(`  Customer created: id=${custResult.data.value.id}`);
  }
  if (vatResult.ok) {
    const vats = vatResult.data.values || [];
    console.log(`  VAT types: ${vats.map((v: any) => `${v.id}(${v.percentage}%)`).join(", ")}`);
  }

  // Test 4: Sequential same calls for comparison
  console.log("\n=== TEST 4: Sequential customer create + vatType read ===");
  const ts2 = Date.now();
  const custResult2 = await api("POST", "/customer", {
    name: "Sandbox Sequential Test AS",
    organizationNumber: "999888002",
    invoiceSendMethod: "MANUAL",
  });
  const vatResult2 = await api("GET", "/ledger/vatType?typeOfVat=OUTGOING&vatDate=2026-03-21&fields=*");
  const elapsed2 = Date.now() - ts2;
  console.log(`Sequential calls completed in ${elapsed2}ms`);

  // Test 5: Full preemptive flow - parallel all 3 reads
  console.log("\n=== TEST 5: Preemptive 3-way parallel (customer + vatType + bankAccount) ===");
  const ts3 = Date.now();
  const [custResult3, vatResult3, acctResult3] = await Promise.all([
    api("POST", "/customer", {
      name: "Sandbox Preemptive Test AS",
      organizationNumber: "999888003",
      invoiceSendMethod: "MANUAL",
    }),
    api("GET", "/ledger/vatType?typeOfVat=OUTGOING&vatDate=2026-03-21&fields=*"),
    api("GET", "/ledger/account?isBankAccount=true&fields=*"),
  ]);
  const elapsed3 = Date.now() - ts3;
  console.log(`3-way parallel completed in ${elapsed3}ms`);

  if (custResult3.ok && vatResult3.ok && acctResult3.ok) {
    const customerId = custResult3.data.value.id;
    const vats = vatResult3.data.values || [];
    const accounts = acctResult3.data.values || [];
    const invoiceAcct = accounts.find((a: any) => a.isInvoiceAccount);
    const needsRepair = invoiceAcct && !invoiceAcct.bankAccountNumber;

    console.log(`  Customer: ${customerId}`);
    console.log(`  VAT types: ${vats.map((v: any) => `${v.id}(${v.percentage}%)`).join(", ")}`);
    console.log(`  Invoice account: ${invoiceAcct?.number} (id=${invoiceAcct?.id}), bankAccountNumber=${invoiceAcct?.bankAccountNumber}`);
    console.log(`  Needs bank repair: ${needsRepair}`);

    // If bank account needs repair, do it now (0 4xx)
    if (needsRepair) {
      console.log("  → Repairing bank account preemptively...");
      await api("PUT", `/ledger/account/${invoiceAcct.id}`, {
        bankAccountNumber: "12345678903",
      });
    }

    // Now create invoice (should succeed without 422)
    const vatType = vats.find((v: any) => v.percentage === 0); // sandbox only has 0%
    if (vatType) {
      const invoiceResp = await api("POST", "/invoice", {
        invoiceDate: "2026-03-21",
        invoiceDueDate: "2026-04-04",
        customer: { id: customerId },
        orders: [{
          customer: { id: customerId },
          orderDate: "2026-03-21",
          deliveryDate: "2026-03-21",
          orderLines: [{
            description: "Sandbox preemptive test",
            count: 1,
            unitPriceExcludingVatCurrency: 1000,
            vatType: { id: vatType.id },
          }],
        }],
      });
      if (invoiceResp.ok) {
        const inv = invoiceResp.data.value;
        console.log(`  Invoice created: id=${inv.id}, number=${inv.invoiceNumber}, excl=${inv.amountExcludingVatCurrency}, incl=${inv.amountCurrency}`);
        console.log(`  PREEMPTIVE FLOW: ${needsRepair ? "5 calls, 0 4xx" : "4 calls, 0 4xx"}`);
      }
    }
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
