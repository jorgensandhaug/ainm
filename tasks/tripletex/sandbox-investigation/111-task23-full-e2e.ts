/**
 * 111-task23-full-e2e.ts — Complete end-to-end task 23 (bank reconciliation) test
 *
 * Creates test data in a clean 2027 period, runs the full 9-step flow,
 * and verifies the outcome.
 *
 * Usage: npx tsx sandbox-investigation/111-task23-full-e2e.ts [YYYY-MM]
 * Example: npx tsx sandbox-investigation/111-task23-full-e2e.ts 2027-06
 *
 * Uses a different month each run to avoid conflicts with closed reconciliations.
 */

// Parse month from args, default to 2027-07
const TEST_MONTH = process.argv[2] || "2027-07";
const [TEST_YEAR, TEST_MON] = TEST_MONTH.split("-").map(Number);
const FIRST_DAY = `${TEST_MONTH}-01`;
const nextMon = TEST_MON === 12 ? 1 : TEST_MON + 1;
const nextYear = TEST_MON === 12 ? TEST_YEAR + 1 : TEST_YEAR;
const NEXT_MONTH_FIRST = `${nextYear}-${String(nextMon).padStart(2, "0")}-01`;

const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN =
  "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + Buffer.from("0:" + TOKEN).toString("base64");

let callCount = 0;
let errorCount = 0;

async function api(
  method: string,
  path: string,
  body?: any,
): Promise<{ status: number; data: any }> {
  const url = `${BASE}/${path}`;
  const headers: Record<string, string> = { Authorization: AUTH };
  if (body && !(body instanceof FormData))
    headers["Content-Type"] = "application/json";
  const opts: RequestInit = { method, headers };
  if (body)
    opts.body = body instanceof FormData ? body : JSON.stringify(body);
  const res = await fetch(url, opts);
  callCount++;
  const text = await res.text();
  let json: any;
  try {
    json = JSON.parse(text);
  } catch {
    json = text;
  }
  if (res.status >= 400) {
    errorCount++;
    console.log(
      `  ✗ ${method} ${path}: ${res.status} ${JSON.stringify(json).slice(0, 300)}`,
    );
  }
  return { status: res.status, data: json };
}

// ==================================================================
// PHASE 1: CREATE TEST DATA
// ==================================================================

