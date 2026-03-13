'use client';

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/utils";
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faHouse, faClipboardList, faRobot, faChartLine, faWallet, faRocket } from '@fortawesome/free-solid-svg-icons';
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core';

const navItems: { href: string; label: string; icon: IconDefinition }[] = [
  { href: '/', label: 'Home', icon: faHouse },
  { href: '/planning', label: 'Planning', icon: faClipboardList },
  { href: '/agents', label: 'Agents', icon: faRobot },
  { href: '/trading', label: 'Trading', icon: faChartLine },
  { href: '/finance', label: 'Finance', icon: faWallet },
];

export function Nav() {
  const pathname = usePathname();

  return (
    <nav className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-14 items-center gap-2">
        <Link href="/" className="font-bold text-lg mr-4 flex items-center gap-2">
          <FontAwesomeIcon icon={faRocket} className="h-5 w-5 text-primary" />
          Mission Control
        </Link>
        <div className="flex gap-1 ml-auto items-center">
          {navItems.map((item) => (
            <Link key={item.href} href={item.href}>
              <Button
                variant={pathname === item.href ? 'secondary' : 'ghost'}
                size="sm"
                className={cn(
                  'text-xs sm:text-sm flex items-center gap-2',
                  pathname === item.href && 'bg-secondary font-semibold'
                )}
              >
                <FontAwesomeIcon icon={item.icon} className="h-4 w-4" />
                {item.label}
              </Button>
            </Link>
          ))}
          <div className="ml-2 border-l pl-2">
            <ThemeToggle />
          </div>
        </div>
      </div>
    </nav>
  );
}
