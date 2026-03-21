const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "8UOaswTtubjEVJ-YMABzuLORlFpPHCjjhniAe2jTut8";
const AUTH = "Basic " + btoa("0:" + TOKEN);

// Step 1: GET municipality
const munRes = await fetch(`${BASE}/municipality?count=1&fields=*`, {
  headers: { Authorization: AUTH },
});
const munData = await munRes.json();
console.log("Municipality status:", munRes.status);
const municipality = munData.values?.[0];
if (!municipality) { console.log("No municipality found"); process.exit(1); }
console.log("Municipality id:", municipality.id, "name:", municipality.name);

// Step 2: Generate valid Norwegian 9-digit org number
function generateOrgNumber(): string {
  const weights = [3, 2, 7, 6, 5, 4, 3, 2];
  while (true) {
    const digits = [9];
    for (let i = 0; i < 7; i++) digits.push(Math.floor(Math.random() * 10));
    let sum = 0;
    for (let i = 0; i < 8; i++) sum += digits[i] * weights[i];
    const remainder = sum % 11;
    if (remainder === 1) continue; // invalid, regenerate
    const checkDigit = remainder === 0 ? 0 : 11 - remainder;
    digits.push(checkDigit);
    return digits.join("");
  }
}

const orgNumber = generateOrgNumber();
console.log("Generated org number:", orgNumber);

// Step 3: POST division
const divPayload = {
  name: "Hovudavdeling",
  organizationNumber: orgNumber,
  startDate: "2026-01-01",
  municipalityDate: "2026-01-01",
  municipality: { id: municipality.id },
};
console.log("Division payload:", JSON.stringify(divPayload, null, 2));

const divRes = await fetch(`${BASE}/division`, {
  method: "POST",
  headers: { Authorization: AUTH, "Content-Type": "application/json" },
  body: JSON.stringify(divPayload),
});
const divData = await divRes.json();
console.log("Division status:", divRes.status);
console.log(JSON.stringify(divData, null, 2));
