const baseUrl = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const sessionToken = "gOno29lbdNwtSEozq0g6An0Ix8fZqoG3D7JHXhpQh28";

const invoiceDate = "2026-03-20";
const invoiceDueDate = "2026-04-03";

const customerInput = {
  name: "Nordhav AS",
  organizationNumber: "876520427",
  invoiceSendMethod: "MANUAL",
};

const lineDescription = "Analyserapport";
const amountExcludingVat = 7850;

type JsonRecord = Record<string, any>;

function buildUrl(path: string, query?: Record<string, string>) {
  const url = new URL(path, baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      url.searchParams.append(key, value);
    }
  }
  return url.toString();
}

function authHeader() {
  return `Basic ${Buffer.from(`0:${sessionToken}`).toString("base64")}`;
}

function isInvalidTokenError(status: number, bodyText: string) {
  if (status !== 403) return false;
  return (
    bodyText.includes('"error":"Invalid or expired token"') ||
    bodyText.includes('"error":"Invalid or expired proxy token.')
  );
}

function getValidationMessages(body: any): string[] {
  if (!body || !Array.isArray(body.validationMessages)) return [];
  return body.validationMessages
    .map((item: any) => item?.message)
    .filter((value: any) => typeof value === "string");
}

async function request<T = any>(
  method: string,
  path: string,
  options?: { query?: Record<string, string>; body?: JsonRecord }
): Promise<{ status: number; bodyText: string; data: T | null }> {
  const response = await fetch(buildUrl(path, options?.query), {
    method,
    headers: {
      Authorization: authHeader(),
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: options?.body ? JSON.stringify(options.body) : undefined,
  });

  const bodyText = await response.text();
  if (isInvalidTokenError(response.status, bodyText)) {
    throw new Error(`Blocked credentials: ${bodyText}`);
  }

  let data: T | null = null;
  if (bodyText) {
    try {
      data = JSON.parse(bodyText);
    } catch {
      data = null;
    }
  }

  return { status: response.status, bodyText, data };
}

function assertOk(response: { status: number; bodyText: string }, label: string) {
  if (response.status >= 200 && response.status < 300) return;
  throw new Error(`${label} failed (${response.status}): ${response.bodyText}`);
}

function pickVatType(vatResponse: any) {
  const values = Array.isArray(vatResponse?.values) ? vatResponse.values : [];
  const vat25 = values.find((item: any) => Number(item?.percentage) === 25);
  if (!vat25) {
    throw new Error(`Blocked: outgoing 25% VAT not available for ${invoiceDate}`);
  }
  return vat25;
}

function makeBankAccountNumber() {
  const weights = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  const baseSeed = String(Date.now()).replace(/\D/g, "").slice(-10).padStart(10, "1");

  for (let offset = 0; offset < 1000; offset += 1) {
    const candidate10 = String((BigInt(baseSeed) + BigInt(offset)) % 10000000000n).padStart(10, "1");
    const digits = candidate10.split("").map(Number);
    const sum = digits.reduce((acc, digit, index) => acc + digit * weights[index], 0);
    const remainder = sum % 11;
    const check = 11 - remainder;
    if (check === 10) continue;
    const checkDigit = check === 11 ? 0 : check;
    return `${candidate10}${checkDigit}`;
  }

  throw new Error("Unable to generate valid bank account number");
}

function pickInvoiceBankAccount(accountResponse: any) {
  const values = Array.isArray(accountResponse?.values) ? accountResponse.values : [];
  return (
    values.find((item: any) => item?.isInvoiceAccount === true) ||
    values.find((item: any) => String(item?.number) === "1920") ||
    values[0]
  );
}

async function createInvoice(customerId: number, vatTypeId: number) {
  return request("POST", "invoice", {
    body: {
      invoiceDate,
      invoiceDueDate,
      customer: { id: customerId },
      orders: [
        {
          customer: { id: customerId },
          orderDate: invoiceDate,
          deliveryDate: invoiceDate,
          orderLines: [
            {
              description: lineDescription,
              count: 1,
              unitPriceExcludingVatCurrency: amountExcludingVat,
              vatType: { id: vatTypeId },
            },
          ],
        },
      ],
    },
  });
}

async function main() {
  const customerResponse = await request<{ value?: { id?: number } }>("POST", "customer", {
    body: customerInput,
  });
  assertOk(customerResponse, "Create customer");

  const customerId = customerResponse.data?.value?.id;
  if (!customerId) {
    throw new Error(`Create customer missing id: ${customerResponse.bodyText}`);
  }

  const vatResponse = await request("GET", "ledger/vatType", {
    query: {
      typeOfVat: "OUTGOING",
      vatDate: invoiceDate,
      fields: "*",
    },
  });
  assertOk(vatResponse, "Resolve VAT");

  const vatType = pickVatType(vatResponse.data);
  let invoiceResponse = await createInvoice(customerId, vatType.id);

  if (invoiceResponse.status >= 400 && invoiceResponse.status < 500) {
    const validationMessages = getValidationMessages(invoiceResponse.data);
    const missingBankAccount =
      invoiceResponse.bodyText.includes("bankkontonummer") ||
      validationMessages.some((message) => message.includes("bankkontonummer"));

    if (!missingBankAccount) {
      throw new Error(`Create invoice failed (${invoiceResponse.status}): ${invoiceResponse.bodyText}`);
    }

    const ledgerAccountResponse = await request("GET", "ledger/account", {
      query: {
        isBankAccount: "true",
        fields: "*",
      },
    });
    assertOk(ledgerAccountResponse, "Find bank account");

    const invoiceAccount = pickInvoiceBankAccount(ledgerAccountResponse.data);
    if (!invoiceAccount?.id) {
      throw new Error(`No invoice bank account found: ${ledgerAccountResponse.bodyText}`);
    }

    const bankAccountNumber =
      typeof invoiceAccount.bankAccountNumber === "string" && invoiceAccount.bankAccountNumber.trim()
        ? invoiceAccount.bankAccountNumber
        : makeBankAccountNumber();

    const updateAccountResponse = await request("PUT", `ledger/account/${invoiceAccount.id}`, {
      body: {
        bankAccountNumber,
      },
    });
    assertOk(updateAccountResponse, "Update bank account");

    invoiceResponse = await createInvoice(customerId, vatType.id);
  }

  assertOk(invoiceResponse, "Create and send invoice");
}

await main();
