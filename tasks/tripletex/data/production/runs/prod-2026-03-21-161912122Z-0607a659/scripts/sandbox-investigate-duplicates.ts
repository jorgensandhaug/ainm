const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa(`0:${TOKEN}`);
const headers = { Authorization: AUTH, "Content-Type": "application/json" };

async function get(path: string) {
  const url = `${BASE}${path}`;
  console.log(`GET ${url}`);
  const r = await fetch(url, { headers });
  const body = await r.json();
  if (!r.ok) { console.error("GET failed:", r.status, JSON.stringify(body)); process.exit(1); }
  return body;
}

async function main() {
  // Get all vouchers from Jan-Feb 2026 to see what's in the sandbox
  const vResp = await get(
    "/ledger/voucher?dateFrom=2026-01-01&dateTo=2026-03-01" +
    "&fields=id,date,description,postings(id,account(id,number),amount,amountGross,amountGrossCurrency,vatType(id),supplier(id),description)" +
    "&count=1000"
  );
  const vouchers = vResp.values;
  console.log(`Found ${vouchers.length} vouchers\n`);

  // Analyze duplicate detection patterns
  // 1. Check for description keywords
  console.log("=== Vouchers with duplicate-related descriptions ===");
  for (const v of vouchers) {
    const desc = (v.description || "").toLowerCase();
    if (desc.includes("duplikat") || desc.includes("dobbelt") || desc.includes("duplicate")) {
      console.log(`  v${v.id} date=${v.date} desc="${v.description}"`);
      for (const p of (v.postings || [])) {
        console.log(`    acct=${p.account?.number} gross=${p.amountGross} vatType=${p.vatType?.id}`);
      }
    }
  }

  // 2. Group by account+amount signature to find actual duplicates (2+ matching entries)
  console.log("\n=== Signature grouping for duplicate detection ===");
  type VoucherSig = { voucherId: number; date: string; desc: string; acctNum: number; gross: number; sig: string };
  const allSigs: VoucherSig[] = [];

  for (const v of vouchers) {
    for (const p of (v.postings || [])) {
      const acctNum = p.account?.number;
      if (!acctNum) continue;
      // Skip system accounts
      if (acctNum === 2710 || acctNum === 1920 || acctNum === 2400) continue;

      const counterAccts = (v.postings || [])
        .filter((pp: any) => pp.account?.number !== acctNum && pp.account?.number !== 2710)
        .map((pp: any) => `${pp.account?.number}:${pp.amountGross}`)
        .sort()
        .join(",");
      const sig = `${acctNum}|${p.amountGross}|${counterAccts}`;
      allSigs.push({ voucherId: v.id, date: v.date, desc: v.description, acctNum, gross: p.amountGross, sig });
    }
  }

  const sigGroups = new Map<string, VoucherSig[]>();
  for (const s of allSigs) {
    const arr = sigGroups.get(s.sig) || [];
    arr.push(s);
    sigGroups.set(s.sig, arr);
  }

  for (const [sig, entries] of sigGroups) {
    if (entries.length >= 2) {
      console.log(`\nDuplicate sig: "${sig}" (${entries.length} entries)`);
      for (const e of entries) {
        console.log(`  v${e.voucherId} date=${e.date} desc="${e.desc}" acct=${e.acctNum} gross=${e.gross}`);
      }
    }
  }
}

main().catch(e => { console.error(e); process.exit(1); });
