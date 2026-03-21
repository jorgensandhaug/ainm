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
  if (!res.ok) console.log("ERROR:", JSON.stringify(json, null, 2));
  return { status: res.status, ok: res.ok, data: json };
}

async function main() {
  // Verify: Does the invoice account have bankAccountNumber populated?
  // If so, the detection logic "needsRepair = !bankAccountNumber" correctly skips the PUT
  const acctResp = await api("GET", "/ledger/account?isBankAccount=true&fields=*");
  const accounts = acctResp.data.values || [];
  const invoiceAcct = accounts.find((a: any) => a.isInvoiceAccount && a.number === 1920);

  console.log("\n=== Invoice Account State ===");
  console.log(`  Account 1920: id=${invoiceAcct?.id}`);
  console.log(`  bankAccountNumber: "${invoiceAcct?.bankAccountNumber}"`);
  console.log(`  bankAccountNumber truthy: ${!!invoiceAcct?.bankAccountNumber}`);

  // The preemptive detection logic:
  // needsRepair = invoiceAcct exists AND bankAccountNumber is falsy (null, undefined, empty string)
  const needsRepair = invoiceAcct && !invoiceAcct.bankAccountNumber;
  console.log(`  Needs repair: ${needsRepair}`);

  // Now simulate full preemptive flow with timing
  console.log("\n=== Full Preemptive Flow (simulated fresh account) ===");
  let callCount = 0;
  let errorCount = 0;

  const t0 = Date.now();

  // Step 1: Parallel batch
  const [custR, vatR, acctR] = await Promise.all([
    api("POST", "/customer", {
      name: "Sandbox Verify Preemptive AS",
      organizationNumber: "999888010",
      invoiceSendMethod: "MANUAL",
    }),
    api("GET", "/ledger/vatType?typeOfVat=OUTGOING&vatDate=2026-03-21&fields=*"),
    api("GET", "/ledger/account?isBankAccount=true&fields=*"),
  ]);
  callCount += 3;

  const customerId = custR.data.value.id;
  const vats = vatR.data.values || [];
  const accts = acctR.data.values || [];
  const invAcct = accts.find((a: any) => a.isInvoiceAccount && a.number === 1920);
  const repair = invAcct && !invAcct.bankAccountNumber;

  // Step 2: Conditional repair
  if (repair) {
    console.log("  → Would repair bank account here");
    callCount++;
  }

  // Step 3: Invoice create
  const vatType = vats[0]; // sandbox only has 0%
  const invR = await api("POST", "/invoice", {
    invoiceDate: "2026-03-21",
    invoiceDueDate: "2026-04-04",
    customer: { id: customerId },
    orders: [{
      customer: { id: customerId },
      orderDate: "2026-03-21",
      deliveryDate: "2026-03-21",
      orderLines: [{
        description: "Verify preemptive test",
        count: 1,
        unitPriceExcludingVatCurrency: 500,
        vatType: { id: vatType.id },
      }],
    }],
  });
  callCount++;
  if (!invR.ok) errorCount++;

  const elapsed = Date.now() - t0;

  console.log(`\n=== RESULTS ===`);
  console.log(`  Total API calls: ${callCount}`);
  console.log(`  4xx errors: ${errorCount}`);
  console.log(`  Wall-clock: ${elapsed}ms`);
  console.log(`  Invoice: id=${invR.data?.value?.id}, number=${invR.data?.value?.invoiceNumber}`);
  console.log(`  Bank repair was needed: ${repair}`);

  // Now also test: pure sequential (current standard) for comparison
  console.log("\n=== Sequential Flow (current standard) ===");
  let seqCalls = 0;
  let seqErrors = 0;
  const t1 = Date.now();

  const custR2 = await api("POST", "/customer", {
    name: "Sandbox Verify Sequential AS",
    organizationNumber: "999888011",
    invoiceSendMethod: "MANUAL",
  });
  seqCalls++;

  const vatR2 = await api("GET", "/ledger/vatType?typeOfVat=OUTGOING&vatDate=2026-03-21&fields=*");
  seqCalls++;

  const invR2 = await api("POST", "/invoice", {
    invoiceDate: "2026-03-21",
    invoiceDueDate: "2026-04-04",
    customer: { id: custR2.data.value.id },
    orders: [{
      customer: { id: custR2.data.value.id },
      orderDate: "2026-03-21",
      deliveryDate: "2026-03-21",
      orderLines: [{
        description: "Verify sequential test",
        count: 1,
        unitPriceExcludingVatCurrency: 500,
        vatType: { id: vatR2.data.values[0].id },
      }],
    }],
  });
  seqCalls++;
  if (!invR2.ok) seqErrors++;

  const elapsed2 = Date.now() - t1;

  console.log(`\n=== SEQUENTIAL RESULTS ===`);
  console.log(`  Total API calls: ${seqCalls}`);
  console.log(`  4xx errors: ${seqErrors}`);
  console.log(`  Wall-clock: ${elapsed2}ms`);
  console.log(`  Invoice: id=${invR2.data?.value?.id}, number=${invR2.data?.value?.invoiceNumber}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
