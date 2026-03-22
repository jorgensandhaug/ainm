const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "MaeWfFTGxyaZ-iYc0ys9kHjRNRjVl2p7lCLKzagTHg8";
const AUTH = "Basic " + btoa(`0:${TOKEN}`);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: any = { method, headers: H };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  const text = await r.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  console.log(`${method} ${path} → ${r.status}`);
  if (!r.ok) { console.log("ERROR:", JSON.stringify(json)); }
  return { status: r.status, data: json };
}

async function upload(path: string, filePath: string) {
  const file = Bun.file(filePath);
  const form = new FormData();
  form.append("file", file);
  const r = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { Authorization: AUTH },
    body: form,
  });
  const text = await r.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  console.log(`POST ${path} → ${r.status}`);
  if (!r.ok) console.log("ERROR:", JSON.stringify(json));
  return { status: r.status, data: json };
}

async function main() {
  // Step 1: Create or resolve department "Salg"
  let deptId: number;
  const deptPost = await api("POST", "/department", { name: "Salg", departmentNumber: -1 });
  if (deptPost.status === 201) {
    deptId = deptPost.data.value.id;
    console.log(`department: id=${deptId}, name=Salg (created)`);
  } else {
    // 409 or other — GET and filter
    const deptGet = await api("GET", "/department?name=Salg&isInactive=false&fields=*");
    const exact = deptGet.data.values.filter((d: any) => d.name === "Salg");
    if (exact.length === 0) throw new Error("Department 'Salg' not found");
    deptId = exact[0].id;
    console.log(`department: id=${deptId}, name=Salg (existing)`);
  }

  // Step 2: Resolve account IDs for 7360 and 1920
  const acctGet = await api("GET", "/ledger/account?number=7360,1920&fields=id,number,name,vatType(*),vatLocked");
  const accounts = acctGet.data.values;
  const acct7360 = accounts.find((a: any) => a.number === 7360);
  const acct1920 = accounts.find((a: any) => a.number === 1920);
  if (!acct7360 || !acct1920) throw new Error("Accounts not found");
  console.log(`expenseAccount: id=${acct7360.id}, number=7360, vatLocked=${acct7360.vatLocked}`);
  console.log(`bankAccount: id=${acct1920.id}, number=1920`);

  // Step 3: Book voucher — Branch A (non-deductible representation, no vatType)
  const lineAmount = 13200;
  const receiptDate = "2026-03-09";
  const description = "Forretningslunsj";

  const voucherPayload = {
    date: receiptDate,
    description,
    postings: [
      {
        row: 1,
        date: receiptDate,
        description,
        account: { id: acct7360.id },
        department: { id: deptId },
        amount: lineAmount,
        amountCurrency: lineAmount,
        amountGross: lineAmount,
        amountGrossCurrency: lineAmount,
      },
      {
        row: 2,
        date: receiptDate,
        description,
        account: { id: acct1920.id },
        amount: -lineAmount,
        amountCurrency: -lineAmount,
        amountGross: -lineAmount,
        amountGrossCurrency: -lineAmount,
      },
    ],
  };

  const voucherRes = await api("POST", "/ledger/voucher?sendToLedger=true", voucherPayload);
  if (voucherRes.status !== 201) throw new Error("Voucher creation failed");
  const voucherId = voucherRes.data.value.id;
  const voucherNum = voucherRes.data.value.number;
  console.log(`voucher: id=${voucherId}, number=${voucherNum}`);

  // Step 4: Verify voucher (GET — free)
  const verify = await api("GET", `/ledger/voucher/${voucherId}?fields=id,number,date,description,postings(row,amount,amountCurrency,amountGross,amountGrossCurrency,account(id,number,name),department(id,name),vatType(id,number,name,percentage),systemGenerated)`);
  const postings = verify.data.value.postings;
  for (const p of postings) {
    console.log(`posting row=${p.row}: account=${p.account.number}(${p.account.name}) amountGross=${p.amountGross} amount=${p.amount} vatType=${p.vatType?.id ?? 'none'}(${p.vatType?.percentage ?? '-'}%) dept=${p.department?.name ?? 'none'} sysGen=${p.systemGenerated}`);
  }

  // Step 5: Upload receipt attachment
  const attachRes = await upload(`/ledger/voucher/${voucherId}/attachment`, "/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-22-103515995Z-70014f3c/attachments/01-kvittering_de_08.pdf");
  if (attachRes.status !== 201) throw new Error("Attachment upload failed");
  console.log(`attachment uploaded: status=${attachRes.status}`);

  // Step 6: Verify attachment (GET — free)
  const attachVerify = await api("GET", `/ledger/voucher/${voucherId}?fields=id,number,attachment(id,fileName)`);
  const att = attachVerify.data.value.attachment;
  console.log(`attachment confirmed: id=${att?.id}, fileName=${att?.fileName}`);

  console.log("\n=== DONE ===");
  console.log(`Voucher id=${voucherId} number=${voucherNum}, account=7360, dept=Salg, amountGross=${lineAmount}, attachment=${att?.id > 0 ? 'OK' : 'MISSING'}`);
}

main().catch(e => { console.error("FATAL:", e); process.exit(1); });
