/**
 * Task 13 Deep Analysis — Phase 1: Explore sandbox state
 *
 * Goals:
 * 1. Verify sandbox connectivity
 * 2. List all existing travel expenses (assess cleanup needs)
 * 3. Check if DELETE works on travel expenses in various states
 * 4. Explore employee, costCategory, paymentType, company for the test
 */

const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H: Record<string, string> = { "Content-Type": "application/json", Authorization: AUTH };

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: RequestInit = { method, headers: H };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  const text = await r.text();
  let json: any;
  try { json = JSON.parse(text); } catch { return { _status: r.status, _raw: text.slice(0, 300) }; }
  return { _status: r.status, ...json };
}

async function main() {
  // 1. Connectivity check
  console.log("=== 1. CONNECTIVITY CHECK ===");
  const whoami = await api("GET", "/token/session/>whoAmI");
  console.log(`Status: ${whoami._status}`);
  if (whoami._status !== 200) {
    console.log("SANDBOX DOWN OR BAD TOKEN:", JSON.stringify(whoami).slice(0, 300));
    return;
  }
  console.log(`Company: ${whoami.value?.company?.name} (id=${whoami.value?.company?.id})`);
  console.log(`Employee: ${whoami.value?.employee?.firstName} ${whoami.value?.employee?.lastName}`);

  // 2. List ALL travel expenses
  console.log("\n=== 2. ALL TRAVEL EXPENSES ===");
  const teList = await api("GET", "/travelExpense?count=1000&fields=*,perDiemCompensations(*),costs(*),voucher(*)");
  const allTE = teList.values || [];
  console.log(`Total travel expenses: ${allTE.length}`);

  const byState: Record<string, number> = {};
  for (const te of allTE) {
    byState[te.state] = (byState[te.state] || 0) + 1;
  }
  console.log("By state:", JSON.stringify(byState));

  // Show recent ones
  for (const te of allTE.slice(-5)) {
    console.log(`  id=${te.id}: state=${te.state}, title="${te.title}", amount=${te.amount}, isCompleted=${te.isCompleted}`);
    console.log(`    costs=${te.costs?.length}, perDiemComps=${te.perDiemCompensations?.length}, voucher=${te.voucher?.id || 'none'}`);
  }

  // 3. Test DELETE on different states
  console.log("\n=== 3. TEST DELETE CAPABILITY ===");
  const openTE = allTE.find((t: any) => t.state === "OPEN");
  const deliveredTE = allTE.find((t: any) => t.state === "DELIVERED");
  const approvedTE = allTE.find((t: any) => t.state === "APPROVED");
  const completedTE = allTE.find((t: any) => t.isCompleted === true);

  if (openTE) {
    const delRes = await api("DELETE", `/travelExpense/${openTE.id}`);
    console.log(`DELETE OPEN (id=${openTE.id}): ${delRes._status}`);
  } else {
    console.log("No OPEN travel expense to test DELETE on");
  }

  if (deliveredTE) {
    const delRes = await api("DELETE", `/travelExpense/${deliveredTE.id}`);
    console.log(`DELETE DELIVERED (id=${deliveredTE.id}): ${delRes._status} - ${JSON.stringify(delRes).slice(0, 200)}`);
  }

  // 4. Check if we can "undeliver" or reverse
  console.log("\n=== 4. EXPLORE TRAVEL EXPENSE ACTIONS ===");
  // Check if :undeliver or :unapprove endpoints exist
  if (deliveredTE) {
    const undRes = await api("PUT", `/travelExpense/:undeliver?id=${deliveredTE.id}`);
    console.log(`:undeliver on DELIVERED (id=${deliveredTE.id}): ${undRes._status}`);
  }
  if (approvedTE) {
    const unapRes = await api("PUT", `/travelExpense/:unapprove?id=${approvedTE.id}`);
    console.log(`:unapprove on APPROVED (id=${approvedTE.id}): ${unapRes._status}`);
  }

  // 5. Key lookups for tests
  console.log("\n=== 5. KEY LOOKUPS ===");
  const [empRes, catRes, payRes] = await Promise.all([
    api("GET", "/employee?count=10&fields=*"),
    api("GET", "/travelExpense/costCategory?count=1000&fields=*"),
    api("GET", "/travelExpense/paymentType?count=1000&fields=*"),
  ]);

  const employees = empRes.values || [];
  console.log(`Employees (${employees.length}):`);
  for (const e of employees) {
    console.log(`  id=${e.id}: ${e.firstName} ${e.lastName}, email=${e.email}, address=${e.address?.city || 'none'}`);
  }

  const travelCats = (catRes.values || []).filter((c: any) => c.showOnTravelExpenses);
  console.log(`\nTravel cost categories (${travelCats.length}):`);
  for (const c of travelCats) {
    console.log(`  id=${c.id}: "${c.description}", vatType=${JSON.stringify(c.vatType)}`);
  }

  const travelPayTypes = (payRes.values || []).filter((p: any) => p.showOnTravelExpenses);
  console.log(`\nTravel payment types (${travelPayTypes.length}):`);
  for (const p of travelPayTypes) {
    console.log(`  id=${p.id}: "${p.description}"`);
  }

  // Get company for departureFrom
  const emp = employees[0];
  if (emp) {
    const compRes = await api("GET", `/company/${emp.companyId}?fields=*,address(*)`);
    console.log(`\nCompany: ${compRes.value?.name}, city=${compRes.value?.address?.city || 'none'}`);
  }

  // 6. Check total count of TEs that would need cleanup
  console.log("\n=== 6. CLEANUP ASSESSMENT ===");
  const testTE = allTE.filter((t: any) => t.title?.startsWith("T13") || t.title?.startsWith("test") || t.title?.startsWith("Test"));
  console.log(`Test travel expenses (title starts with T13/test/Test): ${testTE.length}`);
  const prodLikeTE = allTE.filter((t: any) => !t.title?.startsWith("T13") && !t.title?.startsWith("test") && !t.title?.startsWith("Test"));
  console.log(`Non-test travel expenses: ${prodLikeTE.length}`);
}

main().catch(e => { console.error(e); process.exit(1); });
