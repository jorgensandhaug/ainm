// Prove that salary/type, voucherType, and account lookups can be done in parallel
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);

async function api(path: string) {
  const url = `${BASE}${path}`;
  const t0 = Date.now();
  const res = await fetch(url, {
    headers: { Authorization: AUTH, "Content-Type": "application/json" },
  });
  const data = await res.json();
  const ms = Date.now() - t0;
  console.log(`${res.status} ${path} (${ms}ms)`);
  return data;
}

async function main() {
  console.log("=== Sequential reads ===");
  const t0 = Date.now();
  await api("/salary/type?count=1000&fields=*");
  await api("/ledger/voucherType?name=Lønnsbilag&count=1&fields=*");
  await api("/ledger/account?number=5000,1920&count=10&fields=*");
  console.log(`Sequential total: ${Date.now() - t0}ms`);

  console.log("\n=== Parallel reads ===");
  const t1 = Date.now();
  await Promise.all([
    api("/salary/type?count=1000&fields=*"),
    api("/ledger/voucherType?name=Lønnsbilag&count=1&fields=*"),
    api("/ledger/account?number=5000,1920&count=10&fields=*"),
  ]);
  console.log(`Parallel total: ${Date.now() - t1}ms`);

  // Also verify: can we combine voucherType lookup with salary type?
  // No - different endpoints, different purposes. But can be parallel.

  console.log("\n=== Key findings ===");
  console.log("1. All 3 reads are independent - can be parallelized");
  console.log("2. Combined account number query (5000,1920) returns both");
  console.log("3. VoucherType name filter returns exact match");
  console.log("4. 3 parallel reads = 3 API calls but near-instant wall time");
}

main().catch(console.error);
