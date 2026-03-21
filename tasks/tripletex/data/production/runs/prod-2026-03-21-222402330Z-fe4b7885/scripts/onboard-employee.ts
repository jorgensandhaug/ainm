const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "LekKkPwLrvjmJYruaWFuTTfZ2XUvhV1F9xAA7GITWkg";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { "Content-Type": "application/json", Authorization: AUTH };

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  console.log(`${method} ${url}`);
  const r = await fetch(url, { method, headers: H, body: body ? JSON.stringify(body) : undefined });
  const text = await r.text();
  let data: any;
  try { data = JSON.parse(text); } catch { data = text; }
  console.log(`  → ${r.status}`, JSON.stringify(data, null, 2));
  if (!r.ok) throw { status: r.status, data };
  return data;
}

// Step 1: parallel prereqs
const [divRes, deptRes, occRes] = await Promise.all([
  api("GET", "/division?count=1&fields=id"),
  api("POST", "/department", { name: "Produksjon" }),
  api("GET", "/employee/employment/occupationCode?nameNO=brukerstøtte&count=10&fields=id,nameNO"),
]);

const divisionId = divRes.count > 0 ? divRes.values[0].id : null;
const deptId = deptRes.value.id;

// Pick occupation code — look for exact or best match for IKT-brukerstøtte / STYRK 3512
const occValues: any[] = occRes.values || [];
console.log("Occupation results:", occValues.map((v: any) => `${v.id}: ${v.nameNO}`));
let occId: number | null = null;
// Prefer exact "IKT-BRUKERSTØTTE" or closest match
for (const v of occValues) {
  const n = (v.nameNO || "").toUpperCase();
  if (n === "IKT-BRUKERSTØTTE") { occId = v.id; break; }
}
if (!occId && occValues.length > 0) {
  // fallback: pick first containing "brukerstøtte"
  occId = occValues[0].id;
}
console.log("Selected occupation code id:", occId);

// Step 2: POST /employee
const employeePayload: any = {
  firstName: "Olav",
  lastName: "Johansen",
  dateOfBirth: "1984-07-26",
  nationalIdentityNumber: "26078495390",
  email: "olav.johansen@example.org",
  bankAccountNumber: "23904557668",
  userType: "NO_ACCESS",
  department: { id: deptId },
  employments: [
    {
      startDate: "2026-06-17",
      ...(divisionId ? { division: { id: divisionId } } : {}),
      employmentDetails: [
        {
          date: "2026-06-17",
          employmentType: "ORDINARY",
          employmentForm: "PERMANENT",
          remunerationType: "MONTHLY_WAGE",
          workingHoursScheme: "NOT_SHIFT",
          percentageOfFullTimeEquivalent: 100,
          annualSalary: 750000,
          ...(occId ? { occupationCode: { id: occId } } : {}),
        },
      ],
    },
  ],
};

const empRes = await api("POST", "/employee?fields=*,employments(*)", employeePayload);
const employeeId = empRes.value.id;
console.log("Employee created:", employeeId);

// Step 3: POST /employee/standardTime (default 7.5h)
await api("POST", "/employee/standardTime", {
  employee: { id: employeeId },
  fromDate: "2026-06-17",
  hoursPerDay: 7.5,
});

console.log("Done. Employee onboarded successfully.");
