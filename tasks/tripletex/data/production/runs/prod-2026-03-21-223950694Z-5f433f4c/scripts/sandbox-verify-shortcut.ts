const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: any = { method, headers: H };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  const json = await r.json();
  console.log(`\n${method} ${path} -> ${r.status}`);
  if (!r.ok) console.log(JSON.stringify(json, null, 2));
  return { status: r.status, json };
}

// Test 1: Can we combine customer+manager resolution in a single call? No such endpoint exists.
// Test 2: Re-verify nested customer shortcut still fails silently
const test2 = await api("POST", "/project", {
  name: "SandboxTest-NestedCustomer-" + Date.now(),
  startDate: "2026-03-21",
  customer: { name: "Test GmbH", organizationNumber: "999999999" },
  projectManager: { id: 18617772 },
});
console.log("Nested customer result - customer field:", test2.json?.value?.customer);

// Test 3: Re-verify nested manager without id still fails
const test3 = await api("POST", "/project", {
  name: "SandboxTest-NestedManager-" + Date.now(),
  startDate: "2026-03-21",
  customer: { id: 108331245 },
  projectManager: { email: "emma.schneider@example.org" },
});
console.log("Nested manager result:", test3.status);

console.log("\n--- Conclusion: 3-call minimum unchanged ---");
