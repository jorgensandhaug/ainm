import type {
  StrategyContext,
  StrategyResult,
} from "../../../runtime/contracts";
import { TripletexHttpError } from "../../../runtime/tripletex-client";
import type {
  RunPayrollWithBonusInput,
  RunPayrollWithBonusStrategy,
} from "../task";
import { RUN_PAYROLL_WITH_BONUS_TASK_ID } from "../task";

interface ListResponse<TValue> {
  values?: TValue[];
}

interface ResponseWrapper<TValue> {
  value?: TValue;
}

interface EmployeeSummary {
  id: number;
  email?: string;
  displayName?: string;
  firstName?: string;
  lastName?: string;
  dateOfBirth?: string | null;
  employments?: EmploymentSummary[];
}

interface EmploymentSummary {
  id?: number;
  startDate?: string | null;
  endDate?: string | null;
  division?: {
    id?: number | null;
  } | null;
  employmentDetails?: EmploymentDetailSummary[];
  latestSalary?: EmploymentDetailSummary | null;
}

interface EmploymentDetailSummary {
  id?: number;
  date?: string | null;
  employmentType?: string | null;
  employmentForm?: string | null;
  remunerationType?: string | null;
}

interface DivisionSummary {
  id: number;
  name?: string;
}

interface SalaryTypeSummary {
  id: number;
  name?: string;
}

interface SalarySpecificationSummary {
  amount?: number;
  description?: string;
  salaryType?: SalaryTypeSummary;
}

interface PayslipSummary {
  id?: number;
  grossAmount?: number;
  amount?: number;
  specifications?: SalarySpecificationSummary[];
}

interface SalaryTransactionSummary {
  id?: number;
  payslips?: PayslipSummary[];
}

interface AccountSummary {
  id: number;
  number?: number | string;
  name?: string;
}

interface VoucherPostingSummary {
  amount?: number;
  account?: {
    id?: number;
    number?: number | string;
  };
}

interface VoucherSummary {
  id?: number;
  number?: number | string;
  postings?: VoucherPostingSummary[];
}

interface PayrollPeriod {
  payrollMonth: string;
  year: number;
  month: number;
  startDate: string;
  endDate: string;
  transactionDate: string;
}

