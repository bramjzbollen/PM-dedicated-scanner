import { NextResponse } from 'next/server';
import {
  fetchInvoices,
  fetchEstimates,
  fetchProfitLoss,
  calculateMonthlyRevenue,
  type MoneybirdInvoice,
  type MoneybirdEstimate,
  type MoneybirdProfitLoss,
} from '@/lib/moneybird-client';

export const dynamic = 'force-dynamic';

// Format month code (YYYYMM) to label
function formatMonthLabel(code: string): string {
  const year = code.substring(2, 4);
  const monthNum = parseInt(code.substring(4, 6));
  const monthNames = ['Jan', 'Feb', 'Mrt', 'Apr', 'Mei', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dec'];
  return `${monthNames[monthNum - 1]} '${year}`;
}

function computeKPIs(
  invoices: MoneybirdInvoice[],
  estimates: MoneybirdEstimate[],
  profitLoss: MoneybirdProfitLoss
) {
  const totalRevenueYTD = parseFloat(profitLoss.total_revenue || '0');

  const openInvoices = invoices.filter(i => ['open', 'late', 'reminded', 'pending_payment'].includes(i.state));
  const outstandingAmount = openInvoices.reduce((sum, i) => sum + parseFloat(i.total_unpaid || '0'), 0);

  const paidInvoices = invoices.filter(i => i.state === 'paid');
  const totalInvoicesThisYear = invoices.filter(i => i.state !== 'draft').length;

  const avgInvoiceValue = totalInvoicesThisYear > 0
    ? invoices.filter(i => i.state !== 'draft').reduce((s, i) => s + parseFloat(i.total_price_excl_tax || '0'), 0) / totalInvoicesThisYear
    : 0;

  // Calculate average payment days for paid invoices
  let avgPaymentDays = 0;
  if (paidInvoices.length > 0) {
    const totalDays = paidInvoices.reduce((sum, inv) => {
      if (inv.paid_at && inv.invoice_date) {
        const invoiceDate = new Date(inv.invoice_date);
        const paidDate = new Date(inv.paid_at);
        return sum + Math.max(0, Math.round((paidDate.getTime() - invoiceDate.getTime()) / (1000 * 60 * 60 * 24)));
      }
      return sum;
    }, 0);
    avgPaymentDays = Math.round(totalDays / paidInvoices.length);
  }

  // Pending estimates
  const pendingEstimates = estimates.filter(e => ['open', 'late'].includes(e.state));
  const pendingEstimatesAmount = pendingEstimates.reduce((s, e) => s + parseFloat(e.total_price_excl_tax || '0'), 0);

  // Overdue invoices
  const overdueInvoices = invoices.filter(i => i.state === 'late' || i.state === 'reminded');

  return {
    totalRevenueYTD,
    outstandingAmount,
    pendingEstimatesAmount,
    pendingEstimatesCount: pendingEstimates.length,
    avgPaymentDays,
    totalInvoicesThisYear,
    avgInvoiceValue,
    paidCount: paidInvoices.length,
    openCount: openInvoices.length,
    overdueCount: overdueInvoices.length,
  };
}

function transformInvoices(invoices: MoneybirdInvoice[]) {
  return invoices
    .filter(i => i.state !== 'draft')
    .sort((a, b) => new Date(b.invoice_date).getTime() - new Date(a.invoice_date).getTime())
    .map(inv => ({
      id: inv.id,
      invoiceNumber: inv.invoice_id,
      client: inv.contact?.company_name || `${inv.contact?.firstname || ''} ${inv.contact?.lastname || ''}`.trim() || 'Onbekend',
      amount: parseFloat(inv.total_price_excl_tax || '0'),
      amountIncl: parseFloat(inv.total_price_incl_tax || '0'),
      unpaid: parseFloat(inv.total_unpaid || '0'),
      date: inv.invoice_date,
      dueDate: inv.due_date,
      paidAt: inv.paid_at,
      reference: inv.reference,
      status: inv.state === 'paid' ? 'paid' as const
        : (inv.state === 'late' || inv.state === 'reminded') ? 'overdue' as const
        : inv.state === 'open' ? 'open' as const
        : 'unpaid' as const,
      url: inv.url,
    }));
}

function transformEstimates(estimates: MoneybirdEstimate[]) {
  return estimates
    .sort((a, b) => {
      const dateA = a.estimate_date ? new Date(a.estimate_date).getTime() : 0;
      const dateB = b.estimate_date ? new Date(b.estimate_date).getTime() : 0;
      return dateB - dateA;
    })
    .map(est => ({
      id: est.id,
      estimateNumber: est.estimate_id || 'Concept',
      client: est.contact?.company_name || `${est.contact?.firstname || ''} ${est.contact?.lastname || ''}`.trim() || 'Onbekend',
      amount: parseFloat(est.total_price_excl_tax || '0'),
      amountIncl: parseFloat(est.total_price_incl_tax || '0'),
      date: est.estimate_date || '',
      reference: est.reference,
      status: est.state === 'accepted' ? 'accepted' as const
        : est.state === 'rejected' ? 'rejected' as const
        : est.state === 'draft' ? 'pending' as const
        : (est.state === 'open' || est.state === 'late') ? 'sent' as const
        : est.state === 'billed' ? 'accepted' as const
        : 'pending' as const,
      url: est.url,
    }));
}

export async function GET() {
  try {
    // Fetch all 3 endpoints in parallel — filtered to boekjaar 2026
    const [invoices, estimates, profitLoss] = await Promise.all([
      fetchInvoices('period:202601..202612,state:all'),
      fetchEstimates('period:202601..202612,state:all'),
      fetchProfitLoss('this_year'),
    ]);

    const kpis = computeKPIs(invoices, estimates, profitLoss);
    const transformedInvoices = transformInvoices(invoices);
    const transformedEstimates = transformEstimates(estimates);

    // Calculate monthly revenue from invoices (no extra API calls needed)
    const monthlyRevenueRaw = calculateMonthlyRevenue(invoices);
    const monthlyRevenue = monthlyRevenueRaw.map(m => ({
      month: formatMonthLabel(m.month),
      revenue: m.revenue,
    }));

    return NextResponse.json({
      kpis,
      invoices: transformedInvoices,
      estimates: transformedEstimates,
      monthlyRevenue,
      lastUpdated: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Moneybird API error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch Moneybird data' },
      { status: 500 }
    );
  }
}
