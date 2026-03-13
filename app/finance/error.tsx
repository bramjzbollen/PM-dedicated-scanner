'use client';

export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4">
      <h2 className="text-xl font-bold text-red-500">Er ging iets mis</h2>
      <p className="text-muted-foreground">{error.message}</p>
      <button onClick={reset} className="px-4 py-2 rounded-md bg-primary text-primary-foreground">
        Opnieuw proberen
      </button>
    </div>
  );
}
