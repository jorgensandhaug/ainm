const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

async function get(path: string) {
  const r = await fetch(`${BASE}${path}`, { headers: H });
  console.log("GET", path, r.status);
  if (!r.ok) { console.error(await r.text()); return null; }
  return r.json();
}

async function main() {
  // Check if costCategory and paymentType IDs are consistent across accounts
  const [catRes, ptRes] = await Promise.all([
    get("/travelExpense/costCategory?count=1000&fields=*"),
    get("/travelExpense/paymentType?count=1000&fields=*"),
  ]);

  if (catRes) {
    const cats = catRes.values.filter((c: any) => c.showOnTravelExpenses);
    console.log("\n=== Cost Categories (showOnTravelExpenses=true) ===");
    for (const c of cats) {
      console.log(`  id=${c.id}, desc="${c.description}", vatType=${JSON.stringify(c.vatType?.id)}`);
    }
    const flyCat = cats.find((c: any) => c.description === "Fly");
    const taxiCat = cats.find((c: any) => c.description === "Taxi");
    console.log("\nFly:", flyCat?.id, "Taxi:", taxiCat?.id);
    console.log("Production Fly was 38785113, Taxi was 38785128");
    console.log("IDs differ between accounts:", flyCat?.id !== 38785113 ? "YES" : "NO");
  }

  if (ptRes) {
    const pts = ptRes.values.filter((p: any) => p.showOnTravelExpenses);
    console.log("\n=== Payment Types (showOnTravelExpenses=true) ===");
    for (const p of pts) {
      console.log(`  id=${p.id}, desc="${p.description}"`);
    }
    console.log("Production payType was 38785097");
  }

  // Check if we can create a travel expense with costCategory by description (skip lookup)
  // The trusted standard says this resolves to null at deliver, but let's verify
  console.log("\n=== Investigating: can we inline costCategory.description? ===");

  // Also check: can we merge costCategory + paymentType into one call somehow?
  // Answer: no, they're separate endpoints.

  // Check: can employee lookup return address?
  const empRes = await get("/employee?email=test@example.com&count=1&fields=*");
  if (empRes?.values?.[0]) {
    const emp = empRes.values[0];
    console.log("\n=== Employee address check ===");
    console.log("address:", JSON.stringify(emp.address));
    console.log("Has city?", emp.address?.city ? "YES" : "NO");
  }

  // Check all employees to find one with address
  const allEmps = await get("/employee?count=100&fields=id,firstName,lastName,email,address");
  if (allEmps) {
    console.log("\n=== All employees with addresses ===");
    for (const e of allEmps.values) {
      console.log(`  ${e.id} ${e.firstName} ${e.lastName} (${e.email}) address=${e.address?.city || 'null'}`);
    }
  }
}

main().catch(console.error);