export const strategy = {
  strategyId: "12.repair-aware-payroll.v1",
  strategyPath: "src/tasks/task-12/strategies/repair-aware-payroll.ts",
  taskId: RUN_PAYROLL_WITH_BONUS_TASK_ID,
  name: "Repair-aware payroll",
  summary:
    "Runs payroll for one exact employee by reusing an existing payroll-ready employment when possible, repairing the standard underconfigured employee branch when needed, and only falling back to a manual voucher when the input explicitly allows it.",
  hypothesis:
    "Following the trusted payroll branch order exactly, especially the division-gated repair path before salary-type lookup, should recover the task-12 underconfigured employee failures without wasting calls on dead branches.",
  expectedCallProfile: {
    targetCalls: 6,
    maxCalls: 8,
  },
  stepOutline: [
    "API call 1: GET /employee by email and exact-match the employee locally.",
    "API call 2: Reuse embedded employments when decisive, otherwise GET /employee/employment, or GET /division first for the exact underconfigured branch.",
    "Repair branch: PUT /employee/{id} with placeholder dateOfBirth and POST /employee/employment when payroll prerequisites are missing but repairable.",
    "Payroll branch: GET /salary/type and POST /salary/transaction with embedded Fastlønn and Bonus specifications.",
    "Voucher fallback branch: if division lookup returns no usable rows and manual fallback is explicitly allowed, GET /ledger/account then POST /ledger/voucher.",
    "Verification branch: reuse the salary write response first, otherwise GET /salary/transaction/{id} and GET /salary/payslip/{id} with expanded specifications.",
  ],
  status: "draft",
  async run(
    ctx: StrategyContext,
    input: RunPayrollWithBonusInput,
  ): Promise<StrategyResult> {
    assertNonEmptyText(input.employeeEmail, "employeeEmail");
    assertPositiveNumber(input.baseSalaryNok, "baseSalaryNok");
    assertPositiveNumber(input.bonusAmountNok, "bonusAmountNok");

    const payrollPeriod = parsePayrollMonth(
      input.payrollMonth,
      ctx.clock.today(),
    );
    const normalizedEmployeeEmail = normalizeEmail(input.employeeEmail);
    const totalGross = input.baseSalaryNok + input.bonusAmountNok;

    const employeeResponse = await ctx.tripletex.get<ListResponse<EmployeeSummary>>(
      "/employee",
      {
        query: {
          email: normalizedEmployeeEmail,
          count: 10,
          fields: "*",
        },
      },
    );

    const employee = pickExactEmployee(
      employeeResponse.values ?? [],
      normalizedEmployeeEmail,
    );
    const notes = collectEmployeeNotes(employee, input);

    if (isUnderconfiguredEmployee(employee)) {
      const divisionResponse = await ctx.tripletex.get<ListResponse<DivisionSummary>>(
        "/division",
        {
          query: {
            count: 1,
            fields: "*",
          },
        },
      );
      const division = pickUsableDivision(divisionResponse.values ?? []);

      if (!division) {
        if (!input.allowManualVoucherFallback) {
          throw new Error(
            `Employee ${normalizedEmployeeEmail} is underconfigured for payroll and this account has no reusable division. Manual voucher fallback was not explicitly allowed.`,
          );
        }

        const accountResponse = await ctx.tripletex.get<ListResponse<AccountSummary>>(
          "/ledger/account",
          {
            query: {
              number: "5000,1920",
              fields: "*",
            },
          },
        );
        const salaryCostAccount = pickExactAccount(
          accountResponse.values ?? [],
          5000,
        );
        const bankAccount = pickExactAccount(accountResponse.values ?? [], 1920);

        const voucherResponse = await ctx.tripletex.post<ResponseWrapper<VoucherSummary>>(
          "/ledger/voucher",
          {
            body: {
              date: payrollPeriod.transactionDate,
              description: buildVoucherDescription(payrollPeriod),
              voucherType: null,
              postings: [
                {
                  row: 1,
                  date: payrollPeriod.transactionDate,
                  description: buildVoucherDescription(payrollPeriod),
                  account: { id: salaryCostAccount.id },
                  amount: totalGross,
                  amountCurrency: totalGross,
                  amountGross: totalGross,
                  amountGrossCurrency: totalGross,
                },
                {
                  row: 2,
                  date: payrollPeriod.transactionDate,
                  description: buildVoucherDescription(payrollPeriod),
                  account: { id: bankAccount.id },
                  amount: -totalGross,
                  amountCurrency: -totalGross,
                  amountGross: -totalGross,
                  amountGrossCurrency: -totalGross,
                },
              ],
            },
          },
        );

        const voucherId = requireId(voucherResponse.value?.id, "voucher");
        notes.push(
          `Manual voucher fallback was used because employee ${normalizedEmployeeEmail} was underconfigured and /division returned no reusable division.`,
        );

        assertVoucherMatches(
          voucherResponse.value,
          salaryCostAccount.id,
          bankAccount.id,
          totalGross,
        );

        return {
          createdEntityIds: {
            employeeId: employee.id,
            salaryCostAccountId: salaryCostAccount.id,
            bankAccountId: bankAccount.id,
            voucherId,
          },
          notes,
          verification: {
            branch: "manual-voucher-fallback",
            payrollMonth: payrollPeriod.payrollMonth,
            grossAmount: totalGross,
            voucherNumber: voucherResponse.value?.number,
          },
        };
      }

      if (!employee.dateOfBirth) {
        await ctx.tripletex.put<ResponseWrapper<EmployeeSummary>>(
          `/employee/${employee.id}`,
          {
            body: {
              dateOfBirth: "1990-01-01",
            },
          },
        );
        notes.push(
          `Employee ${normalizedEmployeeEmail} was repaired with placeholder dateOfBirth 1990-01-01 before payroll.`,
        );
      }

      const employmentResponse = await ctx.tripletex.post<
        ResponseWrapper<EmploymentSummary>
      >("/employee/employment", {
        body: {
          employee: { id: employee.id },
          division: { id: division.id },
          startDate: payrollPeriod.startDate,
          isMainEmployer: true,
          taxDeductionCode: "loennFraHovedarbeidsgiver",
        },
      });

      const createdEmploymentId = requireId(
        employmentResponse.value?.id,
        "employment",
      );

      return await runPayroll(
        ctx,
        input,
        payrollPeriod,
        employee,
        notes,
        totalGross,
        {
          repaired: true,
          divisionId: division.id,
          employmentId: createdEmploymentId,
        },
      );
    }

    const embeddedEmployment = pickDecisiveEmployment(
      employee.employments ?? [],
      payrollPeriod,
    );

    if (embeddedEmployment) {
      return await runPayroll(
        ctx,
        input,
        payrollPeriod,
        employee,
        notes,
        totalGross,
        {
          repaired: false,
          divisionId: embeddedEmployment.division?.id ?? undefined,
          employmentId: embeddedEmployment.id,
        },
      );
    }

    const employmentResponse = await ctx.tripletex.get<ListResponse<EmploymentSummary>>(
      "/employee/employment",
      {
        query: {
          employeeId: employee.id,
          count: 20,
          fields: "*",
        },
      },
    );
    const employment = pickDecisiveEmployment(
      employmentResponse.values ?? [],
      payrollPeriod,
    );

    if (!employment) {
      const activeEmployment = pickActiveEmployment(
        employmentResponse.values ?? [],
        payrollPeriod,
      );
      if (activeEmployment) {
        throw new Error(
          `Employee ${normalizedEmployeeEmail} has an active employment covering ${payrollPeriod.payrollMonth}, but it lacks payroll-ready employment details.`,
        );
      }

      const divisionResponse = await ctx.tripletex.get<ListResponse<DivisionSummary>>(
        "/division",
        {
          query: {
            count: 1,
            fields: "*",
          },
        },
      );
      const division = pickUsableDivision(divisionResponse.values ?? []);

      if (!division) {
        if (!input.allowManualVoucherFallback) {
          throw new Error(
            `Employee ${normalizedEmployeeEmail} does not have an active payroll-ready employment covering ${payrollPeriod.payrollMonth}, and this account has no reusable division to repair that state.`,
          );
        }

        const accountResponse = await ctx.tripletex.get<ListResponse<AccountSummary>>(
          "/ledger/account",
          {
            query: {
              number: "5000,1920",
              fields: "*",
            },
          },
        );
        const salaryCostAccount = pickExactAccount(
          accountResponse.values ?? [],
          5000,
        );
        const bankAccount = pickExactAccount(accountResponse.values ?? [], 1920);

        const voucherResponse = await ctx.tripletex.post<ResponseWrapper<VoucherSummary>>(
          "/ledger/voucher",
          {
            body: {
              date: payrollPeriod.transactionDate,
              description: buildVoucherDescription(payrollPeriod),
              voucherType: null,
              postings: [
                {
                  row: 1,
                  date: payrollPeriod.transactionDate,
                  description: buildVoucherDescription(payrollPeriod),
                  account: { id: salaryCostAccount.id },
                  amount: totalGross,
                  amountCurrency: totalGross,
                  amountGross: totalGross,
                  amountGrossCurrency: totalGross,
                },
                {
                  row: 2,
                  date: payrollPeriod.transactionDate,
                  description: buildVoucherDescription(payrollPeriod),
                  account: { id: bankAccount.id },
                  amount: -totalGross,
                  amountCurrency: -totalGross,
                  amountGross: -totalGross,
                  amountGrossCurrency: -totalGross,
                },
              ],
            },
          },
        );

        const voucherId = requireId(voucherResponse.value?.id, "voucher");
        notes.push(
          `Manual voucher fallback was used because employee ${normalizedEmployeeEmail} had no active payroll-ready employment for ${payrollPeriod.payrollMonth} and /division returned no reusable division.`,
        );

        assertVoucherMatches(
          voucherResponse.value,
          salaryCostAccount.id,
          bankAccount.id,
          totalGross,
        );

        return {
          createdEntityIds: {
            employeeId: employee.id,
            salaryCostAccountId: salaryCostAccount.id,
            bankAccountId: bankAccount.id,
            voucherId,
          },
          notes,
          verification: {
            branch: "manual-voucher-fallback",
            payrollMonth: payrollPeriod.payrollMonth,
            grossAmount: totalGross,
            voucherNumber: voucherResponse.value?.number,
          },
        };
      }

      if (!employee.dateOfBirth) {
        await ctx.tripletex.put<ResponseWrapper<EmployeeSummary>>(
          `/employee/${employee.id}`,
          {
            body: {
              dateOfBirth: "1990-01-01",
            },
          },
        );
        notes.push(
          `Employee ${normalizedEmployeeEmail} was repaired with placeholder dateOfBirth 1990-01-01 before payroll.`,
        );
      }

      const repairedEmploymentResponse = await ctx.tripletex.post<
        ResponseWrapper<EmploymentSummary>
      >("/employee/employment", {
        body: {
          employee: { id: employee.id },
          division: { id: division.id },
          startDate: payrollPeriod.startDate,
          isMainEmployer: true,
          taxDeductionCode: "loennFraHovedarbeidsgiver",
        },
      });

      const repairedEmploymentId = requireId(
        repairedEmploymentResponse.value?.id,
        "employment",
      );

      notes.push(
        `Employee ${normalizedEmployeeEmail} had no active payroll-ready employment for ${payrollPeriod.payrollMonth}, so the strategy created a payroll employment before running salary.`,
      );

      return await runPayroll(
        ctx,
        input,
        payrollPeriod,
        employee,
        notes,
        totalGross,
        {
          repaired: true,
          divisionId: division.id,
          employmentId: repairedEmploymentId,
        },
      );
    }

    return await runPayroll(
      ctx,
      input,
      payrollPeriod,
      employee,
      notes,
      totalGross,
      {
        repaired: false,
        divisionId: employment.division?.id ?? undefined,
        employmentId: employment.id,
      },
    );
  },
} satisfies RunPayrollWithBonusStrategy;

