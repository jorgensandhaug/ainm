// Investigate:
// 1. projectInvoiceDetails project mismatch - is it using order ID instead of project ID?
// 2. What is feeAmount and how to make it non-zero?
// 3. Try creating invoice with includeHours or specific fee settings
// 4. Check if we need to set hourly rates on the project

const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: any = {
    method,
    headers: { "Content-Type": "application/json", Authorization: AUTH },
  };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  const text = await r.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  if (r.status >= 400) {
    console.log(`${method} ${path} → ${r.status} ERROR:`, JSON.stringify(json).slice(0, 800));
  } else {
    console.log(`${method} ${path} → ${r.status}`);
  }
  return { status: r.status, data: json };
}

async function main() {
  // Check the full project from the new flow test (402041289)
  const projectId = 402041289;
  const invoiceId = 2147644250;

  // 1. What is project 402041293 (the one in projectInvoiceDetails)?
  console.log("=== What is entity 402041293? ===");
  const unknownRes = await api("GET", `/project/402041293?fields=*`);
  console.log("Is it a project?", unknownRes.status);
  if (unknownRes.status === 200) {
    console.log("Entity:", JSON.stringify(unknownRes.data.value, null, 2)?.slice(0, 500));
  }

  // Try as order
  const orderRes = await api("GET", `/order/402041293?fields=*`);
  console.log("Is it an order?", orderRes.status);
  if (orderRes.status === 200) {
    console.log("Order project:", orderRes.data.value?.project?.id);
  }

  // 2. Check invoice detail fully
  console.log("\n=== Invoice details full ===");
  const invDetailRes = await api("GET", `/invoice/${invoiceId}?fields=*`);
  if (invDetailRes.status === 200) {
    const inv = invDetailRes.data.value;
    console.log("projectInvoiceDetails:");
    for (const d of inv.projectInvoiceDetails || []) {
      const detailRes = await api("GET", `/invoice/details/${d.id}?fields=*`);
      console.log("  detail:", JSON.stringify(detailRes.data.value, null, 2));
    }
    console.log("\norders:");
    for (const o of inv.orders || []) {
      console.log("  order:", JSON.stringify(o));
    }
  }

  // 3. Check project hourly rates
  console.log("\n=== Project hourly rates ===");
  const projRes = await api("GET", `/project/${projectId}?fields=projectHourlyRates(*)`);
  if (projRes.status === 200) {
    console.log("hourlyRates:", JSON.stringify(projRes.data.value.projectHourlyRates, null, 2)?.slice(0, 1000));
  }

  // 4. Check what hourly rate looks like
  const rates = projRes.data.value?.projectHourlyRates || [];
  if (rates.length > 0) {
    const rateRes = await api("GET", `/project/hourlyRates/${rates[0].id}?fields=*`);
    console.log("hourlyRate detail:", JSON.stringify(rateRes.data.value, null, 2));
  }

  // 5. What happens if we try to set hourlyRate on the project?
  console.log("\n=== Test setting hourlyRate on project ===");
  // Check if there's a projectHourlyRates endpoint
  const hrRes = await api("GET", `/project/hourlyRates?projectId=${projectId}&fields=*`);
  console.log("project hourlyRates search:", JSON.stringify(hrRes.data, null, 2)?.slice(0, 1000));

  // 6. Check if the project has a budget field on the project entity itself
  console.log("\n=== Check project budget fields ===");
  const projFull = await api("GET", `/project/${projectId}?fields=*`);
  if (projFull.status === 200) {
    const p = projFull.data.value;
    // Print all numeric fields that could be budget
    const budgetKeys = Object.keys(p).filter(k => {
      const val = p[k];
      return typeof val === "number" || (typeof val === "string" && k.toLowerCase().includes("budget"));
    });
    console.log("Potential budget fields:");
    for (const k of budgetKeys) {
      console.log(`  ${k}: ${p[k]}`);
    }
  }

  // 7. Check OpenAPI for project fields that include "budget"
  console.log("\n=== Check for budget or fixedPrice behavior ===");
  // On the project, we have isFixedPrice: true and fixedprice: 229500
  // Let's check if PUT /project can set additional fields
  console.log("project fixedprice:", projFull.data.value?.fixedprice);
  console.log("project isFixedPrice:", projFull.data.value?.isFixedPrice);
  console.log("project contributionMarginPercent:", projFull.data.value?.contributionMarginPercent);
  console.log("project priceCeilingAmount:", projFull.data.value?.priceCeilingAmount);
  console.log("project isPriceCeiling:", projFull.data.value?.isPriceCeiling);

  console.log("\n=== DONE ===");
}

main().catch(e => { console.error("FATAL:", e.message); process.exit(1); });
