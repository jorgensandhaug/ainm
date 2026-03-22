const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "WQzsIDZRYmnfAr9KaQJ7pcH-7XfnxT0IddIwJaFWWOg";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

async function main() {
  // Step 1: Resolve 0% OUTGOING vatType
  const vatRes = await fetch(
    `${BASE}/ledger/vatType?typeOfVat=OUTGOING&vatDate=2026-03-22&fields=*`,
    { headers: H }
  );
  const vatData = await vatRes.json();
  console.log("VAT response status:", vatRes.status);

  const vatRows = vatData.values || [];
  const zeroVat = vatRows.find((v: any) => v.percentage === 0);
  if (!zeroVat) {
    console.error("No 0% OUTGOING vatType found. Available:", vatRows.map((v: any) => `id=${v.id} ${v.percentage}%`));
    process.exit(1);
  }
  console.log("Resolved 0% vatType:", zeroVat.id, zeroVat.name);

  // Step 2: Create product
  const body = {
    name: "Livro de receitas",
    number: 7946,
    priceExcludingVatCurrency: 18250,
    vatType: { id: zeroVat.id },
  };

  const prodRes = await fetch(`${BASE}/product`, {
    method: "POST",
    headers: H,
    body: JSON.stringify(body),
  });
  const prodData = await prodRes.json();
  console.log("Product create status:", prodRes.status);
  console.log("Product response:", JSON.stringify(prodData.value, null, 2));

  // Verify from response
  const p = prodData.value;
  if (p) {
    console.log("\n=== Verification ===");
    console.log("id:", p.id);
    console.log("number:", p.number);
    console.log("name:", p.name);
    console.log("priceExcludingVatCurrency:", p.priceExcludingVatCurrency);
    console.log("priceIncludingVatCurrency:", p.priceIncludingVatCurrency);
    console.log("vatType.id:", p.vatType?.id, "vatType.percentage:", p.vatType?.percentage);
  }
}

main().catch(console.error);
