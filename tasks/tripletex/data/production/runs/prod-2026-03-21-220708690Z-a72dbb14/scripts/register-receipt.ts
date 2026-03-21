const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "ODT04K7hA6QczCXL2zg_VMQ7HopLM-zDMni8CnYm3wk";
const AUTH = "Basic " + btoa(`0:${TOKEN}`);
const H = { "Authorization": AUTH, "Content-Type": "application/json" };

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: any = { method, headers: H };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  const text = await r.text();
  console.log(`${method} ${path} → ${r.status}`);
  if (!r.ok) { console.log(text); throw new Error(`${r.status}`); }
  return JSON.parse(text);
}

async function uploadAttachment(voucherId: number) {
  const file = Bun.file("/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-21-220708690Z-a72dbb14/attachments/01-kvittering_es_02.pdf");
  const form = new FormData();
  form.append("file", file, "01-kvittering_es_02.pdf");
  const r = await fetch(`${BASE}/ledger/voucher/${voucherId}/attachment`, {
    method: "POST",
    headers: { "Authorization": AUTH },
    body: form,
  });
  const text = await r.text();
  console.log(`POST /ledger/voucher/${voucherId}/attachment → ${r.status}`);
  if (!r.ok) { console.log(text); throw new Error(`${r.status}`); }
  return JSON.parse(text);
}

async function main() {
  // Department already created: id 963901
  const deptId = 963901;
  // Accounts already fetched: 7360 id=474697427, 1920 id=474697115
  const acct7360Id = 474697427;
  const acct1920Id = 474697115;

  // Step 3: Compute GROSS (NET receipt, 14050 × 1.25 = 17562.50)
  const GROSS = 14050 * 1.25; // 17562.50

  // Step 4: POST voucher with sendToLedger=true
  const voucherRes = await api("POST", "/ledger/voucher?sendToLedger=true", {
    date: "2026-04-26",
    description: "Kundemøte lunsj",
    postings: [
      {
        row: 1,
        date: "2026-04-26",
        description: "Kundemøte lunsj",
        account: { id: acct7360Id },
        department: { id: deptId },
        amount: GROSS,
        amountCurrency: GROSS,
        amountGross: GROSS,
        amountGrossCurrency: GROSS,
      },
      {
        row: 2,
        date: "2026-04-26",
        description: "Kundemøte lunsj",
        account: { id: acct1920Id },
        amount: -GROSS,
        amountCurrency: -GROSS,
        amountGross: -GROSS,
        amountGrossCurrency: -GROSS,
      },
    ],
  });
  const voucherId = voucherRes.value.id;
  console.log("Voucher id:", voucherId, "number:", voucherRes.value.number);
  console.log("Postings:", JSON.stringify(voucherRes.value.postings, null, 2));

  // Step 5: Attach receipt
  const attachRes = await uploadAttachment(voucherId);
  console.log("Attachment id:", attachRes.value?.id);
}

main().catch(e => { console.error(e); process.exit(1); });
