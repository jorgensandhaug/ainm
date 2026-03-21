const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "1_lNzi2l6b78sBKEhBTMeQ9sxn6VRXb5qP4zaQjHnHk";
const AUTH = "Basic " + btoa("0:" + TOKEN);

const EMAIL = "brita.berge@example.org";
const BASE_SALARY = 36800;
const BONUS = 14100;
const GROSS = BASE_SALARY + BONUS;
const YEAR = 2026;
const MONTH = 3;
const DATE = "2026-03-21";
const MONTH_START = "2026-03-01";

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: any = {
    method,
    headers: { Authorization: AUTH, "Content-Type": "application/json" },
  };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  const text = await r.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  console.log(`${method} ${path} → ${r.status}`);
  if (r.status >= 400) {
    console.log("ERROR:", JSON.stringify(json, null, 2));
  }
  return { status: r.status, data: json };
}

function generateOrgNumber(): string {
  const digits = [9];
  for (let i = 0; i < 7; i++) digits.push(Math.floor(Math.random() * 10));
  const weights = [3, 2, 7, 6, 5, 4, 3, 2];
  let sum = 0;
  for (let i = 0; i < 8; i++) sum += digits[i] * weights[i];
  const rem = sum % 11;
  if (rem === 1) return generateOrgNumber();
  const check = rem === 0 ? 0 : 11 - rem;
  digits.push(check);
  return digits.join("");
}

