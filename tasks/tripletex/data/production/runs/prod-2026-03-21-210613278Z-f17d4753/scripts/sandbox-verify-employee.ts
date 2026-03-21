// Verify: employees created without employments[] still have all scored fields
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);

async function api(path: string) {
  const r = await fetch(`${BASE}${path}`, {
    headers: { Authorization: AUTH },
  });
  return r.json();
}

async function main() {
  // Check the employee created without employments in the optimized flow
  // The employee id was 18670109 from the earlier test
  const emp = await api("/employee/18670109?fields=*");
  console.log("Employee without employments:");
  console.log("  firstName:", emp.value.firstName);
  console.log("  lastName:", emp.value.lastName);
  console.log("  email:", emp.value.email);
  console.log("  department:", emp.value.department?.id);
  console.log("  employments:", JSON.stringify(emp.value.employments));

  // Also check: does the production account always have 1920?
  // In fresh production accounts, what accounts exist?
  // Check account 1920 specifically
  const acc = await api("/ledger/account?number=1920&fields=id,number,name,isBankAccount,bankAccountNumber");
  console.log("\nAccount 1920:");
  for (const a of acc.values || []) {
    console.log(`  ${a.number}: id=${a.id}, name=${a.name}, bank=${a.isBankAccount}, bankAcctNum=${a.bankAccountNumber}`);
  }

  // Check if there are other bank accounts
  const banks = await api("/ledger/account?isBankAccount=true&fields=id,number,name,bankAccountNumber");
  console.log("\nAll bank accounts:");
  for (const a of banks.values || []) {
    console.log(`  ${a.number}: id=${a.id}, name=${a.name}, bankAcctNum=${a.bankAccountNumber}`);
  }
}

main();
