/**
 * Test: Does accounting period matter for bank reconciliation matching?
 * Production CSVs span Jan-Feb. If recon is for Feb, do Jan txns fail to match?
 * Test both: recon for first month vs recon for last month vs multi-period approach.
 */

const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa(`0:${TOKEN}`);

async function api(method: string, path: string, body?: any, isForm = false) {
  const url = `${BASE}/${path}`;
  const headers: any = { Authorization: AUTH };
  if (body && !isForm) headers["Content-Type"] = "application/json";
  const opts: any = { method, headers };
  if (body) opts.body = isForm ? body : JSON.stringify(body);
  const res = await fetch(url, opts);
  const text = await res.text();
  let data: any;
  try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data };
}

const month = process.argv[2] || "2027-09";
const m = parseInt(month.split("-")[1]);
const y = parseInt(month.split("-")[0]);
// Create dates spanning TWO months: last 2 weeks of month M, first week of month M+1
const m2 = m === 12 ? 1 : m + 1;
const y2 = m === 12 ? y + 1 : y;

const dates = [
  `${y}-${String(m).padStart(2,"0")}-17`,   // month 1
  `${y}-${String(m).padStart(2,"0")}-20`,   // month 1
  `${y}-${String(m).padStart(2,"0")}-25`,   // month 1
  `${y2}-${String(m2).padStart(2,"0")}-02`, // month 2
  `${y2}-${String(m2).padStart(2,"0")}-04`, // month 2
];

const tag = Math.random().toString(36).slice(2, 10);

