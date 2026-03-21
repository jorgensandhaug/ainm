const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "5skQ--OpwSPg7X8_I5Bcl3f9eEMrQu5EBGvSjJ-l9S8";
const AUTH = "Basic " + btoa(`0:${TOKEN}`);

const EMAIL = "ana.ferreira@example.org";
const BASE_SALARY = 41750;
const BONUS = 6750;
const YEAR = 2026;
const MONTH = 3;
const DATE = "2026-03-21";

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: RequestInit = {
    method,
    headers: { "Authorization": AUTH, "Content-Type": "application/json" },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const text = await res.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  console.log(`${method} ${path} => ${res.status}`);
  if (res.status >= 400) {
    console.log("ERROR:", JSON.stringify(json, null, 2));
    if (res.status === 403 && json?.error?.includes?.("Invalid or expired")) {
      console.log("BLOCKED: invalid credentials");
      process.exit(1);
    }
  }
  return { status: res.status, data: json };
}

function generateNorwegianOrgNumber(): string {
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

async function main() {
  // Step 1: Find employee
  const empRes = await api("GET", `/employee?email=${encodeURIComponent(EMAIL)}&count=10&fields=*`);
  if (empRes.status >= 400) { console.log("BLOCKED: cannot find employee"); process.exit(1); }

  const employees = empRes.data?.values || [];
  const emp = employees.find((e: any) =>
    e.email?.toLowerCase() === EMAIL.toLowerCase()
  );
  if (!emp) { console.log("BLOCKED: no exact email match"); process.exit(1); }

  const empId = emp.id;
  console.log(`Employee found: id=${empId}, dateOfBirth=${emp.dateOfBirth}, employments=${JSON.stringify(emp.employments)}`);

  const underconfigured = emp.dateOfBirth === null &&
    (!emp.employments || emp.employments.length === 0);

  if (underconfigured) {
    console.log("Employee is underconfigured — entering repair branch");

    // Step 2: Check for division
    const divRes = await api("GET", "/division?count=1&fields=*");
    const divisions = divRes.data?.values || [];

    let divisionId: number;

    if (divisions.length > 0) {
      divisionId = divisions[0].id;
      console.log(`Existing division found: id=${divisionId}`);
    } else {
      console.log("No division found — creating one");
      // Get municipality
      const munRes = await api("GET", "/municipality?count=1&fields=*");
      const municipalities = munRes.data?.values || [];
      const munId = municipalities[0]?.id;
      if (!munId) { console.log("BLOCKED: no municipality"); process.exit(1); }

      const orgNum = generateNorwegianOrgNumber();
      console.log(`Generated org number: ${orgNum}`);

      const divCreateRes = await api("POST", "/division", {
        name: "Hovudavdeling",
        organizationNumber: orgNum,
        startDate: `${YEAR}-01-01`,
        municipalityDate: `${YEAR}-01-01`,
        municipality: { id: munId },
      });
      if (divCreateRes.status >= 400) { console.log("BLOCKED: division creation failed"); process.exit(1); }
      divisionId = divCreateRes.data?.value?.id;
      console.log(`Division created: id=${divisionId}`);
    }

    // Repair employee: set dateOfBirth
    const putRes = await api("PUT", `/employee/${empId}`, {
      id: empId,
      firstName: emp.firstName,
      lastName: emp.lastName,
      dateOfBirth: "1990-01-01",
    });
    if (putRes.status >= 400) { console.log("BLOCKED: employee repair failed"); process.exit(1); }
    console.log("Employee dateOfBirth repaired");

    // Create employment
    const emplRes = await api("POST", "/employee/employment", {
      employee: { id: empId },
      division: { id: divisionId },
      startDate: `${YEAR}-${String(MONTH).padStart(2, "0")}-01`,
      isMainEmployer: true,
      taxDeductionCode: "loennFraHovedarbeidsgiver",
    });
    if (emplRes.status >= 400) { console.log("BLOCKED: employment creation failed"); process.exit(1); }
    console.log("Employment created");
  } else {
    // Check if employments are too sparse
    const employments = emp.employments || [];
    const hasActiveEmployment = employments.some((e: any) =>
      e.startDate && (!e.endDate || e.endDate >= `${YEAR}-${String(MONTH).padStart(2, "0")}-01`)
    );

    if (!hasActiveEmployment && employments.length > 0) {
      // Sparse stubs — do conditional employment read
      console.log("Employments are sparse, doing conditional read");
      const emplReadRes = await api("GET", `/employee/employment?employeeId=${empId}&count=20&fields=*`);
      // Continue — we just need to verify coverage
    }
  }

  // Step 3: Get salary types
  const stRes = await api("GET", "/salary/type?count=1000&fields=*");
  if (stRes.status >= 400) { console.log("BLOCKED: salary type read failed"); process.exit(1); }

  const salaryTypes = stRes.data?.values || [];
  const fastlonn = salaryTypes.find((st: any) => st.name === "Fastlønn");
  const bonus = salaryTypes.find((st: any) => st.name === "Bonus");

  if (!fastlonn || !bonus) {
    console.log(`BLOCKED: salary types not found. Fastlønn=${fastlonn?.id}, Bonus=${bonus?.id}`);
    console.log("Available types:", salaryTypes.map((st: any) => st.name).join(", "));
    process.exit(1);
  }

  console.log(`Salary types: Fastlønn id=${fastlonn.id}, Bonus id=${bonus.id}`);

  // Step 4: Create salary transaction
  const payload = {
    date: DATE,
    year: YEAR,
    month: MONTH,
    paySlipsAvailableDate: DATE,
    payslips: [
      {
        employee: { id: empId },
        date: DATE,
        year: YEAR,
        month: MONTH,
        specifications: [
          {
            employee: { id: empId },
            salaryType: { id: fastlonn.id },
            description: `Fastlønn mars ${YEAR}`,
            year: YEAR,
            month: MONTH,
            count: 1,
            rate: BASE_SALARY,
            amount: BASE_SALARY,
          },
          {
            employee: { id: empId },
            salaryType: { id: bonus.id },
            description: `Bonus mars ${YEAR}`,
            year: YEAR,
            month: MONTH,
            count: 1,
            rate: BONUS,
            amount: BONUS,
          },
        ],
      },
    ],
  };

  const txRes = await api("POST", "/salary/transaction", payload);
  if (txRes.status === 201 || txRes.status === 200) {
    console.log("SUCCESS: Salary transaction created");
    console.log("Transaction:", JSON.stringify(txRes.data?.value, null, 2));
  } else {
    // If department error, the standard says retry without department — but we didn't include one
    console.log("FAILED: Salary transaction creation failed");
    console.log("Response:", JSON.stringify(txRes.data, null, 2));
  }
}

main().catch(e => { console.error(e); process.exit(1); });
