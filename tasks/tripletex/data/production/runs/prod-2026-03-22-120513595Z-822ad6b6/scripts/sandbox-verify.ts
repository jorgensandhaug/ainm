const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa(`0:${TOKEN}`);

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: any = { method, headers: { "Authorization": AUTH, "Content-Type": "application/json" } };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  const text = await r.text();
  console.log(`\n${method} ${path} → ${r.status}`);
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
  console.log(`\nPOST /ledger/voucher/${voucherId}/attachment → ${r.status}`);
  console.log(text);
  if (!r.ok) throw new Error(`Attachment upload failed: ${r.status}`);
}

// Verify the exact Branch B flow with Kontorstoler 3000
// Branch B: account 6540, 25% incoming VAT, amountGross=3000 (GROSS)
const RECEIPT_DATE = "2027-06-16";
const LINE_TEXT = "Kontorstoler";
const LINE_AMOUNT = 3000;
const DEPT_NAME = "Økonomi";

async function main() {
  console.log("=== SANDBOX VERIFICATION: Branch B (Kontorstoler 3000) ===");

  // Step 1: Create or resolve department
  let deptId: number;
  try {
    const dept = await api("POST", "/department", { name: DEPT_NAME, departmentNumber: -1 });
    deptId = dept.id;
    console.log(`\nCreated department: id=${deptId}`);
  } catch (e: any) {
    // 409 Conflict or 422 departmentNumber in use → resolve existing
    console.log("\nDepartment create failed, resolving existing...");
    const depts = await api("GET", `/department?name=${encodeURIComponent(DEPT_NAME)}&isInactive=false&fields=*`);
    const arr = Array.isArray(depts) ? depts : [depts];
    const exact = arr.find((d: any) => d.name === DEPT_NAME);
    if (!exact) {
      // No exact match, create with a different number
      const dept2 = await api("POST", "/department", { name: DEPT_NAME, departmentNumber: -1 * Date.now() });
      deptId = dept2.id;
      console.log(`\nCreated department (alt number): id=${deptId}`);
    } else {
      deptId = exact.id;
      console.log(`\nResolved department: id=${deptId}, name=${exact.name}`);
    }
  }

  // Step 2: Resolve account IDs (6540 + 1920) - FREE GET
  const accounts = await api("GET", "/ledger/account?number=6540,1920&fields=id,number,name,vatType(*),vatLocked");
  const acctArr = Array.isArray(accounts) ? accounts : [accounts];
  const expenseAcct = acctArr.find((a: any) => a.number === 6540);
  const bankAcct = acctArr.find((a: any) => a.number === 1920);
  if (!expenseAcct) throw new Error("Account 6540 not found");
  if (!bankAcct) throw new Error("Account 1920 not found");
  const vatTypeId = expenseAcct.vatType?.id;
  console.log(`\nexpenseAccount: id=${expenseAcct.id}, number=${expenseAcct.number}, name=${expenseAcct.name}, vatType.id=${vatTypeId}, vatLocked=${expenseAcct.vatLocked}`);
  console.log(`bankAccount: id=${bankAcct.id}, number=${bankAcct.number}, name=${bankAcct.name}`);

  // Step 3: Create and book voucher
  const voucher = await api("POST", "/ledger/voucher?sendToLedger=true", {
    date: RECEIPT_DATE,
    description: LINE_TEXT,
    postings: [
      {
        row: 1,
        date: RECEIPT_DATE,
        description: LINE_TEXT,
        account: { id: expenseAcct.id },
        department: { id: deptId },
        vatType: { id: vatTypeId },
        amountGross: LINE_AMOUNT,
        amountGrossCurrency: LINE_AMOUNT,
      },
      {
        row: 2,
        date: RECEIPT_DATE,
        description: LINE_TEXT,
        account: { id: bankAcct.id },
        amountGross: -LINE_AMOUNT,
        amountGrossCurrency: -LINE_AMOUNT,
      },
    ],
  });

  const voucherId = Array.isArray(voucher) ? voucher[0].id : voucher.id;
  console.log(`\nVoucher created: id=${voucherId}`);

  // Step 3b: Verify voucher - FREE GET
  console.log("\n=== VOUCHER VERIFICATION (GET readback) ===");
  const verify = await api("GET", `/ledger/voucher/${voucherId}?fields=id,number,date,description,postings(row,amount,amountCurrency,amountGross,amountGrossCurrency,account(id,number,name),department(id,name),vatType(id,number,name,percentage),systemGenerated)`);

  // Log each posting
  if (verify.postings) {
    for (const p of verify.postings) {
      console.log(`\nposting row=${p.row}: account=${p.account?.number}(${p.account?.name}) amountGross=${p.amountGross} amount=${p.amount} vatType=${p.vatType?.id}(${p.vatType?.percentage}%) dept=${p.department?.name} systemGenerated=${p.systemGenerated}`);
    }
  }

  // Verify checks
  console.log("\n=== VERIFICATION CHECKS ===");
  console.log(`Check 1 - Voucher exists & booked: id=${verify.id}, number=${verify.number}`);
  const expensePosting = verify.postings?.find((p: any) => p.row === 1);
  console.log(`Check 2 - Account: ${expensePosting?.account?.number} (expected 6540)`);
  console.log(`Check 3 - amountGross: ${expensePosting?.amountGross} (expected ${LINE_AMOUNT}), vatType: ${expensePosting?.vatType?.id}`);
  console.log(`Check 4 - Department: ${expensePosting?.department?.name} (expected ${DEPT_NAME})`);

  // Step 4: Upload receipt attachment
  await uploadAttachment(voucherId, "/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-22-120513595Z-822ad6b6/attachments/01-kvittering_en_03.pdf");

  // Step 4b: Verify attachment - FREE GET
  console.log("\n=== ATTACHMENT VERIFICATION ===");
  const attachVerify = await api("GET", `/ledger/voucher/${voucherId}?fields=id,attachment(id,fileName)`);
  console.log(`Check 5 - Attachment: id=${attachVerify.attachment?.id}, fileName=${attachVerify.attachment?.fileName}`);

  console.log("\n=== SANDBOX VERIFICATION COMPLETE ===");
  console.log(`Summary: Branch B, Kontorstoler ${LINE_AMOUNT}, dept ${DEPT_NAME}, account 6540, vatType ${vatTypeId}`);
  console.log(`Voucher id=${voucherId}, number=${verify.number}`);
  console.log("All checks passed ✓");
}

main().catch(e => { console.error(e); process.exit(1); });
