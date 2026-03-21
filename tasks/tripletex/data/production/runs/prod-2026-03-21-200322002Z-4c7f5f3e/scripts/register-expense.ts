const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "TLdHn4Je5RDtNev0C6dCDXQo5OLJ3hLjjbVJLZ-RbHA";
const AUTH = "Basic " + btoa("0:" + TOKEN);

const h = { Authorization: AUTH, "Content-Type": "application/json" };

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: any = { method, headers: h };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  const text = await r.text();
  console.log(`${method} ${path} → ${r.status}`);
  if (!r.ok) { console.log(text); throw new Error(`${r.status}`); }
  if (!text) return null;
  const json = JSON.parse(text);
  if (json.values !== undefined) return json.values;
  if (json.value !== undefined) return json.value;
  return json;
}

async function uploadAttachment(voucherId: number, filePath: string) {
  const file = Bun.file(filePath);
  const formData = new FormData();
  formData.append("file", file, "kvittering_pt_04.pdf");
  formData.append("fileName", "kvittering_pt_04.pdf");
  const r = await fetch(`${BASE}/ledger/voucher/${voucherId}/attachment`, {
    method: "POST",
    headers: { Authorization: AUTH },
    body: formData,
  });
  const text = await r.text();
  console.log(`POST /ledger/voucher/${voucherId}/attachment → ${r.status}`);
  if (!r.ok) { console.log(text); throw new Error(`${r.status}`); }
  const json = JSON.parse(text);
  return json.value || json;
}

async function main() {
  // Receipt: Kaffemøte 6600 kr NET → GROSS = 6600 × 1.25 = 8250
  const GROSS = 8250;
  const DATE = "2026-01-04";
  const DESC = "Kaffemøte";

  // 1. Create department Utvikling
  const dept = await api("POST", "/department", { name: "Utvikling" });
  console.log("Department:", JSON.stringify({ id: dept.id, name: dept.name }));

  // 2. Get accounts 7360 and 1920
  const accounts = await api("GET", "/ledger/account?number=7360,1920&fields=*");
  const acc7360 = accounts.find((a: any) => a.number === 7360);
  const acc1920 = accounts.find((a: any) => a.number === 1920);
  if (!acc7360 || !acc1920) throw new Error("Missing accounts");
  console.log("Accounts:", JSON.stringify({ "7360": acc7360.id, "1920": acc1920.id }));

  // 3. POST voucher with sendToLedger=true (Branch A: non-deductible representation)
  const voucher = await api("POST", "/ledger/voucher?sendToLedger=true", {
    date: DATE,
    description: DESC,
    postings: [
      {
        row: 1,
        date: DATE,
        description: DESC,
        account: { id: acc7360.id },
        department: { id: dept.id },
        amount: GROSS,
        amountCurrency: GROSS,
        amountGross: GROSS,
        amountGrossCurrency: GROSS,
      },
      {
        row: 2,
        date: DATE,
        description: DESC,
        account: { id: acc1920.id },
        amount: -GROSS,
        amountCurrency: -GROSS,
        amountGross: -GROSS,
        amountGrossCurrency: -GROSS,
      },
    ],
  });
  console.log("Voucher:", JSON.stringify({
    id: voucher.id,
    number: voucher.number,
    date: voucher.date,
    description: voucher.description,
  }));
  if (voucher.postings) {
    for (const p of voucher.postings) {
      console.log("  Posting:", JSON.stringify({
        account: p.account?.number,
        amount: p.amount,
        amountGross: p.amountGross,
        department: p.department?.id,
        vatType: p.vatType?.id,
      }));
    }
  }

  // 4. Attach receipt
  const att = await uploadAttachment(
    voucher.id,
    "/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-21-200322002Z-4c7f5f3e/attachments/01-kvittering_pt_04.pdf"
  );
  console.log("Attachment:", JSON.stringify({ id: att.id }));

  console.log("\nDone. 4 API calls.");
}

main().catch((e) => { console.error(e); process.exit(1); });
