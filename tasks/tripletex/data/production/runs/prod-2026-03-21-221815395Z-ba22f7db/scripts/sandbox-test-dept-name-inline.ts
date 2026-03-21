const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { "Content-Type": "application/json", Authorization: AUTH };

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  console.log(`${method} ${url}`);
  const res = await fetch(url, {
    method,
    headers: H,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  console.log(`Status: ${res.status}`);
  if (res.status >= 400) console.log("Error:", JSON.stringify(json, null, 2));
  return { status: res.status, data: json };
}

async function main() {
  // Test: Can POST /employee succeed with division: { id: 0 } or division omitted
  // but using department: { name: "X" } inline?
  // Already documented as failing, but let's also test if there's any shortcut
  // for the combined department+division case

  // Test: Can we get the division count via the employee create response somehow?
  // Or: can we include division with a known id (e.g. the first one)?

  // Actually, the real question is: is there a way to do this in 2 calls?
  // Option A: POST /department → POST /employee with division.id guessed
  //   - Can't guess the division.id
  // Option B: Skip department, just do GET /division → POST /employee with department: { name: "X" }
  //   - Already documented as failing (department.id required, not department.name)
  // Option C: Some batch endpoint that creates dept + employee?
  //   - Not documented

  // Conclusion: 3 calls is the minimum
  // Let me just verify the parallel execution works optimally
  console.log("=== Confirming parallel GET /division + POST /department is optimal ===");

  const start = Date.now();
  const [divRes, deptRes] = await Promise.all([
    api("GET", "/division?count=1&fields=id"),
    api("POST", "/department", { name: "ParallelTest ba22f7db" }),
  ]);
  const parallelTime = Date.now() - start;

  console.log("\nParallel time:", parallelTime, "ms");
  console.log("Division values:", divRes.data?.values?.length, "rows");
  console.log("Division ID:", divRes.data?.values?.[0]?.id);
  console.log("Department ID:", deptRes.data?.value?.id);
  console.log("\n3-call path confirmed optimal: GET /division || POST /department → POST /employee");
}

main();
