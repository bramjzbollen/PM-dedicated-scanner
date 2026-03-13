// Moneybird MCP Client - Read-only API integration
// Uses MCP (Model Context Protocol) via Streamable HTTP

const MCP_URL = process.env.MONEYBIRD_MCP_URL || 'https://moneybird.com/mcp/v1/read_only';
const API_TOKEN = process.env.MONEYBIRD_API_TOKEN || '';

interface MCPResponse {
  jsonrpc: string;
  id: number;
  result?: {
    content: Array<{ type: string; text: string }>;
    isError: boolean;
  };
  error?: { code: number; message: string };
}

let requestId = 0;

// Simple delay helper
function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function mcpCall<T>(toolName: string, args: Record<string, unknown> = {}, retries = 2): Promise<T> {
  requestId++;

  const body = JSON.stringify({
    jsonrpc: '2.0',
    id: requestId,
    method: 'tools/call',
    params: { name: toolName, arguments: args },
  });

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch(MCP_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${API_TOKEN}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json, text/event-stream',
        },
        body,
        next: { revalidate: 300 }, // Cache for 5 minutes
      });

      if (!response.ok) {
        throw new Error(`Moneybird MCP HTTP ${response.status}: ${response.statusText}`);
      }

      const data: MCPResponse = await response.json();

      if (data.error) {
        throw new Error(`MCP error: ${data.error.message}`);
      }

      const text = data.result?.content?.[0]?.text;
      if (!text) {
        throw new Error('Empty response from Moneybird MCP');
      }

      // Check for error messages in text (API sometimes returns error text with isError: false)
      if (text.includes('API Error:') || text.startsWith('Error:') || text.includes('Too Many Requests') || text.includes('Rate limit')) {
        const isRateLimit = text.includes('429') || text.includes('Rate limit') || text.includes('Too Many Requests');
        if (isRateLimit && attempt < retries) {
          console.warn(`Rate limited on ${toolName}, retrying in ${3000 * (attempt + 1)}ms...`);
          await delay(3000 * (attempt + 1));
          continue;
        }
        throw new Error(text);
      }

      if (data.result?.isError) {
        throw new Error(`Moneybird error: ${text}`);
      }

      // Try to parse the JSON response
      try {
        return JSON.parse(text) as T;
      } catch {
        throw new Error(`Invalid JSON from Moneybird: ${text.substring(0, 200)}`);
      }
    } catch (err) {
      if (attempt < retries && err instanceof Error && (err.message.includes('429') || err.message.includes('Rate limit'))) {
        await delay(2000 * (attempt + 1));
        continue;
      }
      throw err;
    }
  }

  throw new Error('Max retries exceeded for Moneybird MCP call');
}

// ─── Moneybird API Types ───

export interface MoneybirdContact {
  id: string;
  company_name: string;
  firstname: string;
  lastname: string;
}

export interface MoneybirdInvoiceDetail {
  id: string;
  description: string;
  price: string;
  amount: string;
  amount_decimal: string;
  total_price_excl_tax_with_discount: string;
  total_price_excl_tax_with_discount_base: string;
}

export interface MoneybirdInvoice {
  id: string;
  invoice_id: string;
  contact_id: string;
  contact: MoneybirdContact;
  state: 'draft' | 'open' | 'scheduled' | 'pending_payment' | 'late' | 'reminded' | 'paid' | 'uncollectible';
  invoice_date: string;
  due_date: string;
  paid_at: string | null;
  sent_at: string | null;
  reference: string;
  currency: string;
  total_price_excl_tax: string;
  total_price_excl_tax_base: string;
  total_price_incl_tax: string;
  total_price_incl_tax_base: string;
  total_paid: string;
  total_unpaid: string;
  total_unpaid_base: string;
  total_discount: string;
  details: MoneybirdInvoiceDetail[];
  payments: unknown[];
  reminder_count: number;
  url: string;
}

export interface MoneybirdEstimate {
  id: string;
  estimate_id: string;
  contact_id: string;
  contact: MoneybirdContact;
  state: 'draft' | 'open' | 'late' | 'accepted' | 'rejected' | 'billed' | 'archived';
  estimate_date: string;
  due_date: string | null;
  reference: string;
  currency: string;
  total_price_excl_tax: string;
  total_price_excl_tax_base: string;
  total_price_incl_tax: string;
  total_price_incl_tax_base: string;
  total_discount: string;
  details: MoneybirdInvoiceDetail[];
  url: string;
  sent_at: string | null;
  accepted_at: string | null;
  rejected_at: string | null;
}

