export default function Loading() {
  return (
    <main className="flex-1 container py-8">
      <div className="space-y-8">
        <div className="animate-fade-in-up">
          <div className="h-10 w-48 rounded-xl bg-white/[0.04] shimmer" />
          <div className="h-5 w-64 rounded-lg bg-white/[0.03] shimmer mt-2" />
        </div>
        <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-6">
          {[1, 2, 3, 4, 5, 6].map(i => (
            <div
              key={i}
              className="h-28 rounded-2xl glass-card-premium bg-white/[0.04] border border-white/[0.08] shimmer animate-stagger-in"
              style={{ animationDelay: `${80 + i * 60}ms`, animationFillMode: 'backwards' }}
            />
          ))}
        </div>
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 h-64 rounded-2xl glass-card-premium bg-white/[0.04] border border-white/[0.08] shimmer animate-stagger-in" style={{ animationDelay: '400ms', animationFillMode: 'backwards' }} />
          <div className="space-y-6">
            <div className="h-48 rounded-2xl glass-card-premium bg-white/[0.04] border border-white/[0.08] shimmer animate-stagger-in" style={{ animationDelay: '480ms', animationFillMode: 'backwards' }} />
            <div className="h-48 rounded-2xl glass-card-premium bg-white/[0.04] border border-white/[0.08] shimmer animate-stagger-in" style={{ animationDelay: '560ms', animationFillMode: 'backwards' }} />
          </div>
        </div>
      </div>
    </main>
  );
}