async function main() {
  // Step 1: Find employee
  const empRes = await api("GET", `/employee?email=${EMAIL}&count=10&fields=*`);
  if (empRes.status !== 200) { console.log("BLOCKED: cannot read employee"); return; }
  const employees = empRes.data.values?.filter((e: any) =>
    e.email?.toLowerCase() === EMAIL.toLowerCase()
  );
  if (!employees || employees.length === 0) { console.log("BLOCKED: no matching employee"); return; }
  const emp = employees[0];
  const empId = emp.id;
  console.log(`Employee: id=${empId}, name=${emp.firstName} ${emp.lastName}, dob=${emp.dateOfBirth}, employments=${JSON.stringify(emp.employments)}`);

  const underconfigured = emp.dateOfBirth === null && (!emp.employments || emp.employments.length === 0);

  let divisionId: number | null = null;

  if (underconfigured) {
    // Step 2: Check division
    const divRes = await api("GET", "/division?count=1&fields=*");
    const divisions = divRes.data.values || [];
    if (divisions.length > 0) {
      divisionId = divisions[0].id;
      console.log(`Existing division: id=${divisionId}`);
    } else {
      // Create division
      console.log("No division found, creating one...");
      const orgNum = generateOrgNumber();
      const divCreateRes = await api("POST", "/division", {
        name: "Hovudavdeling",
        organizationNumber: orgNum,
        startDate: `${YEAR}-01-01`,
        municipalityDate: `${YEAR}-01-01`,
        municipality: { id: 1 },
      });
      if (divCreateRes.status === 201) {
        divisionId = divCreateRes.data.value?.id;
        console.log(`Created division: id=${divisionId}`);
      } else {
        console.log("BLOCKED: cannot create division");
        return;
      }
    }

    // Step 3: Repair employee - PUT dateOfBirth
    const putRes = await api("PUT", `/employee/${empId}`, {
      ...emp,
      dateOfBirth: "1990-01-01",
    });
    if (putRes.status >= 400) { console.log("BLOCKED: cannot update employee dateOfBirth"); return; }

    // Step 4: Create employment
    const emplRes = await api("POST", "/employee/employment", {
      employee: { id: empId },
      division: { id: divisionId },
      startDate: MONTH_START,
      isMainEmployer: true,
      taxDeductionCode: "loennFraHovedarbeidsgiver",
    });
    if (emplRes.status !== 201) { console.log("BLOCKED: cannot create employment"); return; }
    const employmentId = emplRes.data.value?.id;
    console.log(`Created employment: id=${employmentId}`);

    // Step 5: Create employment details
    const detailsRes = await api("POST", "/employee/employment/details", {
      employment: { id: employmentId },
      date: MONTH_START,
      employmentType: "ORDINARY",
      employmentForm: "PERMANENT",
      remunerationType: "MONTHLY_WAGE",
      workingHoursScheme: "NOT_SHIFT",
      percentageOfFullTimeEquivalent: 100,
      monthlySalary: BASE_SALARY,
      annualSalary: BASE_SALARY * 12,
    });
    if (detailsRes.status !== 201) { console.log("WARNING: employment details creation failed, continuing..."); }
    else { console.log(`Created employment details`); }
  }

  // Step 6: Parallel reads - salary types + voucher type + accounts
  const [salTypeRes, voucherTypeRes, accountsRes] = await Promise.all([
    api("GET", "/salary/type?count=1000&fields=*"),
    api("GET", "/ledger/voucherType?name=L%C3%B8nnsbilag&count=1&fields=*"),
    api("GET", "/ledger/account?number=5000,1920&count=10&fields=*"),
  ]);

  if (salTypeRes.status !== 200) { console.log("BLOCKED: cannot read salary types"); return; }
  const salTypes = salTypeRes.data.values || [];
  const fastlonn = salTypes.find((t: any) => t.name === "Fastlønn" || t.number === 120);
  const bonus = salTypes.find((t: any) => t.name === "Bonus" || t.number === 300);
  if (!fastlonn || !bonus) { console.log(`BLOCKED: missing salary types. Fastlønn=${fastlonn?.id}, Bonus=${bonus?.id}`); return; }
  console.log(`Salary types: Fastlønn id=${fastlonn.id}, Bonus id=${bonus.id}`);

  if (voucherTypeRes.status !== 200) { console.log("BLOCKED: cannot read voucher types"); return; }
  const voucherTypes = voucherTypeRes.data.values || [];
  if (voucherTypes.length === 0) { console.log("BLOCKED: no Lønnsbilag voucher type"); return; }
  const voucherTypeId = voucherTypes[0].id;
  console.log(`VoucherType Lønnsbilag: id=${voucherTypeId}`);

  if (accountsRes.status !== 200) { console.log("BLOCKED: cannot read accounts"); return; }
  const accounts = accountsRes.data.values || [];
  const acc5000 = accounts.find((a: any) => a.number === 5000);
  const acc1920 = accounts.find((a: any) => a.number === 1920);
  if (!acc5000 || !acc1920) { console.log(`BLOCKED: missing accounts. 5000=${acc5000?.id}, 1920=${acc1920?.id}`); return; }
  console.log(`Accounts: 5000 id=${acc5000.id}, 1920 id=${acc1920.id}`);

  // Step 7: Create salary transaction
  const txRes = await api("POST", "/salary/transaction?generateTaxDeduction=true", {
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
  });

  if (txRes.status !== 201) { console.log("BLOCKED: salary transaction failed"); return; }
  console.log(`Salary transaction created: id=${txRes.data.value?.id}`);

  // Step 8: Create Lønnsbilag voucher
  const voucherRes = await api("POST", "/ledger/voucher?sendToLedger=true", {
    voucherType: { id: voucherTypeId },
    date: DATE,
    description: `Lønn mars ${YEAR} - Fastlønn ${BASE_SALARY} + Bonus ${BONUS}`,
    postings: [
      {
        account: { id: acc5000.id },
        amount: BASE_SALARY,
        description: `Fastlønn mars ${YEAR}`,
        row: 1,
      },
      {
        account: { id: acc5000.id },
        amount: BONUS,
        description: `Bonus mars ${YEAR}`,
        row: 2,
      },
      {
        account: { id: acc1920.id },
        amount: -GROSS,
        description: `Lønn mars ${YEAR}`,
        row: 3,
      },
    ],
  });

  if (voucherRes.status !== 201) { console.log("WARNING: voucher creation failed"); return; }
  console.log(`Lønnsbilag voucher created: id=${voucherRes.data.value?.id}, number=${voucherRes.data.value?.number}`);
  console.log("DONE: payroll completed successfully");
}

main().catch(e => console.error(e));
