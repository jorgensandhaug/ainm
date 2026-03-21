// Test: is customerOrganizationNumber a valid query param or silently ignored?
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const headers = { Authorization: AUTH, "Content-Type": "application/json" };

async function api(path: string) {
  const url = `${BASE}${path}`;
  console.log(`GET ${url}`);
  const r = await fetch(url, { headers });
  const j = await r.json();
  console.log(`  -> ${r.status} fullResultSize=${j.fullResultSize}`);
  return j;
}

async function main() {
  // Test 1: All invoices - how many total?
  const r1 = await api("/invoice?invoiceDateFrom=2020-01-01&invoiceDateTo=2027-01-01&count=1&fields=id");
  console.log(`Total invoices: ${r1.fullResultSize}\n`);

  // Test 2: With valid customerId filter
  // First get a customer ID
  const custRes = await api("/customer?organizationNumber=999532193&fields=id");
  const custId = custRes.values?.[0]?.id;
  console.log(`Customer ID for 999532193: ${custId}\n`);

  if (custId) {
    const r2 = await api(`/invoice?invoiceDateFrom=2020-01-01&invoiceDateTo=2027-01-01&customerId=${custId}&count=1&fields=id`);
    console.log(`Invoices with customerId=${custId}: ${r2.fullResultSize}\n`);
  }

  // Test 3: With undocumented customerOrganizationNumber - if same count as total, it's ignored
  const r3 = await api("/invoice?invoiceDateFrom=2020-01-01&invoiceDateTo=2027-01-01&customerOrganizationNumber=999532193&count=1&fields=id");
  console.log(`Invoices with customerOrganizationNumber=999532193: ${r3.fullResultSize}\n`);

  // Test 4: With nonexistent org number - if same count as total, the param is ignored
  const r4 = await api("/invoice?invoiceDateFrom=2020-01-01&invoiceDateTo=2027-01-01&customerOrganizationNumber=000000000&count=1&fields=id");
  console.log(`Invoices with customerOrganizationNumber=000000000: ${r4.fullResultSize}\n`);

  // Test 5: With currency=EUR filter on a mix of NOK and EUR invoices
  const r5 = await api("/invoice?invoiceDateFrom=2020-01-01&invoiceDateTo=2027-01-01&currency=EUR&count=1&fields=id");
  console.log(`Invoices with currency=EUR: ${r5.fullResultSize}\n`);

  const r6 = await api("/invoice?invoiceDateFrom=2020-01-01&invoiceDateTo=2027-01-01&currency=NOK&count=1&fields=id");
  console.log(`Invoices with currency=NOK: ${r6.fullResultSize}\n`);

  const r7 = await api("/invoice?invoiceDateFrom=2020-01-01&invoiceDateTo=2027-01-01&currency=DOESNOTEXIST&count=1&fields=id");
  console.log(`Invoices with currency=DOESNOTEXIST: ${r7.fullResultSize}\n`);
}

main().catch(e => { console.error(e); process.exit(1); });
