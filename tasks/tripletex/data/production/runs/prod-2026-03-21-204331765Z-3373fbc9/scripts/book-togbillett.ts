const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "0JGf7TPZzhFfjqs47_w3qcb1A_-c9tq24a0HcY-ynxo";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const ATTACHMENT_PATH = "/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-21-204331765Z-3373fbc9/attachments/01-kvittering_nb_01.pdf";

const headers = { Authorization: AUTH, "Content-Type": "application/json" };

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: any = { method, headers };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  const text = await r.text();
  console.log(`${method} ${path} → ${r.status}`);
  if (!r.ok) { console.log(text); throw new Error(`${r.status} ${text}`); }
  return JSON.parse(text);
}

async function main() {
  // Step 1: Create department "Administrasjon"
  const deptRes = await api("POST", "/department", { name: "Administrasjon" });
  const deptId = deptRes.value.id;
  console.log("Department ID:", deptId);

  // Step 2: Get account IDs for 7140 and 1920
  const acctRes = await api("GET", "/ledger/account?number=7140,1920&fields=id,number,name,vatType(*)");
  const accounts = acctRes.values;
  const acct7140 = accounts.find((a: any) => a.number === 7140);
  const acct1920 = accounts.find((a: any) => a.number === 1920);
  console.log("7140 ID:", acct7140.id, "1920 ID:", acct1920.id);

  // Receipt line: Togbillett 8750.00 kr (NET)
  // NET check: total 9300 × 0.25 = 2325 = stated MVA → NET confirmed
  // GROSS = 8750 × 1.25 = 10937.50
  const GROSS = 8750 * 1.25; // 10937.50

  // Step 3: POST voucher with sendToLedger=true (Branch C)
  const voucherRes = await api("POST", "/ledger/voucher?sendToLedger=true", {
    date: "2026-02-27",
    description: "Togbillett",
    postings: [
      {
        row: 1,
        date: "2026-02-27",
        description: "Togbillett",
        account: { id: acct7140.id },
        department: { id: deptId },
        vatType: { id: 1 },
        amountGross: GROSS,
        amountGrossCurrency: GROSS,
      },
      {
        row: 2,
        date: "2026-02-27",
        description: "Togbillett",
        account: { id: acct1920.id },
        amount: -GROSS,
        amountCurrency: -GROSS,
        amountGross: -GROSS,
        amountGrossCurrency: -GROSS,
      },
    ],
  });
  const voucherId = voucherRes.value.id;
  console.log("Voucher ID:", voucherId);
  console.log("Voucher postings:", JSON.stringify(voucherRes.value.postings, null, 2));

  // Step 4: Attach the receipt PDF
  const file = Bun.file(ATTACHMENT_PATH);
  const formData = new FormData();
  formData.append("file", file, "01-kvittering_nb_01.pdf");
  formData.append("fileName", "01-kvittering_nb_01.pdf");

  const attachUrl = `${BASE}/ledger/voucher/${voucherId}/attachment`;
  const attachRes = await fetch(attachUrl, {
    method: "POST",
    headers: { Authorization: AUTH },
    body: formData,
  });
  const attachText = await attachRes.text();
  console.log(`POST /ledger/voucher/${voucherId}/attachment → ${attachRes.status}`);
  if (!attachRes.ok) { console.log(attachText); throw new Error(`Attach failed: ${attachRes.status}`); }
  console.log("Attachment response:", attachText);

  console.log("\nDone. 4 API calls, 0 expected errors.");
}

main().catch((e) => { console.error(e); process.exit(1); });
