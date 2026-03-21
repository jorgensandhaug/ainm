const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "AWOUBnPp46g53aKaKWcnfWwccRTLb8wuTQHvHGuQi2I";  // expired
const AUTH = "Basic " + btoa("0:" + TOKEN);
const headers: Record<string, string> = { Authorization: AUTH, "Content-Type": "application/json" };

async function testEndpoint(path: string) {
  const url = `${BASE}/${path}`;
  console.log(`GET ${url}`);
  try {
    const r = await fetch(url, { headers });
    const text = await r.text();
    console.log(`  -> ${r.status} ${text.slice(0, 300)}`);
  } catch (e: any) {
    console.log(`  -> ERROR: ${e.message}`);
  }
}

async function main() {
  // Test bank endpoints through the proxy
  await testEndpoint("bank/reconciliation?count=1&fields=id");
  await testEndpoint("bank/statement?count=1&fields=id");
  await testEndpoint("bank?count=1&fields=id");
  await testEndpoint("bank/reconciliation/match?count=1&fields=id");
  // Compare with a known-working endpoint
  await testEndpoint("invoice?count=1&fields=id");
  // Test a known-beta endpoint for comparison
  await testEndpoint("incomingInvoice/search?count=1");
}

main();
