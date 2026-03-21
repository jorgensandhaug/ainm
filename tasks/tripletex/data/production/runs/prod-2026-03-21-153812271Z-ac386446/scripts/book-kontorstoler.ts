const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "sneAfOlN6JPVDYw5-LQsm-q--xbcgBMs08jwFyD1B9s";
const AUTH = "Basic " + btoa("0:" + TOKEN);

async function api(method: string, path: string, body?: any, isFormData = false) {
  const url = `${BASE}${path}`;
  const headers: Record<string, string> = { Authorization: AUTH };
  if (!isFormData) headers["Content-Type"] = "application/json";
  const res = await fetch(url, {
    method,
    headers,
    body: isFormData ? body : body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  console.log(`${method} ${path} -> ${res.status}`);
  if (!res.ok) {
    console.log("ERROR:", text);
    throw new Error(`API ${res.status}: ${text}`);
  }
  if (!text) return null;
  const json = JSON.parse(text);
  if (json.values !== undefined) return json.values;
  if (json.value !== undefined) return json.value;
  return json;
}

// Receipt facts:
// Kontorstoler: 13500 kr (net, ex-VAT)
// VAT 25%: 3375 kr
// Gross: 16875 kr
// Date: 2026-02-22
// Only booking Kontorstoler, not Mus

const RECEIPT_DATE = "2026-02-22";
const DESCRIPTION = "Kontorstoler";
const NET_AMOUNT = 13500;
const GROSS_AMOUNT = 16875; // 13500 * 1.25

// Step 1: Create department "Drift" (fresh account)
console.log("\n=== Step 1: Create department ===");
const dept = await api("POST", "/department", { name: "Drift" });
console.log("Department created:", dept.id, dept.name);

// Step 2: Get accounts 6540 (Inventar) and 1920 (Bank)
console.log("\n=== Step 2: Get accounts ===");
const accounts = await api("GET", "/ledger/account?number=6540,1920&fields=*");
const acc6540 = accounts.find((a: any) => a.number === 6540);
const acc1920 = accounts.find((a: any) => a.number === 1920);
if (!acc6540) throw new Error("Account 6540 not found");
if (!acc1920) throw new Error("Account 1920 not found");
console.log("Account 6540:", acc6540.id, acc6540.name, "vatLocked:", acc6540.vatLocked);
console.log("Account 1920:", acc1920.id, acc1920.name);

// Step 3: Get incoming 25% VAT type
console.log("\n=== Step 3: Get incoming VAT type ===");
const vatTypes = await api("GET", `/ledger/vatType?typeOfVat=INCOMING&vatDate=${RECEIPT_DATE}&fields=*`);
console.log("Incoming VAT types found:", vatTypes.length);
for (const v of vatTypes) {
  console.log(`  id=${v.id} number=${v.number} name=${v.name} pct=${v.percentage}`);
}
const vat25 = vatTypes.find((v: any) => v.percentage === 25);
if (!vat25) throw new Error("Incoming 25% VAT type not found");
console.log("Using VAT type:", vat25.id, vat25.name, `${vat25.percentage}%`);

// Step 4: Create voucher
// POST /ledger/voucher: "Only the gross amounts will be used"
// With vatType on expense posting, Tripletex auto-calculates net and VAT posting
console.log("\n=== Step 4: Create voucher ===");
const voucher = await api("POST", "/ledger/voucher", {
  date: RECEIPT_DATE,
  description: DESCRIPTION,
  voucherType: null,
  postings: [
    {
      row: 1,
      date: RECEIPT_DATE,
      description: DESCRIPTION,
      account: { id: acc6540.id },
      department: { id: dept.id },
      vatType: { id: vat25.id },
      amount: GROSS_AMOUNT,
      amountCurrency: GROSS_AMOUNT,
      amountGross: GROSS_AMOUNT,
      amountGrossCurrency: GROSS_AMOUNT,
    },
    {
      row: 2,
      date: RECEIPT_DATE,
      description: DESCRIPTION,
      account: { id: acc1920.id },
      amount: -GROSS_AMOUNT,
      amountCurrency: -GROSS_AMOUNT,
      amountGross: -GROSS_AMOUNT,
      amountGrossCurrency: -GROSS_AMOUNT,
    },
  ],
});
console.log("Voucher created:", JSON.stringify(voucher, null, 2));

// Step 5: Attach receipt PDF
console.log("\n=== Step 5: Attach receipt ===");
const filePath = "/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-21-153812271Z-ac386446/attachments/01-kvittering_nn_07.pdf";
const fileData = await Bun.file(filePath).arrayBuffer();
const formData = new FormData();
formData.append("file", new Blob([fileData], { type: "application/pdf" }), "01-kvittering_nn_07.pdf");
const attachment = await api("POST", `/ledger/voucher/${voucher.id}/attachment`, formData, true);
console.log("Attachment result:", JSON.stringify(attachment, null, 2));

console.log("\n=== DONE ===");
console.log("Voucher ID:", voucher.id);
console.log("Department:", dept.name, "(id:", dept.id, ")");
