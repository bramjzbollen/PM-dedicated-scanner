import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { TaskQueue } from "@/lib/types";

interface TaskQueueProps {
  queue: TaskQueue;
}

export function TaskQueueCard({ queue }: TaskQueueProps) {
  const total = queue.pending + queue.inProgress + queue.completed + queue.failed + queue.cancelled;
  
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Task Queue</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.04] space-y-1">
              <p className="text-xs text-white/45">Pending</p>
              <p className="text-2xl font-bold text-amber-400">{queue.pending}</p>
            </div>
            <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.04] space-y-1">
              <p className="text-xs text-white/45">In Progress</p>
              <p className="text-2xl font-bold text-blue-400">{queue.inProgress}</p>
            </div>
            <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.04] space-y-1">
              <p className="text-xs text-white/45">Completed</p>
              <p className="text-2xl font-bold text-emerald-400">{queue.completed}</p>
            </div>
            <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.04] space-y-1">
              <p className="text-xs text-white/45">Failed</p>
              <p className="text-2xl font-bold text-red-400">{queue.failed}</p>
            </div>
          </div>
          
          {queue.cancelled > 0 && (
            <div className="p-3 rounded-xl bg-orange-500/[0.04] border border-orange-500/[0.08] space-y-1">
              <p className="text-xs text-white/45">Cancelled</p>
              <p className="text-xl font-bold text-orange-400">{queue.cancelled}</p>
            </div>
          )}
          
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-white/45">Total Tasks</span>
              <span className="font-medium text-white/70">{total}</span>
            </div>
            <div className="h-2 bg-white/[0.06] rounded-full overflow-hidden flex">
              <div
                className="bg-emerald-500 transition-all duration-500"
                style={{ width: `${(queue.completed / total) * 100}%` }}
              />
              <div
                className="bg-blue-500 transition-all duration-500"
                style={{ width: `${(queue.inProgress / total) * 100}%` }}
              />
              <div
                className="bg-amber-500 transition-all duration-500"
                style={{ width: `${(queue.pending / total) * 100}%` }}
              />
              <div
                className="bg-red-500 transition-all duration-500"
                style={{ width: `${(queue.failed / total) * 100}%` }}
              />
              {queue.cancelled > 0 && (
                <div
                  className="bg-orange-500 transition-all duration-500"
                  style={{ width: `${(queue.cancelled / total) * 100}%` }}
                />
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
