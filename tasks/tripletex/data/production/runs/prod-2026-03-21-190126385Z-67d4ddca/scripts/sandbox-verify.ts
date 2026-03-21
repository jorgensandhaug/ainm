const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa(`0:${TOKEN}`);

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
    return null;
  }
  const json = text ? JSON.parse(text) : null;
  if (json?.values !== undefined) return json.values;
  if (json?.value !== undefined) return json.value;
  return json;
}

async function main() {
  // Step 1: Check account 7140 details and VAT type
  console.log("=== Step 1: Check account 7140 and 1920 ===");
  const accounts = await api(
    "GET",
    "/ledger/account?number=7140,1920&fields=id,number,name,vatType(*),vatLocked"
  );
  if (!accounts) return;

  for (const a of accounts) {
    console.log(`Account ${a.number} "${a.name}": id=${a.id}, vatLocked=${a.vatLocked}, vatType.id=${a.vatType?.id}, vatType.name=${a.vatType?.name}, vatType.percentage=${a.vatType?.percentage}`);
  }

  const acct7140 = accounts.find((a: any) => a.number === 7140);
  const acct1920 = accounts.find((a: any) => a.number === 1920);
  if (!acct7140 || !acct1920) {
    console.log("Missing accounts!");
    return;
  }

  // Step 2: Get or create a department for testing
  console.log("\n=== Step 2: Check existing department Drift ===");
  const depts = await api("GET", "/department?name=Drift&isInactive=false&fields=*");
  let deptId: number;
  if (depts && depts.length > 0) {
    const exactDept = depts.find((d: any) => d.name === "Drift");
    if (exactDept) {
      deptId = exactDept.id;
      console.log(`Found existing department Drift: id=${deptId}`);
    } else {
      console.log("No exact 'Drift' found, creating...");
      const newDept = await api("POST", "/department", { name: "Drift sandbox overnatting", departmentNumber: 99 });
      if (!newDept) return;
      deptId = newDept.id;
      console.log(`Created department: id=${deptId}`);
    }
  } else {
    const newDept = await api("POST", "/department", { name: "Drift sandbox overnatting", departmentNumber: 99 });
    if (!newDept) return;
    deptId = newDept.id;
    console.log(`Created department: id=${deptId}`);
  }

  // Step 3: Create voucher with Branch C pattern (accommodation, 12% incoming VAT)
  console.log("\n=== Step 3: Create voucher — Branch C (Overnatting, 12% incoming) ===");
  const vatTypeId = acct7140.vatType?.id;
  console.log(`Using vatType.id=${vatTypeId} from account 7140`);

  const voucherPayload = {
    date: "2026-06-20",
    description: "Overnatting",
    postings: [
      {
        row: 1,
        date: "2026-06-20",
        description: "Overnatting",
        account: { id: acct7140.id },
        department: { id: deptId },
        vatType: { id: vatTypeId },
        amountGross: 4850,
        amountGrossCurrency: 4850,
      },
      {
        row: 2,
        date: "2026-06-20",
        description: "Overnatting",
        account: { id: acct1920.id },
        amount: -4850,
        amountCurrency: -4850,
        amountGross: -4850,
        amountGrossCurrency: -4850,
      },
    ],
  };

  const voucher = await api("POST", "/ledger/voucher", voucherPayload);
  if (!voucher) return;

  console.log("\nVoucher postings:");
  for (const p of voucher.postings) {
    console.log(`  row=${p.row}, account=${p.account?.id}, amount=${p.amount}, amountGross=${p.amountGross}, vatType.id=${p.vatType?.id}, department=${p.department?.id}, systemGenerated=${p.systemGenerated}`);
  }

  // Verify amounts
  const expensePosting = voucher.postings.find((p: any) => p.row === 1);
  const bankPosting = voucher.postings.find((p: any) => p.row === 2);
  const vatPosting = voucher.postings.find((p: any) => p.systemGenerated);

  console.log("\n=== Verification ===");
  console.log(`Expense posting: amount=${expensePosting?.amount}, amountGross=${expensePosting?.amountGross}`);
  console.log(`  Expected net: ${4850 / 1.12} = ${(4850 / 1.12).toFixed(2)}`);
  console.log(`  Actual net: ${expensePosting?.amount}`);
  console.log(`  Match: ${Math.abs(expensePosting?.amount - 4850 / 1.12) < 0.01}`);

  if (vatPosting) {
    console.log(`VAT posting: amount=${vatPosting.amount}, account=${vatPosting.account?.id}`);
    console.log(`  Expected VAT: ${4850 - 4850 / 1.12} = ${(4850 - 4850 / 1.12).toFixed(2)}`);
    console.log(`  Match: ${Math.abs(vatPosting.amount - (4850 - 4850 / 1.12)) < 0.01}`);
  }

  console.log(`Bank posting: amount=${bankPosting?.amount}`);
  console.log(`  Expected: -4850`);
  console.log(`  Match: ${bankPosting?.amount === -4850}`);

  // Also check: what other travel/accommodation accounts exist?
  console.log("\n=== Step 4: Check other travel expense accounts ===");
  const travelAccts = await api(
    "GET",
    "/ledger/account?numberFrom=7100&numberTo=7199&fields=id,number,name,vatType(*),vatLocked"
  );
  if (travelAccts) {
    for (const a of travelAccts) {
      console.log(`  ${a.number} "${a.name}": vatType.id=${a.vatType?.id}, vatType.name="${a.vatType?.name}", vatLocked=${a.vatLocked}`);
    }
  }

  console.log("\n=== DONE ===");
}

main().catch(console.error);
