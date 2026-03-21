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
  const r = await fetch(url, { method: "POST", headers, body: JSON.stringify(body) });
  const respBody = await r.json();
  if (!r.ok) throw new Error(`POST failed ${r.status}: ${JSON.stringify(respBody).substring(0, 500)}`);
  return respBody;
}

async function tryVoucher(accNum1: number, accNum2: number, amount: number): Promise<void> {
  console.log(`\nTesting voucher: ${accNum1} (debit ${amount}) / ${accNum2} (credit ${amount})`);
  try {
    const acc1Res = await get(`/ledger/account?number=${accNum1}&fields=id,number,name`);
    const acc1 = acc1Res.values?.[0];
    if (!acc1) { console.log(`  Account ${accNum1} NOT FOUND`); return; }

    const acc2Res = await get(`/ledger/account?number=${accNum2}&fields=id,number,name`);
    const acc2 = acc2Res.values?.[0];
    if (!acc2) { console.log(`  Account ${accNum2} NOT FOUND`); return; }

    console.log(`  ${accNum1}: ${acc1.name} (ID=${acc1.id})`);
    console.log(`  ${accNum2}: ${acc2.name} (ID=${acc2.id})`);

    const vRes = await post(`/ledger/voucher`, {
      date: "2026-03-21",
      description: `Test ${accNum1}/${accNum2}`,
      postings: [
        { date: "2026-03-21", account: { id: acc1.id }, amount: amount, description: "test" },
        { date: "2026-03-21", account: { id: acc2.id }, amount: -amount, description: "test" }
      ]
    });
    console.log(`  SUCCESS: voucher ID=${vRes.value?.id}`);
  } catch (e: any) {
    console.log(`  FAILED: ${e.message.substring(0, 200)}`);
  }
}

async function main() {
  // Test various account pairs for manual voucher creation
  // Goal: determine which accounts are blocked (system-generated) and which allow manual posting

  // Test 1: 8160 (Valutatap) / 1500 (Kundefordringer) — known to fail
  await tryVoucher(8160, 1500, 100);

  // Test 2: 7100 (Lønn) / 2000 (annen gjeld) — both user-level
  await tryVoucher(7100, 2000, 100);

  // Test 3: 8060 (Valutagevinst) / 8160 (Valutatap) — both FX
  await tryVoucher(8060, 8160, 100);

  // Test 4: 4300 / 1500 — expense vs receivable
  await tryVoucher(4300, 1500, 100);

  // Test 5: 8050 / 8150 — try neighboring accounts
  await tryVoucher(8050, 8150, 100);

  // Test 6: pure expense accounts 6700 / 6800
  await tryVoucher(6700, 6800, 100);

  // Check if 8160 is in fact flagged as system account
  const acc8160Res = await get(`/ledger/account?number=8160&fields=*`);
  const acc8160 = acc8160Res.values?.[0];
  console.log(`\n8160 full details: isSystemAccount=${acc8160?.isSystemAccount}, isClosingAccount=${acc8160?.isClosingAccount}, canBePostedAgainst=${acc8160?.canBePostedAgainst}, requiresVatCode=${acc8160?.requiresVatCode}`);
  console.log(JSON.stringify(acc8160).substring(0, 500));
}

main().catch(e => { console.error(e); process.exit(1); });
