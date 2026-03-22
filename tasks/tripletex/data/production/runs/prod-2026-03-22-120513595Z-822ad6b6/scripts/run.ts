const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "8GTqXHq9jtPd_7x_LqFISTMqcunGUoSLIsPiOcCuZ5M";
const AUTH = "Basic " + btoa(`0:${TOKEN}`);

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: any = { method, headers: { "Authorization": AUTH, "Content-Type": "application/json" } };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  const text = await r.text();
  console.log(`${method} ${path} → ${r.status}`);
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  console.log(JSON.stringify(json, null, 2));
  if (!r.ok) throw new Error(`${r.status}: ${JSON.stringify(json)}`);
  if (json?.values !== undefined) return json.values;
  if (json?.value !== undefined) return json.value;
  return json;
}

async function uploadAttachment(voucherId: number, filePath: string) {
  const file = Bun.file(filePath);
  const formData = new FormData();
  formData.append("file", file);
  const url = `${BASE}/ledger/voucher/${voucherId}/attachment`;
  const r = await fetch(url, {
    method: "POST",
    headers: { "Authorization": AUTH },
    body: formData,
  });
  const text = await r.text();
  console.log(`POST /ledger/voucher/${voucherId}/attachment → ${r.status}`);
  console.log(text);
  if (!r.ok) throw new Error(`Attachment upload failed: ${r.status}`);
}

// Receipt: Kontorstoler 3000 kr, date 2026-06-16, dept Økonomi
// Branch B: account 6540, 25% incoming VAT, amountGross=3000 (GROSS, no multiply)

async function main() {
  // Step 1: Create department (or resolve if exists)
  let deptId: number;
  try {
    const dept = await api("POST", "/department", { name: "Økonomi", departmentNumber: -1 });
    deptId = dept.id;
    console.log(`Created department: id=${deptId}`);
  } catch (e: any) {
    if (e.message.includes("409")) {
      console.log("Department exists, resolving...");
      const depts = await api("GET", "/department?name=%C3%98konomi&isInactive=false&fields=*");
      const exact = (Array.isArray(depts) ? depts : [depts]).find((d: any) => d.name === "Økonomi");
      if (!exact) throw new Error("Could not find department Økonomi");
      deptId = exact.id;
      console.log(`Resolved department: id=${deptId}`);
    } else {
      throw e;
    }
  }

  // Step 2: Resolve account IDs (6540 + 1920)
  const accounts = await api("GET", "/ledger/account?number=6540,1920&fields=id,number,name,vatType(*),vatLocked");
  const acctArr = Array.isArray(accounts) ? accounts : [accounts];
  const expenseAcct = acctArr.find((a: any) => a.number === 6540);
  const bankAcct = acctArr.find((a: any) => a.number === 1920);
  if (!expenseAcct) throw new Error("Account 6540 not found");
  if (!bankAcct) throw new Error("Account 1920 not found");
  const vatTypeId = expenseAcct.vatType?.id;
  console.log(`expenseAccount: id=${expenseAcct.id}, number=${expenseAcct.number}, vatType.id=${vatTypeId}, vatLocked=${expenseAcct.vatLocked}`);
  console.log(`bankAccount: id=${bankAcct.id}, number=${bankAcct.number}`);

  // Step 3: Create and book voucher
  const voucher = await api("POST", "/ledger/voucher?sendToLedger=true", {
    date: "2026-06-16",
    description: "Kontorstoler",
    postings: [
      {
        row: 1,
        date: "2026-06-16",
        description: "Kontorstoler",
        account: { id: expenseAcct.id },
        department: { id: deptId },
        vatType: { id: vatTypeId },
        amountGross: 3000,
        amountGrossCurrency: 3000,
      },
      {
        row: 2,
        date: "2026-06-16",
        description: "Kontorstoler",
        account: { id: bankAcct.id },
        amountGross: -3000,
        amountGrossCurrency: -3000,
      },
    ],
  });

  const voucherId = Array.isArray(voucher) ? voucher[0].id : voucher.id;
  console.log(`Voucher created: id=${voucherId}`);

  // Step 3b: Verify voucher (free GET)
  const verify = await api("GET", `/ledger/voucher/${voucherId}?fields=id,number,date,description,postings(row,amount,amountCurrency,amountGross,amountGrossCurrency,account(id,number,name),department(id,name),vatType(id,number,name,percentage),systemGenerated)`);
  console.log("=== VOUCHER VERIFICATION ===");

  // Step 4: Upload receipt attachment
  await uploadAttachment(voucherId, "/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-22-120513595Z-822ad6b6/attachments/01-kvittering_en_03.pdf");

  // Step 4b: Verify attachment (free GET)
  const attachVerify = await api("GET", `/ledger/voucher/${voucherId}?fields=id,attachment(id,fileName)`);
  console.log("=== ATTACHMENT VERIFICATION ===");

  console.log("DONE");
}

main().catch(e => { console.error(e); process.exit(1); });