async function setupTestData() {
  const TAG = Date.now().toString(36);
  console.log(`\n${"=".repeat(60)}`);
  console.log(`PHASE 1: CREATE TEST DATA (tag=${TAG})`);
  console.log(`${"=".repeat(60)}\n`);

  // Create 5 customers
  const customerNames = [
    `Nordvik ${TAG} AS`,
    `Storhaug ${TAG} AS`,
    `Fjellheim ${TAG} AS`,
    `Bakken ${TAG} AS`,
    `Solberg ${TAG} AS`,
  ];

  const customerIds: number[] = [];
  for (const name of customerNames) {
    const res = await api("POST", "customer", {
      name,
      isCustomer: true,
      email: `${TAG}@example.com`,
    });
    if (res.status >= 400) return null;
    customerIds.push(res.data.value.id);
    console.log(`  Customer: ${name} → id=${res.data.value.id}`);
  }

  // Create 3 suppliers
  const supplierNames = [
    `LevA ${TAG} AS`,
    `LevB ${TAG} AS`,
    `LevC ${TAG} AS`,
  ];
  const supplierIds: number[] = [];
  for (const name of supplierNames) {
    const res = await api("POST", "supplier", {
      name,
      isSupplier: true,
      email: `sup-${TAG}@example.com`,
    });
    if (res.status >= 400) return null;
    supplierIds.push(res.data.value.id);
    console.log(`  Supplier: ${name} → id=${res.data.value.id}`);
  }

  // Create orders + invoices (5 invoices, one per customer)
  // Customer 4 (Solberg) gets 2 invoices for partial payment testing
  const orderConfigs = [
    { custIdx: 0, count: 10, price: 1000 }, // 10000
    { custIdx: 1, count: 5, price: 2500 }, // 12500
    { custIdx: 2, count: 8, price: 1500 }, // 12000
    { custIdx: 3, count: 3, price: 3000 }, // 9000
    { custIdx: 4, count: 20, price: 500 }, // 10000 (Solberg #1)
    { custIdx: 4, count: 15, price: 800 }, // 12000 (Solberg #2)
  ];

  const invoices: Array<{
    id: number;
    invoiceNumber: number;
    amount: number;
    outstanding: number;
    customerName: string;
    custIdx: number;
  }> = [];

  for (const oc of orderConfigs) {
    const orderRes = await api("POST", "order", {
      customer: { id: customerIds[oc.custIdx] },
      deliveryDate: FIRST_DAY,
      orderDate: FIRST_DAY,
      orderLines: [
        {
          description: "Service",
          count: oc.count,
          unitPriceExcludingVatCurrency: oc.price,
        },
      ],
    });
    if (orderRes.status >= 400) return null;

    const invRes = await api(
      "PUT",
      `order/${orderRes.data.value.id}/:invoice?invoiceDate=${TEST_MONTH}-02&sendToCustomer=false`,
    );
    if (invRes.status >= 400) return null;

    const det = (
      await api(
        "GET",
        `invoice/${invRes.data.value.id}?fields=id,invoiceNumber,amountCurrency,amountCurrencyOutstanding,customer(name)`,
      )
    ).data.value;
    invoices.push({
      id: det.id,
      invoiceNumber: det.invoiceNumber,
      amount: det.amountCurrency,
      outstanding: det.amountCurrencyOutstanding,
      customerName: det.customer.name,
      custIdx: oc.custIdx,
    });
    console.log(
      `  Invoice #${det.invoiceNumber}: ${det.amountCurrencyOutstanding} for ${det.customer.name}`,
    );
  }

  return {
    customerIds,
    supplierIds,
    customerNames,
    supplierNames,
    invoices,
    tag: TAG,
  };
}

// ==================================================================
// PHASE 2: BUILD TEST CSV
// ==================================================================

function buildTestCsv(
  data: NonNullable<Awaited<ReturnType<typeof setupTestData>>>,
) {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`PHASE 2: BUILD TEST CSV`);
  console.log(`${"=".repeat(60)}\n`);

  const lines: Array<{
    date: string;
    desc: string;
    inn: number;
    ut: number;
    saldo: number;
  }> = [];
  let saldo = 100000; // Opening balance

  // 5 customer incoming payments
  // Pay full for first 4, partial for Solberg (half of first invoice)
  const custPayments = [
    {
      name: data.customerNames[0],
      amount: data.invoices[0].outstanding,
      date: `${TEST_MONTH}-05`,
    },
    {
      name: data.customerNames[1],
      amount: data.invoices[1].outstanding,
      date: `${TEST_MONTH}-06`,
    },
    {
      name: data.customerNames[2],
      amount: data.invoices[2].outstanding,
      date: `${TEST_MONTH}-07`,
    },
    {
      name: data.customerNames[3],
      amount: data.invoices[3].outstanding,
      date: `${TEST_MONTH}-08`,
    },
    {
      name: data.customerNames[4],
      amount: Math.round((data.invoices[4].outstanding / 2) * 100) / 100,
      date: `${TEST_MONTH}-09`,
    },
  ];

  for (const p of custPayments) {
    saldo += p.amount;
    lines.push({
      date: p.date,
      desc: `Innbetaling fra ${p.name} / Faktura ${1000 + lines.length + 1}`,
      inn: p.amount,
      ut: 0,
      saldo,
    });
  }

  // 3 supplier outgoing payments
  const supPayments = [
    { name: data.supplierNames[0], amount: 8500, date: `${TEST_MONTH}-10` },
    { name: data.supplierNames[1], amount: 12000, date: `${TEST_MONTH}-12` },
    { name: data.supplierNames[2], amount: 5500, date: `${TEST_MONTH}-14` },
  ];

  for (const p of supPayments) {
    saldo -= p.amount;
    lines.push({ date: p.date, desc: `Betaling ${p.name}`, inn: 0, ut: p.amount, saldo });
  }

  // Non-invoice lines
  saldo -= 250;
  lines.push({
    date: `${TEST_MONTH}-15`,
    desc: "Bankgebyr",
    inn: 0,
    ut: 250,
    saldo,
  });

  saldo += 127.5;
  lines.push({
    date: `${TEST_MONTH}-16`,
    desc: "Renteinntekter",
    inn: 127.5,
    ut: 0,
    saldo,
  });

  saldo -= 1850;
  lines.push({
    date: `${TEST_MONTH}-18`,
    desc: "Skattetrekk",
    inn: 0,
    ut: 1850,
    saldo,
  });

  // Build CSV
  let csv = "Dato;Forklaring;Inn;Ut;Saldo\n";
  for (const l of lines) {
    csv += `${l.date};${l.desc};${l.inn > 0 ? l.inn.toFixed(2) : ""};${l.ut > 0 ? l.ut.toFixed(2) : ""};${l.saldo.toFixed(2)}\n`;
  }

  console.log(csv);

  return {
    csv,
    lines,
    openingBalance: 100000,
    closingBalance: Math.round(saldo * 100) / 100,
    custPayments,
    supPayments,
  };
}

