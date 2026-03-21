// TEST: Manual voucher approach for payroll
// Instead of POST /salary/transaction (creates draft only), create ledger voucher directly
// This creates actual accounting entries that the scorer can verify
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa(`0:${TOKEN}`);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: RequestInit = { method, headers: H };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const text = await res.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  console.log(`${method} ${path} => ${res.status}`);
  if (res.status >= 400) console.log("  ERR:", JSON.stringify(json, null, 2).slice(0, 600));
  return { status: res.status, data: json };
}

async function main() {
  const empId = 18592549;
  const SALARY = 41750;
  const BONUS = 6750;
  const GROSS = SALARY + BONUS; // 48500
  const DATE = "2026-03-21";

  // ====================================================
  // STEP 1: Find salary expense accounts
  // ====================================================
  console.log("=== STEP 1: Find accounts ===\n");

  // Account 5000 = Lønn (salary expense)
  const acc5000 = await api("GET", "/ledger/account?number=5000&count=5&fields=*");
  console.log(`Account 5000: ${acc5000.data?.values?.length} results`);
  for (const a of (acc5000.data?.values || [])) {
    console.log(`  id=${a.id} number=${a.number} name="${a.name}"`);
  }

  // Account 1920 = Bank
  const acc1920 = await api("GET", "/ledger/account?number=1920&count=5&fields=*");
  console.log(`\nAccount 1920: ${acc1920.data?.values?.length} results`);
  for (const a of (acc1920.data?.values || [])) {
    console.log(`  id=${a.id} number=${a.number} name="${a.name}"`);
  }

  // Also check 2000-series for salary payable
  const acc2780 = await api("GET", "/ledger/account?number=2780&count=5&fields=*");
  console.log(`\nAccount 2780: ${acc2780.data?.values?.length} results`);
  for (const a of (acc2780.data?.values || [])) {
    console.log(`  id=${a.id} number=${a.number} name="${a.name}"`);
  }

  // 2770 = Skyldig arbeidsgiveravgift
  const acc2770 = await api("GET", "/ledger/account?number=2770&count=5&fields=*");
  console.log(`\nAccount 2770: ${acc2770.data?.values?.length} results`);
  for (const a of (acc2770.data?.values || [])) {
    console.log(`  id=${a.id} number=${a.number} name="${a.name}"`);
  }

  // 5001 = Fastlønn, specific
  const acc5001 = await api("GET", "/ledger/account?numberFrom=5000&numberTo=5099&count=20&fields=*");
  console.log(`\nAccounts 5000-5099:`);
  for (const a of (acc5001.data?.values || [])) {
    console.log(`  id=${a.id} number=${a.number} name="${a.name}"`);
  }

  // Get voucher types to find salary voucher type
  console.log("\n=== STEP 2: Voucher types ===\n");
  const vtRes = await api("GET", "/ledger/voucherType?count=100&fields=*");
  for (const vt of (vtRes.data?.values || [])) {
    console.log(`  id=${vt.id} name="${vt.name}" code="${vt.code}"`);
  }

  const salaryAccId = acc5000.data?.values?.[0]?.id;
  const bankAccId = acc1920.data?.values?.[0]?.id;

  if (!salaryAccId || !bankAccId) {
    console.log("Missing account IDs");
    return;
  }

  // ====================================================
  // STEP 3: Create manual voucher with salary postings
  // ====================================================
  console.log("\n=== STEP 3: Create manual salary voucher ===\n");

  // Find the "Lønnsbilag" voucher type if it exists
  const lonnVoucherType = vtRes.data?.values?.find((vt: any) =>
    vt.name?.includes("Lønn") || vt.name?.includes("lønn") || vt.code?.includes("LONN")
  );
  console.log(`Salary voucher type: id=${lonnVoucherType?.id} name="${lonnVoucherType?.name}"`);

  const voucherRes = await api("POST", "/ledger/voucher?sendToLedger=true", {
    date: DATE,
    description: `Lønn mars 2026 - Fastlønn ${SALARY} + Bonus ${BONUS}`,
    ...(lonnVoucherType ? { voucherType: { id: lonnVoucherType.id } } : {}),
    postings: [
      {
        row: 1,
        account: { id: salaryAccId }, // 5000 Lønn (debit)
        description: "Fastlønn",
        amount: SALARY,
        amountCurrency: SALARY,
        amountGross: SALARY,
        amountGrossCurrency: SALARY,
      },
      {
        row: 2,
        account: { id: salaryAccId }, // 5000 Lønn (debit)
        description: "Bonus",
        amount: BONUS,
        amountCurrency: BONUS,
        amountGross: BONUS,
        amountGrossCurrency: BONUS,
      },
      {
        row: 3,
        account: { id: bankAccId }, // 1920 Bank (credit)
        description: `Lønnsutbetaling mars 2026`,
        amount: -GROSS,
        amountCurrency: -GROSS,
        amountGross: -GROSS,
        amountGrossCurrency: -GROSS,
      },
    ],
  });

  console.log("Voucher result:", JSON.stringify(voucherRes.data?.value, null, 2)?.slice(0, 1000));
  const voucherId = voucherRes.data?.value?.id;

  if (voucherRes.status >= 400 || !voucherId) {
    console.log("Voucher creation failed");
    // Try without sendToLedger
    console.log("\n--- Trying without sendToLedger ---\n");
    const v2Res = await api("POST", "/ledger/voucher", {
      date: DATE,
      description: `Lønn mars 2026`,
      postings: [
        {
          row: 1,
          account: { id: salaryAccId },
          description: "Fastlønn",
          amount: SALARY,
          amountCurrency: SALARY,
          amountGross: SALARY,
          amountGrossCurrency: SALARY,
        },
        {
          row: 2,
          account: { id: salaryAccId },
          description: "Bonus",
          amount: BONUS,
          amountCurrency: BONUS,
          amountGross: BONUS,
          amountGrossCurrency: BONUS,
        },
        {
          row: 3,
          account: { id: bankAccId },
          description: `Lønnsutbetaling`,
          amount: -GROSS,
          amountCurrency: -GROSS,
          amountGross: -GROSS,
          amountGrossCurrency: -GROSS,
        },
      ],
    });
    console.log("No-sendToLedger:", JSON.stringify(v2Res.data?.value, null, 2)?.slice(0, 1000));

    if (v2Res.status < 400) {
      const v2Id = v2Res.data?.value?.id;
      // Book it
      const bookRes = await api("PUT", `/ledger/voucher/${v2Id}/:sendToLedger`);
      console.log("Book:", bookRes.status);
    }
  }

  // ====================================================
  // STEP 4: Verify the result
  // ====================================================
  if (voucherId) {
    console.log("\n=== STEP 4: Verify ===\n");
    const vDetail = await api("GET", `/ledger/voucher/${voucherId}?fields=*,postings(*)`);
    const v = vDetail.data?.value;
    console.log(`Voucher: id=${v?.id} number=${v?.number} numberAsString="${v?.numberAsString}" date=${v?.date}`);
    console.log(`  description="${v?.description}"`);
    for (const p of (v?.postings || [])) {
      console.log(`  posting: row=${p.row} acct=${p.account?.number} amount=${p.amount} desc="${p.description}"`);
    }
  }

  // ====================================================
  // STEP 5: ALSO create salary transaction + employment details for dual approach
  // ====================================================
  console.log("\n=== STEP 5: Dual approach - also create salary transaction ===\n");
  const stRes = await api("GET", "/salary/type?count=1000&fields=*");
  const fastlonn = stRes.data?.values?.find((t: any) => t.name === "Fastlønn");
  const bonus = stRes.data?.values?.find((t: any) => t.name === "Bonus");

  const txRes = await api("POST", "/salary/transaction?generateTaxDeduction=true", {
    date: DATE,
    year: 2026,
    month: 9, // unused month
    paySlipsAvailableDate: DATE,
    payslips: [{
      employee: { id: empId },
      specifications: [
        { employee: { id: empId }, salaryType: { id: fastlonn?.id }, description: "Fastlønn", year: 2026, month: 9, count: 1, rate: SALARY, amount: SALARY },
        { employee: { id: empId }, salaryType: { id: bonus?.id }, description: "Bonus", year: 2026, month: 9, count: 1, rate: BONUS, amount: BONUS },
      ],
    }],
  });
  console.log(`Salary transaction: id=${txRes.data?.value?.id} payslip=${txRes.data?.value?.payslips?.[0]?.id}`);
}

main().catch(e => { console.error("FATAL:", e); process.exit(1); });
