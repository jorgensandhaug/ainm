const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "v9513Ed6FtuUIGtnpfM4tEOs7w_HrhzOg4PH4dPYbxg";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { "Content-Type": "application/json", Authorization: AUTH };

const RECEIPT_DATE = "2026-06-16";
const LINE_TEXT = "Whiteboard";
const NET = 8600;
const GROSS = NET * 1.25; // 10750
const ATTACHMENT_PATH = "/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-21-221545802Z-eec3764a/attachments/01-kvittering_en_05.pdf";

async function run() {
  // Step 1: POST /department — fresh account, create Administrasjon
  console.log("=== Step 1: POST /department ===");
  const deptRes = await fetch(`${BASE}/department`, {
    method: "POST",
    headers: H,
    body: JSON.stringify({ name: "Administrasjon" }),
  });
  const deptBody = await deptRes.json();
  console.log("Status:", deptRes.status);
  console.log("Body:", JSON.stringify(deptBody, null, 2));
  if (!deptRes.ok) throw new Error("Failed to create department");
  const deptId = deptBody.value.id;
  console.log("Department ID:", deptId);

  // Step 2: GET /ledger/account — get 6540 and 1920 IDs + vatType
  console.log("\n=== Step 2: GET /ledger/account ===");
  const accRes = await fetch(
    `${BASE}/ledger/account?number=6540,1920&fields=id,number,name,vatType(*)`,
    { headers: H }
  );
  const accBody = await accRes.json();
  console.log("Status:", accRes.status);
  console.log("Body:", JSON.stringify(accBody, null, 2));
  if (!accRes.ok) throw new Error("Failed to get accounts");

  const acc6540 = accBody.values.find((a: any) => a.number === 6540);
  const acc1920 = accBody.values.find((a: any) => a.number === 1920);
  if (!acc6540 || !acc1920) throw new Error("Missing account");
  const vatTypeId = acc6540.vatType?.id;
  console.log("Account 6540 ID:", acc6540.id, "vatType.id:", vatTypeId);
  console.log("Account 1920 ID:", acc1920.id);

  // Step 3: POST /ledger/voucher?sendToLedger=true
  console.log("\n=== Step 3: POST /ledger/voucher?sendToLedger=true ===");
  const voucher = {
    date: RECEIPT_DATE,
    description: LINE_TEXT,
    postings: [
      {
        row: 1,
        date: RECEIPT_DATE,
        description: LINE_TEXT,
        account: { id: acc6540.id },
        department: { id: deptId },
        vatType: { id: vatTypeId },
        amountGross: GROSS,
        amountGrossCurrency: GROSS,
      },
      {
        row: 2,
        date: RECEIPT_DATE,
        description: LINE_TEXT,
        account: { id: acc1920.id },
        amount: -GROSS,
        amountCurrency: -GROSS,
        amountGross: -GROSS,
        amountGrossCurrency: -GROSS,
      },
    ],
  };
  console.log("Payload:", JSON.stringify(voucher, null, 2));
  const vRes = await fetch(`${BASE}/ledger/voucher?sendToLedger=true`, {
    method: "POST",
    headers: H,
    body: JSON.stringify(voucher),
  });
  const vBody = await vRes.json();
  console.log("Status:", vRes.status);
  console.log("Body:", JSON.stringify(vBody, null, 2));
  if (!vRes.ok) throw new Error("Failed to create voucher");
  const voucherId = vBody.value.id;
  console.log("Voucher ID:", voucherId);

  // Step 4: POST /ledger/voucher/{id}/attachment
  console.log("\n=== Step 4: POST attachment ===");
  const file = Bun.file(ATTACHMENT_PATH);
  const formData = new FormData();
  formData.append("file", file);
  const aRes = await fetch(`${BASE}/ledger/voucher/${voucherId}/attachment`, {
    method: "POST",
    headers: { Authorization: AUTH },
    body: formData,
  });
  const aBody = await aRes.json();
  console.log("Status:", aRes.status);
  console.log("Body:", JSON.stringify(aBody, null, 2));
  if (!aRes.ok) throw new Error("Failed to attach receipt");

  console.log("\n=== DONE ===");
  console.log("Voucher ID:", voucherId);
  console.log("Department:", deptId, "Administrasjon");
  console.log("Expense account: 6540 Inventar, vatType:", vatTypeId);
  console.log("GROSS:", GROSS, "(NET:", NET, "× 1.25)");
}

run().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
