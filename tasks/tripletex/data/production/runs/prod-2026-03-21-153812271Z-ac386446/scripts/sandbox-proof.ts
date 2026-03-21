// Sandbox proof: Full end-to-end Kontorstoler receipt voucher
// Tests two interpretations of the receipt line price (13500)

const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: any = {
    method,
    headers: { "Authorization": AUTH, "Content-Type": "application/json" },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const text = await res.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  console.log(`\n=== ${method} ${path} => ${res.status} ===`);
  if (res.status >= 400) {
    console.log("ERROR:", JSON.stringify(json, null, 2));
  }
  return { status: res.status, json };
}

async function apiFormData(method: string, path: string, formData: FormData) {
  const url = `${BASE}${path}`;
  const res = await fetch(url, {
    method,
    headers: { "Authorization": AUTH },
    body: formData,
  });
  const text = await res.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  console.log(`\n=== ${method} ${path} => ${res.status} ===`);
  if (res.status >= 400) {
    console.log("ERROR:", JSON.stringify(json, null, 2));
  }
  return { status: res.status, json };
}

async function main() {
  // Use known sandbox IDs
  const acct6540Id = 424191132;
  const acct1920Id = 424190862;
  const vatType1Id = 1; // Incoming 25%
  const driftId = 927069;

  // Proof A: receipt line price = GROSS amount (amountGross=13500)
  // This is consistent with Forretningslunsj pattern where receipt line price was used directly
  console.log("\n=== PROOF A: Receipt line 13500 as GROSS ===");
  const voucherA = {
    date: "2026-02-22",
    description: "Kontorstoler",
    postings: [
      {
        row: 1,
        date: "2026-02-22",
        description: "Kontorstoler",
        account: { id: acct6540Id },
        department: { id: driftId },
        vatType: { id: vatType1Id },
        amountGross: 13500,
        amountGrossCurrency: 13500,
      },
      {
        row: 2,
        date: "2026-02-22",
        description: "Kontorstoler",
        account: { id: acct1920Id },
        amount: -13500,
        amountCurrency: -13500,
        amountGross: -13500,
        amountGrossCurrency: -13500,
      },
    ],
  };
  const resA = await api("POST", "/ledger/voucher", voucherA);
  if (resA.status < 300) {
    const v = resA.json?.value;
    console.log(`Voucher A: id=${v?.id}, number=${v?.number}`);
    console.log("Postings:");
    for (const p of v?.postings || []) {
      console.log(`  acct=${p.account?.id}(${p.account?.number}), amount=${p.amount}, amountCurrency=${p.amountCurrency}, amountGross=${p.amountGross}, amountGrossCurrency=${p.amountGrossCurrency}, vatType=${p.vatType?.id}, dept=${p.department?.id}, desc="${p.description}"`);
    }
  }

  // Proof B: receipt line price = NET amount (amountGross=16875)
  console.log("\n=== PROOF B: Receipt line 13500 as NET ===");
  const voucherB = {
    date: "2026-02-22",
    description: "Kontorstoler",
    postings: [
      {
        row: 1,
        date: "2026-02-22",
        description: "Kontorstoler",
        account: { id: acct6540Id },
        department: { id: driftId },
        vatType: { id: vatType1Id },
        amountGross: 16875,
        amountGrossCurrency: 16875,
      },
      {
        row: 2,
        date: "2026-02-22",
        description: "Kontorstoler",
        account: { id: acct1920Id },
        amount: -16875,
        amountCurrency: -16875,
        amountGross: -16875,
        amountGrossCurrency: -16875,
      },
    ],
  };
  const resB = await api("POST", "/ledger/voucher", voucherB);
  if (resB.status < 300) {
    const v = resB.json?.value;
    console.log(`Voucher B: id=${v?.id}, number=${v?.number}`);
    console.log("Postings:");
    for (const p of v?.postings || []) {
      console.log(`  acct=${p.account?.id}(${p.account?.number}), amount=${p.amount}, amountCurrency=${p.amountCurrency}, amountGross=${p.amountGross}, amountGrossCurrency=${p.amountGrossCurrency}, vatType=${p.vatType?.id}, dept=${p.department?.id}, desc="${p.description}"`);
    }
  }

  // Test attachment on voucher A
  if (resA.status < 300) {
    const voucherId = resA.json?.value?.id;
    console.log(`\n=== Attaching PDF to voucher A (id=${voucherId}) ===`);
    const pdfPath = "/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-21-153812271Z-ac386446/attachments/01-kvittering_nn_07.pdf";
    const pdfFile = Bun.file(pdfPath);
    const formData = new FormData();
    formData.append("file", pdfFile);
    formData.append("fileName", "01-kvittering_nn_07.pdf");
    const attachRes = await apiFormData("POST", `/ledger/voucher/${voucherId}/attachment`, formData);
    if (attachRes.status < 300) {
      const av = attachRes.json?.value;
      console.log(`Attachment: voucherId=${av?.id}, attachment.id=${av?.attachment?.id}`);
    }
  }

  // Also check: can we skip GET /ledger/vatType by using the account's default?
  // Account 6540 has default vatType.id=1 which is the 25% incoming
  // Can we omit explicit vatType on the posting and rely on the default?
  console.log("\n=== PROOF C: No explicit vatType, relying on account default ===");
  const voucherC = {
    date: "2026-02-22",
    description: "Kontorstoler attempt C - no explicit vatType",
    postings: [
      {
        row: 1,
        date: "2026-02-22",
        description: "Kontorstoler",
        account: { id: acct6540Id },
        department: { id: driftId },
        amountGross: 13500,
        amountGrossCurrency: 13500,
      },
      {
        row: 2,
        date: "2026-02-22",
        description: "Kontorstoler",
        account: { id: acct1920Id },
        amount: -13500,
        amountCurrency: -13500,
        amountGross: -13500,
        amountGrossCurrency: -13500,
      },
    ],
  };
  const resC = await api("POST", "/ledger/voucher", voucherC);
  if (resC.status < 300) {
    const v = resC.json?.value;
    console.log(`Voucher C: id=${v?.id}, number=${v?.number}`);
    console.log("Postings:");
    for (const p of v?.postings || []) {
      console.log(`  acct=${p.account?.id}(${p.account?.number}), amount=${p.amount}, amountGross=${p.amountGross}, vatType=${p.vatType?.id}, dept=${p.department?.id}`);
    }
  }

  // Check: can the receipt line price interpretation be determined from the receipt math?
  // Receipt: Kontorstoler=13500, Mus=360, Total=13860, MVA 25%=3465
  // 13860 * 0.25 = 3465 => prices are NET (ex-VAT)
  // But in Norwegian retail, prices include VAT
  // The test data seems to use NET prices based on math
  console.log("\n=== Receipt math analysis ===");
  console.log("If NET prices: 13500 + 360 = 13860, MVA = 13860*0.25 = 3465 ✓");
  console.log("If GROSS prices: 13500 + 360 = 13860, MVA should be 13860*25/125 = 2772 ≠ 3465");
  console.log("Conclusion: Receipt line prices are NET (ex-VAT)");
  console.log("For Kontorstoler: NET=13500, VAT=3375, GROSS=16875");
}

main().catch(console.error);
