const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa(`0:${TOKEN}`);

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: any = {
    method,
    headers: { Authorization: AUTH, "Content-Type": "application/json" },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const text = await res.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  console.log(`\n${method} ${path} => ${res.status}`);
  if (!res.ok) console.log("ERROR:", JSON.stringify(json, null, 2));
  return { status: res.status, data: json };
}

async function main() {
  // Full chain: whoAmI → company → municipality → POST /division

  // Step 1: whoAmI
  const whoAmI = await api("GET", "/token/session/>whoAmI");
  const companyId = whoAmI.data?.value?.companyId;
  console.log("Company ID:", companyId);

  // Step 2: company info
  const company = await api("GET", `/company/${companyId}?fields=*`);
  const orgNum = company.data?.value?.organizationNumber;
  console.log("Org number:", orgNum);

  // Step 3: municipality
  const mun = await api("GET", "/municipality?count=1&fields=*");
  const munId = mun.data?.values?.[0]?.id;
  console.log("Municipality ID:", munId, "Name:", mun.data?.values?.[0]?.name);

  // Step 4: create division using company's org number
  console.log("\n=== CREATE DIVISION ===");
  const divRes = await api("POST", "/division", {
    name: "Reflection Test Division",
    organizationNumber: orgNum,
    startDate: "2026-01-01",
    municipalityDate: "2026-01-01",
    municipality: { id: munId },
  });
  if (divRes.status === 201 || divRes.status === 200) {
    console.log("Division created!", JSON.stringify(divRes.data?.value, null, 2));

    // Now test the full payroll flow with this new division
    const divisionId = divRes.data?.value?.id;

    // Create a disposable employee
    const empRes = await api("POST", "/employee", {
      firstName: "Reflection",
      lastName: "Test",
      email: `reflection-test-${Date.now()}@example.org`,
    });
    if (empRes.status !== 201 && empRes.status !== 200) {
      console.log("Cannot create test employee");
      return;
    }
    const empId = empRes.data?.value?.id;
    console.log("Test employee ID:", empId);

    // PUT dateOfBirth
    const putRes = await api("PUT", `/employee/${empId}`, {
      ...empRes.data?.value,
      dateOfBirth: "1990-01-01",
    });
    console.log("DOB repair:", putRes.status);

    // POST employment
    const emplRes = await api("POST", "/employee/employment", {
      employee: { id: empId },
      division: { id: divisionId },
      startDate: "2026-03-01",
      isMainEmployer: true,
      taxDeductionCode: "loennFraHovedarbeidsgiver",
    });
    console.log("Employment create:", emplRes.status);

    // GET salary types
    const stRes = await api("GET", "/salary/type?count=1000&fields=*");
    const salaryTypes = stRes.data?.values || [];
    const fastlonn = salaryTypes.find((t: any) => t.name === "Fastlønn");
    const bonus = salaryTypes.find((t: any) => t.name === "Bonus");
    console.log("Salary types:", fastlonn?.id, bonus?.id);

    if (fastlonn && bonus) {
      // POST salary transaction
      const txRes = await api("POST", "/salary/transaction", {
        date: "2026-03-21",
        year: 2026,
        month: 3,
        paySlipsAvailableDate: "2026-03-21",
        payslips: [{
          employee: { id: empId },
          date: "2026-03-21",
          year: 2026,
          month: 3,
          specifications: [
            {
              employee: { id: empId },
              salaryType: { id: fastlonn.id },
              description: "Fastlønn mars 2026",
              year: 2026,
              month: 3,
              count: 1,
              rate: 36000,
              amount: 36000,
            },
            {
              employee: { id: empId },
              salaryType: { id: bonus.id },
              description: "Bonus mars 2026",
              year: 2026,
              month: 3,
              count: 1,
              rate: 15400,
              amount: 15400,
            },
          ],
        }],
      });
      console.log("Salary transaction:", txRes.status);
      if (txRes.status === 201 || txRes.status === 200) {
        const txId = txRes.data?.value?.id;
        console.log("Transaction ID:", txId);

        // Verify
        const verifyTx = await api("GET", `/salary/transaction/${txId}?fields=*`);
        const payslipId = verifyTx.data?.value?.payslips?.[0]?.id;
        if (payslipId) {
          const verifyPs = await api("GET", `/salary/payslip/${payslipId}?fields=*,specifications(*,salaryType(*))`);
          const ps = verifyPs.data?.value;
          console.log("\n=== PAYSLIP VERIFICATION ===");
          console.log("Gross amount:", ps?.grossAmount);
          console.log("Amount:", ps?.amount);
          const specs = ps?.specifications || [];
          for (const s of specs) {
            console.log(`  ${s.salaryType?.name}: amount=${s.amount}, rate=${s.rate}`);
          }
        }
      }
    }
  } else {
    console.log("Division creation FAILED");
  }
}

main().catch(console.error);
