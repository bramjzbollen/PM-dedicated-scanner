// Legacy mock data - no longer used.
// Finance data is now fetched from Moneybird API via /api/moneybird route.
// This file is kept for backward compatibility in case any other components reference it.

import type { Invoice, Estimate, MonthlyRevenue, FinanceKPIs } from './types';

export const getMockInvoices = (): Invoice[] => [];
export const getMockEstimates = (): Estimate[] => [];
export const getMockMonthlyRevenue = (): MonthlyRevenue[] => [];
export const getMockFinanceKPIs = (): FinanceKPIs => ({
  totalRevenueYTD: 0,
  outstandingAmount: 0,
  pendingEstimatesAmount: 0,
  pendingEstimatesCount: 0,
  avgPaymentDays: 0,
  totalInvoicesThisYear: 0,
  avgInvoiceValue: 0,
  paidCount: 0,
  openCount: 0,
  overdueCount: 0,
});
