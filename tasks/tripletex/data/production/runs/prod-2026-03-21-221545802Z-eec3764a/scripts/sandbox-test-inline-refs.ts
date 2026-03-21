const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { "Content-Type": "application/json", Authorization: AUTH };

async function run() {
  // Test 1: Can we use account by number+name without id?
  console.log("=== Test 1: account by number+name (no id) ===");
  const v1 = {
    date: "2026-06-16",
    description: "Test inline refs",
    postings: [
      {
        row: 1,
        date: "2026-06-16",
        description: "Test",
        account: { number: 6540, name: "Inventar" },
        amountGross: 1250,
        amountGrossCurrency: 1250,
        vatType: { id: 1 },
      },
      {
        row: 2,
        date: "2026-06-16",
        description: "Test",
        account: { number: 1920, name: "Bankinnskudd" },
        amount: -1250,
        amountCurrency: -1250,
        amountGross: -1250,
        amountGrossCurrency: -1250,
      },
    ],
  };
  const r1 = await fetch(`${BASE}/ledger/voucher?sendToLedger=true`, {
    method: "POST",
    headers: H,
    body: JSON.stringify(v1),
  });
  console.log("Status:", r1.status);
  const b1 = await r1.json();
  console.log("Body:", JSON.stringify(b1, null, 2));

  // Test 2: Can we use department by name (no id)?
  console.log("\n=== Test 2: department by name (no id) on posting ===");
  // First get real account ids for a clean test
  const accRes = await fetch(
    `${BASE}/ledger/account?number=6540,1920&fields=id,number,name`,
    { headers: H }
  );
  const accBody = await accRes.json();
  const acc6540 = accBody.values.find((a: any) => a.number === 6540);
  const acc1920 = accBody.values.find((a: any) => a.number === 1920);

  const v2 = {
    date: "2026-06-16",
    description: "Test dept by name",
    postings: [
      {
        row: 1,
        date: "2026-06-16",
        description: "Test",
        account: { id: acc6540.id },
        department: { name: "Administrasjon" },
        amountGross: 1250,
        amountGrossCurrency: 1250,
        vatType: { id: 1 },
      },
      {
        row: 2,
        date: "2026-06-16",
        description: "Test",
        account: { id: acc1920.id },
        amount: -1250,
        amountCurrency: -1250,
        amountGross: -1250,
        amountGrossCurrency: -1250,
      },
    ],
  };
  const r2 = await fetch(`${BASE}/ledger/voucher?sendToLedger=true`, {
    method: "POST",
    headers: H,
    body: JSON.stringify(v2),
  });
  console.log("Status:", r2.status);
  const b2 = await r2.json();
  // Check if department was actually persisted
  if (r2.ok) {
    const posting = b2.value?.postings?.find((p: any) => p.row === 1);
    console.log("Department on posting:", JSON.stringify(posting?.department));
    if (!posting?.department?.id) {
      console.log("WARNING: department name accepted but stored as null!");
    }
  } else {
    console.log("Body:", JSON.stringify(b2, null, 2));
  }
}

run().catch(console.error);