async function runPayroll(
  ctx: StrategyContext,
  input: RunPayrollWithBonusInput,
  payrollPeriod: PayrollPeriod,
  employee: EmployeeSummary,
  notes: string[],
  totalGross: number,
  prerequisiteState: {
    repaired: boolean;
    divisionId?: number;
    employmentId?: number;
  },
): Promise<StrategyResult> {
  const salaryTypeResponse = await ctx.tripletex.get<ListResponse<SalaryTypeSummary>>(
    "/salary/type",
    {
      query: {
        count: 1000,
        fields: "*",
      },
    },
  );
  const salaryTypes = salaryTypeResponse.values ?? [];
  const baseSalaryType = pickSalaryType(salaryTypes, "Fastlønn");
  const bonusType = pickSalaryType(salaryTypes, "Bonus");

  const salaryTransactionPayload = buildSalaryTransactionPayload(
    payrollPeriod,
    employee.id,
    input.baseSalaryNok,
    input.bonusAmountNok,
    baseSalaryType.id,
    bonusType.id,
  );

  const transaction = await createSalaryTransactionWithOneDepartmentRetry(
    ctx,
    salaryTransactionPayload,
    notes,
  );
  const salaryTransactionId = requireId(
    transaction.id,
    "salary transaction",
  );

  const writePayslip = transaction.payslips?.[0];
  let verifiedPayslip = writePayslip;
  let verifiedFromDetailedRead = false;

  if (
    !writeResponseAlreadyProvesPayroll(
      transaction,
      input.baseSalaryNok,
      input.bonusAmountNok,
      totalGross,
    )
  ) {
    const transactionRead = await ctx.tripletex.get<
      ResponseWrapper<SalaryTransactionSummary>
    >(`/salary/transaction/${salaryTransactionId}`, {
      query: {
        fields: "*",
      },
    });
    const payslipId = requireId(
      transactionRead.value?.payslips?.[0]?.id,
      "payslip",
    );
    const payslipResponse = await ctx.tripletex.get<ResponseWrapper<PayslipSummary>>(
      `/salary/payslip/${payslipId}`,
      {
        query: {
          fields: "*,specifications(*,salaryType(*))",
        },
      },
    );
    verifiedPayslip = payslipResponse.value;
    verifiedFromDetailedRead = true;
  }

  assertVerifiedPayslip(
    verifiedPayslip,
    baseSalaryType.id,
    bonusType.id,
    input.baseSalaryNok,
    input.bonusAmountNok,
    totalGross,
  );

  return {
    createdEntityIds: {
      employeeId: employee.id,
      ...(prerequisiteState.divisionId
        ? { divisionId: prerequisiteState.divisionId }
        : {}),
      ...(prerequisiteState.employmentId
        ? { employmentId: prerequisiteState.employmentId }
        : {}),
      salaryTransactionId,
      ...(typeof verifiedPayslip?.id === "number"
        ? { payslipId: verifiedPayslip.id }
        : {}),
    },
    notes,
    verification: {
      branch: prerequisiteState.repaired
        ? "repaired-payroll"
        : "existing-payroll-ready",
      payrollMonth: payrollPeriod.payrollMonth,
      salaryTransactionId,
      payslipId: verifiedPayslip?.id,
      grossAmount: verifiedPayslip?.grossAmount,
      amount: verifiedPayslip?.amount,
      specificationCount: verifiedPayslip?.specifications?.length,
      detailedVerificationRead: verifiedFromDetailedRead,
      salaryTypeIds: {
        fastlonn: baseSalaryType.id,
        bonus: bonusType.id,
      },
    },
  };
}

