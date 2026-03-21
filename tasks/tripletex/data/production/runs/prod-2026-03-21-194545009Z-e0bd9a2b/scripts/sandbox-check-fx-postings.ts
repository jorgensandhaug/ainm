const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa(`0:${TOKEN}`);

const headers = { Authorization: AUTH, "Content-Type": "application/json" };

async function get(path: string): Promise<any> {
  const url = `${BASE}${path}`;
  const r = await fetch(url, { headers });
  const body = await r.json();
  if (!r.ok) { console.log(JSON.stringify(body).substring(0, 500)); throw new Error(`GET failed ${r.status}`); }
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
  // Check the EUR invoice payment voucher postings from 2147631555
  // That was the EUR invoice I created and paid with FX difference
  const invId = 2147631555;

  // Get the invoice with voucher info
  const invRes = await get(`/invoice/${invId}?fields=*,voucher(*)`);
  const inv = invRes.value;
  console.log(`Invoice ${invId}: voucher=${inv.voucher?.id}`);

  // Get all vouchers for this invoice date
  // The payment creates a new voucher, let me find it
  // Payment vouchers have specific types
  const voucherListRes = await get(`/ledger/voucher?dateFrom=2026-03-20&dateTo=2026-03-22&fields=*`);
  const vouchers = voucherListRes.values || [];
  console.log(`Total vouchers in date range: ${vouchers.length}`);

  // Find the latest vouchers (payment vouchers)
  const recent = vouchers.slice(-10);
  for (const v of recent) {
    const vRes = await get(`/ledger/voucher/${v.id}?fields=*,postings(*,account(*))`);
    const postings = vRes.value?.postings || [];

    // Check if any posting references account 8160 or 8060
    const hasFx = postings.some((p: any) =>
      p.account?.number === 8160 || p.account?.number === 8060
    );
    if (hasFx) {
      console.log(`\n=== FX Voucher ${v.id} (type=${v.typeId}, desc="${v.description}") ===`);
      for (const p of postings) {
        console.log(`  Account ${p.account?.number} (${p.account?.name}): amount=${p.amount}, amountCurrency=${p.amountCurrency}, currency=${p.amountCurrencyValueCurrencyCode || 'NOK'}`);
      }
    }
  }

  // Step 2: Try creating a manual voucher with 1500 (Kundefordringer) instead of 1920
  console.log("\n\n=== Testing manual voucher with 1500 account ===");
  const acc8160Res = await get(`/ledger/account?number=8160&fields=*`);
  const acc8160 = acc8160Res.values?.[0];
  console.log(`Account 8160: ID=${acc8160?.id}`);

  const acc1500Res = await get(`/ledger/account?number=1500&fields=*`);
  const acc1500 = acc1500Res.values?.[0];
  console.log(`Account 1500: ID=${acc1500?.id}, name=${acc1500?.name}`);

  // Try manual voucher: debit 8160, credit 1500
  try {
    const voucherRes = await post(`/ledger/voucher`, {
      date: "2026-03-21",
      description: "Disagio test",
      postings: [
        {
          date: "2026-03-21",
          account: { id: acc8160.id },
          amount: 100,
          description: "Disagio test"
        },
        {
          date: "2026-03-21",
          account: { id: acc1500.id },
          amount: -100,
          description: "Disagio test"
        }
      ]
    });
    console.log(`Manual voucher SUCCEEDED: ID=${voucherRes.value?.id}`);
  } catch (e: any) {
    console.log(`Manual voucher FAILED: ${e.message}`);
  }

  // Also try with different accounts
  // Account 3000 = Salgsinntekt
  const acc3000Res = await get(`/ledger/account?number=3000&fields=*`);
  const acc3000 = acc3000Res.values?.[0];
  console.log(`\nAccount 3000: ID=${acc3000?.id}, name=${acc3000?.name}`);

  try {
    const voucherRes = await post(`/ledger/voucher`, {
      date: "2026-03-21",
      description: "Disagio test 2",
      postings: [
        {
          date: "2026-03-21",
          account: { id: acc8160.id },
          amount: 200,
          description: "Disagio test 2"
        },
        {
          date: "2026-03-21",
          account: { id: acc3000.id },
          amount: -200,
          description: "Disagio test 2"
        }
      ]
    });
    console.log(`Manual voucher 2 SUCCEEDED: ID=${voucherRes.value?.id}`);
  } catch (e: any) {
    console.log(`Manual voucher 2 FAILED: ${e.message}`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