export interface MoneybirdProfitLoss {
  total_revenue: string;
  total_expenses: string;
  gross_profit: string;
  operating_profit: string;
  net_profit: string;
  revenue_by_ledger_account: {
    ledger_accounts: Array<{ ledger_account_id: string; value: string }>;
  };
}

// ─── Data Fetching Functions ───

export async function fetchInvoices(filter = 'period:this_year,state:all', perPage = '100'): Promise<MoneybirdInvoice[]> {
  return mcpCall<MoneybirdInvoice[]>('list_invoices', { filter, per_page: perPage });
}

export async function fetchEstimates(filter = 'period:this_year,state:all', perPage = '100'): Promise<MoneybirdEstimate[]> {
  return mcpCall<MoneybirdEstimate[]>('list_estimates', { filter, per_page: perPage });
}

export async function fetchProfitLoss(period = 'this_year'): Promise<MoneybirdProfitLoss> {
  return mcpCall<MoneybirdProfitLoss>('profit_loss_report', { period });
}

/**
 * Calculate monthly revenue from invoice data instead of making 12 separate API calls.
 * Shows all 12 months of 2026 (Jan-Dec).
 */
export function calculateMonthlyRevenue(invoices: MoneybirdInvoice[]): Array<{ month: string; revenue: number }> {
  const monthMap = new Map<string, number>();

  // Initialize all 12 months of 2026
  for (let m = 1; m <= 12; m++) {
    monthMap.set(`2026${String(m).padStart(2, '0')}`, 0);
  }

  // Sum invoice amounts by month (exclude drafts)
  for (const inv of invoices) {
    if (inv.state === 'draft') continue;
    if (!inv.invoice_date) continue;

    const date = new Date(inv.invoice_date);
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const key = `${yyyy}${mm}`;

    if (monthMap.has(key)) {
      monthMap.set(key, (monthMap.get(key) || 0) + parseFloat(inv.total_price_excl_tax || '0'));
    }
  }

  // Convert to sorted array
  return Array.from(monthMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, revenue]) => ({ month, revenue }));
}

/**
 * Fetch monthly revenue via sequential P&L API calls with rate limit protection.
 * Use this for accurate revenue data; falls back to invoice-based calculation on error.
 */
export async function fetchMonthlyRevenue(
  months: string[],
  invoiceFallback?: MoneybirdInvoice[]
): Promise<Array<{ month: string; revenue: number }>> {
  const results: Array<{ month: string; revenue: number }> = [];

  // Process sequentially with delay to avoid rate limits
  for (const month of months) {
    try {
      await delay(300); // 300ms between calls
      const data = await mcpCall<MoneybirdProfitLoss>('profit_loss_report', { period: month });
      results.push({ month, revenue: parseFloat(data.total_revenue || '0') });
    } catch (err) {
      console.warn(`Failed to fetch P&L for ${month}:`, err instanceof Error ? err.message : err);
      // If we hit rate limits, fall back to invoice-based calculation
      if (err instanceof Error && (err.message.includes('429') || err.message.includes('Rate limit'))) {
        console.log('Rate limited — falling back to invoice-based monthly revenue');
        if (invoiceFallback) {
          return calculateMonthlyRevenue(invoiceFallback);
        }
      }
      results.push({ month, revenue: 0 });
    }
  }

  return results;
}

// ─── Aggregated Data Functions ───

export interface FinanceDashboardData {
  invoices: MoneybirdInvoice[];
  estimates: MoneybirdEstimate[];
  profitLoss: MoneybirdProfitLoss;
  monthlyRevenue: Array<{ month: string; revenue: number }>;
}

export async function fetchFinanceDashboardData(): Promise<FinanceDashboardData> {
  // Fetch the three main data points first (parallel is fine for 3 calls)
  const [invoices, estimates, profitLoss] = await Promise.all([
    fetchInvoices(),
    fetchEstimates(),
    fetchProfitLoss(),
  ]);

  // Calculate monthly revenue from invoices (fast, no extra API calls)
  const monthlyRevenue = calculateMonthlyRevenue(invoices);

  return { invoices, estimates, profitLoss, monthlyRevenue };
}
