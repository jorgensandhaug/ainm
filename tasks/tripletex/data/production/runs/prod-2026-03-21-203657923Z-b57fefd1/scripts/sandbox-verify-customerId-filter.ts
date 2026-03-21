const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

async function main() {
  // Verify: customerId IS a valid filter (unlike customerOrganizationNumber)
  // First get a customer ID
  const custUrl = `${BASE}/customer?organizationNumber=907791616&fields=id,name,organizationNumber`;
  const cr = await fetch(custUrl, { headers: H });
  const cd = await cr.json();
  console.log("Customer lookup:", cr.status);
  if (cr.ok && cd.values?.length) {
    const cust = cd.values[0];
    console.log("Customer:", cust.id, cust.name, cust.organizationNumber);

    // Now use customerId filter on GET /invoice
    const invUrl = `${BASE}/invoice?invoiceDateFrom=2020-01-01&invoiceDateTo=2030-12-31&customerId=${cust.id}&count=5&fields=*,customer(*),orderLines(*)`;
    const ir = await fetch(invUrl, { headers: H });
    const id2 = await ir.json();
    console.log("\nInvoices with customerId filter:", ir.status);
    console.log("Found:", id2.values?.length, "/ fullResultSize:", id2.fullResultSize);
    id2.values?.forEach((inv: any) => {
      console.log("  id:", inv.id, "customer:", inv.customer?.name, "orgNr:", inv.customer?.organizationNumber);
    });
  }

  // Also confirm: customerOrganizationNumber with a nonexistent value still returns results (proving it's silently ignored)
  const badUrl = `${BASE}/invoice?invoiceDateFrom=2020-01-01&invoiceDateTo=2030-12-31&customerOrganizationNumber=DOESNOTEXIST999&count=3&fields=id`;
  const br = await fetch(badUrl, { headers: H });
  const bd = await br.json();
  console.log("\ncustomerOrganizationNumber=DOESNOTEXIST999:", br.status, "count:", bd.values?.length);
}

main().catch(e => { console.error(e); process.exit(1); });
