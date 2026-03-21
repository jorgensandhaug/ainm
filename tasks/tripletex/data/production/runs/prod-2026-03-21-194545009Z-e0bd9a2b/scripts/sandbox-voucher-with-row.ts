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
  // Get account IDs for 8160 (Valutatap/disagio) and 1920 (Bank)
  const accRes = await get(`/ledger/account?number=8160,1920&fields=id,number,name`);
  const accounts = accRes.values || [];
  const acc8160 = accounts.find((a: any) => a.number === 8160);
  const acc1920 = accounts.find((a: any) => a.number === 1920);
  console.log(`Account 8160: ID=${acc8160?.id}, name=${acc8160?.name}`);
  console.log(`Account 1920: ID=${acc1920?.id}, name=${acc1920?.name}`);

  if (!acc8160 || !acc1920) throw new Error("Missing accounts");

  // Test voucher with row starting at 1 and all required amount fields
  const disagioAmount = 7232.73; // 12689 * (11.28 - 10.71)

  const voucherRes = await post(`/ledger/voucher`, {
    date: "2026-03-21",
    description: "Valutatap/disagio - EUR payment difference",
    voucherType: null,
    postings: [
      {
        row: 1,
        account: { id: acc8160.id },
        amount: disagioAmount,
        amountCurrency: disagioAmount,
        amountGross: disagioAmount,
        amountGrossCurrency: disagioAmount,
        description: "Valutatap disagio"
      },
      {
        row: 2,
        account: { id: acc1920.id },
        amount: -disagioAmount,
        amountCurrency: -disagioAmount,
        amountGross: -disagioAmount,
        amountGrossCurrency: -disagioAmount,
        description: "Valutatap disagio"
      }
    ]
  });
  console.log(`\nVoucher SUCCEEDED: ID=${voucherRes.value?.id}`);

  // Show the postings
  const postings = voucherRes.value?.postings || [];
  for (const p of postings) {
    console.log(`  Row ${p.row}: account=${p.account?.id} (${p.account?.number}), amount=${p.amount}`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