function buildSalaryTransactionPayload(
  payrollPeriod: PayrollPeriod,
  employeeId: number,
  baseSalaryNok: number,
  bonusAmountNok: number,
  baseSalaryTypeId: number,
  bonusTypeId: number,
): Record<string, unknown> {
  return {
    date: payrollPeriod.transactionDate,
    year: payrollPeriod.year,
    month: payrollPeriod.month,
    paySlipsAvailableDate: payrollPeriod.transactionDate,
    payslips: [
      {
        employee: { id: employeeId },
        date: payrollPeriod.transactionDate,
        year: payrollPeriod.year,
        month: payrollPeriod.month,
        specifications: [
          {
            employee: { id: employeeId },
            salaryType: { id: baseSalaryTypeId },
            description: `Fastlønn ${formatPayrollMonthLabel(payrollPeriod)}`,
            year: payrollPeriod.year,
            month: payrollPeriod.month,
            count: 1,
            rate: baseSalaryNok,
            amount: baseSalaryNok,
          },
          {
            employee: { id: employeeId },
            salaryType: { id: bonusTypeId },
            description: `Bonus ${formatPayrollMonthLabel(payrollPeriod)}`,
            year: payrollPeriod.year,
            month: payrollPeriod.month,
            count: 1,
            rate: bonusAmountNok,
            amount: bonusAmountNok,
          },
        ],
      },
    ],
  };
}

