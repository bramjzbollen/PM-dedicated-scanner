import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { ThemeProvider } from "@/components/theme-provider";
import { Sidebar } from "@/components/sidebar";
import { NoiseOverlay } from "@/components/ui/noise-overlay";
import { DotPattern } from "@/components/ui/dot-pattern";
import { ScannerSchedulerInit } from "@/components/scanner-scheduler-init";
import { Toaster } from "sonner";
import "@/lib/fontawesome";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Mission Control Dashboard",
  description: "Real-time trading and agent monitoring dashboard",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className}>
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem
          disableTransitionOnChange={false}
        >
          {/* Ambient Background - Animated Orbs (dark mode only) */}
          <div className="fixed inset-0 overflow-hidden pointer-events-none z-0 dark:block hidden">
            {/* Primary orb - indigo */}
            <div className="absolute top-[-20%] left-[-10%] w-[700px] h-[700px] rounded-full bg-indigo-600/[0.07] blur-[150px] animate-orb-1" />
            {/* Secondary orb - purple */}
            <div className="absolute top-[30%] right-[-15%] w-[600px] h-[600px] rounded-full bg-purple-600/[0.05] blur-[130px] animate-orb-2" />
            {/* Tertiary orb - cyan */}
            <div className="absolute bottom-[-10%] left-[20%] w-[500px] h-[500px] rounded-full bg-cyan-500/[0.04] blur-[120px] animate-orb-3" />
            {/* Accent orb - rose (subtle) */}
            <div className="absolute top-[60%] left-[60%] w-[350px] h-[350px] rounded-full bg-rose-500/[0.025] blur-[100px] animate-orb-1" style={{ animationDelay: '-5s' }} />
          </div>

          {/* Dot Pattern Overlay */}
          <div className="fixed inset-0 z-[1] pointer-events-none dark:block hidden">
            <DotPattern
              width={24}
              height={24}
              cr={0.8}
              className="[mask-image:radial-gradient(ellipse_80%_80%_at_50%_50%,black_20%,transparent_70%)] opacity-60"
            />
          </div>

          {/* Noise Texture */}
          <NoiseOverlay opacity={0.025} />

          {/* Scanner Scheduler - Auto-starts on mount */}
          <ScannerSchedulerInit />
          
          <div className="relative z-10 flex min-h-screen">
            <Sidebar />
            <div className="flex-1 min-w-0">
              {children}
            </div>
          </div>
          <Toaster
            position="top-right"
            toastOptions={{
              style: {
                background: 'rgba(15, 15, 25, 0.95)',
                border: '1px solid rgba(255,255,255,0.08)',
                color: 'rgba(255,255,255,0.9)',
                backdropFilter: 'blur(12px)',
              },
            }}
          />
        </ThemeProvider>
      </body>
    </html>
  );
}
