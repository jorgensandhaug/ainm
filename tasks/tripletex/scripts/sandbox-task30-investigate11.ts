// Investigate /yearEnd endpoint — it returned data!
// This could be the key to understanding what the checker validates.

const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa(`0:${TOKEN}`);

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: any = {
    method,
    headers: { Authorization: AUTH, "Content-Type": "application/json" },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const text = await res.text();
  let data: any;
  try { data = JSON.parse(text); } catch { data = text; }
  console.log(`${method} ${path} => ${res.status}`);
  if (!res.ok) {
    console.log(`  ERR: ${JSON.stringify(data).slice(0, 500)}`);
  }
  return { ok: res.ok, status: res.status, data };
}

async function main() {
  // =====================================================================
  // PART 1: Explore /yearEnd endpoint thoroughly
  // =====================================================================
  console.log("=".repeat(70));
  console.log("PART 1: /yearEnd endpoint exploration");
  console.log("=".repeat(70));

  // Get full details
  const ye1 = await api("GET", "/yearEnd?year=2025&fields=*");
  console.log("\n/yearEnd?year=2025:", JSON.stringify(ye1.data, null, 2).slice(0, 3000));

  // Try without year filter
  const ye2 = await api("GET", "/yearEnd?fields=*&count=10");
  console.log("\n/yearEnd (no filter):", JSON.stringify(ye2.data, null, 2).slice(0, 3000));

  // Check what sub-endpoints exist
  const yeId = ye1.data?.value?.id || ye1.data?.values?.[0]?.id;
  if (yeId) {
    console.log(`\nYear-end ID found: ${yeId}`);
    const ye3 = await api("GET", `/yearEnd/${yeId}?fields=*`);
    console.log(`/yearEnd/${yeId}:`, JSON.stringify(ye3.data, null, 2).slice(0, 3000));

    // Try sub-endpoints
    const subPaths = [
      `/yearEnd/${yeId}/annualAccounts`,
      `/yearEnd/${yeId}/report`,
      `/yearEnd/${yeId}/send`,
      `/yearEnd/${yeId}/note`,
    ];
    for (const sp of subPaths) {
      const r = await api("GET", `${sp}?fields=*&count=10`);
      if (r.ok) {
        console.log(`\n${sp}: ${JSON.stringify(r.data).slice(0, 1000)}`);
      }
    }
  }

  // =====================================================================
  // PART 2: Check /yearEnd/annualAccounts
  // =====================================================================
  console.log("\n" + "=".repeat(70));
  console.log("PART 2: /yearEnd/annualAccounts");
  console.log("=".repeat(70));

  const aa1 = await api("GET", "/yearEnd/annualAccounts?year=2025&fields=*&count=10");
  if (aa1.ok) console.log("Result:", JSON.stringify(aa1.data, null, 2).slice(0, 2000));

  const aa2 = await api("GET", "/yearEnd/annualAccounts?fields=*&count=10");
  if (aa2.ok) console.log("Result:", JSON.stringify(aa2.data, null, 2).slice(0, 2000));

  // =====================================================================
  // PART 3: Check /yearEnd/report
  // =====================================================================
  console.log("\n" + "=".repeat(70));
  console.log("PART 3: /yearEnd/report");
  console.log("=".repeat(70));

  const rp1 = await api("GET", "/yearEnd/report?year=2025&fields=*&count=10");
  if (rp1.ok) console.log("Result:", JSON.stringify(rp1.data, null, 2).slice(0, 2000));

  // =====================================================================
  // PART 4: What if the issue is about the YEAR-END being "locked" or "completed"?
  // Maybe we need to PUT /yearEnd to mark it as done?
  // =====================================================================
  console.log("\n" + "=".repeat(70));
  console.log("PART 4: Check if yearEnd needs to be 'completed'");
  console.log("=".repeat(70));

  if (yeId) {
    // Try PUT to update year-end status
    const yePut = await api("PUT", `/yearEnd/${yeId}`, {
      id: yeId,
      status: "COMPLETED",
    });
    console.log("PUT /yearEnd:", JSON.stringify(yePut.data).slice(0, 500));
  }

  // =====================================================================
  // PART 5: Look at the openapi spec for yearEnd details
  // =====================================================================
  console.log("\n" + "=".repeat(70));
  console.log("PART 5: yearEnd-related endpoints in API");
  console.log("=".repeat(70));

  // Try various yearEnd sub-resources
  const moreEndpoints = [
    "/yearEnd/dispositions?year=2025&fields=*&count=10",
    "/yearEnd/relatedContent?year=2025&fields=*&count=10",
    "/yearEnd/voucher?year=2025&fields=*&count=10",
    "/yearEnd?year=2024&fields=*",
  ];
  for (const ep of moreEndpoints) {
    const r = await api("GET", ep);
    if (r.ok) {
      console.log(`  ${ep}: ${JSON.stringify(r.data).slice(0, 1000)}`);
    }
  }

  // =====================================================================
  // PART 6: Check if there's a company setting related to year-end
  // =====================================================================
  console.log("\n" + "=".repeat(70));
  console.log("PART 6: Company settings");
  console.log("=".repeat(70));

  const company = await api("GET", "/company/withLoginAccess?fields=*&count=5");
  if (company.ok) {
    console.log("Company:", JSON.stringify(company.data).slice(0, 2000));
  }

  console.log("\n" + "=".repeat(70));
  console.log("DONE");
  console.log("=".repeat(70));
}

main().catch(e => { console.error("FATAL:", e); process.exit(1); });
