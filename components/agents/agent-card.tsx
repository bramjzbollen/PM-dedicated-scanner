import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { Agent } from "@/lib/types";
import { cn } from "@/lib/utils";

interface AgentCardProps {
  agent: Agent;
}

export function AgentCard({ agent }: AgentCardProps) {
  const statusColors = {
    active: 'bg-green-500',
    idle: 'bg-yellow-500',
    offline: 'bg-red-500',
  };

  const healthColor = agent.health >= 90 ? 'text-green-500' : agent.health >= 70 ? 'text-yellow-500' : 'text-red-500';

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
        <div className="space-y-1">
          <CardTitle className="text-lg">{agent.name}</CardTitle>
          <p className="text-sm text-muted-foreground">{agent.role}</p>
        </div>
        <div className="flex items-center gap-2">
          <div className={cn("h-2 w-2 rounded-full", statusColors[agent.status])} />
          <Badge variant="outline">{agent.status}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {agent.currentTask && (
          <div className="text-sm">
            <span className="text-muted-foreground">Current: </span>
            <span className="font-medium">{agent.currentTask}</span>
          </div>
        )}
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div>
            <span className="text-muted-foreground">Health: </span>
            <span className={cn("font-semibold", healthColor)}>{agent.health}%</span>
          </div>
          <div>
            <span className="text-muted-foreground">Tasks: </span>
            <span className="font-semibold">{agent.tasksCompleted}</span>
          </div>
          <div className="col-span-2">
            <span className="text-muted-foreground">Uptime: </span>
            <span className="font-semibold">{agent.uptime}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
