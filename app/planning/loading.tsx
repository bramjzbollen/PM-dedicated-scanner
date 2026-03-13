export default function Loading() {
  return (
    <main className="flex-1 container py-8">
      <div className="space-y-8">
        <div className="animate-fade-in-up">
          <div className="h-10 w-48 rounded-xl bg-white/[0.04] shimmer" />
          <div className="h-5 w-56 rounded-lg bg-white/[0.03] shimmer mt-2" />
        </div>
        <div className="grid gap-6 md:grid-cols-3">
          {[1, 2, 3].map(i => (
            <div
              key={i}
              className="rounded-2xl glass-card-premium bg-white/[0.04] border border-white/[0.08] p-4 space-y-3 animate-stagger-in"
              style={{ animationDelay: `${80 + i * 80}ms`, animationFillMode: 'backwards' }}
            >
              <div className="h-6 w-24 rounded-lg shimmer" />
              {[1, 2, 3].map(j => <div key={j} className="h-20 rounded-xl bg-white/[0.03] shimmer" />)}
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
