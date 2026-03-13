import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface MetricsCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  trend?: 'up' | 'down' | 'neutral';
  icon?: React.ReactNode;
}

export function MetricsCard({ title, value, subtitle, trend, icon }: MetricsCardProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-white/60">{title}</CardTitle>
        {icon}
      </CardHeader>
      <CardContent>
        <div className={cn(
          "text-3xl font-bold tracking-tight",
          trend === 'up' && "text-emerald-400",
          trend === 'down' && "text-red-400",
          !trend && "text-white/90"
        )}>
          {value}
        </div>
        {subtitle && (
          <p className="text-xs text-white/40 mt-1">
            {subtitle}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
