const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  console.log(`${method} ${url}`);
  const opts: any = {
    method,
    headers: { Authorization: AUTH, "Content-Type": "application/json" },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const json = await res.json();
  if (!res.ok) {
    console.error("ERROR", res.status, JSON.stringify(json).slice(0, 500));
    return null;
  }
  return json;
}

async function main() {
  // Query all vouchers in Jan-Feb with full expansion
  const vRes = await api("GET", "/ledger/voucher?dateFrom=2026-01-01&dateTo=2026-03-01&fields=id,date,description,postings(id,account(id,number),amount,amountGross,amountGrossCurrency,vatType(id),supplier(id),description)&count=1000");
  if (!vRes) return;

  console.log(`\nTotal vouchers: ${vRes.values.length}`);

  // Find ALL vouchers that have a posting on an expense account (4xxx, 5xxx, 6xxx, 7xxx)
  // and check which ones have 2710 and which don't
  for (const v of vRes.values) {
    const expensePostings = v.postings.filter((p: any) => {
      const num = p.account?.number;
      return num && num >= 4000 && num < 8000;
    });
    const has2710 = v.postings.some((p: any) => p.account?.number === 2710);

    if (expensePostings.length > 0) {
      for (const ep of expensePostings) {
        console.log(`  Voucher ${v.id} | ${v.date} | "${v.description}" | acct=${ep.account.number} | gross=${ep.amountGross} | net=${ep.amount} | vatType=${ep.vatType?.id} | has2710=${has2710}`);
      }
    }
  }

  // Now specifically look for accounts commonly used in missing-VAT test scenarios
  console.log("\n--- Specific search for missing-VAT candidates ---");
  const targetAccounts = [4300, 4500, 6500, 6540, 7000, 7100, 7300];

  for (const acctNum of targetAccounts) {
    const matches = [];
    for (const v of vRes.values) {
      for (const p of v.postings) {
        if (p.account?.number === acctNum) {
          const has2710 = v.postings.some((pp: any) => pp.account?.number === 2710);
          const amt2710 = v.postings
            .filter((pp: any) => pp.account?.number === 2710)
            .reduce((s: number, pp: any) => s + pp.amountGross, 0);
          matches.push({
            voucherId: v.id,
            date: v.date,
            desc: v.description,
            gross: p.amountGross,
            net: p.amount,
            vatType: p.vatType?.id,
            has2710,
            amt2710,
          });
        }
      }
    }
    if (matches.length > 0) {
      console.log(`\nAccount ${acctNum}:`);
      for (const m of matches) {
        console.log(`  v=${m.voucherId} | ${m.date} | "${m.desc}" | gross=${m.gross} | net=${m.net} | vatType=${m.vatType} | has2710=${m.has2710} (${m.amt2710})`);
      }
    }
  }
}

main().catch(e => console.error("FATAL:", e.message));
