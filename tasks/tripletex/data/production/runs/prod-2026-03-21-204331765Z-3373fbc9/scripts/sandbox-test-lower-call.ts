// Sandbox investigation: can we skip GET /ledger/account by using account number+name in voucher postings?
// This would reduce the flow from 4 calls to 3.

const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);

const headers = { Authorization: AUTH, "Content-Type": "application/json" };

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: any = { method, headers };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  const text = await r.text();
  console.log(`\n${method} ${path} → ${r.status}`);
  if (text) {
    try { console.log(JSON.stringify(JSON.parse(text), null, 2).substring(0, 2000)); } catch { console.log(text.substring(0, 2000)); }
  }
  return { status: r.status, data: text ? JSON.parse(text) : null };
}

async function main() {
  // First, get a known department ID from sandbox
  const deptRes = await api("GET", "/department?name=Administrasjon&isInactive=false&fields=*");
  let deptId: number;
  if (deptRes.data.values && deptRes.data.values.length > 0) {
    const exact = deptRes.data.values.find((d: any) => d.name === "Administrasjon");
    if (exact) {
      deptId = exact.id;
      console.log("\nUsing existing dept:", deptId);
    } else {
      const newDept = await api("POST", "/department", { name: "Administrasjon" });
      deptId = newDept.data.value.id;
      console.log("\nCreated dept:", deptId);
    }
  } else {
    const newDept = await api("POST", "/department", { name: "Administrasjon" });
    deptId = newDept.data.value.id;
    console.log("\nCreated dept:", deptId);
  }

  // Test 1: Try using account number+name (no id) — expected to fail
  console.log("\n=== TEST 1: account with number+name, no id ===");
  const test1 = await api("POST", "/ledger/voucher?sendToLedger=true", {
    date: "2026-02-27",
    description: "Togbillett sandbox test",
    postings: [
      {
        row: 1, date: "2026-02-27", description: "Togbillett sandbox test",
        account: { number: 7140, name: "Reisekostnad, ikke oppgavepliktig" },
        department: { id: deptId },
        vatType: { id: 1 },
        amountGross: 10937.50, amountGrossCurrency: 10937.50,
      },
      {
        row: 2, date: "2026-02-27", description: "Togbillett sandbox test",
        account: { number: 1920, name: "Bankinnskudd" },
        amount: -10937.50, amountCurrency: -10937.50,
        amountGross: -10937.50, amountGrossCurrency: -10937.50,
      },
    ],
  });

  // Test 2: Try using only account number (no id, no name) — expected to fail
  console.log("\n=== TEST 2: account with number only ===");
  const test2 = await api("POST", "/ledger/voucher?sendToLedger=true", {
    date: "2026-02-27",
    description: "Togbillett sandbox test 2",
    postings: [
      {
        row: 1, date: "2026-02-27", description: "Togbillett sandbox test 2",
        account: { number: 7140 },
        department: { id: deptId },
        vatType: { id: 1 },
        amountGross: 10937.50, amountGrossCurrency: 10937.50,
      },
      {
        row: 2, date: "2026-02-27", description: "Togbillett sandbox test 2",
        account: { number: 1920 },
        amount: -10937.50, amountCurrency: -10937.50,
        amountGross: -10937.50, amountGrossCurrency: -10937.50,
      },
    ],
  });

  // Test 3: Try combining POST /department + GET /ledger/account in parallel
  // (This doesn't reduce calls but could the GET be replaced by using /department/list?)
  // Actually, let's test if POST /ledger/voucher can create the department inline
  console.log("\n=== TEST 3: department by name inline on voucher ===");
  const test3 = await api("POST", "/ledger/voucher?sendToLedger=true", {
    date: "2026-02-27",
    description: "Togbillett sandbox test 3",
    postings: [
      {
        row: 1, date: "2026-02-27", description: "Togbillett sandbox test 3",
        account: { id: 424191019 }, // known sandbox account id for 7140
        department: { name: "SandboxTestDept" },
        vatType: { id: 1 },
        amountGross: 5000, amountGrossCurrency: 5000,
      },
      {
        row: 2, date: "2026-02-27", description: "Togbillett sandbox test 3",
        account: { id: 424190862 }, // known sandbox id for 1920
        amount: -5000, amountCurrency: -5000,
        amountGross: -5000, amountGrossCurrency: -5000,
      },
    ],
  });

  // Check if test3 actually stored the department
  if (test3.status === 201 && test3.data?.value) {
    const postings = test3.data.value.postings;
    const expensePosting = postings?.find((p: any) => p.row === 1);
    console.log("\nTest3 expense posting department:", JSON.stringify(expensePosting?.department));
  }

  console.log("\n=== DONE ===");
}

main().catch((e) => { console.error(e); process.exit(1); });
