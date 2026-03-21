// Sandbox investigation: test voucher row field requirement and voucherType lookup
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const TODAY = "2026-03-21";
const h = { "Content-Type": "application/json", Authorization: AUTH };

async function get(path: string) {
  const r = await fetch(`${BASE}${path}`, { headers: h });
  const b = await r.json();
  console.log("GET", path, r.status);
  return { status: r.status, body: b };
}
async function post(path: string, body: any) {
  const r = await fetch(`${BASE}${path}`, { method: "POST", headers: h, body: JSON.stringify(body) });
  const b = await r.json();
  console.log("POST", path, r.status);
  return { status: r.status, body: b };
}

async function main() {
  // Test 1: Look up voucherType by name
  const vtRes = await get("/ledger/voucherType?name=Leverandørfaktura&count=1&fields=*");
  console.log("voucherType lookup:", JSON.stringify(vtRes.body.values?.map((v: any) => ({ id: v.id, name: v.name }))));
  const voucherTypeId = vtRes.body.values?.[0]?.id;
  console.log("voucherType ID in sandbox:", voucherTypeId);

  // We need a supplier and project to test with. Let's find existing ones.
  const suppRes = await get("/supplier?count=1&fields=*");
  const suppId = suppRes.body.values?.[0]?.id;
  console.log("supplier id:", suppId);

  const projRes = await get("/project?count=1&fields=id,name");
  const projId = projRes.body.values?.[0]?.id;
  console.log("project id:", projId);

  const accRes = await get("/ledger/account?number=6590,2400&fields=id,number,name");
  const acc6590 = accRes.body.values?.find((a: any) => a.number === 6590);
  const acc2400 = accRes.body.values?.find((a: any) => a.number === 2400);
  console.log("acc6590:", acc6590?.id, "acc2400:", acc2400?.id);

  if (!suppId || !projId || !acc6590 || !acc2400 || !voucherTypeId) {
    console.log("Missing prerequisites, skipping voucher tests");
    return;
  }

  // Test 2: POST voucher WITHOUT row fields (should fail)
  console.log("\n--- Test 2: Voucher WITHOUT row fields ---");
  const noRowRes = await post("/ledger/voucher", {
    voucherType: { id: voucherTypeId },
    date: TODAY,
    description: "Test without row fields",
    postings: [
      {
        account: { id: acc6590.id },
        amount: 100,
        amountCurrency: 100,
        amountGross: 100,
        amountGrossCurrency: 100,
        project: { id: projId },
        date: TODAY,
        description: "Test expense",
      },
      {
        account: { id: acc2400.id },
        amount: -100,
        amountCurrency: -100,
        amountGross: -100,
        amountGrossCurrency: -100,
        supplier: { id: suppId },
        date: TODAY,
        description: "Test credit",
      },
    ],
  });
  console.log("Without row result:", JSON.stringify(noRowRes.body).slice(0, 500));

  // Test 3: POST voucher WITH row fields (should succeed)
  console.log("\n--- Test 3: Voucher WITH row fields ---");
  const withRowRes = await post("/ledger/voucher", {
    voucherType: { id: voucherTypeId },
    date: TODAY,
    description: "Test with row fields",
    postings: [
      {
        row: 1,
        account: { id: acc6590.id },
        amount: 200,
        amountCurrency: 200,
        amountGross: 200,
        amountGrossCurrency: 200,
        project: { id: projId },
        date: TODAY,
        description: "Test expense",
      },
      {
        row: 2,
        account: { id: acc2400.id },
        amount: -200,
        amountCurrency: -200,
        amountGross: -200,
        amountGrossCurrency: -200,
        supplier: { id: suppId },
        date: TODAY,
        description: "Test credit",
      },
    ],
  });
  console.log("With row result:", JSON.stringify(withRowRes.body).slice(0, 500));

  // Test 4: POST voucher with hardcoded voucherType 9744845
  console.log("\n--- Test 4: Voucher with hardcoded ID 9744845 ---");
  const hardcodedRes = await post("/ledger/voucher", {
    voucherType: { id: 9744845 },
    date: TODAY,
    description: "Test hardcoded voucherType",
    postings: [
      {
        row: 1,
        account: { id: acc6590.id },
        amount: 300,
        amountCurrency: 300,
        amountGross: 300,
        amountGrossCurrency: 300,
        project: { id: projId },
        date: TODAY,
        description: "Test expense",
      },
      {
        row: 2,
        account: { id: acc2400.id },
        amount: -300,
        amountCurrency: -300,
        amountGross: -300,
        amountGrossCurrency: -300,
        supplier: { id: suppId },
        date: TODAY,
        description: "Test credit",
      },
    ],
  });
  console.log("Hardcoded ID result:", JSON.stringify(hardcodedRes.body).slice(0, 500));
}

main().catch((e) => console.error("FATAL:", e.message));
