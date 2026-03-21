const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "NCVfO2u1_oIzb_7xorGFZSowZ4bfJn2qnYPufHmRu68";
const AUTH = "Basic " + btoa("0:" + TOKEN);

const headers = { Authorization: AUTH, "Content-Type": "application/json" };

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: RequestInit = { method, headers };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const text = await res.text();
  console.log(`${method} ${path} → ${res.status}`);
  if (!res.ok) {
    console.error(text);
    throw new Error(`${method} ${path} failed: ${res.status}`);
  }
  return JSON.parse(text);
}

async function uploadAttachment(voucherId: number, filePath: string) {
  const file = Bun.file(filePath);
  const formData = new FormData();
  formData.append("file", file, "kvittering_es_02.pdf");
  formData.append("fileName", "kvittering_es_02.pdf");
  const res = await fetch(`${BASE}/ledger/voucher/${voucherId}/attachment`, {
    method: "POST",
    headers: { Authorization: AUTH },
    body: formData,
  });
  const text = await res.text();
  console.log(`POST /ledger/voucher/${voucherId}/attachment → ${res.status}`);
  if (!res.ok) {
    console.error(text);
    throw new Error(`Attachment upload failed: ${res.status}`);
  }
  return JSON.parse(text);
}

async function main() {
  // Step 1: Create department Drift
  const deptRes = await api("POST", "/department", { name: "Drift" });
  const deptId = deptRes.value.id;
  console.log(`Department Drift created: id=${deptId}`);

  // Step 2: Get account IDs for 7360 and 1920
  const acctRes = await api("GET", "/ledger/account?number=7360,1920&fields=*");
  const accounts = acctRes.values;
  const acct7360 = accounts.find((a: any) => a.number === 7360);
  const acct1920 = accounts.find((a: any) => a.number === 1920);
  if (!acct7360 || !acct1920) throw new Error("Account(s) not found");
  console.log(`Account 7360 id=${acct7360.id}, Account 1920 id=${acct1920.id}`);

  // Step 3: Create voucher — Branch A (non-deductible representation)
  const linePrice = 14050;
  const receiptDate = "2026-04-26";
  const description = "Kundemøte lunsj";

  const voucherRes = await api("POST", "/ledger/voucher", {
    date: receiptDate,
    description,
    postings: [
      {
        row: 1,
        date: receiptDate,
        description,
        account: { id: acct7360.id },
        department: { id: deptId },
        amount: linePrice,
        amountCurrency: linePrice,
        amountGross: linePrice,
        amountGrossCurrency: linePrice,
      },
      {
        row: 2,
        date: receiptDate,
        description,
        account: { id: acct1920.id },
        amount: -linePrice,
        amountCurrency: -linePrice,
        amountGross: -linePrice,
        amountGrossCurrency: -linePrice,
      },
    ],
  });

  const voucher = voucherRes.value;
  console.log(`Voucher created: id=${voucher.id}, number=${voucher.number}`);
  const expPosting = voucher.postings?.find((p: any) => p.account?.id === acct7360.id);
  console.log(`Expense posting: account=${expPosting?.account?.id}, dept=${expPosting?.department?.id}, vatType=${expPosting?.vatType?.id}, amountGross=${expPosting?.amountGross}`);

  // Step 4: Upload receipt attachment
  const attachPath = "/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-21-191432442Z-01420e60/attachments/01-kvittering_es_02.pdf";
  const attachRes = await uploadAttachment(voucher.id, attachPath);
  console.log(`Attachment uploaded: id=${attachRes.value?.id}`);

  console.log("\n=== DONE ===");
  console.log(`Voucher ${voucher.id} (number ${voucher.number}): Kundemøte lunsj 14050 kr on account 7360, department Drift (${deptId}), VAT code 0`);
}

main().catch((e) => { console.error(e); process.exit(1); });
