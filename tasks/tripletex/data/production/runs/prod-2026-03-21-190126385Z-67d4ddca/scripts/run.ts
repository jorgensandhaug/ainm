const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "hNbRJaZT346v0SIgymtSDMMekRyBayJ1vm-nh3qmI8I";
const AUTH = "Basic " + btoa(`0:${TOKEN}`);

const RECEIPT_DATE = "2026-06-20";
const LINE_TEXT = "Overnatting";
const LINE_AMOUNT = 4850;
const ATTACHMENT_PATH =
  "/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-21-190126385Z-67d4ddca/attachments/01-kvittering_es_08.pdf";

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: RequestInit = {
    method,
    headers: {
      Authorization: AUTH,
      "Content-Type": "application/json",
    },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const text = await res.text();
  console.log(`${method} ${path} → ${res.status}`);
  if (!res.ok) {
    console.log("ERROR:", text);
    throw new Error(`${res.status} ${text}`);
  }
  const json = text ? JSON.parse(text) : null;
  if (json?.values !== undefined) return json.values;
  if (json?.value !== undefined) return json.value;
  return json;
}

async function main() {
  // Step 1: Create department "Drift"
  const dept = await api("POST", "/department", {
    name: "Drift",
    departmentNumber: 1,
  });
  console.log("Department:", JSON.stringify(dept));
  const deptId = dept.id;

  // Step 2: Get accounts 7140 and 1920 with vatType expansion
  const accounts = await api(
    "GET",
    "/ledger/account?number=7140,1920&fields=id,number,name,vatType(*)"
  );
  console.log("Accounts:", JSON.stringify(accounts));

  const acct7140 = accounts.find((a: any) => a.number === 7140);
  const acct1920 = accounts.find((a: any) => a.number === 1920);
  if (!acct7140) throw new Error("Account 7140 not found");
  if (!acct1920) throw new Error("Account 1920 not found");

  const vatTypeId = acct7140.vatType?.id;
  console.log(
    `Account 7140: id=${acct7140.id}, name=${acct7140.name}, vatType.id=${vatTypeId}, vatType.name=${acct7140.vatType?.name}`
  );
  console.log(`Account 1920: id=${acct1920.id}`);

  // Step 3: Create voucher — Branch B pattern (deductible expense with incoming VAT)
  const postings: any[] = [
    {
      row: 1,
      date: RECEIPT_DATE,
      description: LINE_TEXT,
      account: { id: acct7140.id },
      department: { id: deptId },
      amountGross: LINE_AMOUNT,
      amountGrossCurrency: LINE_AMOUNT,
    },
    {
      row: 2,
      date: RECEIPT_DATE,
      description: LINE_TEXT,
      account: { id: acct1920.id },
      amount: -LINE_AMOUNT,
      amountCurrency: -LINE_AMOUNT,
      amountGross: -LINE_AMOUNT,
      amountGrossCurrency: -LINE_AMOUNT,
    },
  ];

  // Add vatType if the account has incoming VAT (non-zero)
  if (vatTypeId !== undefined && vatTypeId !== 0) {
    postings[0].vatType = { id: vatTypeId };
  }

  const voucher = await api("POST", "/ledger/voucher", {
    date: RECEIPT_DATE,
    description: LINE_TEXT,
    postings,
  });
  console.log("Voucher:", JSON.stringify(voucher, null, 2));

  // Step 4: Attach receipt PDF
  const file = Bun.file(ATTACHMENT_PATH);
  const formData = new FormData();
  formData.append("file", file, "01-kvittering_es_08.pdf");

  const attachRes = await fetch(
    `${BASE}/ledger/voucher/${voucher.id}/attachment`,
    {
      method: "POST",
      headers: { Authorization: AUTH },
      body: formData,
    }
  );
  const attachText = await attachRes.text();
  console.log(
    `POST /ledger/voucher/${voucher.id}/attachment → ${attachRes.status}`
  );
  if (!attachRes.ok) {
    console.log("Attachment ERROR:", attachText);
  } else {
    const attachJson = JSON.parse(attachText);
    const val = attachJson?.value || attachJson;
    console.log("Attachment:", JSON.stringify(val));
  }

  console.log("\n=== DONE ===");
}

main().catch(console.error);