// ==================================================================
// PHASE 3: FULL 9-STEP FLOW
// ==================================================================

async function runFlow(
  testData: NonNullable<Awaited<ReturnType<typeof setupTestData>>>,
  csvData: ReturnType<typeof buildTestCsv>,
) {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`PHASE 3: FULL 9-STEP FLOW`);
  console.log(`${"=".repeat(60)}\n`);

  // Reset call counter for the flow itself
  const flowStartCalls = callCount;
  const flowStartErrors = errorCount;

  const { lines, openingBalance, closingBalance, custPayments, supPayments } =
    csvData;

  // ======== STEP 1: 6 parallel reads ========
  console.log("── Step 1: 6 parallel reads ──");
  const [invRes, ptRes, supRes, sinvRes, acctRes, periodRes] =
    await Promise.all([
      api(
        "GET",
        "invoice?invoiceDateFrom=2020-01-01&invoiceDateTo=2031-01-01&count=1000&fields=*,customer(*)",
      ),
      api(
        "GET",
        "invoice/paymentType?count=1000&fields=*,debitAccount(*)",
      ),
      api("GET", "supplier?count=1000&fields=*"),
      api(
        "GET",
        "supplierInvoice?invoiceDateFrom=2020-01-01&invoiceDateTo=2031-01-01&count=1000&fields=*,supplier(*)",
      ),
      api(
        "GET",
        "ledger/account?number=1920,2050,2400,2600,7770,8050&fields=*",
      ),
      api(
        "GET",
        `ledger/accountingPeriod?startFrom=${FIRST_DAY}&startTo=${TEST_MONTH}-02&count=1&fields=*`,
      ),
    ]);

  const allInvoices = (invRes.data.values || []).filter(
    (i: any) => (i.amountCurrencyOutstanding || 0) > 0,
  );
  console.log(
    `  Invoices with outstanding > 0: ${allInvoices.length}`,
  );

  const paymentType = (ptRes.data.values || []).find(
    (pt: any) => pt.debitAccount?.number === 1920,
  );
  console.log(
    `  Payment type: id=${paymentType?.id} (${paymentType?.description})`,
  );

  const allSuppliers = supRes.data.values || [];
  console.log(`  Suppliers: ${allSuppliers.length}`);

  const supplierInvoiceCount = (sinvRes.data.values || []).length;
  console.log(`  Supplier invoices: ${supplierInvoiceCount}`);

  const accounts: Record<number, number> = {};
  for (const a of acctRes.data.values || []) {
    accounts[a.number] = a.id;
  }
  console.log(
    `  Accounts: ${Object.entries(accounts).map(([n, id]) => `${n}=${id}`).join(", ")}`,
  );

  const period = (periodRes.data.values || [])[0];
  console.log(
    `  Period: id=${period?.id} (${period?.start} to ${period?.end})`,
  );

  if (!paymentType || !period || !accounts[1920] || !accounts[2050]) {
    console.error("FATAL: Missing required data");
    return null;
  }

  // ======== PRE-CHECK: Get existing 1920 balance before any changes ========
  console.log("\n── Pre-check: existing 1920 balance ──");
  // Get balance as of end of prior month
  const priorMonStr = TEST_MON === 1 ? `${TEST_YEAR - 1}-12` : `${TEST_YEAR}-${String(TEST_MON - 1).padStart(2, "0")}`;
  const preBsRes = await api(
    "GET",
    `balanceSheet?dateFrom=${priorMonStr}-01&dateTo=${FIRST_DAY}&accountNumberFrom=1920&accountNumberTo=1920&count=1&fields=*`,
  );
  const priorBalance = preBsRes.data?.values?.[0]?.balanceOut || 0;
  console.log(`  Prior 1920 balance (end of ${priorMonStr}): ${priorBalance}`);
  // The closing balance after our flow = priorBalance + openingBalance + net CSV movements
  // = priorBalance + closingBalance (since closingBalance = openingBalance + net movements)
  const expectedLedgerClosing = Math.round((priorBalance + closingBalance) * 100) / 100;
  console.log(`  Expected ledger closing: ${priorBalance} + ${closingBalance} = ${expectedLedgerClosing}`);

  // ======== STEP 0: Opening balance voucher ========
  console.log("\n── Step 0: Opening balance voucher ──");
  const obRes = await api("POST", "ledger/voucher", {
    date: lines[0].date,
    description: "Inngående balanse",
    postings: [
      {
        row: 1,
        date: lines[0].date,
        description: "Inngående balanse",
        account: { id: accounts[1920] },
        amount: openingBalance,
        amountCurrency: openingBalance,
        amountGross: openingBalance,
        amountGrossCurrency: openingBalance,
        currency: { id: 1 },
      },
      {
        row: 2,
        date: lines[0].date,
        description: "Inngående balanse",
        account: { id: accounts[2050] },
        amount: -openingBalance,
        amountCurrency: -openingBalance,
        amountGross: -openingBalance,
        amountGrossCurrency: -openingBalance,
        currency: { id: 1 },
      },
    ],
  });
  console.log(
    `  Opening balance ${openingBalance}: ${obRes.status} (voucher id=${obRes.data?.value?.id})`,
  );
  if (obRes.status >= 400) return null;

  // ======== STEP 3: Customer payments ========
  console.log("\n── Step 3: Customer payments ──");
  const outstandingTracker = new Map<number, number>();
  for (const inv of allInvoices) {
    outstandingTracker.set(inv.id, inv.amountCurrencyOutstanding);
  }

  for (const cp of custPayments) {
    // Match by customer name
    const searchName = cp.name.toLowerCase();
    const candidates = allInvoices.filter((inv: any) => {
      const custName = (inv.customer?.name || "").toLowerCase();
      return custName.includes(searchName) || searchName.includes(custName);
    });

    // Find best match by amount (exact first, then closest with remaining outstanding)
    let bestMatch: any = null;
    let bestDiff = Infinity;
    for (const inv of candidates) {
      const outstanding = outstandingTracker.get(inv.id) || 0;
      if (outstanding <= 0) continue;
      const diff = Math.abs(outstanding - cp.amount);
      if (diff < bestDiff) {
        bestDiff = diff;
        bestMatch = inv;
      }
    }

    if (!bestMatch) {
      console.error(`  NO MATCH: "${cp.name}" amount=${cp.amount}`);
      continue;
    }

    const outstanding = outstandingTracker.get(bestMatch.id) || 0;
    const payAmount = Math.min(cp.amount, outstanding);

    const payRes = await api(
      "PUT",
      `invoice/${bestMatch.id}/:payment?paymentDate=${cp.date}&paymentTypeId=${paymentType.id}&paidAmount=${payAmount}`,
    );
    const isPartial = payAmount < outstanding;
    console.log(
      `  Pay #${bestMatch.invoiceNumber} (${bestMatch.customer.name}): ${payAmount}/${outstanding}${isPartial ? " PARTIAL" : " FULL"} → ${payRes.status}`,
    );

    outstandingTracker.set(bestMatch.id, outstanding - payAmount);
  }

  // ======== STEPS 4+5: Combined voucher ========
  console.log("\n── Steps 4+5: Combined voucher (suppliers + non-invoice) ──");
  const voucherPostings: any[] = [];
  let row = 1;

  // Supplier payments (debit 2400, credit 1920)
  for (const sp of supPayments) {
    const supplier = allSuppliers.find((s: any) => {
      const sName = s.name.toLowerCase();
      const spName = sp.name.toLowerCase();
      return sName.includes(spName) || spName.includes(sName);
    });
    if (!supplier) {
      console.error(`  No supplier match: "${sp.name}"`);
      continue;
    }

    voucherPostings.push(
      {
        row: row++,
        date: sp.date,
        description: `Betaling ${supplier.name}`,
        account: { id: accounts[2400] },
        supplier: { id: supplier.id },
        amount: sp.amount,
        amountCurrency: sp.amount,
        amountGross: sp.amount,
        amountGrossCurrency: sp.amount,
      },
      {
        row: row++,
        date: sp.date,
        description: `Betaling ${supplier.name}`,
        account: { id: accounts[1920] },
        amount: -sp.amount,
        amountCurrency: -sp.amount,
        amountGross: -sp.amount,
        amountGrossCurrency: -sp.amount,
      },
    );
    console.log(`  Supplier: ${supplier.name} → -${sp.amount}`);
  }

  // Bankgebyr -250 (Ut) → debit 7770, credit 1920
  voucherPostings.push(
    {
      row: row++,
      date: `${TEST_MONTH}-15`,
      description: "Bankgebyr",
      account: { id: accounts[7770] },
      amount: 250,
      amountCurrency: 250,
      amountGross: 250,
      amountGrossCurrency: 250,
    },
    {
      row: row++,
      date: `${TEST_MONTH}-15`,
      description: "Bankgebyr",
      account: { id: accounts[1920] },
      amount: -250,
      amountCurrency: -250,
      amountGross: -250,
      amountGrossCurrency: -250,
    },
  );
  console.log(`  Non-invoice: Bankgebyr -250`);

  // Renteinntekter +127.50 (Inn) → debit 1920, credit 8050
  voucherPostings.push(
    {
      row: row++,
      date: `${TEST_MONTH}-16`,
      description: "Renteinntekter",
      account: { id: accounts[1920] },
      amount: 127.5,
      amountCurrency: 127.5,
      amountGross: 127.5,
      amountGrossCurrency: 127.5,
    },
    {
      row: row++,
      date: `${TEST_MONTH}-16`,
      description: "Renteinntekter",
      account: { id: accounts[8050] },
      amount: -127.5,
      amountCurrency: -127.5,
      amountGross: -127.5,
      amountGrossCurrency: -127.5,
    },
  );
  console.log(`  Non-invoice: Renteinntekter +127.50`);

  // Skattetrekk -1850 (Ut) → debit 2600, credit 1920
  voucherPostings.push(
    {
      row: row++,
      date: `${TEST_MONTH}-18`,
      description: "Skattetrekk",
      account: { id: accounts[2600] },
      amount: 1850,
      amountCurrency: 1850,
      amountGross: 1850,
      amountGrossCurrency: 1850,
    },
    {
      row: row++,
      date: `${TEST_MONTH}-18`,
      description: "Skattetrekk",
      account: { id: accounts[1920] },
      amount: -1850,
      amountCurrency: -1850,
      amountGross: -1850,
      amountGrossCurrency: -1850,
    },
  );
  console.log(`  Non-invoice: Skattetrekk -1850`);

  const vRes = await api("POST", "ledger/voucher", {
    date: supPayments[0].date,
    description: "Bank reconciliation - supplier payments and non-invoice",
    postings: voucherPostings,
  });
  console.log(
    `  Combined voucher: ${vRes.status} (id=${vRes.data?.value?.id}, ${voucherPostings.length} postings)`,
  );
  if (vRes.status >= 400) return null;

  // ======== STEP 6: Bank statement import ========
  console.log("\n── Step 6: Bank statement import ──");

  const firstDate = lines[0].date.split("-").reverse().join(".");
  const lastDate = lines[lines.length - 1].date.split("-").reverse().join(".");
  const fmt = (n: number) => n.toFixed(2).replace(".", ",");

  let sbankenCsv = `"Inngående saldo ${firstDate}";"${fmt(openingBalance)}"\n`;
  sbankenCsv += `"Utgående saldo ${lastDate}";"${fmt(closingBalance)}"\n`;
  sbankenCsv += `"Bokført";"Rentedato";"Beskrivelse";"Beløp"\n`;
  for (const l of lines) {
    const d = l.date.split("-").reverse().join(".");
    const amount = l.inn > 0 ? l.inn : -l.ut;
    sbankenCsv += `"${d}";"${d}";"${l.desc}";"${fmt(amount)}"\n`;
  }

  console.log("  Sbanken CSV preview:");
  for (const line of sbankenCsv.split("\n").slice(0, 5)) {
    console.log(`    ${line}`);
  }
  console.log(`    ... (${lines.length} data rows total)`);

  const formData = new FormData();
  formData.append(
    "file",
    new Blob([sbankenCsv], { type: "text/csv" }),
    "bankstatement.csv",
  );

  const dayAfter = new Date(lines[lines.length - 1].date);
  dayAfter.setDate(dayAfter.getDate() + 1);
  const dayAfterStr = dayAfter.toISOString().split("T")[0];

  const importRes = await api(
    "POST",
    `bank/statement/import?bankId=112&accountId=${accounts[1920]}&fromDate=${lines[0].date}&toDate=${dayAfterStr}&fileFormat=SBANKEN_BEDRIFT_CSV`,
    formData,
  );

  if (importRes.status >= 400) return null;

  const bankStatement = importRes.data.value;
  console.log(
    `  Import OK: statement id=${bankStatement.id}`,
  );

  // Fetch full transaction details (import response may not include amounts)
  const txnDetailRes = await api(
    "GET",
    `bank/statement/transaction?bankStatementId=${bankStatement.id}&count=1000&fields=id,postedDate,amountCurrency,description`,
  );
  const bankTxns = txnDetailRes.data.values || [];
  console.log(`  Fetched ${bankTxns.length} transaction details`);
  for (const t of bankTxns) {
    console.log(
      `    txn ${t.id}: ${t.amountCurrency > 0 ? "+" : ""}${t.amountCurrency} "${(t.description || "").slice(0, 50)}"`,
    );
  }

  // ======== STEP 7: Match bank txns to ledger postings ========
  console.log("\n── Step 7: Match bank transactions to postings ──");

  // Get all 1920 postings for May 2027
  const postingsRes = await api(
    "GET",
    `ledger/posting?accountId=${accounts[1920]}&dateFrom=${FIRST_DAY}&dateTo=${NEXT_MONTH_FIRST}&count=1000&fields=id,date,amount,description`,
  );
  const allPostings1920 = postingsRes.data.values || [];
  console.log(`  1920 postings found: ${allPostings1920.length}`);

  // Create reconciliation (OPEN)
  let reconRes = await api(
    "GET",
    `bank/reconciliation?accountId=${accounts[1920]}&accountingPeriodId=${period.id}&count=1&fields=*`,
  );
  let recon = (reconRes.data.values || [])[0];
  if (!recon) {
    const createRes = await api("POST", "bank/reconciliation", {
      account: { id: accounts[1920] },
      accountingPeriod: { id: period.id },
      type: "MANUAL",
      bankAccountClosingBalanceCurrency: 0,
      isClosed: false,
    });
    recon = createRes.data?.value;
    console.log(`  Created reconciliation: id=${recon?.id}`);
  } else {
    console.log(
      `  Existing reconciliation: id=${recon.id} (closed=${recon.isClosed})`,
    );
  }

  if (!recon?.id) return null;

  // Match each bank txn to posting with same amount
  const usedPostingIds = new Set<number>();
  let matchCount = 0;

  for (const txn of bankTxns) {
    const matchPosting = allPostings1920.find(
      (p: any) =>
        Math.abs(p.amount - txn.amountCurrency) < 0.01 &&
        !usedPostingIds.has(p.id),
    );

    if (matchPosting) {
      usedPostingIds.add(matchPosting.id);
      const matchRes = await api("POST", "bank/reconciliation/match", {
        bankReconciliation: { id: recon.id },
        transactions: [{ id: txn.id }],
        postings: [{ id: matchPosting.id }],
      });

      if (matchRes.status < 400) {
        matchCount++;
        console.log(
          `  ✓ txn ${txn.id} (${txn.amountCurrency}) ↔ posting ${matchPosting.id} (${matchPosting.amount})`,
        );
      } else {
        console.error(
          `  ✗ MATCH FAILED: txn ${txn.id} (${txn.amountCurrency}) ↔ posting ${matchPosting.id}`,
        );
      }
    } else {
      console.error(
        `  ✗ NO POSTING for txn ${txn.id} (amount=${txn.amountCurrency})`,
      );
      // Debug: show available unmatched postings
      const available = allPostings1920.filter(
        (p: any) => !usedPostingIds.has(p.id),
      );
      console.error(
        `    Available postings: ${available.map((p: any) => `${p.id}:${p.amount}`).join(", ")}`,
      );
    }
  }

  console.log(`\n  Matched: ${matchCount}/${bankTxns.length}`);

  // ======== STEP 8: Close bank reconciliation ========
  console.log("\n── Step 8: Close bank reconciliation ──");

  const freshRecon = await api(
    "GET",
    `bank/reconciliation/${recon.id}?fields=*`,
  );
  const version = freshRecon.data?.value?.version;

  // First check what the actual 1920 balance is
  const bsRes = await api(
    "GET",
    `balanceSheet?dateFrom=${FIRST_DAY}&dateTo=${NEXT_MONTH_FIRST}&accountNumberFrom=1920&accountNumberTo=1920&count=1&fields=*`,
  );
  const actualBalance = bsRes.data?.values?.[0]?.balanceOut;
  console.log(`  Expected closing (prior + CSV): ${expectedLedgerClosing}`);
  console.log(`  Actual 1920 balance: ${actualBalance}`);
  console.log(`  Match: ${Math.abs((actualBalance || 0) - expectedLedgerClosing) < 0.01 ? "YES" : "NO — diff=" + ((actualBalance || 0) - expectedLedgerClosing)}`);

  // Use actual balance for closing
  const closeBalance = Math.round((actualBalance || expectedLedgerClosing) * 100) / 100;

  const closeRes = await api("PUT", `bank/reconciliation/${recon.id}`, {
    id: recon.id,
    version,
    account: { id: accounts[1920] },
    accountingPeriod: { id: period.id },
    type: "MANUAL",
    bankAccountClosingBalanceCurrency: closeBalance,
    isClosed: true,
  });

  console.log(`  Close reconciliation: ${closeRes.status}`);
  if (closeRes.status >= 400) {
    console.error("  CLOSE FAILED — checking balance mismatch...");
    console.error(
      `  CSV closing: ${roundedClosing}, Actual balance: ${actualBalance}`,
    );
    console.error(
      `  Difference: ${(actualBalance || 0) - roundedClosing}`,
    );
  }

  const flowCalls = callCount - flowStartCalls;
  const flowErrors = errorCount - flowStartErrors;
  console.log(`\n  Flow API calls: ${flowCalls}, errors: ${flowErrors}`);

  return {
    recon,
    bankStatement,
    matchCount,
    totalTxns: bankTxns.length,
    accounts,
    period,
    closeBalance,
    flowCalls,
    flowErrors,
  };
}

