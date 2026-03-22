/**
 * Manual disposable verification: test whether POST /employee?fields=*
 * returns startDate in the employment objects.
 *
 * This bypasses the sandbox reset pipeline because the persistent sandbox
 * has un-neutralizable employee records from previous verification runs.
 */

const baseUrl = "https://kkpqfuj-amager.tripletex.dev/v2";
const sessionToken = process.env.TRIPLETEX_TEST_SESSION_TOKEN;
if (!sessionToken) {
  throw new Error("TRIPLETEX_TEST_SESSION_TOKEN not set");
}

const authHeader = `Basic ${Buffer.from(`0:${sessionToken}`).toString("base64")}`;

async function apiCall<T>(
  method: string,
  path: string,
  options: { query?: Record<string, string>; body?: unknown } = {},
): Promise<{ status: number; data: T; raw: string }> {
  const url = new URL(`${baseUrl}/${path}`);
  if (options.query) {
    for (const [k, v] of Object.entries(options.query)) {
      url.searchParams.set(k, v);
    }
  }

  const response = await fetch(url.toString(), {
    method,
    headers: {
      Authorization: authHeader,
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const raw = await response.text();
  const data = raw ? (JSON.parse(raw) as T) : ({} as T);
  return { status: response.status, data, raw };
}

async function main() {
  const timestamp = Date.now();
  const testEmail = `verify-fields-${timestamp}@example.org`;
  const testStartDate = "2026-11-15";

  console.log("=== Manual Verification: POST /employee?fields=* ===");
  console.log(`Test email: ${testEmail}`);
  console.log(`Test startDate: ${testStartDate}`);

  // Step 1: Resolve department (sandbox requires it)
  console.log("\n--- Step 1: GET /department ---");
  const deptResult = await apiCall<{ values?: Array<{ id: number; name?: string }> }>(
    "GET",
    "department",
    { query: { isInactive: "false", count: "1", fields: "*" } },
  );
  console.log(`Status: ${deptResult.status}`);
  const deptId = deptResult.data.values?.[0]?.id;
  if (!deptId) {
    throw new Error(`No department found: ${deptResult.raw}`);
  }
  console.log(`Department ID: ${deptId}`);

  // Step 2: Resolve division (sandbox requires it)
  console.log("\n--- Step 2: GET /division ---");
  const divResult = await apiCall<{ values?: Array<{ id: number; name?: string }> }>(
    "GET",
    "division",
    { query: { count: "1", fields: "*" } },
  );
  console.log(`Status: ${divResult.status}`);
  const divId = divResult.data.values?.[0]?.id;
  if (!divId) {
    throw new Error(`No division found: ${divResult.raw}`);
  }
  console.log(`Division ID: ${divId}`);

  const employeePayload = {
    firstName: "FieldsTest",
    lastName: `Verify${timestamp}`,
    dateOfBirth: "1990-05-20",
    email: testEmail,
    userType: "NO_ACCESS",
    department: { id: deptId },
    employments: [
      {
        startDate: testStartDate,
        division: { id: divId },
      },
    ],
  };

  // Step 3a: POST /employee WITHOUT fields=*
  console.log("\n--- Step 3a: POST /employee (no fields param) ---");
  const noFieldsResult = await apiCall<{ value?: Record<string, unknown> }>(
    "POST",
    "employee",
    { body: { ...employeePayload, email: `no-fields-${timestamp}@example.org` } },
  );
  console.log(`Status: ${noFieldsResult.status}`);
  if (noFieldsResult.status === 201 || noFieldsResult.status === 200) {
    const emp = noFieldsResult.data.value as Record<string, unknown>;
    const employments = emp?.employments as Array<Record<string, unknown>> | undefined;
    console.log("employments in response:", JSON.stringify(employments, null, 2));
    const hasStartDate = employments?.some((e) => typeof e.startDate === "string");
    console.log(`startDate present without fields=*: ${hasStartDate}`);
  } else {
    console.log(`Failed: ${noFieldsResult.raw.slice(0, 500)}`);
  }

  // Step 3b: POST /employee WITH fields=*
  console.log("\n--- Step 3b: POST /employee?fields=* ---");
  const withFieldsResult = await apiCall<{ value?: Record<string, unknown> }>(
    "POST",
    "employee",
    {
      query: { fields: "*" },
      body: employeePayload,
    },
  );
  console.log(`Status: ${withFieldsResult.status}`);
  if (withFieldsResult.status === 201 || withFieldsResult.status === 200) {
    const emp = withFieldsResult.data.value as Record<string, unknown>;
    const employments = emp?.employments as Array<Record<string, unknown>> | undefined;
    console.log("employments in response:", JSON.stringify(employments, null, 2));
    const hasStartDate = employments?.some((e) => typeof e.startDate === "string");
    console.log(`startDate present with fields=*: ${hasStartDate}`);

    if (hasStartDate) {
      console.log("\n=== HYPOTHESIS CONFIRMED ===");
      console.log("POST /employee?fields=* DOES return startDate in employments.");
      console.log("The v2 strategy can safely skip the employment readback → 1-call path possible.");
    } else {
      console.log("\n=== HYPOTHESIS REJECTED ===");
      console.log("POST /employee?fields=* does NOT return startDate.");
      console.log("Employments are still sparse even with fields=*.");
    }

    // Step 4: Try with fields=employments(*)
    console.log("\n--- Step 4: POST /employee?fields=employments(*) ---");
    const withEmploymentFieldsResult = await apiCall<{ value?: Record<string, unknown> }>(
      "POST",
      "employee",
      {
        query: { fields: "employments(*)" },
        body: {
          ...employeePayload,
          email: `emp-fields-${timestamp}@example.org`,
        },
      },
    );
    console.log(`Status: ${withEmploymentFieldsResult.status}`);
    if (withEmploymentFieldsResult.status === 201 || withEmploymentFieldsResult.status === 200) {
      const emp2 = withEmploymentFieldsResult.data.value as Record<string, unknown>;
      const employments2 = emp2?.employments as Array<Record<string, unknown>> | undefined;
      console.log("employments in response:", JSON.stringify(employments2, null, 2));
      const hasStartDate2 = employments2?.some((e) => typeof e.startDate === "string");
      console.log(`startDate present with fields=employments(*): ${hasStartDate2}`);
    } else {
      console.log(`Failed: ${withEmploymentFieldsResult.raw.slice(0, 500)}`);
    }
  } else {
    console.log(`Failed: ${withFieldsResult.raw.slice(0, 500)}`);
  }
}

await main();