async function createSalaryTransactionWithOneDepartmentRetry(
  ctx: StrategyContext,
  payload: Record<string, unknown>,
  notes: string[],
): Promise<SalaryTransactionSummary> {
  try {
    const response = await ctx.tripletex.post<
      ResponseWrapper<SalaryTransactionSummary>
    >("/salary/transaction", {
      body: payload,
    });
    return response.value ?? {};
  } catch (error) {
    if (!isDepartmentAccountingError(error)) {
      throw error;
    }

    notes.push(
      "The first salary transaction attempt failed on department accounting, so the strategy retried once without any department fields.",
    );
    const retriedResponse = await ctx.tripletex.post<
      ResponseWrapper<SalaryTransactionSummary>
    >("/salary/transaction", {
      body: stripDepartmentFields(payload),
    });
    return retriedResponse.value ?? {};
  }
}

function stripDepartmentFields(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => stripDepartmentFields(entry));
  }

  if (value && typeof value === "object") {
    const normalized: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
      if (key === "department") {
        continue;
      }

      normalized[key] = stripDepartmentFields(entry);
    }
    return normalized;
  }

  return value;
}

function isDepartmentAccountingError(error: unknown): boolean {
  return (
    error instanceof TripletexHttpError &&
    error.status === 422 &&
    error.message.includes("avdelingsregnskap")
  );
}

