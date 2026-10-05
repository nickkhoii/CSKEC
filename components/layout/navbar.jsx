'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, useTransition } from 'react';
import { Bell, LogOut, Settings, UserRound } from 'lucide-react';
import { ROLE_LABELS } from '@/lib/constants';
import { cn, formatRelative } from '@/lib/utils';
import { Avatar } from '@/components/ui';
import { Sidebar } from '@/components/layout/sidebar';
import { logoutAction } from '@/actions/auth-actions';

/**
 * ---------------------------------------------------------------------------
 * Top navigation bar: club identity, notification bell, account menu.
 * ---------------------------------------------------------------------------
 */

export function Navbar({ user, unreadCount = 0, notifications = [], onOpenMobileNav }) {
  const [bellOpen, setBellOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const popoverRef = useRef(null);

  // Close the popovers on an outside click.
  useEffect(() => {
    if (!bellOpen && !menuOpen) return undefined;
    const onClick = (event) => {
      if (popoverRef.current && !popoverRef.current.contains(event.target)) {
        setBellOpen(false);
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [bellOpen, menuOpen]);

  const signOut = () =>
    new Promise((resolve) => {
      startTransition(async () => {
        await logoutAction();
        resolve();
      });
    });

  return (
    <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur">
      <div className="flex h-14 items-center gap-2 px-4 sm:px-6">
        {onOpenMobileNav ? (
          <button
            type="button"
            onClick={onOpenMobileNav}
            aria-label="Open navigation"
            className="inline-flex h-9 w-9 items-center justify-center rounded-md text-ink-soft hover:bg-slate-100 lg:hidden"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 6h16M4 12h16M4 18h16" strokeLinecap="round" />
            </svg>
          </button>
        ) : null}

        <p className="min-w-0 flex-1 truncate text-sm font-medium text-ink">
          Centro Sugbo Eagles Club
          <span className="ml-2 hidden text-xs text-ink-muted sm:inline">Members Portal</span>
        </p>

        <div className="relative" ref={popoverRef}>
          <NotificationBell
            unreadCount={unreadCount}
            open={bellOpen}
            onToggle={() => {
              setBellOpen((open) => !open);
              setMenuOpen(false);
            }}
            notifications={notifications}
            onNavigate={() => setBellOpen(false)}
          />
          <AccountMenu
            user={user}
            open={menuOpen}
            onToggle={() => {
              setMenuOpen((open) => !open);
              setBellOpen(false);
            }}
            onSignOut={signOut}
            pending={isPending}
          />
        </div>
      </div>
    </header>
  );
}

function NotificationBell({ unreadCount, open, onToggle, notifications, onNavigate }) {
  return (
    <>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={`Notifications (${unreadCount} unread)`}
        className="relative inline-flex h-9 w-9 items-center justify-center rounded-md text-ink-soft transition-colors hover:bg-slate-100"
      >
        <Bell className="h-4 w-4" aria-hidden="true" />
        {unreadCount > 0 ? (
          <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-600 px-1 text-[10px] font-semibold text-white">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        ) : null}
      </button>

      {open ? (
        <div
          role="dialog"
          aria-label="Recent notifications"
          className="absolute right-0 top-12 z-30 w-80 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-panel"
        >
          <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2">
            <p className="text-xs font-semibold text-ink">Notifications</p>
            <Link
              href="/notifications"
              onClick={onNavigate}
              className="text-[11px] font-medium text-navy-700 hover:underline"
            >
              View all
            </Link>
          </div>
          <ul className="max-h-80 overflow-y-auto">
            {notifications.length === 0 ? (
              <li className="px-3 py-6 text-center text-xs text-ink-muted">
                You have no notifications yet.
              </li>
            ) : (
              notifications.map((item) => (
                <li key={item.id} className="border-b border-slate-100 last:border-0">
                  <Link
                    href={item.link ?? '/notifications'}
                    onClick={onNavigate}
                    className={cn(
                      'block px-3 py-2.5 transition-colors hover:bg-slate-50',
                      !item.readAt && 'bg-navy-50/50',
                    )}
                  >
                    <p className="text-xs font-medium text-ink">{item.title}</p>
                    <p className="mt-0.5 line-clamp-2 text-[11px] text-ink-muted">{item.message}</p>
                    <p className="mt-1 text-[10px] text-ink-muted">{formatRelative(item.createdAt)}</p>
                  </Link>
                </li>
              ))
            )}
          </ul>
        </div>
      ) : null}
    </>
  );
}

function AccountMenu({ user, open, onToggle, onSignOut, pending }) {
  return (
    <>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-haspopup="menu"
        className="ml-1 flex items-center gap-2 rounded-md px-1.5 py-1 transition-colors hover:bg-slate-100"
      >
        <Avatar name={user.name} size="sm" />
        <span className="hidden text-left sm:block">
          <span className="block max-w-[9rem] truncate text-xs font-medium text-ink">{user.name}</span>
          <span className="block text-[10px] uppercase tracking-wide text-ink-muted">
            {ROLE_LABELS[user.role] ?? user.role}
          </span>
        </span>
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute right-0 top-12 z-30 w-56 overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-panel"
        >
          <Link
            href="/profile"
            role="menuitem"
            className="flex items-center gap-2 px-3 py-2 text-xs text-ink transition-colors hover:bg-slate-50"
          >
            <UserRound className="h-3.5 w-3.5" aria-hidden="true" />
            My Profile
          </Link>
          <Link
            href="/settings"
            role="menuitem"
            className="flex items-center gap-2 px-3 py-2 text-xs text-ink transition-colors hover:bg-slate-50"
          >
            <Settings className="h-3.5 w-3.5" aria-hidden="true" />
            Settings &amp; Security
          </Link>
          <div className="my-1 border-t border-slate-200" />
          <button
            type="button"
            role="menuitem"
            disabled={pending}
            onClick={onSignOut}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-rose-700 transition-colors hover:bg-rose-50 disabled:opacity-60"
          >
            <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
            Sign out
          </button>
        </div>
      ) : null}
    </>
  );
}

/**
 * Client shell that owns the mobile-drawer state and composes sidebar + navbar.
 *
 * Both `Sidebar` and `Navbar` are Client Components, so this frame renders the
 * sidebar itself. It deliberately does NOT accept a `sidebar` render prop: the
 * server layout used to pass one, and React refuses to serialise a function from
 * a Server Component to a Client Component, which crashed every portal page.
 * Only serialisable props (user, permissions, notification rows) cross the wire.
 */
export function AppShellFrame({ user, permissions, unreadCount, notifications, children }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const closeMobile = () => setMobileOpen(false);

  return (
    <div className="min-h-screen bg-slate-50">
      <Sidebar
        user={user}
        permissions={permissions}
        mobileOpen={mobileOpen}
        onCloseMobile={closeMobile}
      />
      <div className="lg:pl-64">
        <Navbar
          user={user}
          unreadCount={unreadCount}
          notifications={notifications}
          onOpenMobileNav={() => setMobileOpen(true)}
        />
        <main id="main-content" className="px-4 py-6 sm:px-6 lg:px-8">
          <div className="mx-auto w-full max-w-7xl">{children}</div>
        </main>
        <footer className="border-t border-slate-200 px-4 py-4 text-center text-[11px] text-ink-muted sm:px-6">
          Centro Sugbo Eagles Club Members Portal &middot; Internal use only
        </footer>
      </div>
    </div>
  );
}