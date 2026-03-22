/**
 * Task 30 — Full /yearEnd/annualAccounts deep dive
 * Focus on transfers, netProfitOrLossForTheYear, and balance sheet sections
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
  // Get the FULL annualAccounts response
  console.log("=== FULL /yearEnd/annualAccounts ===");
  const aa = await api("GET", "/yearEnd/annualAccounts", undefined, { year: "2025", fields: "*" });

  if (aa.status === 200) {
    const v = aa.data?.value;
    console.log("ALL TOP-LEVEL KEYS:", Object.keys(v).join(", "));

    // Print each section
    for (const key of Object.keys(v)) {
      const section = v[key];
      if (section === null || section === undefined) {
        console.log(`\n--- ${key}: null ---`);
        continue;
      }
      if (typeof section === 'object' && section.name) {
        console.log(`\n--- ${key}: "${section.name}" ---`);
        console.log(`  sumOpeningBalance: ${section.sumOpeningBalance}`);
        console.log(`  sumClosingBalance: ${section.sumClosingBalance}`);
        if (section.subTotalLines) {
          for (const line of section.subTotalLines) {
            console.log(`  [${line.orid}] "${line.name}" grouping=${line.grouping} closing=${line.closingBalance} opening=${line.openingBalance}`);
          }
        }
      } else if (typeof section === 'object') {
        console.log(`\n--- ${key}: ${JSON.stringify(section).slice(0, 300)} ---`);
      } else {
        console.log(`\n--- ${key}: ${section} ---`);
      }
    }
  }

  // Also check: the "Disponering" (transfers/disposition) section
  // This is crucial — does the yearEnd/annualAccounts have disposition data?
  console.log("\n\n=== /yearEnd with different field expansions ===");

  // Try expanding sub-objects
  const yeExpanded = await api("GET", "/yearEnd", undefined, {
    year: "2025",
    fields: "id,status,annualResult,yearEndReportPosting(*),yearEndReportBasicData(*)"
  });
  if (yeExpanded.status === 200) {
    const v = yeExpanded.data?.value;
    console.log("yearEndReportBasicData:", JSON.stringify(v?.yearEndReportBasicData));
    console.log("yearEndReportPosting:", JSON.stringify(v?.yearEndReportPosting));
  }

  // Check what the scorer might verify:
  // Hypothesis: the scorer reads /yearEnd/annualAccounts and checks:
  // 1. Each depreciation appears under operatingProfitExpenses/avskrivning
  // 2. The prepaid reversal changes currentAssets correctly
  // 3. Tax appears under ordinaryResultAfterTaxes/skattekostnad
  // 4. Transfers/disposition appears under netProfitOrLossForTheYear or transfers

  // Let me check the exact balance sheet accounts that feed into each section
  console.log("\n=== Balance sheet by yearEnd section groupings ===");

  // operatingProfitExpenses depreciation: 6000-6049,6060-6099
  await getGroupingBalances("6000-6049,6060-6099", "Depreciation (6000-6049,6060-6099)");

  // operatingProfitExpenses other: 6100-7999,8500-8599,8700-8799
  await getGroupingBalances("6100-6399", "Other operating 6100-6399");
  await getGroupingBalances("7400-7599", "Other operating 7400-7599");
  await getGroupingBalances("8700-8799", "8700 range (miscategorized as operating)");

  // Tax: 8300-8399,8600-8699
  await getGroupingBalances("8300-8399", "Tax 8300-8399");
  await getGroupingBalances("8600-8699", "Tax 8600-8699");

  // What about 8800-8999? What yearEnd section do these fall in?
  await getGroupingBalances("8800-8999", "Result/disposition 8800-8999");

  // Check currentAssets — prepaid account 1700 grouping
  await getGroupingBalances("1700-1779", "Prepaid (1700-1779)");
}

async function getGroupingBalances(range: string, label: string) {
  const [fromStr, toStr] = range.split("-");
  const from = parseInt(fromStr);
  const to = parseInt(toStr);
  const bs = await api("GET", "/balanceSheet", undefined, {
    dateFrom: "2025-01-01", dateTo: "2026-01-01",
    accountNumberFrom: String(from), accountNumberTo: String(to),
    fields: "*,account(number,name)", count: "50"
  });
  let total = 0;
  const accounts: string[] = [];
  if (bs.status === 200) {
    for (const row of bs.data?.values ?? []) {
      if (Math.abs(row.balanceOut) > 0.01) {
        accounts.push(`${row.account?.number}=${row.balanceOut}`);
        total += row.balanceOut ?? 0;
      }
    }
  }
  console.log(`  ${label}: total=${total} [${accounts.join(", ")}]`);
}

main().catch(console.error);
