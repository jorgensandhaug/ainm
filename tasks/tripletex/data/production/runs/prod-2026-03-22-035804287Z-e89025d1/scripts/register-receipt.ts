const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "dtAFSbfPFSRkwwjXAG3A5TxwNbbFIUUeDEzA_YY6RLM";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const h = { Authorization: AUTH, "Content-Type": "application/json" };

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: RequestInit = { method, headers: h };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  const j = await r.json();
  if (!r.ok) { console.error(`${method} ${path} → ${r.status}`, JSON.stringify(j)); throw new Error(`${r.status}`); }
  return j;
}

async function main() {
  // Round 1: parallel — create/get department + get accounts
  const [deptRes, acctRes] = await Promise.all([
    api("POST", "/department", { name: "Utvikling", departmentNumber: -1 })
      .catch(async (e) => {
        // 409 = exists, GET it
        const r = await api("GET", "/department?name=Utvikling&isInactive=false&fields=*");
        const exact = r.values.filter((d: any) => d.name === "Utvikling");
        if (!exact.length) throw new Error("Department Utvikling not found");
        return { value: exact[0] };
      }),
    api("GET", "/ledger/account?number=6540,1920&fields=id,number,name,vatType(*),vatLocked"),
  ]);

  const deptId = deptRes.value.id;
  console.log("Department:", deptId, deptRes.value.name);

  const acct6540 = acctRes.values.find((a: any) => a.number === 6540);
  const acct1920 = acctRes.values.find((a: any) => a.number === 1920);
  if (!acct6540 || !acct1920) throw new Error("Accounts not found");
  console.log("6540:", acct6540.id, "vatType:", acct6540.vatType?.id);
  console.log("1920:", acct1920.id);

  const vatTypeId = acct6540.vatType?.id ?? 1; // 25% incoming
  const GROSS = 6900 * 1.25; // 8625

  // Round 2: POST voucher
  const voucher = await api("POST", "/ledger/voucher?sendToLedger=true", {
    date: "2026-05-19",
    description: "Tastatur",
    postings: [
      {
        row: 1,
        date: "2026-05-19",
        description: "Tastatur",
        account: { id: acct6540.id },
        department: { id: deptId },
        vatType: { id: vatTypeId },
        amountGross: GROSS,
        amountGrossCurrency: GROSS,
      },
      {
        row: 2,
        date: "2026-05-19",
        description: "Tastatur",
        account: { id: acct1920.id },
        amountGross: -GROSS,
        amountGrossCurrency: -GROSS,
      },
    ],
  });

  const voucherId = voucher.value.id;
  console.log("Voucher created:", voucherId, "number:", voucher.value.number);
  console.log("Postings:", JSON.stringify(voucher.value.postings, null, 2));

  // Round 3: Upload attachment
  const filePath = "/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-22-035804287Z-e89025d1/attachments/01-kvittering_fr_03.pdf";
  const file = Bun.file(filePath);
  const form = new FormData();
  form.append("file", file, "01-kvittering_fr_03.pdf");

  const attachRes = await fetch(`${BASE}/ledger/voucher/${voucherId}/attachment`, {
    method: "POST",
    headers: { Authorization: AUTH },
    body: form,
  });
  const attachJson = await attachRes.json();
  if (!attachRes.ok) { console.error("Attachment failed:", attachRes.status, JSON.stringify(attachJson)); }
  else { console.log("Attachment uploaded:", attachJson.value?.attachment?.id); }

  console.log("\nDone. 4 calls (or 3+1 if dept existed).");
}

main().catch(e => { console.error("FATAL:", e); process.exit(1); });
