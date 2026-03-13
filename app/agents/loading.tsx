export default function Loading() {
  return (
    <main className="flex-1 container py-8">
      <div className="space-y-8">
        <div className="animate-fade-in-up">
          <div className="h-10 w-64 rounded-xl bg-white/[0.04] shimmer" />
          <div className="h-5 w-48 rounded-lg bg-white/[0.03] shimmer mt-2" />
        </div>
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="rounded-2xl glass-card-premium bg-white/[0.04] border border-white/[0.08] p-6 space-y-4 animate-stagger-in" style={{ animationDelay: '80ms', animationFillMode: 'backwards' }}>
            <div className="h-6 w-24 rounded-lg shimmer" />
            <div className="grid grid-cols-2 gap-4">
              {[1, 2, 3, 4].map(i => <div key={i} className="h-16 rounded-xl bg-white/[0.03] shimmer" />)}
            </div>
          </div>
          <div className="lg:col-span-2 rounded-2xl glass-card-premium bg-white/[0.04] border border-white/[0.08] p-6 space-y-3 animate-stagger-in" style={{ animationDelay: '160ms', animationFillMode: 'backwards' }}>
            <div className="h-6 w-32 rounded-lg shimmer" />
            {[1, 2, 3].map(i => <div key={i} className="h-20 rounded-xl bg-white/[0.03] shimmer" />)}
          </div>
        </div>
      </div>
    </main>
  );
}
