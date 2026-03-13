import { AgentHierarchy } from "@/components/agents/agent-hierarchy";
import { RealTimeTasksLive } from "@/components/agents/real-time-tasks-live";
import { TaskQueueCard } from "@/components/agents/task-queue";
import { getMockTaskQueue } from "@/lib/agent-data";
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faRobot } from '@fortawesome/free-solid-svg-icons';

export default function AgentsPage() {
  const queue = getMockTaskQueue();

  return (
    <main className="flex-1 container py-8">
      <div className="space-y-8">
        <div className="animate-fade-in-up">
          <h1 className="text-4xl font-bold flex items-center gap-3 tracking-tight">
            <div className="p-2.5 rounded-xl bg-purple-500/[0.1] glow-purple">
              <FontAwesomeIcon icon={faRobot} className="h-6 w-6 text-purple-400" />
            </div>
            <span className="bg-gradient-to-r from-white via-purple-200 to-white/60 bg-clip-text text-transparent">
              Agents Monitor
            </span>
          </h1>
          <p className="text-white/50 mt-1">Agent hiërarchie en taak voortgang</p>
        </div>

        {/* Task Queue Overview */}
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-1 animate-stagger-in" style={{ animationDelay: '80ms', animationFillMode: 'backwards' }}>
            <TaskQueueCard queue={queue} />
          </div>
          <div className="lg:col-span-2 animate-stagger-in" style={{ animationDelay: '160ms', animationFillMode: 'backwards' }}>
            <RealTimeTasksLive />
          </div>
        </div>

        {/* Agent Hierarchy */}
        <div className="animate-stagger-in" style={{ animationDelay: '240ms', animationFillMode: 'backwards' }}>
          <h2 className="text-2xl font-bold mb-4 text-white/90">Agent Hiërarchie</h2>
          <AgentHierarchy />
        </div>
      </div>
    </main>
  );
}