function writeResponseAlreadyProvesPayroll(
  transaction: SalaryTransactionSummary,
  baseSalaryNok: number,
  bonusAmountNok: number,
  totalGross: number,
): boolean {
  const payslip = transaction.payslips?.[0];
  if (!payslip) {
    return false;
  }

  if (payslip.grossAmount !== totalGross || payslip.amount !== totalGross) {
    return false;
  }

  const specifications = payslip.specifications ?? [];
  if (specifications.length !== 2) {
    return false;
  }

  const amounts = specifications
    .map((specification) => specification.amount)
    .filter((amount): amount is number => typeof amount === "number")
    .sort((left, right) => left - right);

  return amounts.length === 2 && amounts[0] === bonusAmountNok && amounts[1] === baseSalaryNok;
}

function assertVerifiedPayslip(
  payslip: PayslipSummary | undefined,
  baseSalaryTypeId: number,
  bonusTypeId: number,
  baseSalaryNok: number,
  bonusAmountNok: number,
  totalGross: number,
): void {
  if (!payslip) {
    throw new Error("Verification failed: missing payslip.");
  }

  if (payslip.grossAmount !== totalGross) {
    throw new Error(
      `Verification failed: grossAmount=${payslip.grossAmount}, expected=${totalGross}.`,
    );
  }

  if (payslip.amount !== totalGross) {
    throw new Error(
      `Verification failed: amount=${payslip.amount}, expected=${totalGross}.`,
    );
  }

  const specifications = payslip.specifications ?? [];
  if (specifications.length !== 2) {
    throw new Error(
      `Verification failed: specCount=${specifications.length}, expected=2.`,
    );
  }

  const baseSalaryLine = specifications.find((specification) =>
    sameSalaryType(specification.salaryType, baseSalaryTypeId, "Fastlønn"),
  );
  if (!baseSalaryLine || baseSalaryLine.amount !== baseSalaryNok) {
    throw new Error(
      `Verification failed: missing Fastlønn line with amount ${baseSalaryNok}.`,
    );
  }

  const bonusLine = specifications.find((specification) =>
    sameSalaryType(specification.salaryType, bonusTypeId, "Bonus"),
  );
  if (!bonusLine || bonusLine.amount !== bonusAmountNok) {
    throw new Error(
      `Verification failed: missing Bonus line with amount ${bonusAmountNok}.`,
    );
  }
}

function sameSalaryType(
  salaryType: SalaryTypeSummary | undefined,
  wantedId: number,
  wantedName: string,
): boolean {
  if (salaryType?.id === wantedId) {
    return true;
  }

  return normalizeText(salaryType?.name) === normalizeText(wantedName);
}

