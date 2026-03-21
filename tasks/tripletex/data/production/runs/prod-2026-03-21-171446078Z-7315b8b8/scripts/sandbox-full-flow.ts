const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa(`0:${TOKEN}`);
const TODAY = "2026-03-21";

const headers = { Authorization: AUTH, "Content-Type": "application/json" };

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: RequestInit = { method, headers };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  const json = await r.json();
  console.log(`${method} ${path} => ${r.status}`);
  if (!r.ok) {
    console.log(JSON.stringify(json, null, 2));
    throw new Error(`${method} ${path} failed ${r.status}`);
  }
  return json;
}

function resolveProducts(products: any[], refs: string[]): Record<string, any> {
  const map: Record<string, any> = {};
  for (const p of products) {
    for (const key of ["productNumber", "number"]) {
      const val = String(p[key] ?? "");
      if (refs.includes(val) && !map[val]) {
        map[val] = p;
      }
    }
  }
  return map;
}

async function main() {
  const REFS = ["5271", "3613"];
  const NAMES: Record<string, string> = {
    "TestProd A": "5271",
    "Asesoría de datos": "3613",  // won't match in sandbox, using generic names
  };
  // For sandbox, let's use the actual sandbox product names
  // Products in sandbox: TestProd A (number=5271), TestProd B (number=3613)
  const SANDBOX_NAMES: Record<string, string> = {
    "TestProd A": "5271",
    "TestProd B": "3613",
  };

  let callCount = 0;

  // Step 1: Customer
  // Use an existing sandbox customer. Let me check who exists.
  console.log("=== Step 1: Resolve customer ===");
  const custResp = await api("GET", "/customer?organizationNumber=975687821&fields=*");
  callCount++;
  const customer = custResp.values?.[0];
  if (!customer) {
    console.log("No customer found. Let me try another org number...");
    const custResp2 = await api("GET", "/customer?organizationNumber=864062245&fields=*");
    callCount++;
    const c2 = custResp2.values?.[0];
    console.log(`Customer: id=${c2?.id} name=${c2?.name}`);
    if (!c2) { console.log("No customer found. Stopping."); return; }
  } else {
    console.log(`Customer: id=${customer.id} name=${customer.name}`);
  }
  const cust = customer || (await api("GET", "/customer?organizationNumber=864062245&fields=*")).values?.[0];

  // Step 2: Products - 2-tier approach
  console.log("\n=== Step 2: Products (2-tier) ===");
  console.log("Tier 1: productNumber lookup");
  const prodResp = await api("GET", `/product?productNumber=${REFS.join("&productNumber=")}&fields=*`);
  callCount++;
  let prodMap = resolveProducts(prodResp.values || [], REFS);
  const missing1 = REFS.filter(r => !prodMap[r]);
  console.log(`  Found ${Object.keys(prodMap).length}/${REFS.length} products. Missing: ${missing1.join(", ") || "none"}`);

  if (missing1.length > 0) {
    console.log("Tier 2: count=1000 name+number filter (skip ids fallback)");
    const allResp = await api("GET", "/product?count=1000&fields=*");
    callCount++;
    // Resolve by number field first
    const byNumber = resolveProducts(allResp.values || [], missing1);
    Object.assign(prodMap, byNumber);
    // Then by exact name
    const stillMissing = REFS.filter(r => !prodMap[r]);
    if (stillMissing.length > 0) {
      for (const p of allResp.values || []) {
        const ref = SANDBOX_NAMES[p.name];
        if (ref && !prodMap[ref]) {
          prodMap[ref] = p;
        }
      }
    }
  }

  for (const ref of REFS) {
    const p = prodMap[ref];
    console.log(`  Product ${ref}: id=${p?.id} number=${p?.number} name=${p?.name}`);
  }
  if (REFS.some(r => !prodMap[r])) {
    console.log("ERROR: Could not resolve all products");
    return;
  }

  // Step 3: Payment type
  console.log("\n=== Step 3: Payment type ===");
  const ptResp = await api("GET", "/invoice/paymentType?count=1000&fields=*,debitAccount(*),creditAccount(*)");
  callCount++;
  let chosen: any = null;
  for (const pt of ptResp.values || []) {
    const da = pt.debitAccount;
    if (!da) continue;
    const acctNum = String(da.number);
    if (acctNum.startsWith("19")) {
      chosen = pt;
      if (da.isBankAccount || da.isInvoiceAccount) break;
    }
  }
  console.log(`PaymentType: id=${chosen?.id} description=${chosen?.description}`);
  if (!chosen) { console.log("ERROR: No suitable payment type"); return; }

  // Step 4: Create order
  console.log("\n=== Step 4: Create order ===");
  const orderBody = {
    customer: { id: cust.id },
    orderDate: TODAY,
    deliveryDate: TODAY,
    orderLines: [
      {
        product: { id: prodMap["5271"].id },
        description: "Desarrollo de sistemas",
        count: 1,
        unitPriceExcludingVatCurrency: 6950,
      },
      {
        product: { id: prodMap["3613"].id },
        description: "Asesoría de datos",
        count: 1,
        unitPriceExcludingVatCurrency: 7000,
      },
    ],
  };
  const orderResp = await api("POST", "/order", orderBody);
  callCount++;
  const orderId = orderResp.value.id;
  console.log(`Order created: id=${orderId}`);

  // Step 5: Invoice + payment
  console.log("\n=== Step 5: Invoice + payment ===");
  const invoicePath = `/order/${orderId}/:invoice?invoiceDate=${TODAY}&sendToCustomer=false&paymentTypeId=${chosen.id}&paidAmount=0.01&paymentTypeIdRestAmount=${chosen.id}`;
  const invResp = await api("PUT", invoicePath);
  callCount++;
  const inv = invResp.value;
  console.log(`Invoice: id=${inv.id} invoiceNumber=${inv.invoiceNumber}`);
  console.log(`amountExcludingVatCurrency=${inv.amountExcludingVatCurrency}`);
  console.log(`amountCurrencyOutstanding=${inv.amountCurrencyOutstanding}`);
  console.log(`amountOutstanding=${inv.amountOutstanding}`);

  const outstanding = inv.amountCurrencyOutstanding ?? inv.amountOutstanding;
  console.log(`\nFully paid: ${outstanding === 0}`);
  console.log(`Total API calls: ${callCount}`);
}

main().catch(e => { console.error(e); process.exit(1); });