async function main() {
  console.log(`Cross-month test: ${dates[0]} to ${dates[4]} (tag=${tag})`);

  // Get accounts
  const acctRes = await api("GET", "ledger/account?number=1920,2050,7770&fields=id,number");
  const accts = acctRes.data.values || [];
  const acctMap: Record<number, number> = {};
  for (const a of accts) acctMap[a.number] = a.id;
  console.log(`Accounts: ${JSON.stringify(acctMap)}`);

  // Post opening balance + 5 test vouchers
  const obRes = await api("POST", "ledger/voucher", {
    date: dates[0],
    description: "Test OB " + tag,
    postings: [
      { row: 1, date: dates[0], account: { id: acctMap[1920] }, amount: 50000, amountCurrency: 50000, amountGross: 50000, amountGrossCurrency: 50000, currency: { id: 1 } },
      { row: 2, date: dates[0], account: { id: acctMap[2050] }, amount: -50000, amountCurrency: -50000, amountGross: -50000, amountGrossCurrency: -50000, currency: { id: 1 } },
    ],
  });
  console.log(`OB: ${obRes.status}`);

  // Post 5 test transactions on different dates (3 in month1, 2 in month2)
  const amounts = [1000, 2000, 3000, -500, -800];
  const vRes = await api("POST", "ledger/voucher", {
    date: dates[0],
    description: "Test movements " + tag,
    postings: dates.flatMap((d, i) => [
      { row: i*2+1, date: d, description: `Txn ${i} ${tag}`, account: { id: acctMap[1920] }, amount: amounts[i], amountCurrency: amounts[i], amountGross: amounts[i], amountGrossCurrency: amounts[i], currency: { id: 1 } },
      { row: i*2+2, date: d, description: `Txn ${i} ${tag}`, account: { id: acctMap[7770] }, amount: -amounts[i], amountCurrency: -amounts[i], amountGross: -amounts[i], amountGrossCurrency: -amounts[i], currency: { id: 1 } },
    ]),
  });
  console.log(`Movements voucher: ${vRes.status} id=${vRes.data.value?.id}`);

  // Import bank statement spanning both months
  const fmt = (n: number) => n.toFixed(2).replace(".", ",");
  const fmtDate = (d: string) => d.split("-").reverse().join(".");
  let sbanken = `"Inngående saldo ${fmtDate(dates[0])}";"${fmt(50000)}"\n`;
  sbanken += `"Utgående saldo ${fmtDate(dates[4])}";"${fmt(50000 + amounts.reduce((s,a) => s+a, 0))}"\n`;
  sbanken += `"Bokført";"Rentedato";"Beskrivelse";"Beløp"\n`;
  for (let i = 0; i < dates.length; i++) {
    sbanken += `"${fmtDate(dates[i])}";"${fmtDate(dates[i])}";"Txn ${i} ${tag}";"${fmt(amounts[i])}"\n`;
  }
  console.log(`\nSbanken CSV:\n${sbanken}`);

  const dayAfterLast = new Date(dates[4]);
  dayAfterLast.setDate(dayAfterLast.getDate() + 1);
  const dayAfter = dayAfterLast.toISOString().split("T")[0];

  const formData = new FormData();
  formData.append("file", new Blob([sbanken], { type: "text/csv" }), "bankstatement.csv");
  const importRes = await api("POST", `bank/statement/import?bankId=112&accountId=${acctMap[1920]}&fromDate=${dates[0]}&toDate=${dayAfter}&fileFormat=SBANKEN_BEDRIFT_CSV`, formData, true);
  console.log(`Import: ${importRes.status} bankStatementId=${importRes.data.value?.id}`);
  const bsId = importRes.data.value?.id;
  if (!bsId) { console.error("Import failed:", JSON.stringify(importRes.data).slice(0, 300)); return; }

  // Get bank transactions
  const txnRes = await api("GET", `bank/statement/transaction?bankStatementId=${bsId}&count=100&fields=id,postedDate,amountCurrency,description`);
  const txns = txnRes.data.values || [];
  console.log(`\nBank transactions: ${txns.length}`);
  for (const t of txns) console.log(`  ${t.id}: ${t.postedDate} ${t.amountCurrency} "${t.description}"`);

  // Get postings on 1920
  const postRes = await api("GET", `ledger/posting?accountId=${acctMap[1920]}&dateFrom=${dates[0]}&dateTo=${dayAfter}&count=100&fields=id,date,amount,description`);
  const posts = postRes.data.values || [];
  console.log(`\nPostings on 1920: ${posts.length}`);
  for (const p of posts) console.log(`  ${p.id}: ${p.date} ${p.amount} "${p.description}"`);

  // Get BOTH accounting periods
  const month1Start = `${y}-${String(m).padStart(2,"0")}-01`;
  const month1End = `${y}-${String(m).padStart(2,"0")}-02`;
  const month2Start = `${y2}-${String(m2).padStart(2,"0")}-01`;
  const month2End = `${y2}-${String(m2).padStart(2,"0")}-02`;

  const [per1Res, per2Res] = await Promise.all([
    api("GET", `ledger/accountingPeriod?startFrom=${month1Start}&startTo=${month1End}&count=1&fields=*`),
    api("GET", `ledger/accountingPeriod?startFrom=${month2Start}&startTo=${month2End}&count=1&fields=*`),
  ]);
  const period1 = per1Res.data.values?.[0];
  const period2 = per2Res.data.values?.[0];
  console.log(`\nPeriod 1 (month ${m}): id=${period1?.id} start=${period1?.start}`);
  console.log(`Period 2 (month ${m2}): id=${period2?.id} start=${period2?.start}`);

  // TEST 1: Create recon for FIRST month and try matching ALL transactions
  console.log("\n=== TEST 1: Recon for FIRST month, match ALL txns ===");
  const recon1Res = await api("POST", "bank/reconciliation", {
    account: { id: acctMap[1920] },
    accountingPeriod: { id: period1.id },
    type: "MANUAL",
    bankAccountClosingBalanceCurrency: 0,
    isClosed: false,
  });
  const recon1 = recon1Res.data.value;
  console.log(`Recon1: ${recon1Res.status} id=${recon1?.id}`);

  const usedPostings = new Set<number>();
  for (const txn of txns) {
    const matchPost = posts.find((p: any) => Math.abs(p.amount - txn.amountCurrency) < 0.01 && !usedPostings.has(p.id));
    if (matchPost) {
      usedPostings.add(matchPost.id);
      const mr = await api("POST", "bank/reconciliation/match", {
        bankReconciliation: { id: recon1.id },
        transactions: [{ id: txn.id }],
        postings: [{ id: matchPost.id }],
      });
      const ok = mr.status < 300;
      console.log(`  Match txn ${txn.id} (${txn.postedDate} ${txn.amountCurrency}) → post ${matchPost.id}: ${ok ? "OK" : "FAIL " + JSON.stringify(mr.data).slice(0, 150)}`);
    }
  }

  // Delete recon1 so we can try again with different period
  await api("DELETE", `bank/reconciliation/${recon1.id}`);
  console.log(`Deleted recon1`);

  // TEST 2: Create recon for SECOND month and try matching ALL
  console.log("\n=== TEST 2: Recon for SECOND month, match ALL txns ===");
  const recon2Res = await api("POST", "bank/reconciliation", {
    account: { id: acctMap[1920] },
    accountingPeriod: { id: period2.id },
    type: "MANUAL",
    bankAccountClosingBalanceCurrency: 0,
    isClosed: false,
  });
  const recon2 = recon2Res.data.value;
  console.log(`Recon2: ${recon2Res.status} id=${recon2?.id}`);

  const usedPostings2 = new Set<number>();
  for (const txn of txns) {
    const matchPost = posts.find((p: any) => Math.abs(p.amount - txn.amountCurrency) < 0.01 && !usedPostings2.has(p.id));
    if (matchPost) {
      usedPostings2.add(matchPost.id);
      const mr = await api("POST", "bank/reconciliation/match", {
        bankReconciliation: { id: recon2.id },
        transactions: [{ id: txn.id }],
        postings: [{ id: matchPost.id }],
      });
      const ok = mr.status < 300;
      console.log(`  Match txn ${txn.id} (${txn.postedDate} ${txn.amountCurrency}) → post ${matchPost.id}: ${ok ? "OK" : "FAIL " + JSON.stringify(mr.data).slice(0, 150)}`);
    }
  }
  await api("DELETE", `bank/reconciliation/${recon2.id}`);
  console.log(`Deleted recon2`);

  // TEST 3: TWO recons, one per month, match txns to correct period
  console.log("\n=== TEST 3: TWO recons, match each txn to correct period ===");
  const [r3aRes, r3bRes] = await Promise.all([
    api("POST", "bank/reconciliation", {
      account: { id: acctMap[1920] }, accountingPeriod: { id: period1.id },
      type: "MANUAL", bankAccountClosingBalanceCurrency: 0, isClosed: false,
    }),
    api("POST", "bank/reconciliation", {
      account: { id: acctMap[1920] }, accountingPeriod: { id: period2.id },
      type: "MANUAL", bankAccountClosingBalanceCurrency: 0, isClosed: false,
    }),
  ]);
  const r3a = r3aRes.data.value;
  const r3b = r3bRes.data.value;
  console.log(`Recon A (month ${m}): id=${r3a?.id}, Recon B (month ${m2}): id=${r3b?.id}`);

  const usedPostings3 = new Set<number>();
  for (const txn of txns) {
    const matchPost = posts.find((p: any) => Math.abs(p.amount - txn.amountCurrency) < 0.01 && !usedPostings3.has(p.id));
    if (matchPost) {
      usedPostings3.add(matchPost.id);
      const txnMonth = parseInt(txn.postedDate.split("-")[1]);
      const reconId = txnMonth === m ? r3a.id : r3b.id;
      const mr = await api("POST", "bank/reconciliation/match", {
        bankReconciliation: { id: reconId },
        transactions: [{ id: txn.id }],
        postings: [{ id: matchPost.id }],
      });
      const ok = mr.status < 300;
      console.log(`  Match txn ${txn.id} (${txn.postedDate} ${txn.amountCurrency}) → recon ${reconId === r3a.id ? "A" : "B"}: ${ok ? "OK" : "FAIL " + JSON.stringify(mr.data).slice(0, 150)}`);
    }
  }

  // Close both recons
  const closingBal = 50000 + amounts.reduce((s,a) => s+a, 0);
  for (const [label, rid] of [["A", r3a.id], ["B", r3b.id]] as const) {
    const fresh = await api("GET", `bank/reconciliation/${rid}?fields=*`);
    const cr = await api("PUT", `bank/reconciliation/${rid}`, {
      id: rid, version: fresh.data.value.version,
      account: { id: acctMap[1920] }, accountingPeriod: { id: label === "A" ? period1.id : period2.id },
      type: "MANUAL", bankAccountClosingBalanceCurrency: closingBal, isClosed: true,
    });
    console.log(`Close recon ${label}: ${cr.status} ${cr.status >= 400 ? JSON.stringify(cr.data).slice(0, 200) : "OK"}`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
