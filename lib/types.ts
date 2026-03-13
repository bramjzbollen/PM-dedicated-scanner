// ─── Trading Types ───
export interface TradingMetrics {
  winRate: number;
  profitLoss: number;
  tradesPerHour: number;
  walletSize: number;
  avgHoldTimeSeconds: number;
  trades24h: number;
}

export interface Trade {
  id: string;
  symbol: string;
  type: 'LONG' | 'SHORT';
  entryPrice: number;
  currentPrice: number;
  quantity: number;
  leverage: number;
  profitLoss: number;
  profitLossPercent: number;
  status: 'OPEN' | 'CLOSED';
  entryTime: Date;
  closeTime?: Date;
}

export interface CryptoPrice {
  symbol: string;
  price: number;
  change24h: number;
  volume24h: number;
  lastUpdate: Date;
}

export interface TradingSignal {
  id: string;
  symbol: string;
  type: 'LONG' | 'SHORT';
  strength: number;
  price: number;
  stochRSI_K: number;
  stochRSI_D: number;
  timestamp: Date;
}

// ─── Agent Types ───
export interface AgentTask {
  id: string;
  title: string;
  description: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'cancelled';
  progress: number;
  eta?: string;
  startedAt?: Date;
  completedAt?: Date;
  cancelledAt?: Date;
  sessionKey?: string;
  agentName?: string;
}

export interface Agent {
  id: string;
  name: string;
  role: string;
  status: 'active' | 'idle' | 'offline';
  health: number;
  currentTask?: string;
  tasksCompleted: number;
  uptime: string;
  lastSeen: Date;
}

export interface TaskQueue {
  pending: number;
  inProgress: number;
  completed: number;
  failed: number;
  cancelled: number;
}

// ─── Hierarchical Agent Types ───
export interface HierarchicalAgent {
  id: string;
  name: string;
  emoji: string;
  avatar?: string; // path to avatar image (e.g. /avatars/jos.png)
  role: string;
  status: 'idle' | 'working' | 'done' | 'blocked';
  model?: {
    primary: string;
    fallbacks?: string[];
  };
  skills?: string[];
  currentTask?: {
    title: string;
    progress: number;
    eta?: string;
  };
  children?: HierarchicalAgent[];
}

// ─── Planning Types ───
export interface PlanningTask {
  id: string;
  title: string;
  description?: string;
  status: 'todo' | 'in-progress' | 'done' | 'blocked';
  deadline?: string; // ISO date string
  progress: number; // 0-100%
  category: 'prive' | 'planb-task' | 'planb-project';
  tags?: string[];
  createdAt: string;
  updatedAt: string;
}

// ─── Finance Types ───
export interface Invoice {
  id: string;
  invoiceNumber: string;
  client: string;
  amount: number;
  amountIncl: number;
  unpaid: number;
  date: string;
  dueDate: string;
  paidAt: string | null;
  reference: string;
  status: 'paid' | 'open' | 'overdue' | 'unpaid';
  url: string;
}

export interface Estimate {
  id: string;
  estimateNumber: string;
  client: string;
  amount: number;
  amountIncl: number;
  date: string;
  reference: string;
  status: 'sent' | 'accepted' | 'rejected' | 'pending';
  url: string;
}

export interface MonthlyRevenue {
  month: string;
  revenue: number;
}

export interface FinanceKPIs {
  totalRevenueYTD: number;
  outstandingAmount: number;
  pendingEstimatesAmount: number;
  pendingEstimatesCount: number;
  avgPaymentDays: number;
  totalInvoicesThisYear: number;
  avgInvoiceValue: number;
  paidCount: number;
  openCount: number;
  overdueCount: number;
}

export interface FinanceDashboardResponse {
  kpis: FinanceKPIs;
  invoices: Invoice[];
  estimates: Estimate[];
  monthlyRevenue: MonthlyRevenue[];
  lastUpdated: string;
  error?: string;
}

// ─── Weather Types ───
export interface WeatherData {
  location: string;
  temperature: number;
  feelsLike: number;
  condition: string;
  icon: string;
  humidity: number;
  windSpeed: number;
  forecast: WeatherForecast[];
}

export interface WeatherForecast {
  date: string;
  tempMin: number;
  tempMax: number;
  condition: string;
  icon: string;
}

// ─── Bitcoin Types ───
export interface BitcoinData {
  price: number;
  change24h: number;
  changePercent24h: number;
  high24h: number;
  low24h: number;
  marketCap: number;
  sparkline: number[];
}
