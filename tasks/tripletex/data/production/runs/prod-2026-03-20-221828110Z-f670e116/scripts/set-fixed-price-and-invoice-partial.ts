const baseUrl = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const sessionToken = "MapjjNJu73g1PKxvO4Jzg09ujw0q6W-xMBah41cLmgc";

const invoiceDate = "2026-03-20";
const customerName = "Sjøbris AS";
const customerOrg = "825338756";
const projectName = "Automatiseringsprosjekt";
const managerEmail = "knut.kvamme@example.org";
const fixedPrice = 316000;
const partialAmount = 158000;
const partialLabel = "Delbetaling 50 % av fastpris";

type Json =
  | null
  | boolean
  | number
  | string
  | Json[]
  | { [key: string]: Json };

type TripletexError = {
  status: number;
  bodyText: string;
  bodyJson?: any;
};

let callCount = 0;

function authHeader() {
  return `Basic ${Buffer.from(`0:${sessionToken}`).toString("base64")}`;
}

function endpoint(pathAndQuery: string) {
  const normalizedBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return new URL(pathAndQuery, normalizedBase).toString();
}

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

function getValues<T>(payload: any): T[] {
  return Array.isArray(payload?.values) ? payload.values : [];
}

function getValue<T>(payload: any): T {
  if (!payload || typeof payload !== "object" || !("value" in payload)) {
    fail(`Missing response.value in payload: ${JSON.stringify(payload)}`);
  }
  return payload.value as T;
}

function exactString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function exactNumber(value: unknown) {
  return typeof value === "number" ? value : Number(value);
}

function extractValidationMessages(bodyJson: any): string[] {
  const raw = bodyJson?.validationMessages;
  if (!Array.isArray(raw)) return [];
  return raw
    .map((entry) => {
      if (typeof entry === "string") return entry;
      if (entry && typeof entry.message === "string") return entry.message;
      return "";
    })
    .filter(Boolean);
}

function isInvalidTokenError(err: TripletexError) {
  return (
    err.status === 403 &&
    (err.bodyText.includes("Invalid or expired token") ||
      err.bodyText.includes("Invalid or expired proxy token"))
  );
}

function isMissingCompanyBankAccountError(err: TripletexError) {
  if (err.status !== 422) return false;
  if (err.bodyText.includes("Faktura kan ikke opprettes før selskapet har registrert et bankkontonummer.")) {
    return true;
  }
  return extractValidationMessages(err.bodyJson).some((msg) =>
    msg.includes("Faktura kan ikke opprettes før selskapet har registrert et bankkontonummer."),
  );
}