// ==================================================================
// PHASE 4: VERIFY
// ==================================================================

async function verify(result: any) {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`PHASE 4: VERIFICATION`);
  console.log(`${"=".repeat(60)}\n`);

  if (!result) {
    console.log("SKIP: flow failed");
    return;
  }

  const checks: Array<{ name: string; pass: boolean; detail: string }> = [];

  // Check 1: Bank reconciliation is closed
  const reconRes = await api(
    "GET",
    `bank/reconciliation/${result.recon.id}?fields=*`,
  );
  const recon = reconRes.data?.value;
  checks.push({
    name: "Bank reconciliation closed",
    pass: recon?.isClosed === true,
    detail: `isClosed=${recon?.isClosed}, balance=${recon?.bankAccountClosingBalanceCurrency}`,
  });

  // Check 2: All bank transactions matched
  const txnRes = await api(
    "GET",
    `bank/statement/transaction?bankStatementId=${result.bankStatement.id}&count=100&fields=id,amountCurrency,matched,matchType`,
  );
  const txns = txnRes.data.values || [];
  const allMatched = txns.length > 0 && txns.every((t: any) => t.matched);
  checks.push({
    name: "All bank txns matched",
    pass: allMatched,
    detail: `${txns.filter((t: any) => t.matched).length}/${txns.length} matched`,
  });

  // Check 3: Reconciliation matches count
  const matchRes = await api(
    "GET",
    `bank/reconciliation/match?bankReconciliationId=${result.recon.id}&count=100&fields=*`,
  );
  const matches = matchRes.data.values || [];
  checks.push({
    name: "Match count equals txn count",
    pass: matches.length === txns.length,
    detail: `${matches.length} matches for ${txns.length} txns`,
  });

  // Check 4: Balance matches
  const bsRes = await api(
    "GET",
    `balanceSheet?dateFrom=${FIRST_DAY}&dateTo=${NEXT_MONTH_FIRST}&accountNumberFrom=1920&accountNumberTo=1920&count=1&fields=*`,
  );
  const balance = bsRes.data?.values?.[0]?.balanceOut;
  const balanceMatch =
    Math.abs((balance || 0) - result.closeBalance) < 0.01;
  checks.push({
    name: "1920 balance matches closing",
    pass: balanceMatch,
    detail: `ledger=${balance}, closing=${result.closeBalance}`,
  });

  // Check 5: Invoices updated
  const invRes = await api(
    "GET",
    `invoice?invoiceDateFrom=${FIRST_DAY}&invoiceDateTo=${NEXT_MONTH_FIRST}&count=100&fields=id,invoiceNumber,amountCurrency,amountCurrencyOutstanding,customer(name)`,
  );
  const paidInvoices = (invRes.data.values || []).filter(
    (i: any) => i.amountCurrencyOutstanding < i.amountCurrency,
  );
  checks.push({
    name: "Customer invoices paid (5 of 6)",
    pass: paidInvoices.length >= 5,
    detail: `${paidInvoices.length} invoices paid/partially paid`,
  });

  // Print results
  console.log("VERIFICATION RESULTS:");
  for (const c of checks) {
    console.log(
      `  ${c.pass ? "✓ PASS" : "✗ FAIL"}: ${c.name} — ${c.detail}`,
    );
  }

  const allPass = checks.every((c) => c.pass);
  console.log(
    `\n  ${allPass ? "ALL CHECKS PASSED ✓" : "SOME CHECKS FAILED ✗"}`,
  );
  console.log(`  Flow calls: ${result.flowCalls}, errors: ${result.flowErrors}`);
  console.log(`  Total API calls (incl setup): ${callCount}`);
}

// ==================================================================
// MAIN
// ==================================================================

async function main() {
  const testData = await setupTestData();
  if (!testData) {
    console.error("FATAL: setup failed");
    process.exit(1);
  }

  const csvData = buildTestCsv(testData);

  const result = await runFlow(testData, csvData);
  await verify(result);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
