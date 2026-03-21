const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);

// Use employee 18478235 with employment starting 2026-10-25
// Test with November 2026 (within employment period)
const EMP_ID = 18478235;
const FASTLONN_ID = 69031179;
const BONUS_ID = 69031348;

const txPayload = {
  date: "2026-11-01",
  year: 2026,
  month: 11,
  paySlipsAvailableDate: "2026-11-01",
  payslips: [{
    employee: { id: EMP_ID },
    specifications: [
      {
        employee: { id: EMP_ID },
        salaryType: { id: FASTLONN_ID },
        description: "Fastlønn",
        year: 2026,
        month: 11,
        count: 1,
        rate: 11111,
        amount: 11111,
      },
      {
        employee: { id: EMP_ID },
        salaryType: { id: BONUS_ID },
        description: "Bonus",
        year: 2026,
        month: 11,
        count: 1,
        rate: 2222,
        amount: 2222,
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
console.log("=== POST /salary/transaction response ===");
console.log("Status:", txRes.status);
console.log(JSON.stringify(txData, null, 2));