async function request<T = any>(
  method: string,
  pathAndQuery: string,
  body?: Json,
): Promise<T> {
  callCount += 1;
  const response = await fetch(endpoint(pathAndQuery), {
    method,
    headers: {
      Authorization: authHeader(),
      Accept: "application/json",
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const bodyText = await response.text();
  const bodyJson = bodyText ? safeJsonParse(bodyText) : undefined;

  if (!response.ok) {
    const error: TripletexError = {
      status: response.status,
      bodyText,
      bodyJson,
    };
    throw error;
  }

  return (bodyJson as T) ?? (undefined as T);
}

function safeJsonParse(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function chooseExactProject(projects: any[]) {
  const byNameAndCustomer = projects.filter(
    (project) =>
      exactString(project?.name) === projectName &&
      exactString(project?.customer?.organizationNumber) === customerOrg,
  );
  if (byNameAndCustomer.length <= 1) return byNameAndCustomer[0] ?? null;

  const byManager = byNameAndCustomer.filter(
    (project) => exactString(project?.projectManager?.email) === managerEmail,
  );
  if (byManager.length === 1) return byManager[0];

  fail(`Ambiguous project match for ${projectName}/${customerOrg}`);
}

function chooseExactCustomer(customers: any[]) {
  const exactOrgMatches = customers.filter(
    (customer) => exactString(customer?.organizationNumber) === customerOrg,
  );
  if (exactOrgMatches.length === 1) return exactOrgMatches[0];
  if (exactOrgMatches.length === 0) return null;

  const exactNameMatches = exactOrgMatches.filter(
    (customer) => exactString(customer?.name) === customerName,
  );
  if (exactNameMatches.length === 1) return exactNameMatches[0];

  fail(`Ambiguous customer match for ${customerOrg}`);
}

function chooseExactManager(employees: any[]) {
  const exactMatches = employees.filter(
    (employee) => exactString(employee?.email) === managerEmail,
  );
  if (exactMatches.length === 1) return exactMatches[0];
  if (exactMatches.length === 0) return null;
  fail(`Ambiguous employee match for ${managerEmail}`);
}

function chooseVatType(vatTypes: any[]) {
  const pct25 = vatTypes.find((vatType) => exactNumber(vatType?.percentage) === 25);
  if (pct25) return pct25;

  const pct0 = vatTypes.filter((vatType) => exactNumber(vatType?.percentage) === 0);
  if (pct0.length > 0 && pct0.length === vatTypes.length) return pct0[0];

  fail(`Could not resolve safe outgoing VAT type from ${JSON.stringify(vatTypes)}`);
}

async function ensureCompanyBankAccount() {
  const accountsPayload = await request<any>("GET", "ledger/account?isBankAccount=true&fields=*");
  const accounts = getValues<any>(accountsPayload);
  const invoiceAccount =
    accounts.find(
      (account) =>
        account?.isInvoiceAccount === true &&
        exactNumber(account?.number) === 1920,
    ) ??
    accounts.find((account) => account?.isInvoiceAccount === true) ??
    accounts.find((account) => account?.isBankAccount === true);

  if (!invoiceAccount?.id) {
    fail(`No invoice bank account found in ${JSON.stringify(accounts)}`);
  }

  if (exactString(invoiceAccount.bankAccountNumber)) {
    return invoiceAccount;
  }

  await request<any>(
    "PUT",
    `ledger/account/${invoiceAccount.id}`,
    { bankAccountNumber: "12345678903" },
  );
  return invoiceAccount;
}

async function invoiceOrder(orderId: number) {
  try {
    return await request<any>(
      "PUT",
      `order/${orderId}/:invoice?invoiceDate=${encodeURIComponent(invoiceDate)}&sendToCustomer=false`,
    );
  } catch (error) {
    const err = error as TripletexError;
    if (!isMissingCompanyBankAccountError(err)) throw err;
    await ensureCompanyBankAccount();
    return await request<any>(
      "PUT",
      `order/${orderId}/:invoice?invoiceDate=${encodeURIComponent(invoiceDate)}&sendToCustomer=false`,
    );
  }
}

async function main() {
  let firstCallMade = false;
  try {
    const projectPayload = await request<any>(
      "GET",
      `project?name=${encodeURIComponent(projectName)}&count=50&fields=${encodeURIComponent("*,customer(*),projectManager(*)")}`,
    );
    firstCallMade = true;

    const projectSearchHits = getValues<any>(projectPayload);
    let project = chooseExactProject(projectSearchHits);

    let customerId: number | undefined = project?.customer?.id;
    let managerId: number | undefined = project?.projectManager?.id;

    const customerProven = exactString(project?.customer?.organizationNumber) === customerOrg;
    const managerProven = exactString(project?.projectManager?.email) === managerEmail;
    const fixedPriceProven =
      project?.isFixedPrice === true && exactNumber(project?.fixedprice) === fixedPrice;

    if (!customerProven) {
      const customerPayload = await request<any>(
        "GET",
        `customer?organizationNumber=${encodeURIComponent(customerOrg)}&count=10&fields=*`,
      );
      const customer = chooseExactCustomer(getValues<any>(customerPayload));
      const resolvedCustomer =
        customer ??
        getValue<any>(
          await request<any>("POST", "customer", {
            name: customerName,
            organizationNumber: customerOrg,
            invoiceSendMethod: "MANUAL",
          }),
        );
      customerId = resolvedCustomer.id;
    }

    if (!managerProven) {
      const employeePayload = await request<any>(
        "GET",
        `employee?email=${encodeURIComponent(managerEmail)}&assignableProjectManagers=true&count=10&fields=*`,
      );
      const employee = chooseExactManager(getValues<any>(employeePayload));
      if (!employee?.id) {
        fail(`Project manager not found for ${managerEmail}`);
      }
      managerId = employee.id;
    }

    if (!customerId || !managerId) {
      fail(`Missing resolved customer or manager id`);
    }

    if (!project) {
      const createdProjectPayload = await request<any>("POST", "project", {
        name: projectName,
        startDate: invoiceDate,
        customer: { id: customerId },
        projectManager: { id: managerId },
        isFixedPrice: true,
        fixedprice: fixedPrice,
        invoiceOnAccountVatHigh: false,
      });
      project = getValue<any>(createdProjectPayload);
    } else if (!(customerProven && managerProven && fixedPriceProven)) {
      const updatedProjectPayload = await request<any>("PUT", `project/${project.id}`, {
        name: projectName,
        startDate: exactString(project.startDate) || invoiceDate,
        customer: { id: customerId },
        projectManager: { id: managerId },
        isFixedPrice: true,
        fixedprice: fixedPrice,
        invoiceOnAccountVatHigh: false,
      });
      project = getValue<any>(updatedProjectPayload);
    }

    const vatPayload = await request<any>(
      "GET",
      `ledger/vatType?typeOfVat=OUTGOING&vatDate=${encodeURIComponent(invoiceDate)}&fields=*`,
    );
    const vatType = chooseVatType(getValues<any>(vatPayload));

    const orderPayload = await request<any>("POST", "order", {
      customer: { id: customerId },
      project: { id: project.id },
      orderDate: invoiceDate,
      deliveryDate: invoiceDate,
      invoiceOnAccountVatHigh: false,
      orderLines: [
        {
          description: partialLabel,
          count: 1,
          unitPriceExcludingVatCurrency: partialAmount,
          vatType: { id: vatType.id },
        },
      ],
    });
    const order = getValue<any>(orderPayload);
    const invoicePayload = await invoiceOrder(order.id);
    const invoice = getValue<any>(invoicePayload);

    console.log(
      JSON.stringify({
        ok: true,
        callCount,
        projectId: project.id,
        customerId,
        managerId,
        fixedPrice,
        partialAmount,
        orderId: order.id,
        invoiceId: invoice.id,
        amountExcludingVatCurrency: invoice.amountExcludingVatCurrency,
        amountCurrencyOutstanding: invoice.amountCurrencyOutstanding,
      }),
    );
  } catch (error) {
    const err = error as TripletexError;
    if (err && typeof err.status === "number") {
      if (!firstCallMade || isInvalidTokenError(err)) {
        fail(`Blocked by unusable credentials: ${err.status} ${err.bodyText}`);
      }
      fail(`Tripletex error ${err.status}: ${err.bodyText}`);
    }
    fail(`Unexpected failure: ${String(error)}`);
  }
}

await main();
