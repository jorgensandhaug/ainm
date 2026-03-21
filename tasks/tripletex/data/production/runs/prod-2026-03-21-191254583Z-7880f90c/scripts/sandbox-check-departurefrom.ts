// Check what departureFrom values the scorer might expect
// Test what employee addresses look like for the test employees
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa(`0:${TOKEN}`);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

async function api(method: string, path: string) {
  const url = `${BASE}${path}`;
  const r = await fetch(url, { method, headers: H });
  const json = await r.json();
  console.log(`${r.status} ${method} ${path}`);
  if (!r.ok) console.log("  ERROR:", JSON.stringify(json).slice(0, 500));
  return json;
}

async function main() {
  // Check all the test employee emails that appeared in production prompts
  const testEmails = [
    "lars.johansen@example.org",
    "pablo.sanchez@example.org",
    "pablo.rodriguez@example.org",
    "maria.hernandez@example.org",
    "lucy.walker@example.org",
    "johanna.hoffmann@example.org",
    "bruno.santos@example.org",
    "torbjrn.brekke@example.org",
    "miguel.perez@example.org",
    "charlotte.williams@example.org",
  ];

  for (const email of testEmails) {
    const res = await api("GET", `/employee?email=${encodeURIComponent(email)}&count=10&fields=*`);
    const emps = res?.values || [];
    if (emps.length === 0) {
      console.log(`  ${email}: NOT FOUND in sandbox`);
    } else {
      for (const emp of emps) {
        console.log(`  ${email}: id=${emp.id}, name=${emp.firstName} ${emp.lastName}, address=${JSON.stringify(emp.address)}, companyId=${emp.companyId}`);
      }
    }
  }

  // Check the company address
  const compRes = await api("GET", "/company/108114337?fields=*,address(*)");
  const comp = compRes?.value;
  console.log(`\nCompany: ${comp?.name}`);
  console.log(`  address: ${JSON.stringify(comp?.address)}`);
}

main().catch(e => console.error(e));
