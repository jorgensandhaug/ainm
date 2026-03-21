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

// Norwegian org number generator (9 digits, checksum on positions)
// For sub-entities (underenheter), the number starts with 8 or 9
function generateNorwegianOrgNumber(): string {
  const weights = [3, 2, 7, 6, 5, 4, 3, 2];
  // Start with 9 for sub-entity
  let digits = [9];
  for (let i = 1; i < 8; i++) {
    digits.push(Math.floor(Math.random() * 10));
  }
  const sum = digits.reduce((acc, d, i) => acc + d * weights[i], 0);
  const remainder = sum % 11;
  if (remainder === 0) {
    digits.push(0);
  } else if (remainder === 1) {
    // Invalid, try again
    return generateNorwegianOrgNumber();
  } else {
    digits.push(11 - remainder);
  }
  return digits.join('');
}

async function main() {
  // Path A: Try creating division with a generated sub-entity org number
  console.log("=== PATH A: DIVISION WITH GENERATED SUB-ENTITY ORG NUMBER ===");
  const orgNum = generateNorwegianOrgNumber();
  console.log("Generated org number:", orgNum);

  const divRes = await api("POST", "/division", {
    name: `Avdeling ${Date.now()}`,
    organizationNumber: orgNum,
    startDate: "2026-01-01",
    municipalityDate: "2026-01-01",
    municipality: { id: 1 },
  });
  if (divRes.status === 201 || divRes.status === 200) {
    console.log("SUCCESS! Division created with generated org number!");
    console.log("Division:", JSON.stringify(divRes.data?.value, null, 2));
  }

  // Path B: Try with well-known sub-entity format
  console.log("\n=== PATH B: DIVISION WITH 8-PREFIXED ORG NUMBER ===");
  const orgNum2 = generateNorwegianOrgNumber().replace(/^9/, '8');
  // Recalculate checksum for 8-prefix
  const orgNum3 = generateNorwegianOrgNumber();
  console.log("Trying org number:", orgNum3);

  const divRes2 = await api("POST", "/division", {
    name: `Avdeling B ${Date.now()}`,
    organizationNumber: orgNum3,
    startDate: "2026-01-01",
    municipalityDate: "2026-01-01",
    municipality: { id: 1 },
  });
  if (divRes2.status === 201 || divRes2.status === 200) {
    console.log("SUCCESS! Division created!");
    console.log("Division:", JSON.stringify(divRes2.data?.value, null, 2));
  }

  // Path C: Check if existing sandbox divisions have sub-entity org numbers
  console.log("\n=== EXISTING DIVISION ORG NUMBERS ===");
  const existingDivs = await api("GET", "/division?count=10&fields=organizationNumber,name");
  const divs = existingDivs.data?.values || [];
  for (const d of divs) {
    console.log(`  "${d.name}": orgNum=${d.organizationNumber} (starts with ${d.organizationNumber?.[0]})`);
  }

  // Path D: Try manual voucher as fallback
  console.log("\n=== PATH D: MANUAL VOUCHER FALLBACK ===");
  const accRes = await api("GET", "/ledger/account?number=5000,1920&fields=*");
  const accounts = accRes.data?.values || [];
  const acc5000 = accounts.find((a: any) => a.number === 5000);
  const acc1920 = accounts.find((a: any) => a.number === 1920);
  if (acc5000 && acc1920) {
    console.log(`Account 5000 id=${acc5000.id}, Account 1920 id=${acc1920.id}`);
    const grossAmount = 36000 + 15400;
    const voucherRes = await api("POST", "/ledger/voucher", {
      date: "2026-03-21",
      description: `Lønn Reflection Test mars 2026`,
      voucherType: null,
      postings: [
        {
          date: "2026-03-21",
          account: { id: acc5000.id },
          amount: grossAmount,
          amountCurrency: grossAmount,
          amountGross: grossAmount,
          amountGrossCurrency: grossAmount,
          description: `Lønn mars 2026`,
        },
        {
          date: "2026-03-21",
          account: { id: acc1920.id },
          amount: -grossAmount,
          amountCurrency: -grossAmount,
          amountGross: -grossAmount,
          amountGrossCurrency: -grossAmount,
          description: `Lønn mars 2026`,
        },
      ],
    });
    console.log("Voucher result:", voucherRes.status);
    if (voucherRes.status === 201 || voucherRes.status === 200) {
      console.log("Voucher:", JSON.stringify(voucherRes.data?.value, null, 2));
    }
  }
}

main().catch(console.error);