function assertVoucherMatches(
  voucher: VoucherSummary | undefined,
  salaryCostAccountId: number,
  bankAccountId: number,
  totalGross: number,
): void {
  if (typeof voucher?.id !== "number") {
    throw new Error("Tripletex did not return a voucher id.");
  }

  const postings = voucher.postings ?? [];
  if (postings.length === 0) {
    return;
  }

  const salaryCostPosting = postings.find(
    (posting) => posting.account?.id === salaryCostAccountId,
  );
  const bankPosting = postings.find(
    (posting) => posting.account?.id === bankAccountId,
  );

  if (salaryCostPosting && salaryCostPosting.amount !== totalGross) {
    throw new Error(
      `Voucher verification failed: salary cost posting amount=${salaryCostPosting.amount}, expected=${totalGross}.`,
    );
  }

  if (bankPosting && bankPosting.amount !== -totalGross) {
    throw new Error(
      `Voucher verification failed: bank posting amount=${bankPosting.amount}, expected=${-totalGross}.`,
    );
  }
}

function pickExactEmployee(
  employees: readonly EmployeeSummary[],
  normalizedEmployeeEmail: string,
): EmployeeSummary {
  const matches = employees.filter(
    (employee) => normalizeEmail(employee.email) === normalizedEmployeeEmail,
  );

  if (matches.length === 0) {
    throw new Error(
      `Expected an existing employee with email ${normalizedEmployeeEmail}, but none was found.`,
    );
  }

  if (matches.length > 1) {
    throw new Error(
      `Expected exactly one employee with email ${normalizedEmployeeEmail}, but found ${matches.length}.`,
    );
  }

  return matches[0];
}

function collectEmployeeNotes(
  employee: EmployeeSummary,
  input: RunPayrollWithBonusInput,
): string[] {
  const notes: string[] = [];
  const promptName = input.employeeName?.trim();
  const matchedName = getEmployeeDisplayName(employee);

  if (
    promptName &&
    matchedName &&
    !sameText(promptName, matchedName)
  ) {
    notes.push(
      `Employee lookup matched email ${normalizeEmail(input.employeeEmail)}, but the stored name "${matchedName}" differed from extracted input "${promptName}".`,
    );
  }

  return notes;
}

function getEmployeeDisplayName(employee: EmployeeSummary): string | undefined {
  const displayName = employee.displayName?.trim();
  if (displayName) {
    return displayName;
  }

  const compositeName = `${employee.firstName ?? ""} ${employee.lastName ?? ""}`.trim();
  return compositeName.length > 0 ? compositeName : undefined;
}

function isUnderconfiguredEmployee(employee: EmployeeSummary): boolean {
  return !employee.dateOfBirth && (employee.employments ?? []).length === 0;
}

function pickActiveEmployment(
  employments: readonly EmploymentSummary[],
  payrollPeriod: PayrollPeriod,
): EmploymentSummary | undefined {
  return employments.find(
    (employment) =>
      coversPayrollPeriod(employment, payrollPeriod) &&
      typeof employment.division?.id === "number",
  );
}

function pickDecisiveEmployment(
  employments: readonly EmploymentSummary[],
  payrollPeriod: PayrollPeriod,
): EmploymentSummary | undefined {
  return employments.find(
    (employment) =>
      coversPayrollPeriod(employment, payrollPeriod) &&
      typeof employment.division?.id === "number" &&
      hasPayrollDetails(employment, payrollPeriod),
  );
}

function hasPayrollDetails(
  employment: EmploymentSummary,
  payrollPeriod: PayrollPeriod,
): boolean {
  if (employment.latestSalary) {
    return true;
  }

  return (employment.employmentDetails ?? []).some((detail) => {
    if (!detail) {
      return false;
    }

    if (detail.date && detail.date > payrollPeriod.endDate) {
      return false;
    }

    return Boolean(
      detail.employmentType ||
      detail.employmentForm ||
      detail.remunerationType,
    );
  });
}

