export default function Loading() {
  return (
    <main className="flex-1 container py-8">
      <div className="space-y-8">
        <div className="animate-fade-in-up">
          <div className="h-10 w-56 rounded-xl bg-white/[0.04] shimmer" />
          <div className="h-5 w-72 rounded-lg bg-white/[0.03] shimmer mt-2" />
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {[1, 2, 3].map(i => (
            <div
              key={i}
              className="h-32 rounded-2xl glass-card-premium bg-white/[0.04] border border-white/[0.08] shimmer animate-stagger-in"
              style={{ animationDelay: `${80 + i * 60}ms`, animationFillMode: 'backwards' }}
            />
          ))}
        </div>
        <div className="h-72 rounded-2xl glass-card-premium bg-white/[0.04] border border-white/[0.08] shimmer animate-stagger-in" style={{ animationDelay: '320ms', animationFillMode: 'backwards' }} />
        <div className="grid gap-8 lg:grid-cols-2">
          <div className="h-64 rounded-2xl glass-card-premium bg-white/[0.04] border border-white/[0.08] shimmer animate-stagger-in" style={{ animationDelay: '400ms', animationFillMode: 'backwards' }} />
          <div className="h-64 rounded-2xl glass-card-premium bg-white/[0.04] border border-white/[0.08] shimmer animate-stagger-in" style={{ animationDelay: '480ms', animationFillMode: 'backwards' }} />
        </div>
      </div>
    </main>
  );
}
