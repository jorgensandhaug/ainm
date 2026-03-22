/**
 * Task 30 — How to populate yearEndReportPosting?
 *
 * Hypothesis: yearEndReportPosting requires vouchers with a specific voucherType
 * or created through a year-end workflow endpoint.
 */

const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + Buffer.from(`0:${TOKEN}`).toString("base64");

async function api(method: string, path: string, body?: any, query?: Record<string, string>) {
  let url = `${BASE}${path}`;
  if (query) url += "?" + new URLSearchParams(query).toString();
  const res = await fetch(url, {
    method,
    headers: { Authorization: AUTH, "Content-Type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  let data: any;
  try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data };
}

async function main() {
  // 1. Check /yearEnd/annualAccounts
  console.log("=== /yearEnd/annualAccounts ===");
  const aa = await api("GET", "/yearEnd/annualAccounts", undefined, { year: "2025", fields: "*" });
  console.log("Status:", aa.status);
  console.log("Data:", JSON.stringify(aa.data).slice(0, 2000));

  // 2. Check available voucherTypes
  console.log("\n=== Voucher Types ===");
  // Try different endpoint patterns
  for (const path of [
    "/ledger/voucherType",
    "/ledger/voucher/type",
  ]) {
    const r = await api("GET", path, undefined, { count: "100", fields: "*" });
    console.log(`  ${path}: ${r.status}`);
    if (r.status === 200 && r.data?.values) {
      for (const vt of r.data.values) {
        console.log(`    ${vt.id}: "${vt.name}"`);
      }
    }
  }

  // 3. Look at an existing voucher to see what voucherType it uses
  console.log("\n=== Existing Voucher Types ===");
  const vouchers = await api("GET", "/ledger/voucher", undefined, {
    dateFrom: "2025-01-01", dateTo: "2025-12-31",
    fields: "id,date,description,voucherType(*)", count: "5"
  });
  if (vouchers.status === 200) {
    for (const v of vouchers.data?.values ?? []) {
      console.log(`  Voucher ${v.id}: type=${JSON.stringify(v.voucherType)}, desc="${v.description}"`);
    }
  }

  // 4. Try to find year-end specific voucher type
  console.log("\n=== Search for year-end voucher type ===");
  const allVouchers = await api("GET", "/ledger/voucher", undefined, {
    dateFrom: "2025-12-31", dateTo: "2025-12-31",
    fields: "id,date,description,voucherType(*),postings(account(number,name),amountGross)", count: "20"
  });
  if (allVouchers.status === 200) {
    const vtypes = new Map<string, string>();
    for (const v of allVouchers.data?.values ?? []) {
      const vtName = v.voucherType?.name ?? "unknown";
      vtypes.set(String(v.voucherType?.id), vtName);
      console.log(`  Voucher ${v.id}: type=${v.voucherType?.id}:"${vtName}" desc="${v.description}"`);
    }
    console.log("\n  Distinct types:", [...vtypes.entries()].map(([k, v]) => `${k}="${v}"`).join(", "));
  }

  // 5. Try posting a voucher with voucherType explicitly set to different values
  // First, find a "Årsoppgjør" or "YE" voucher type
  console.log("\n=== List all voucherType IDs ===");
  const vtSearch = await api("GET", "/ledger/voucherType", undefined, { count: "100", fields: "*" });
  if (vtSearch.status === 200) {
    for (const vt of vtSearch.data?.values ?? []) {
      console.log(`  VoucherType ${vt.id}: "${vt.name}"`);
    }
  } else {
    // Maybe voucherType is at a different endpoint
    console.log("  voucherType endpoint not found, trying alternatives...");
    // Try getting the voucherType from a voucher and iterating
    for (const typeId of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]) {
      const testVoucher = await api("POST", "/ledger/voucher", {
        date: "2025-12-31",
        description: `Type test ${typeId}`,
        voucherType: { id: typeId },
        postings: [
          { row: 1, account: { id: 424190862 }, amountGross: 1, amountGrossCurrency: 1 }, // 8300
          { row: 2, account: { id: 424190862 }, amountGross: -1, amountGrossCurrency: -1 }, // dummy
        ]
      });
      if (testVoucher.status < 400) {
        console.log(`  TypeId ${typeId}: ${testVoucher.status} - created!`);
        // Read back to see the type name
        if (testVoucher.data?.value?.id) {
          const readBack = await api("GET", `/ledger/voucher/${testVoucher.data.value.id}`, undefined, { fields: "voucherType(*)" });
          console.log(`    Type name: "${readBack.data?.value?.voucherType?.name}"`);
        }
        break; // Stop at first success to save calls
      } else {
        const msg = testVoucher.data?.validationMessages?.[0]?.message || testVoucher.data?.message || "";
        if (!msg.includes("ID not found")) {
          console.log(`  TypeId ${typeId}: ${testVoucher.status} - ${msg.slice(0, 100)}`);
        }
      }
    }
  }

  // 6. Check the yearEndReportPosting section grouping
  console.log("\n=== yearEndReportPosting grouping analysis ===");
  const ye = await api("GET", "/yearEnd", undefined, { year: "2025", fields: "yearEndReportPosting(*)" });
  console.log("  yearEndReportPosting:", JSON.stringify(ye.data?.value?.yearEndReportPosting));

  // Maybe yearEndReportPosting is populated from a specific account range like 8800-8999?
  // Let's check the balance on 8800, 8960, 2050 which are year-end accounts
  console.log("\n=== Year-end disposition accounts ===");
  for (const acctNum of [8800, 8960, 2050]) {
    const bs = await api("GET", "/balanceSheet", undefined, {
      dateFrom: "2025-01-01", dateTo: "2026-01-01",
      accountNumberFrom: String(acctNum), accountNumberTo: String(acctNum),
      fields: "*,account(number,name)", count: "10"
    });
    if (bs.status === 200) {
      for (const row of bs.data?.values ?? []) {
        console.log(`  ${row.account?.number} ${row.account?.name}: balanceOut=${row.balanceOut}`);
      }
    }
  }

  // 7. yearEnd annualResult formula check
  console.log("\n=== yearEnd annualResult formula ===");
  const yeFull = await api("GET", "/yearEnd", undefined, { year: "2025", fields: "annualResult,operatingRevenue,operatingExpense,capitalIncome,capitalCost,extraordinaryCost,taxCost" });
  const v = yeFull.data?.value;
  if (v) {
    const rev = v.operatingRevenue?.sumAmount ?? 0;
    const exp = v.operatingExpense?.sumAmount ?? 0;
    const capInc = v.capitalIncome?.sumAmount ?? 0;
    const capCost = v.capitalCost?.sumAmount ?? 0;
    const extraCost = v.extraordinaryCost?.sumAmount ?? 0;
    const tax = v.taxCost?.sumAmount ?? 0;
    const calculated = rev - exp + capInc - capCost - extraCost - tax;
    console.log(`  Revenue: ${rev}`);
    console.log(`  Expense: ${exp}`);
    console.log(`  CapitalIncome: ${capInc}`);
    console.log(`  CapitalCost: ${capCost}`);
    console.log(`  ExtraordinaryCost: ${extraCost}`);
    console.log(`  Tax: ${tax}`);
    console.log(`  Calculated: ${calculated}`);
    console.log(`  Actual annualResult: ${v.annualResult}`);
  }
}

main().catch(console.error);
