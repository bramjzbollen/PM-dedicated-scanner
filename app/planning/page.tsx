import { PlanningBoard } from "@/components/planning/planning-board";
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faClipboardList } from '@fortawesome/free-solid-svg-icons';

export default function PlanningPage() {
  return (
    <main className="flex-1 container py-8">
      <div className="space-y-8">
        <div className="animate-fade-in-up">
          <h1 className="text-4xl font-bold flex items-center gap-3 tracking-tight">
            <div className="p-2.5 rounded-xl bg-indigo-500/[0.1] glow-blue">
              <FontAwesomeIcon icon={faClipboardList} className="h-6 w-6 text-indigo-400" />
            </div>
            <span className="bg-gradient-to-r from-white via-blue-200 to-white/60 bg-clip-text text-transparent">
              Planning
            </span>
          </h1>
          <p className="text-white/50 mt-1">Beheer je taken en projecten</p>
        </div>
        <div className="animate-stagger-in" style={{ animationDelay: '80ms', animationFillMode: 'backwards' }}>
          <PlanningBoard />
        </div>
      </div>
    </main>
  );
}
