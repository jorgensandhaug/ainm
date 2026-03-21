const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa(`0:${TOKEN}`);

const headers = { Authorization: AUTH, "Content-Type": "application/json" };

async function get(path: string): Promise<any> {
  const url = `${BASE}${path}`;
  const r = await fetch(url, { headers });
  const body = await r.json();
  if (!r.ok) throw new Error(`GET failed ${r.status}: ${JSON.stringify(body).substring(0, 300)}`);
  return body;
}

async function post(path: string, body: any): Promise<any> {
  const url = `${BASE}${path}`;
  console.log(`POST ${url}`);
  const r = await fetch(url, { method: "POST", headers, body: JSON.stringify(body) });
  const respBody = await r.json();
  console.log(`Status: ${r.status}`);
  if (!r.ok) { console.log(JSON.stringify(respBody).substring(0, 1000)); throw new Error(`POST failed ${r.status}`); }
  return respBody;
}

async function main() {
  // Get account IDs
  const accRes = await get(`/ledger/account?number=8160,1500&fields=id,number,name`);
  const accounts = accRes.values || [];
  const acc8160 = accounts.find((a: any) => a.number === 8160);
  const acc1500 = accounts.find((a: any) => a.number === 1500);
  console.log(`Account 8160: ID=${acc8160?.id}, name=${acc8160?.name}`);
  console.log(`Account 1500: ID=${acc1500?.id}, name=${acc1500?.name}`);

  // Test 1: 8160/1500 with row: 1 and row: 2
  const disagio = 7232.73;
  const vRes = await post(`/ledger/voucher`, {
    date: "2026-03-21",
    description: "Valutatap/disagio test 8160/1500",
    voucherType: null,
    postings: [
      {
        row: 1,
        account: { id: acc8160.id },
        amount: disagio,
        amountCurrency: disagio,
        amountGross: disagio,
        amountGrossCurrency: disagio
      },
      {
        row: 2,
        account: { id: acc1500.id },
        amount: -disagio,
        amountCurrency: -disagio,
        amountGross: -disagio,
        amountGrossCurrency: -disagio
      }
    ]
  });
  console.log(`\nVoucher 8160/1500 SUCCEEDED: ID=${vRes.value?.id}`);
  const postings = vRes.value?.postings || [];
  for (const p of postings) {
    console.log(`  Row ${p.row}: account=${p.account?.number || p.account?.id}, amount=${p.amount}, amountCurrency=${p.amountCurrency}`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
