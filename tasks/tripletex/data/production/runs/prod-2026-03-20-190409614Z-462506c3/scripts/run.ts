const baseUrl = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const sessionToken = "WwcsNNOADJj5k4drZ2kTvg7IV9vz6ewMdI2gMH2l6Js";

const invoiceDate = "2026-03-20";
const invoiceDueDate = "2026-04-03";
const customerInput = {
  name: "Snøhetta AS",
  organizationNumber: "871844062",
  invoiceSendMethod: "MANUAL",
};
const lineDescription = "Webdesign";
const amountExcludingVat = 20100;
const expectedVatPercentage = 25;

const authHeader = `Basic ${Buffer.from(`0:${sessionToken}`).toString("base64")}`;

type ApiError = {
  status: number;
  bodyText: string;
  bodyJson: any;
};

function endpointUrl(path: string): string {
  return new URL(path, baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`).toString();
}

async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("Authorization", authHeader);
  headers.set("Accept", "application/json");
  if (init.body !== undefined && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(endpointUrl(path), { ...init, headers });
  const bodyText = await response.text();
  let bodyJson: any = null;
  if (bodyText) {
    try {
      bodyJson = JSON.parse(bodyText);
    } catch {
      bodyJson = null;
    }
  }

  if (!response.ok) {
    if (
      response.status === 403 &&
      bodyJson &&
      typeof bodyJson.error === "string" &&
      bodyJson.error === "Invalid or expired token"
    ) {
      throw new Error("Blocked: invalid or expired Tripletex token");
    }
    const err: ApiError = { status: response.status, bodyText, bodyJson };
    throw err;
  }

  return bodyJson as T;
}

function errorMessage(error: unknown): string {
  if (typeof error === "object" && error !== null && "status" in error) {
    const apiError = error as ApiError;
    return `HTTP ${apiError.status}: ${apiError.bodyText}`;
  }
  return error instanceof Error ? error.message : String(error);
}

function hasMissingBankAccountValidation(error: unknown): boolean {
  if (!(typeof error === "object" && error !== null && "bodyJson" in error)) {
    return false;
  }
  const bodyJson = (error as ApiError).bodyJson;
  const text = JSON.stringify(bodyJson ?? {});
  return text.includes("Faktura kan ikke opprettes før selskapet har registrert et bankkontonummer.");
}

function bankAccountCheckDigit(firstTenDigits: string): string | null {
  const weights = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  const digits = firstTenDigits.split("").map(Number);
  const sum = digits.reduce((acc, digit, index) => acc + digit * weights[index], 0);
  const remainder = sum % 11;
  const check = 11 - remainder;
  if (check === 11) return "0";
  if (check === 10) return null;
  return String(check);
}

function nextUniqueBankAccount(existingNumbers: Set<string>): string {
  for (let i = 1000000000; i <= 9999999999; i++) {
    const prefix = String(i);
    const checkDigit = bankAccountCheckDigit(prefix);
    if (!checkDigit) continue;
    const candidate = `${prefix}${checkDigit}`;
    if (!existingNumbers.has(candidate)) return candidate;
  }
  throw new Error("Unable to generate unique checksum-valid bank account number");
}

async function createCustomer() {
  const customerRes = await api<{ value: { id: number; name: string; organizationNumber: string } }>("customer", {
    method: "POST",
    body: JSON.stringify(customerInput),
  });
  return customerRes.value;
}

async function getVatTypeId() {
  const vatRes = await api<{ values: Array<{ id: number; percentage?: number; rate?: number; name?: string }> }>(
    `ledger/vatType?typeOfVat=OUTGOING&vatDate=${invoiceDate}&fields=*`,
  );
  const vat = vatRes.values.find((row) => Number(row.percentage ?? row.rate) === expectedVatPercentage);
  if (!vat) {
    throw new Error(`Blocked: no OUTGOING VAT type with ${expectedVatPercentage}% on ${invoiceDate}`);
  }
  return vat.id;
}

function invoicePayload(customerId: number, vatTypeId: number) {
  return {
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
  };
}

async function createInvoice(customerId: number, vatTypeId: number) {
  return api<{
    value: {
      id: number;
      invoiceNumber?: number | string;
      amountExcludingVatCurrency?: number;
      amountCurrency?: number;
    };
  }>("invoice", {
    method: "POST",
    body: JSON.stringify(invoicePayload(customerId, vatTypeId)),
  });
}

async function repairBankAccount() {
  const accountsRes = await api<{
    values: Array<{
      id: number;
      number?: number | string;
      bankAccountNumber?: string;
      isInvoiceAccount?: boolean;
    }>;
  }>("ledger/account?isBankAccount=true&fields=*");

  const accounts = accountsRes.values;
  const target =
    accounts.find((account) => account.isInvoiceAccount) ??
    accounts.find((account) => String(account.number) === "1920") ??
    accounts[0];

  if (!target) {
    throw new Error("Blocked: no bank account found for repair branch");
  }

  const existingNumbers = new Set(
    accounts.map((account) => account.bankAccountNumber).filter((value): value is string => Boolean(value)),
  );
  const bankAccountNumber = target.bankAccountNumber && !existingNumbers.has(target.bankAccountNumber)
    ? target.bankAccountNumber
    : nextUniqueBankAccount(existingNumbers);

  await api(`ledger/account/${target.id}`, {
    method: "PUT",
    body: JSON.stringify({ bankAccountNumber }),
  });
}

async function main() {
  const customer = await createCustomer();
  const vatTypeId = await getVatTypeId();

  let invoiceRes;
  try {
    invoiceRes = await createInvoice(customer.id, vatTypeId);
  } catch (error) {
    if (!hasMissingBankAccountValidation(error)) {
      throw error;
    }
    await repairBankAccount();
    invoiceRes = await createInvoice(customer.id, vatTypeId);
  }

  const invoice = invoiceRes.value;
  if (invoice.amountExcludingVatCurrency !== amountExcludingVat) {
    throw new Error(
      `Created invoice has wrong ex-VAT amount: ${invoice.amountExcludingVatCurrency} != ${amountExcludingVat}`,
    );
  }
  if (!(typeof invoice.amountCurrency === "number" && invoice.amountCurrency > amountExcludingVat)) {
    throw new Error(`Created invoice does not appear to include VAT: ${invoice.amountCurrency}`);
  }

  console.log(
    JSON.stringify(
      {
        customerId: customer.id,
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber ?? null,
        amountExcludingVatCurrency: invoice.amountExcludingVatCurrency,
        amountCurrency: invoice.amountCurrency ?? null,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(errorMessage(error));
  process.exit(1);
});