function coversPayrollPeriod(
  employment: EmploymentSummary,
  payrollPeriod: PayrollPeriod,
): boolean {
  const startDate = employment.startDate ?? "";
  const endDate = employment.endDate ?? "";
  const startsBeforePeriodEnds =
    startDate.length === 0 || startDate <= payrollPeriod.endDate;
  const endsAfterPeriodStarts =
    endDate.length === 0 || endDate >= payrollPeriod.startDate;

  return startsBeforePeriodEnds && endsAfterPeriodStarts;
}

function pickUsableDivision(
  divisions: readonly DivisionSummary[],
): DivisionSummary | undefined {
  return divisions.find((division) => typeof division.id === "number");
}

function pickSalaryType(
  salaryTypes: readonly SalaryTypeSummary[],
  wantedName: string,
): SalaryTypeSummary {
  const normalizedWantedName = normalizeText(wantedName);

  const exactMatch = salaryTypes.find(
    (salaryType) => normalizeText(salaryType.name) === normalizedWantedName,
  );
  if (exactMatch) {
    return exactMatch;
  }

  const partialMatch = salaryTypes.find((salaryType) =>
    normalizeText(salaryType.name).includes(normalizedWantedName),
  );
  if (partialMatch) {
    return partialMatch;
  }

  throw new Error(`Tripletex did not return salary type ${wantedName}.`);
}

function pickExactAccount(
  accounts: readonly AccountSummary[],
  wantedNumber: number,
): AccountSummary {
  const account = accounts.find(
    (candidate) => normalizeAccountNumber(candidate.number) === wantedNumber,
  );

  if (!account) {
    throw new Error(`Tripletex did not return ledger account ${wantedNumber}.`);
  }

  return account;
}

function normalizeAccountNumber(value: number | string | undefined): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim().length > 0) {
    const numericValue = Number(value.trim());
    return Number.isFinite(numericValue) ? numericValue : undefined;
  }

  return undefined;
}

function requireId(value: number | undefined, entityName: string): number {
  if (typeof value !== "number") {
    throw new Error(`Tripletex did not return a ${entityName} id.`);
  }

  return value;
}

function parsePayrollMonth(
  payrollMonth: string,
  today: string,
): PayrollPeriod {
  const match = /^(\d{4})-(\d{2})$/.exec(payrollMonth.trim());
  if (!match) {
    throw new Error("payrollMonth must be in YYYY-MM format.");
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    throw new Error("payrollMonth must be a valid YYYY-MM value.");
  }

  const startDate = `${match[1]}-${match[2]}-01`;
  const endDate = lastDayOfMonth(year, month);
  const transactionDate =
    today.startsWith(`${match[1]}-${match[2]}-`) ? today : startDate;

  return {
    payrollMonth: `${match[1]}-${match[2]}`,
    year,
    month,
    startDate,
    endDate,
    transactionDate,
  };
}

function lastDayOfMonth(year: number, month: number): string {
  const date = new Date(Date.UTC(year, month, 0));
  return date.toISOString().slice(0, 10);
}

function buildVoucherDescription(payrollPeriod: PayrollPeriod): string {
  return `Payroll fallback ${payrollPeriod.payrollMonth}`;
}

function formatPayrollMonthLabel(payrollPeriod: PayrollPeriod): string {
  return payrollPeriod.payrollMonth;
}

function assertNonEmptyText(value: unknown, fieldName: string): void {
  if (String(value ?? "").trim().length === 0) {
    throw new Error(`${fieldName} must be a non-empty string.`);
  }
}

function assertPositiveNumber(value: unknown, fieldName: string): void {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) {
    throw new Error(`${fieldName} must be a positive number.`);
  }
}

function normalizeEmail(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

function normalizeText(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

function sameText(left: unknown, right: unknown): boolean {
  return String(left ?? "").localeCompare(String(right ?? ""), undefined, { sensitivity: "base" }) === 0;
}
