// Task 23: verify accounts for non-invoice bank statement lines
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa(`0:${TOKEN}`);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: RequestInit = { method, headers: H };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const json = await res.json();
  console.log(`${method} ${path} => ${res.status}`);
  if (res.status >= 400) console.log("  ERR:", JSON.stringify(json, null, 2).slice(0, 500));
  return { status: res.status, data: json };
}

async function main() {
  // Check accounts for non-invoice line types
  // 8040/8050 = Renteinntekter (interest income)
  // 6300/7770 = Bankgebyr (bank fees/charges)
  // 2600/2780 = Skattetrekk (tax deduction)
  // 1920 = Bank
  const accounts = [1920, 2600, 2610, 2780, 6300, 7770, 8040, 8050];
  const accRes = await api("GET", `/ledger/account?number=${accounts.join(",")}&fields=id,number,name,vatType(id,percentage),vatLocked`);

  console.log("\nNon-invoice line account mapping:");
  for (const acc of (accRes.data?.values || []).sort((a: any, b: any) => a.number - b.number)) {
    console.log(`  ${acc.number} "${acc.name}" (id=${acc.id}, vatLocked=${acc.vatLocked}, vatType=${acc.vatType?.id || '-'})`);
  }

  // Test creating a voucher with these accounts
  const acc1920 = accRes.data?.values?.find((a: any) => a.number === 1920);
  const acc8050 = accRes.data?.values?.find((a: any) => a.number === 8050);
  const acc6300 = accRes.data?.values?.find((a: any) => a.number === 6300);
  const acc2780 = accRes.data?.values?.find((a: any) => a.number === 2780);

  console.log("\n=== Test: Book non-invoice lines as voucher ===");
  const v = await api("POST", "/ledger/voucher?sendToLedger=true", {
    date: "2026-03-21",
    description: "Bank reconciliation - non-invoice lines",
    postings: [
      // Renteinntekter (interest income): debit 1920 bank, credit 8050 interest
      {
        row: 1, date: "2026-03-21", description: "Renteinntekter",
        account: { id: acc1920?.id },
        amount: 127.20, amountCurrency: 127.20,
        amountGross: 127.20, amountGrossCurrency: 127.20,
      },
      {
        row: 2, date: "2026-03-21", description: "Renteinntekter",
        account: { id: acc8050?.id },
        amount: -127.20, amountCurrency: -127.20,
        amountGross: -127.20, amountGrossCurrency: -127.20,
      },
      // Bankgebyr refund (positive = Inn): debit 1920, credit 6300
      {
        row: 3, date: "2026-03-21", description: "Bankgebyr",
        account: { id: acc1920?.id },
        amount: 1956.88, amountCurrency: 1956.88,
        amountGross: 1956.88, amountGrossCurrency: 1956.88,
      },
      {
        row: 4, date: "2026-03-21", description: "Bankgebyr",
        account: { id: acc6300?.id },
        amount: -1956.88, amountCurrency: -1956.88,
        amountGross: -1956.88, amountGrossCurrency: -1956.88,
      },
      // Skattetrekk (tax deduction, negative = Ut): debit 2780, credit 1920
      {
        row: 5, date: "2026-03-21", description: "Skattetrekk",
        account: { id: acc2780?.id },
        amount: 1413.40, amountCurrency: 1413.40,
        amountGross: 1413.40, amountGrossCurrency: 1413.40,
      },
      {
        row: 6, date: "2026-03-21", description: "Skattetrekk",
        account: { id: acc1920?.id },
        amount: -1413.40, amountCurrency: -1413.40,
        amountGross: -1413.40, amountGrossCurrency: -1413.40,
      },
    ],
  });
  console.log(`Voucher: status=${v.status} id=${v.data?.value?.id} number=${v.data?.value?.number}`);
  if (v.data?.value?.postings) {
    for (const p of v.data.value.postings) {
      console.log(`  row=${p.row} acct=${p.account?.number || p.account?.id} amt=${p.amount}`);
    }
  }

  // Also check: what bank reconciliation APIs exist?
  console.log("\n=== Check bank reconciliation endpoints ===");
  const br1 = await api("GET", "/bank/reconciliation?count=1&fields=*");
  const br2 = await api("GET", "/bank/statement?count=1&fields=*");

  console.log("\n=== DONE ===");
}

main().catch(e => { console.error("FATAL:", e); process.exit(1); });
