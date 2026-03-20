import type { ActiveStrategySelectionConfig } from "../runtime/contracts";
import {
  createActiveStrategyResolver,
  loadActiveStrategySelectionConfig,
} from "./active-strategy-selection";
import {
  CANONICAL_TASK_REGISTRY,
  slugToTxTaskId,
  txTaskIdToSlug,
} from "./legacy-tripletex1-task-bridge";
import { createTaskRegistry } from "./task-registry";
import { taskRegistration as createCustomerTask } from "../tasks/task-create-customer/task";
import { taskRegistration as createSupplierTask } from "../tasks/task-create-supplier/task";
import { taskRegistration as createDepartmentTask } from "../tasks/task-create-department/task";
import { taskRegistration as createProductTask } from "../tasks/task-create-product/task";
import { taskRegistration as createProjectTask } from "../tasks/task-create-project/task";
import { taskRegistration as createEmployeeTask } from "../tasks/task-create-employee/task";
import { taskRegistration as createAccountingDimensionAndPostVoucherTask } from "../tasks/task-create-accounting-dimension-and-post-voucher/task";
import { taskRegistration as createAndSendInvoiceTask } from "../tasks/task-create-and-send-invoice/task";
import { taskRegistration as createCustomerInvoiceTask } from "../tasks/task-create-customer-invoice/task";
import { taskRegistration as issueFullCreditNoteTask } from "../tasks/task-issue-full-credit-note/task";
import { taskRegistration as createOrderInvoiceAndRegisterPaymentTask } from "../tasks/task-create-order-invoice-and-register-payment/task";
import { taskRegistration as runPayrollWithBonusTask } from "../tasks/task-run-payroll-with-bonus/task";
import { taskRegistration as registerTravelExpenseTask } from "../tasks/task-register-travel-expense/task";
import { taskRegistration as setProjectFixedPriceAndInvoiceMilestoneTask } from "../tasks/task-set-project-fixed-price-and-invoice-milestone/task";
import { taskRegistration as registerProjectHoursAndCreateProjectInvoiceTask } from "../tasks/task-register-project-hours-and-create-project-invoice/task";
import { taskRegistration as registerSupplierInvoiceTask } from "../tasks/task-register-supplier-invoice/task";
import { taskRegistration as registerCustomerInvoicePaymentTask } from "../tasks/task-register-customer-invoice-payment/task";
import { taskRegistration as reverseCustomerInvoicePaymentTask } from "../tasks/task-reverse-customer-invoice-payment/task";

const implementedTaskRegistrations = [
  createCustomerTask,
  createSupplierTask,
  createDepartmentTask,
  createProductTask,
  createProjectTask,
  createEmployeeTask,
  createAccountingDimensionAndPostVoucherTask,
  createAndSendInvoiceTask,
  createCustomerInvoiceTask,
  issueFullCreditNoteTask,
  createOrderInvoiceAndRegisterPaymentTask,
  runPayrollWithBonusTask,
  registerTravelExpenseTask,
  setProjectFixedPriceAndInvoiceMilestoneTask,
  registerProjectHoursAndCreateProjectInvoiceTask,
  registerSupplierInvoiceTask,
  registerCustomerInvoicePaymentTask,
  reverseCustomerInvoicePaymentTask,
] as const;
const implementedTaskRegistrationsById = new Map(
  implementedTaskRegistrations.map((registration) => [
    registration.task.taskId,
    registration,
  ]),
);

export const taskRegistrations = CANONICAL_TASK_REGISTRY.map((canonicalTask) => {
  const registration = implementedTaskRegistrationsById.get(canonicalTask.taskId);
  if (!registration) {
    throw new Error("Missing task registration for canonical task \"" + canonicalTask.taskId + "\".");
  }

  return registration;
});
export const DEFAULT_ACTIVE_STRATEGY_SELECTION_CONFIG_PATH =
  "configs/active-strategies.json";

export const taskRegistry = createTaskRegistry(taskRegistrations);

export const taskSpecs = taskRegistry.taskSpecs;

export { slugToTxTaskId, txTaskIdToSlug };

export const listTaskIds = (): readonly string[] => taskRegistry.listTaskIds();

export const hasTask = (taskId: string): boolean => taskRegistry.hasTask(taskId);

export const getTaskSpec = (taskId: string) => taskRegistry.getTaskSpec(taskId);

export const requireTaskSpec = (taskId: string) =>
  taskRegistry.requireTaskSpec(taskId);

export const loadTaskModule = (taskId: string) =>
  taskRegistry.loadTaskModule(taskId);

export const requireTaskModule = (taskId: string) =>
  taskRegistry.requireTaskModule(taskId);

export const loadActiveStrategyResolver = async (
  configPath: string = DEFAULT_ACTIVE_STRATEGY_SELECTION_CONFIG_PATH,
  configOverride?: ActiveStrategySelectionConfig,
) => {
  if (configOverride) {
    return createActiveStrategyResolver({
      registry: taskRegistry,
      config: configOverride,
      configPath: "inline-override",
    });
  }

  const loadedConfig = await loadActiveStrategySelectionConfig(configPath);

  return createActiveStrategyResolver({
    registry: taskRegistry,
    ...loadedConfig,
  });
};
