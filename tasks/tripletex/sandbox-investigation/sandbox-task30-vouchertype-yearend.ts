/**
 * Task 30 — Test if specific voucherType populates yearEndReportPosting
 * Also test: /yearEnd/annualAccounts PUT/POST, undocumented endpoints
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
  if (!res.ok && res.status !== 409) console.log(`  ${method} ${path} → ${res.status}: ${typeof data === 'string' ? data.slice(0, 200) : JSON.stringify(data).slice(0, 200)}`);
  return { status: res.status, data };
}

async function main() {
  // Get account IDs for test postings
  const accts = await api("GET", "/ledger/account", undefined, {
    number: "8300,2500,6300,1700", fields: "id,number,name", count: "10"
  });
  const acctMap = new Map<number, number>();
  for (const a of accts.data?.values ?? []) acctMap.set(a.number, a.id);
  console.log("Account map:", [...acctMap.entries()].map(([k, v]) => `${k}→${v}`).join(", "));

  // 1. Try posting a test voucher with each voucherType and check yearEndReportPosting after
  console.log("\n=== Test voucher with different voucherTypes ===");

  // Get current yearEndReportPosting
  const yeBefore = await api("GET", "/yearEnd", undefined, { year: "2025", fields: "yearEndReportPosting(*)" });
  console.log("Before:", JSON.stringify(yeBefore.data?.value?.yearEndReportPosting));

  // Try voucherType "Åpningsbalanse" (9744856) - closest to year-end?
  const testVoucher = await api("POST", "/ledger/voucher", {
    date: "2025-12-31",
    description: "YearEnd test with Åpningsbalanse type",
    voucherType: { id: 9744856 },
    postings: [
      { row: 1, account: { id: acctMap.get(8300)! }, amountGross: 0.01, amountGrossCurrency: 0.01, description: "Test tax" },
      { row: 2, account: { id: acctMap.get(2500)! }, amountGross: -0.01, amountGrossCurrency: -0.01, description: "Test tax payable" },
    ]
  });
  console.log("Voucher with Åpningsbalanse type:", testVoucher.status);
  if (testVoucher.status === 201) {
    const vid = testVoucher.data?.value?.id;
    const readback = await api("GET", `/ledger/voucher/${vid}`, undefined, { fields: "voucherType(*),date,description" });
    console.log("  Readback type:", readback.data?.value?.voucherType?.name);

    // Check yearEndReportPosting after
    const yeAfter = await api("GET", "/yearEnd", undefined, { year: "2025", fields: "yearEndReportPosting(*)" });
    console.log("  After Åpningsbalanse voucher:", JSON.stringify(yeAfter.data?.value?.yearEndReportPosting));
  }

  // 2. Try undocumented yearEnd endpoints for creating report postings
  console.log("\n=== Undocumented yearEnd endpoints ===");

  // POST /yearEnd/annualAccounts
  const postAA = await api("POST", "/yearEnd/annualAccounts", { year: 2025 });
  console.log("POST /yearEnd/annualAccounts:", postAA.status);

  // PUT /yearEnd/annualAccounts
  const putAA = await api("PUT", "/yearEnd/annualAccounts", { year: 2025 });
  console.log("PUT /yearEnd/annualAccounts:", putAA.status);

  // POST /yearEnd/0/posting (yearEnd id is 0)
  const postPosting = await api("POST", "/yearEnd/0/posting", {
    posts: [{ groupNumber: "8300", sumAmount: 1000 }]
  });
  console.log("POST /yearEnd/0/posting:", postPosting.status);

  // POST /yearEnd/posting
  const postPosting2 = await api("POST", "/yearEnd/posting", {
    yearEndReportId: 0, posts: [{ groupNumber: "8300", sumAmount: 1000 }]
  });
  console.log("POST /yearEnd/posting:", postPosting2.status);

  // PUT /yearEnd/0/yearEndReportPosting
  const putYePost = await api("PUT", "/yearEnd/0/yearEndReportPosting", {
    posts: [{ groupNumber: "8300", sumAmount: 1000 }]
  });
  console.log("PUT /yearEnd/0/yearEndReportPosting:", putYePost.status);

  // POST /yearEnd/0/send
  const send = await api("POST", "/yearEnd/0/send");
  console.log("POST /yearEnd/0/send:", send.status);

  // PUT /yearEnd/0
  const putYe0 = await api("PUT", "/yearEnd/0", { status: "COMPLETED" });
  console.log("PUT /yearEnd/0:", putYe0.status);

  // GET /yearEnd/0 with all fields
  const getYe0 = await api("GET", "/yearEnd/0", undefined, { fields: "*" });
  console.log("GET /yearEnd/0:", getYe0.status);
  if (getYe0.status === 200) {
    console.log("  Keys:", Object.keys(getYe0.data?.value ?? {}).join(", "));
    console.log("  yearEndReportBasicData:", JSON.stringify(getYe0.data?.value?.yearEndReportBasicData));
  }

  // 3. Try voucherType iteration - post with each type and see which ones work
  console.log("\n=== Test posting with different voucherTypes ===");
  const voucherTypes = [
    { id: 9744844, name: "Utgående faktura" },
    { id: 9744845, name: "Leverandørfaktura" },
    { id: 9744847, name: "Betaling" },
    { id: 9744848, name: "Lønnsbilag" },
    { id: 9744856, name: "Åpningsbalanse" },
  ];

  for (const vt of voucherTypes) {
    const r = await api("POST", "/ledger/voucher", {
      date: "2025-12-31",
      description: `Test ${vt.name}`,
      voucherType: { id: vt.id },
      postings: [
        { row: 1, account: { id: acctMap.get(6300)! }, amountGross: 0.01, amountGrossCurrency: 0.01 },
        { row: 2, account: { id: acctMap.get(1700)! }, amountGross: -0.01, amountGrossCurrency: -0.01 },
      ]
    });
    console.log(`  ${vt.name} (${vt.id}): ${r.status}`);
  }

  // 4. Post with NO voucherType (null/default)
  const defaultVoucher = await api("POST", "/ledger/voucher", {
    date: "2025-12-31",
    description: "Test default type",
    postings: [
      { row: 1, account: { id: acctMap.get(6300)! }, amountGross: 0.02, amountGrossCurrency: 0.02 },
      { row: 2, account: { id: acctMap.get(1700)! }, amountGross: -0.02, amountGrossCurrency: -0.02 },
    ]
  });
  console.log("Default (no type):", defaultVoucher.status);
  if (defaultVoucher.status === 201) {
    const vid = defaultVoucher.data?.value?.id;
    const rb = await api("GET", `/ledger/voucher/${vid}`, undefined, { fields: "voucherType(*)" });
    console.log("  Readback type:", JSON.stringify(rb.data?.value?.voucherType));
  }

  // 5. Final check: yearEndReportPosting
  const yeFinal = await api("GET", "/yearEnd", undefined, { year: "2025", fields: "yearEndReportPosting(*),status" });
  console.log("\nFinal yearEndReportPosting:", JSON.stringify(yeFinal.data?.value?.yearEndReportPosting));
  console.log("Final status:", yeFinal.data?.value?.status);

  // 6. Check yearEnd basic data structure
  console.log("\n=== yearEnd basic data exploration ===");
  const basicData = await api("GET", "/yearEnd", undefined, {
    year: "2025",
    fields: "yearEndReportBasicData(*),showInfoSumDepreciation,showInfoSumRevenueRecognitionNegBalance"
  });
  console.log("yearEndReportBasicData:", JSON.stringify(basicData.data?.value?.yearEndReportBasicData));
  console.log("showInfoSumDepreciation:", basicData.data?.value?.showInfoSumDepreciation);
  console.log("showInfoSumRevenueRecognitionNegBalance:", basicData.data?.value?.showInfoSumRevenueRecognitionNegBalance);
}

main().catch(console.error);
