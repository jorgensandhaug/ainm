const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "8UOaswTtubjEVJ-YMABzuLORlFpPHCjjhniAe2jTut8";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const EMP_ID = 18612820;
const DIV_ID = 108387380;

// Step 1: PUT employee with placeholder dateOfBirth
const putRes = await fetch(`${BASE}/employee/${EMP_ID}`, {
  method: "PUT",
  headers: { Authorization: AUTH, "Content-Type": "application/json" },
  body: JSON.stringify({
    id: EMP_ID,
    firstName: "Jules",
    lastName: "Leroy",
    dateOfBirth: "1990-01-01",
  }),
});
const putData = await putRes.json();
console.log("PUT employee status:", putRes.status);
if (putRes.status >= 400) { console.log(JSON.stringify(putData, null, 2)); process.exit(1); }
console.log("dateOfBirth:", putData.value?.dateOfBirth);

// Step 2: POST employment
const empRes = await fetch(`${BASE}/employee/employment`, {
  method: "POST",
  headers: { Authorization: AUTH, "Content-Type": "application/json" },
  body: JSON.stringify({
    employee: { id: EMP_ID },
    division: { id: DIV_ID },
    startDate: "2026-03-01",
    isMainEmployer: true,
    taxDeductionCode: "loennFraHovedarbeidsgiver",
  }),
});
const empData = await empRes.json();
console.log("POST employment status:", empRes.status);
if (empRes.status >= 400) { console.log(JSON.stringify(empData, null, 2)); process.exit(1); }
console.log("Employment id:", empData.value?.id);

// Step 3: GET salary types
const stRes = await fetch(`${BASE}/salary/type?count=1000&fields=*`, {
  headers: { Authorization: AUTH },
});
const stData = await stRes.json();
console.log("GET salary/type status:", stRes.status);
if (stRes.status >= 400) { console.log(JSON.stringify(stData, null, 2)); process.exit(1); }

const fastlonn = stData.values?.find((t: any) => t.name === "Fastlønn");
const bonus = stData.values?.find((t: any) => t.name === "Bonus");
console.log("Fastlønn id:", fastlonn?.id, "number:", fastlonn?.number);
console.log("Bonus id:", bonus?.id, "number:", bonus?.number);

if (!fastlonn || !bonus) { console.log("Missing salary types"); process.exit(1); }

// Step 4: POST salary transaction
const txPayload = {
  date: "2026-03-01",
  year: 2026,
  month: 3,
  paySlipsAvailableDate: "2026-03-01",
  payslips: [
    {
      employee: { id: EMP_ID },
      specifications: [
        {
          employee: { id: EMP_ID },
          salaryType: { id: fastlonn.id },
          description: "Fastlønn",
          year: 2026,
          month: 3,
          count: 1,
          rate: 56950,
          amount: 56950,
        },
        {
          employee: { id: EMP_ID },
          salaryType: { id: bonus.id },
          description: "Bonus",
          year: 2026,
          month: 3,
          count: 1,
          rate: 9350,
          amount: 9350,
        },
      ],
    },
  ],
};

const txRes = await fetch(`${BASE}/salary/transaction`, {
  method: "POST",
  headers: { Authorization: AUTH, "Content-Type": "application/json" },
  body: JSON.stringify(txPayload),
});
const txData = await txRes.json();
console.log("POST salary/transaction status:", txRes.status);
console.log(JSON.stringify(txData, null, 2));
