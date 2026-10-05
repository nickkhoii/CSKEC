'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { ChevronDown, Menu, X } from 'lucide-react';
import { ROLE_BADGE, ROLE_LABELS } from '@/lib/constants';
import { cn } from '@/lib/utils';
import { buildNavigation } from './navigation';
import { Avatar } from '@/components/ui';

/**
 * ---------------------------------------------------------------------------
 * Sidebar (desktop) + drawer (mobile)
 * ---------------------------------------------------------------------------
 * Sections are filtered by permission on the client for presentation only. Every
 * linked page independently re-authorises the request on the server.
 */

function isActive(pathname, href) {
  if (href === '/dashboard') return pathname === '/dashboard' || pathname === '/';
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function Sidebar({ user, canFn, mobileOpen, onCloseMobile }) {
  const pathname = usePathname();
  const sections = buildNavigation(user.role, canFn);
  const [collapsed, setCollapsed] = useState({});

  return (
    <>
      {mobileOpen ? (
        <button
          type="button"
          aria-label="Close navigation"
          onClick={onCloseMobile}
          className="fixed inset-0 z-30 bg-navy-950/40 lg:hidden"
        />
      ) : null}

      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-navy-900/40 bg-navy-900 text-navy-100',
          'transition-transform duration-200 lg:translate-x-0',
          mobileOpen ? 'translate-x-0' : '-translate-x-full',
        )}
        aria-label="Main navigation"
      >
        <div className="flex items-center justify-between gap-2 border-b border-white/10 px-4 py-4">
          <Link href="/dashboard" onClick={onCloseMobile} className="flex min-w-0 items-center gap-2.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-gold-500 text-sm font-bold text-navy-950">
              CSEC
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold text-white">Centro Sugbo</span>
              <span className="block truncate text-[11px] uppercase tracking-wide text-gold-400">
                Eagles Club
              </span>
            </span>
          </Link>
          <button
            type="button"
            onClick={onCloseMobile}
            aria-label="Close navigation"
            className="rounded p-1 text-navy-300 hover:bg-white/10 lg:hidden"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <SidebarNav pathname={pathname} sections={sections} collapsed={collapsed} setCollapsed={setCollapsed} onNavigate={onCloseMobile} />

        <div className="border-t border-white/10 px-4 py-3">
          <div className="flex items-center gap-2.5">
            <Avatar name={user.name} size="sm" />
            <div className="min-w-0">
              <p className="truncate text-xs font-medium text-white">{user.name}</p>
              <span
                className={cn(
                  'inline-flex rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ring-1 ring-inset',
                  ROLE_BADGE[user.role] ?? 'bg-slate-100 text-slate-700 ring-slate-200',
                )}
              >
                {ROLE_LABELS[user.role] ?? user.role}
              </span>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}

function SidebarNav({ pathname, sections, collapsed, setCollapsed, onNavigate }) {
  return (
    <nav className="flex-1 overflow-y-auto px-3 py-4">
      {sections.map((section, sectionIndex) => (
        <div key={section.label ?? `section-${sectionIndex}`} className="mb-4 last:mb-0">
          {section.label ? (
            <button
              type="button"
              onClick={() =>
                setCollapsed((c) => ({ ...c, [section.label]: !c[section.label] }))
              }
              aria-expanded={!collapsed[section.label]}
              className="mb-1 flex w-full items-center justify-between px-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-navy-400 hover:text-navy-200"
            >
              {section.label}
              <ChevronDown
                className={cn(
                  'h-3 w-3 transition-transform',
                  collapsed[section.label] && '-rotate-90',
                )}
                aria-hidden="true"
              />
            </button>
          ) : null}

          {!collapsed[section.label] ? (
            <ul className="space-y-0.5">
              {section.items.map((item) => {
                const active = isActive(pathname, item.href);
                const Icon = item.icon;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={onNavigate}
                      aria-current={active ? 'page' : undefined}
                      className={cn(
                        'flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[13px] transition-colors',
                        active
                          ? 'bg-white/10 font-medium text-white'
                          : 'text-navy-200 hover:bg-white/5 hover:text-white',
                      )}
                    >
                      <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                      <span className="truncate">{item.label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          ) : null}
        </div>
      ))}
    </nav>
  );
}

/** Mobile top bar with the hamburger trigger. */
export function MobileNavTrigger({ onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Open navigation"
      className="inline-flex h-9 w-9 items-center justify-center rounded-md text-ink-soft transition-colors hover:bg-slate-100 lg:hidden"
    >
      <Menu className="h-5 w-5" aria-hidden="true" />
    </button>
  );
}