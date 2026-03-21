// Sandbox test: Can we inline department creation on voucher posting?
// Or can we combine any calls?

const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);

const headers = { Authorization: AUTH, "Content-Type": "application/json" };

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: RequestInit = { method, headers };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const text = await res.text();
  console.log(`\n${method} ${path} → ${res.status}`);
  if (!res.ok) {
    console.error(text.substring(0, 500));
  }
  try { return { status: res.status, data: JSON.parse(text) }; } catch { return { status: res.status, data: text }; }
}

async function main() {
  // Test 1: Check if account 7360 exists
  console.log("=== Test 1: Check accounts ===");
  const acctRes = await api("GET", "/ledger/account?number=7360,1920&fields=id,number,name,vatType(*)");
  if (acctRes.status === 200) {
    const accounts = acctRes.data.values;
    for (const a of accounts) {
      console.log(`  Account ${a.number} (${a.name}): id=${a.id}, vatType.id=${a.vatType?.id}`);
    }
  }

  // Test 2: Check if we can look up existing Drift department
  console.log("\n=== Test 2: Check departments ===");
  const deptRes = await api("GET", "/department?name=Drift&isInactive=false&fields=*");
  if (deptRes.status === 200) {
    const depts = deptRes.data.values;
    console.log(`  Found ${depts.length} department(s):`);
    for (const d of depts) {
      console.log(`    id=${d.id}, name="${d.name}"`);
    }
    const exactDrift = depts.find((d: any) => d.name === "Drift");
    if (exactDrift) {
      console.log(`  Exact "Drift" found: id=${exactDrift.id}`);
    } else {
      console.log(`  No exact "Drift" found, would need POST /department`);
    }
  }

  // Test 3: Try creating a voucher with department name inline (known to fail silently)
  // Just to reconfirm the trap
  console.log("\n=== Test 3: Voucher with inline department name ===");
  const acct7360 = acctRes.data.values.find((a: any) => a.number === 7360);
  const acct1920 = acctRes.data.values.find((a: any) => a.number === 1920);

  if (acct7360 && acct1920) {
    const testVoucher = await api("POST", "/ledger/voucher", {
      date: "2026-04-26",
      description: "Test inline dept name",
      postings: [
        {
          row: 1,
          date: "2026-04-26",
          description: "Test inline dept name",
          account: { id: acct7360.id },
          department: { name: "TestDeptInline" },
          amount: 100,
          amountCurrency: 100,
          amountGross: 100,
          amountGrossCurrency: 100,
        },
        {
          row: 2,
          date: "2026-04-26",
          description: "Test inline dept name",
          account: { id: acct1920.id },
          amount: -100,
          amountCurrency: -100,
          amountGross: -100,
          amountGrossCurrency: -100,
        },
      ],
    });
    if (testVoucher.status === 201) {
      const posting = testVoucher.data.value.postings?.find((p: any) => p.account?.id === acct7360.id);
      console.log(`  Voucher created: id=${testVoucher.data.value.id}`);
      console.log(`  Expense posting dept: ${JSON.stringify(posting?.department)}`);
      if (posting?.department?.id) {
        console.log(`  >>> Department inline name WORKED! id=${posting.department.id}`);
      } else {
        console.log(`  >>> Department inline name SILENTLY IGNORED (department=null)`);
      }
    }
  }

  // Test 4: Can we combine POST /department into the voucher call somehow?
  // Answer: No, Tripletex doesn't support auto-creating departments inline.
  // The 4-call flow is minimal for fresh accounts.

  console.log("\n=== Summary ===");
  console.log("Branch A (non-deductible representation) optimal flow:");
  console.log("  1. POST /department (if fresh account)");
  console.log("  2. GET /ledger/account?number=7360,1920&fields=*");
  console.log("  3. POST /ledger/voucher");
  console.log("  4. POST /ledger/voucher/{id}/attachment");
  console.log("  Total: 4 calls (cannot reduce further)");
}

main().catch(console.error);
