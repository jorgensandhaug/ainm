const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "lWHRtr5RA6QX2-CIJifgcvI8ZGuPwlZ7qq_Oopm8MbY";
const AUTH = "Basic " + btoa("0:" + TOKEN);

const headers = { Authorization: AUTH, "Content-Type": "application/json" };

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: any = { method, headers };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const json = await res.json();
  if (!res.ok) {
    console.error(`${method} ${path} → ${res.status}`, JSON.stringify(json, null, 2));
    throw new Error(`${method} ${path} failed: ${res.status}`);
  }
  console.log(`${method} ${path} → ${res.status}`);
  return json;
}

async function main() {
  // Receipt: Jernia, 21.06.2026, Whiteboard NET=14300, Branch B (6540, 25%)
  const receiptDate = "2026-06-21";
  const description = "Whiteboard";
  const NET = 14300;
  const GROSS = NET * 1.25; // 17875
  const deptName = "HR";

  // Call 1: Create department HR
  let deptId: number;
  try {
    const deptRes = await api("POST", "/department", { name: deptName, departmentNumber: -1 });
    deptId = deptRes.value.id;
    console.log("Created department:", deptId);
  } catch {
    // 409 conflict → already exists, GET it
    const deptGet = await api("GET", `/department?name=${encodeURIComponent(deptName)}&isInactive=false&fields=*`);
    const exact = deptGet.values.find((d: any) => d.name === deptName);
    if (!exact) throw new Error("Department HR not found");
    deptId = exact.id;
    console.log("Found department:", deptId);
  }

  // Call 2: Resolve accounts 6540 + 1920
  const acctRes = await api("GET", "/ledger/account?number=6540,1920&fields=id,number,name,vatType(*),vatLocked");
  const acct6540 = acctRes.values.find((a: any) => a.number === 6540);
  const acct1920 = acctRes.values.find((a: any) => a.number === 1920);
  if (!acct6540 || !acct1920) throw new Error("Missing accounts");
  const vatTypeId = acct6540.vatType?.id;
  console.log(`Account 6540 id=${acct6540.id}, vatType.id=${vatTypeId}; Account 1920 id=${acct1920.id}`);

  // Call 3: Create and book voucher
  const voucherRes = await api("POST", "/ledger/voucher?sendToLedger=true", {
    date: receiptDate,
    description,
    postings: [
      {
        row: 1,
        date: receiptDate,
        description,
        account: { id: acct6540.id },
        department: { id: deptId },
        vatType: { id: vatTypeId },
        amountGross: GROSS,
        amountGrossCurrency: GROSS,
      },
      {
        row: 2,
        date: receiptDate,
        description,
        account: { id: acct1920.id },
        amountGross: -GROSS,
        amountGrossCurrency: -GROSS,
      },
    ],
  });
  const voucherId = voucherRes.value.id;
  const voucherNumber = voucherRes.value.number;
  console.log(`Voucher created: id=${voucherId}, number=${voucherNumber}`);
  console.log("Postings:", JSON.stringify(voucherRes.value.postings, null, 2));

  // Call 4: Upload receipt attachment
  const filePath = "/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-22-052532132Z-7ad5804f/attachments/01-kvittering_nb_06.pdf";
  const file = Bun.file(filePath);
  const formData = new FormData();
  formData.append("file", file);
  const attachRes = await fetch(`${BASE}/ledger/voucher/${voucherId}/attachment`, {
    method: "POST",
    headers: { Authorization: AUTH },
    body: formData,
  });
  const attachJson = await attachRes.json();
  if (!attachRes.ok) {
    console.error("Attachment upload failed:", attachRes.status, JSON.stringify(attachJson, null, 2));
    throw new Error("Attachment upload failed");
  }
  console.log("Attachment uploaded:", JSON.stringify(attachJson.value?.attachment?.id));

  console.log("\n=== DONE ===");
  console.log(`Voucher id=${voucherId}, number=${voucherNumber}`);
  console.log(`Department: ${deptName} (id=${deptId})`);
  console.log(`Account: 6540 (id=${acct6540.id})`);
  console.log(`GROSS: ${GROSS}, NET (auto): ${NET}, VAT (auto): ${GROSS - NET}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
