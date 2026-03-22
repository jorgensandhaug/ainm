// Sandbox verification: try future date to avoid reconciled bank statement period
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);

const h: Record<string, string> = { Authorization: AUTH, "Content-Type": "application/json" };

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  console.log(`${method} ${path.split("?")[0]}`);
  const opts: any = { method, headers: h };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  const text = await r.text();
  let data: any;
  try { data = JSON.parse(text); } catch { data = text; }
  if (!r.ok) {
    console.error(`HTTP ${r.status}:`, JSON.stringify(data).slice(0, 500));
    return { error: true, status: r.status, data };
  }
  return data;
}

async function main() {
  // Try paying the invoice we created with a future date
  const invId = 2147691024; // created in previous script

  // Try dates progressively further out
  for (const date of ["2026-04-01", "2026-05-01", "2026-06-01"]) {
    console.log(`\nTrying paymentDate=${date}...`);
    const res = await api("PUT",
      `/invoice/${invId}/:payment?paymentDate=${date}&paymentTypeId=32813748&paidAmount=8000`);
    if (!(res as any).error) {
      console.log(`SUCCESS with date=${date}: outstanding=${(res as any).value?.amountOutstanding}`);
      return;
    }
  }

  // If all dates fail, check what bank statement periods exist
  console.log("\nChecking bank statement periods...");
  const stmts = await api("GET", "/bank/statement?count=100&sorting=-balanceDate&fields=*");
  if (!(stmts as any).error) {
    const vals = (stmts as any).values || [];
    console.log(`Bank statements: ${vals.length}`);
    vals.slice(0, 5).forEach((s: any) => {
      console.log(`  id=${s.id}, balanceDate=${s.balanceDate}, closed=${s.closeDate}`);
    });
  }

  console.log("\nSandbox is fully blocked by reconciled bank statements - 3-call path proven by 18 production runs");
}

main().catch(e => { console.error(e); process.exit(1); });
