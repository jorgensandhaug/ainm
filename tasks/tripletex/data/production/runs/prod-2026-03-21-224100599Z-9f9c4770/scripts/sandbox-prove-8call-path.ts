// Prove the 8-call underconfigured path:
// Step 1 (3 parallel): GET /employee + GET /salary/type + GET /ledger/account
// Step 2 (2 parallel): POST /division + PUT /employee
// Step 3 (1): POST /employment (needs division.id)
// Step 4 (2 parallel): POST /salary/transaction + POST /ledger/voucher (voucherType by name)

const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

let callCount = 0;
async function api(method: string, path: string, body?: any) {
  callCount++;
  const n = callCount;
  const url = `${BASE}${path}`;
  const opts: any = { method, headers: H };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  const text = await r.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  console.log(`[${n}] ${method} ${path} → ${r.status}`);
  if (r.status >= 400) { console.log(JSON.stringify(json, null, 2)); throw new Error(`Call ${n}: ${r.status}`); }
  return json;
}

function genOrgNr(): string {
  const weights = [3, 2, 7, 6, 5, 4, 3, 2];
  while (true) {
    const digits = [9];
    for (let i = 0; i < 7; i++) digits.push(Math.floor(Math.random() * 10));
    let sum = 0;
    for (let i = 0; i < 8; i++) sum += digits[i] * weights[i];
    const rem = sum % 11;
    if (rem === 1) continue;
    const check = rem === 0 ? 0 : 11 - rem;
    digits.push(check);
    return digits.join("");
  }
}

async function main() {
  console.log("=== 8-CALL UNDERCONFIGURED PATH PROOF ===\n");
  const t0 = Date.now();

  // Step 1 (3 parallel): GET /employee + GET /salary/type + GET /ledger/account
  // We use email search like production, even though we know the sandbox employee
  console.log("--- Step 1: GET /employee + GET /salary/type + GET /ledger/account ---");
  const [empRes, stRes, accRes] = await Promise.all([
    api("GET", "/employee?email=simen.sandhaug@example.org&count=10&fields=*"),
    api("GET", "/salary/type?count=1000&fields=*"),
    api("GET", "/ledger/account?number=5000,1920&count=10&fields=*"),
  ]);

  // Process step 1 results
  // Note: sandbox employee is already configured, but we simulate the underconfigured check
  const emp = empRes.values[0]; // In production we'd exact-match email
  const empId = emp.id;
  console.log(`Employee: id=${empId}, ${emp.firstName} ${emp.lastName}, dob=${emp.dateOfBirth}`);

  const fastlonn = stRes.values.find((t: any) => t.name === "Fastlønn");
  const bonus = stRes.values.find((t: any) => t.name === "Bonus");
  console.log(`Fastlønn id=${fastlonn.id}, Bonus id=${bonus.id}`);

  const acc5000 = accRes.values.find((a: any) => a.number === 5000);
  const acc1920 = accRes.values.find((a: any) => a.number === 1920);
  console.log(`Account 5000 id=${acc5000.id}, 1920 id=${acc1920.id}`);

  // For the underconfigured branch in production, we'd continue:
  // Step 2 (2 parallel): POST /division + PUT /employee
  console.log("\n--- Step 2: POST /division + PUT /employee ---");
  const orgNr = genOrgNr();
  const [divRes] = await Promise.all([
    api("POST", "/division", {
      name: "Hovudavdeling",
      organizationNumber: orgNr,
      startDate: "2026-01-01",
      municipalityDate: "2026-01-01",
      municipality: { id: 1 },
    }),
    api("PUT", `/employee/${empId}`, {
      id: empId,
      firstName: emp.firstName,
      lastName: emp.lastName,
      dateOfBirth: "1990-01-01",
    }),
  ]);
  const divId = divRes.value.id;
  console.log(`Division id=${divId}`);

  // Step 3 (1 call): POST /employment with inline details
  console.log("\n--- Step 3: POST /employment ---");
  const salaryBase = 36800;
  await api("POST", "/employee/employment", {
    employee: { id: empId },
    startDate: "2026-03-01",
    isMainEmployer: true,
    taxDeductionCode: "loennFraHovedarbeidsgiver",
    division: { id: divId },
    employmentDetails: [{
      date: "2026-03-01",
      employmentType: "ORDINARY",
      employmentForm: "PERMANENT",
      remunerationType: "MONTHLY_WAGE",
      workingHoursScheme: "NOT_SHIFT",
      percentageOfFullTimeEquivalent: 100,
      monthlySalary: salaryBase,
      annualSalary: salaryBase * 12,
    }],
  });

  // Step 4 (2 parallel): POST /salary/transaction + POST /ledger/voucher (voucherType by name!)
  console.log("\n--- Step 4: POST /salary/transaction + POST /ledger/voucher (PARALLEL) ---");
  const bonusAmount = 14100;
  const gross = salaryBase + bonusAmount;

  const [txRes, vRes] = await Promise.all([
    api("POST", "/salary/transaction?generateTaxDeduction=true", {
      date: "2026-03-20", year: 2026, month: 3, paySlipsAvailableDate: "2026-03-20",
      payslips: [{
        employee: { id: empId }, date: "2026-03-20", year: 2026, month: 3,
        specifications: [
          { employee: { id: empId }, salaryType: { id: fastlonn.id }, description: "Fastlønn mars 2026", year: 2026, month: 3, count: 1, rate: salaryBase, amount: salaryBase },
          { employee: { id: empId }, salaryType: { id: bonus.id }, description: "Bonus mars 2026", year: 2026, month: 3, count: 1, rate: bonusAmount, amount: bonusAmount },
        ],
      }],
    }),
    api("POST", "/ledger/voucher?sendToLedger=true", {
      voucherType: { name: "Lønnsbilag" },  // ← BY NAME, no id lookup needed!
      date: "2026-03-20",
      description: `Lønn mars 2026 - Fastlønn ${salaryBase} + Bonus ${bonusAmount}`,
      postings: [
        { account: { id: acc5000.id }, amount: salaryBase, description: "Fastlønn", row: 1 },
        { account: { id: acc5000.id }, amount: bonusAmount, description: "Bonus", row: 2 },
        { account: { id: acc1920.id }, amount: -gross, description: "Utbetalt lønn", row: 3 },
      ],
    }),
  ]);

  console.log(`\nSalary transaction id: ${txRes.value.id}`);
  console.log(`Voucher id: ${vRes.value.id}, number: ${vRes.value.number}`);
  console.log(`\nTotal API calls: ${callCount}`);
  console.log(`Total time: ${Date.now() - t0}ms`);
  console.log("\n=== 8-CALL PATH PROOF COMPLETE ===");
}

main().catch(e => { console.error("FATAL:", e.message); process.exit(1); });
