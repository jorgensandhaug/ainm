const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);

// Use employee 18564428 (Payroll Proof 469473) which was confirmed working in previous proofs
// Check its employment first
const emplRes = await fetch(`${BASE}/employee/employment?employeeId=18564428&count=20&fields=*`, {
  headers: { Authorization: AUTH },
});
const emplData = await emplRes.json();
for (const empl of emplData.values || []) {
  console.log(`employment ${empl.id} start=${empl.startDate} end=${empl.endDate} div=${empl.division?.id}`);
}

const activeEmpl = emplData.values?.find((e: any) => e.startDate && e.division?.id);
if (!activeEmpl) {
  console.log("No suitable employment found for 18564428");
  process.exit(0);
}

// Do a payroll for December 2026 (should be within employment period)
const EMP_ID = 18564428;
const FASTLONN_ID = 69031179;
const BONUS_ID = 69031348;

const txPayload = {
  date: "2026-12-01",
  year: 2026,
  month: 12,
  paySlipsAvailableDate: "2026-12-01",
  payslips: [{
    employee: { id: EMP_ID },
    specifications: [
      {
        employee: { id: EMP_ID },
        salaryType: { id: FASTLONN_ID },
        description: "Fastlønn",
        year: 2026,
        month: 12,
        count: 1,
        rate: 56950,
        amount: 56950,
      },
      {
        employee: { id: EMP_ID },
        salaryType: { id: BONUS_ID },
        description: "Bonus",
        year: 2026,
        month: 12,
        count: 1,
        rate: 9350,
        amount: 9350,
      },
    ],
  }],
};

const txRes = await fetch(`${BASE}/salary/transaction`, {
  method: "POST",
  headers: { Authorization: AUTH, "Content-Type": "application/json" },
  body: JSON.stringify(txPayload),
});
const txData = await txRes.json();
console.log("\n=== POST /salary/transaction response ===");
console.log("Status:", txRes.status);
console.log(JSON.stringify(txData, null, 2));

// Key question: does the response include amounts?
if (txRes.status === 201) {
  const payslipInResponse = txData.value?.payslips?.[0];
  console.log("\n=== Response analysis ===");
  console.log("Has payslip details?", !!payslipInResponse?.grossAmount);
  console.log("Payslip shape:", JSON.stringify(payslipInResponse));
}
