'use client';

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  Home,
  CalendarDays,
  Bot,
  TrendingUp,
  Wallet,
  PanelLeftClose,
  PanelLeftOpen,
  Menu,
  Rocket,
} from "lucide-react";

const navItems = [
  { href: '/', label: 'Home', icon: Home, color: 'indigo' },
  { href: '/planning', label: 'Planning', icon: CalendarDays, color: 'blue' },
  { href: '/agents', label: 'Agents', icon: Bot, color: 'purple' },
  { href: '/trading', label: 'Trading', icon: TrendingUp, color: 'cyan' },
  { href: '/finance', label: 'Finance', icon: Wallet, color: 'emerald' },
];

const STORAGE_KEY = 'mc-sidebar-collapsed';

const colorMap: Record<string, { text: string; glow: string; bg: string }> = {
  indigo: { text: 'text-indigo-400', glow: 'shadow-[0_0_12px_rgba(99,102,241,0.3)]', bg: 'bg-indigo-500/[0.1]' },
  blue: { text: 'text-blue-400', glow: 'shadow-[0_0_12px_rgba(59,130,246,0.3)]', bg: 'bg-blue-500/[0.1]' },
  purple: { text: 'text-purple-400', glow: 'shadow-[0_0_12px_rgba(168,85,247,0.3)]', bg: 'bg-purple-500/[0.1]' },
  cyan: { text: 'text-cyan-400', glow: 'shadow-[0_0_12px_rgba(34,211,238,0.3)]', bg: 'bg-cyan-500/[0.1]' },
  emerald: { text: 'text-emerald-400', glow: 'shadow-[0_0_12px_rgba(52,211,153,0.3)]', bg: 'bg-emerald-500/[0.1]' },
  violet: { text: 'text-violet-400', glow: 'shadow-[0_0_12px_rgba(139,92,246,0.3)]', bg: 'bg-violet-500/[0.1]' },
};

function SidebarNav({ collapsed, onNavigate }: { collapsed: boolean; onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <nav className="flex flex-col gap-1 px-2">
      {navItems.map((item) => {
        const isActive = pathname === item.href;
        const Icon = item.icon;
        const colors = colorMap[item.color] || colorMap.indigo;
        return (
          <Link key={item.href} href={item.href} onClick={onNavigate}>
            <Button
              variant="ghost"
              className={cn(
                'w-full justify-start gap-3 h-10 transition-all duration-200 rounded-xl relative overflow-hidden',
                collapsed && 'justify-center px-0',
                isActive && [
                  'bg-white/[0.08] text-white font-semibold border border-white/[0.1]',
                  colors.glow,
                ],
                !isActive && 'text-white/60 hover:text-white/90 hover:bg-white/[0.05]'
              )}
            >
              {/* Active indicator bar */}
              {isActive && (
                <span className={cn(
                  "absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full",
                  colors.text.replace('text-', 'bg-'),
                )} />
              )}
              <Icon className={cn(
                "h-5 w-5 shrink-0 transition-all duration-200",
                isActive && `${colors.text} drop-shadow-[0_0_6px_rgba(99,102,241,0.5)]`
              )} />
              {!collapsed && (
                <span className="truncate">{item.label}</span>
              )}
            </Button>
          </Link>
        );
      })}
    </nav>
  );
}

function SidebarLogo({ collapsed }: { collapsed: boolean }) {
  return (
    <div className={cn(
      "flex items-center gap-2.5 px-4 py-5 transition-all duration-200",
      collapsed && "justify-center px-2"
    )}>
      <div className="relative group">
        <Rocket className="h-6 w-6 text-indigo-400 shrink-0 drop-shadow-[0_0_8px_rgba(99,102,241,0.5)] transition-transform duration-300 group-hover:rotate-12 group-hover:scale-110" />
        {/* Subtle glow behind icon */}
        <div className="absolute inset-0 rounded-full bg-indigo-500/20 blur-md opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
      </div>
      {!collapsed && (
        <span className="font-bold text-lg truncate tracking-tight bg-gradient-to-r from-white via-indigo-200 to-white/70 bg-clip-text text-transparent">
          Mission Control
        </span>
      )}
    </div>
  );
}

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved !== null) {
      setCollapsed(saved === 'true');
    }
  }, []);

  const toggleCollapsed = () => {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem(STORAGE_KEY, String(next));
  };

  // Prevent hydration mismatch
  if (!mounted) {
    return (
      <>
        <div className="md:hidden sticky top-0 z-50 h-14" />
        <div className="hidden md:block w-[240px] shrink-0" />
      </>
    );
  }

  return (
    <>
      {/* ===== MOBILE: Top bar + Sheet drawer ===== */}
      <div className="md:hidden sticky top-0 z-50 flex items-center justify-between h-14 px-4 bg-[#07071a]/80 dark:bg-[#07071a]/80 bg-white/95 backdrop-blur-2xl border-b border-white/[0.06] dark:border-white/[0.06] border-gray-200">
        <div className="flex items-center gap-2">
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="h-9 w-9">
                <Menu className="h-5 w-5" />
                <span className="sr-only">Open menu</span>
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-[280px] p-0">
              <SheetTitle className="sr-only">Navigation</SheetTitle>
              <div className="flex flex-col h-full">
                <SidebarLogo collapsed={false} />
                <Separator />
                <div className="flex-1 py-4">
                  <SidebarNav collapsed={false} onNavigate={() => setMobileOpen(false)} />
                </div>
                <Separator />
                <div className="p-4 flex items-center justify-between">
                  <span className="text-sm text-white/50">Theme</span>
                  <ThemeToggle />
                </div>
              </div>
            </SheetContent>
          </Sheet>
          <Rocket className="h-5 w-5 text-indigo-400 drop-shadow-[0_0_6px_rgba(99,102,241,0.5)]" />
          <span className="font-bold bg-gradient-to-r from-white via-indigo-200 to-white/70 bg-clip-text text-transparent">Mission Control</span>
        </div>
        <ThemeToggle />
      </div>

      {/* ===== DESKTOP: Fixed sidebar ===== */}
      <aside
        className={cn(
          "hidden md:flex flex-col fixed top-0 left-0 h-screen z-40 transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]",
          "bg-[#07071a]/80 dark:bg-[#07071a]/80 bg-white/95 backdrop-blur-3xl border-r border-white/[0.06] dark:border-white/[0.06] border-gray-200",
          "shadow-[4px_0_32px_rgba(0,0,0,0.3)]",
          collapsed ? "w-[64px]" : "w-[240px]"
        )}
      >
        {/* Logo */}
        <SidebarLogo collapsed={collapsed} />
        <Separator />

        {/* Nav items */}
        <div className="flex-1 py-4 overflow-y-auto">
          <SidebarNav collapsed={collapsed} />
        </div>

        <Separator />

        {/* Bottom section: theme toggle + collapse toggle */}
        <div className={cn(
          "p-3 flex items-center gap-2 transition-all duration-200",
          collapsed ? "flex-col" : "justify-between"
        )}>
          <ThemeToggle />
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 shrink-0 text-white/50 hover:text-white/80"
            onClick={toggleCollapsed}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? (
              <PanelLeftOpen className="h-4 w-4" />
            ) : (
              <PanelLeftClose className="h-4 w-4" />
            )}
            <span className="sr-only">Toggle sidebar</span>
          </Button>
        </div>
      </aside>

      {/* Spacer to push content right on desktop */}
      <div
        className={cn(
          "hidden md:block shrink-0 transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]",
          collapsed ? "w-[64px]" : "w-[240px]"
        )}
      />
    </>
  );
}
