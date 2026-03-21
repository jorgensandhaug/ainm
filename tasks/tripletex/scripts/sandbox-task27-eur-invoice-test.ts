// Test: Create an EUR invoice in sandbox, pay at different rate, verify agio auto-booked
// Then also test: what happens if we manually book agio on an NOK invoice

const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: any = { method, headers: { Authorization: AUTH, "Content-Type": "application/json" } };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const text = await res.text();
  let data: any;
  try { data = JSON.parse(text); } catch { data = text; }
  if (!res.ok) console.log(`${method} ${path} → ${res.status}: ${JSON.stringify(data).slice(0, 400)}`);
  else console.log(`${method} ${path} → ${res.status}`);
  return { ok: res.ok, data };
}

async function main() {
  // Step 1: Check existing invoices
  console.log("=== Existing invoices ===");
  const invs = await api("GET", "/invoice?invoiceDateFrom=2000-01-01&invoiceDateTo=2027-01-01&fields=id,invoiceDate,customer(name),currency(code),amount,amountCurrency,amountOutstanding,amountCurrencyOutstanding,amountExcludingVat,amountExcludingVatCurrency&count=100");
  for (const inv of invs.data?.values || []) {
    console.log(`  id=${inv.id} date=${inv.invoiceDate} customer="${inv.customer?.name}" currency=${inv.currency?.code} amount=${inv.amount} amountCurrency=${inv.amountCurrency} outstanding=${inv.amountOutstanding} exVat=${inv.amountExcludingVat} exVatCurrency=${inv.amountExcludingVatCurrency}`);
  }

  // Step 2: Check if EUR currency exists
  const currencies = await api("GET", "/currency?code=EUR&fields=id,code,description&count=10");
  const eurId = currencies.data?.values?.[0]?.id;
  console.log(`\nEUR currency id: ${eurId}`);

  // Step 3: Find a customer
  const customers = await api("GET", "/customer?fields=id,name&count=5");
  let customerId = customers.data?.values?.[0]?.id;
  let customerName = customers.data?.values?.[0]?.name;
  console.log(`\nUsing customer: ${customerName} (id=${customerId})`);

  // If no customer, create one
  if (!customerId) {
    console.log("Creating test customer...");
    const cust = await api("POST", "/customer", { name: "Task27 Test Customer" });
    customerId = cust.data?.value?.id;
    customerName = "Task27 Test Customer";
  }

  // Step 4: Try creating an order with EUR currency
  // First we need a NOK order (Tripletex requires orders for invoices)
  console.log("\n=== Creating EUR order ===");
  const order = await api("POST", "/order", {
    customer: { id: customerId },
    orderDate: "2026-03-15",
    deliveryDate: "2026-03-15",
    currency: eurId ? { id: eurId } : undefined,
  });

  if (!order.ok) {
    console.log("Order creation failed. Let me try with currency code...");
    const order2 = await api("POST", "/order", {
      customer: { id: customerId },
      orderDate: "2026-03-15",
      deliveryDate: "2026-03-15",
    });
    if (order2.ok) {
      console.log("Created NOK order:", order2.data?.value?.id);
    }
  } else {
    console.log("Created order:", order.data?.value?.id);
  }

  // Step 5: Let me check what's on accounts 8060 and 8160 (agio/disagio)
  console.log("\n=== Agio/disagio accounts ===");
  const agioAccts = await api("GET", "/ledger/account?number=8060,8160&fields=id,number,name&count=10");
  for (const a of agioAccts.data?.values || []) {
    console.log(`  ${a.number}: ${a.name} (id=${a.id})`);
  }

  // Step 6: Check if we can post a manual agio voucher
  // This tests: can we book agio on an NOK invoice by manual voucher?
  const accts = await api("GET", "/ledger/account?number=1920,8060&fields=id,number,name&count=10");
  const acctMap: Record<number, number> = {};
  for (const a of accts.data?.values || []) acctMap[a.number] = a.id;

  if (acctMap[1920] && acctMap[8060]) {
    console.log("\n=== Testing manual agio voucher ===");
    const agioVoucher = await api("POST", "/ledger/voucher", {
      date: "2026-03-21",
      description: "Agio Solmar SL",
      postings: [
        { row: 1, account: { id: acctMap[1920] }, amountGross: 10091, amountGrossCurrency: 10091, description: "Valutagevinst" },
        { row: 2, account: { id: acctMap[8060] }, amountGross: -10091, amountGrossCurrency: -10091, description: "Agio" },
      ],
    });
    if (agioVoucher.ok) {
      console.log("Manual agio voucher created OK! Voucher ID:", agioVoucher.data?.value?.id);

      // Verify what it looks like
      const voucherId = agioVoucher.data?.value?.id;
      const verifyVoucher = await api("GET", `/ledger/voucher/${voucherId}?fields=id,date,description,postings(account(number,name),amount,amountGross)`);
      if (verifyVoucher.ok) {
        console.log("Voucher postings:");
        for (const p of verifyVoucher.data?.value?.postings || []) {
          console.log(`  ${p.account?.number} (${p.account?.name}): amount=${p.amount} gross=${p.amountGross}`);
        }
      }
    }
  }

  // Step 7: Check balance on 8060 after
  console.log("\n=== Balance on 8060 after manual voucher ===");
  const bs8060 = await api("GET", "/balanceSheet?dateFrom=2026-01-01&dateTo=2027-01-01&accountNumberFrom=8060&accountNumberTo=8060&fields=*,account(number,name)&count=10");
  for (const row of bs8060.data?.values || []) {
    console.log(`  ${row.account?.number}: balanceOut=${row.balanceOut}`);
  }

  // Step 8: Check what payment types are available
  console.log("\n=== Payment types ===");
  const pts = await api("GET", "/invoice/paymentType?fields=id,description,debitAccount(number,name,isBankAccount)&count=20");
  for (const pt of pts.data?.values || []) {
    console.log(`  id=${pt.id} desc="${pt.description}" acct=${pt.debitAccount?.number} (${pt.debitAccount?.name}) bank=${pt.debitAccount?.isBankAccount}`);
  }
}

main().catch(e => { console.error("FATAL:", e); process.exit(1); });
