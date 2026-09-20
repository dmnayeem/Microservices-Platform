"use client";

import Link from "next/link";
import { USER_HOME } from "@/lib/routes";
import { Avatar } from "@/components/user/primitives/avatar";
import { usePathname } from "next/navigation";
import {
  GraduationCap,
  LayoutDashboard,
  BookOpen,
  Plus,
  Home,
  Menu,
  X,
} from "lucide-react";
import { useState } from "react";

interface Props {
  user: {
    id: string;
    name: string | null;
    email: string | null;
    avatar: string | null;
  };
  children: React.ReactNode;
}

const NAV = [
  { href: "/tutor/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/tutor/courses", label: "My courses", icon: BookOpen },
];

export function TutorShell({ user, children }: Props) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const isActive = (href: string) =>
    pathname === href || (href !== "/tutor" && pathname?.startsWith(`${href}/`));

  return (
    <div className="min-h-screen bg-(--app-page)">
      {/* Mobile drawer toggle */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="lg:hidden fixed top-3 left-3 z-40 p-2 rounded-lg bg-(--app-surface) border border-(--app-line) text-(--app-ink)"
      >
        <Menu className="w-5 h-5" />
      </button>

      {/* Sidebar */}
      <aside
        className={
          "fixed inset-y-0 left-0 w-64 bg-(--app-surface) border-r border-(--app-line) z-50 transform transition-transform " +
          (open ? "translate-x-0" : "-translate-x-full lg:translate-x-0")
        }
      >
        <div className="flex items-center justify-between p-4 border-b border-(--app-line)">
          <Link href="/tutor/dashboard" className="inline-flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 text-white flex items-center justify-center">
              <GraduationCap className="w-5 h-5" />
            </div>
            <div>
              <p className="text-sm font-bold text-white leading-tight">
                Tutor Hub
              </p>
              <p className="text-[10px] text-(--app-ink-3) uppercase tracking-wider">
                EarnGPT
              </p>
            </div>
          </Link>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="lg:hidden text-(--app-ink-3) hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <nav className="p-3 space-y-1">
          {NAV.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className={
                  "flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors " +
                  (active
                    ? "bg-(--app-cta)/20 text-(--app-on-cta) border border-(--app-accent-edge)/40"
                    : "text-(--app-ink-2) hover:bg-(--app-surface-2)")
                }
              >
                <Icon className="w-4 h-4" />
                {item.label}
              </Link>
            );
          })}

          <Link
            href="/tutor/courses/new"
            className="mt-3 flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-bold bg-emerald-600 hover:bg-emerald-500 text-white"
            onClick={() => setOpen(false)}
          >
            <Plus className="w-4 h-4" />
            New course
          </Link>
        </nav>

        <div className="absolute bottom-0 left-0 right-0 p-3 border-t border-(--app-line) bg-(--app-surface)">
          <div className="flex items-center gap-2 mb-2">
            <Avatar
              src={user.avatar}
              name={user.name || user.email}
              fallbackText={user.name || user.email ? undefined : "?"}
              size={36}
              fallbackStyle="solid-slate"
              className="shrink-0"
            />
            <div className="min-w-0">
              <p className="text-sm font-bold text-white truncate">
                {user.name ?? "Tutor"}
              </p>
              <p className="text-[11px] text-(--app-ink-3) truncate">{user.email}</p>
            </div>
          </div>
          <Link
            href={USER_HOME}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-(--app-ink-2) hover:bg-(--app-surface-2) font-bold"
          >
            <Home className="w-3.5 h-3.5" />
            Back to platform
          </Link>
        </div>
      </aside>

      {/* Drawer backdrop (mobile) */}
      {open && (
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="fixed inset-0 bg-black/60 z-40 lg:hidden"
          aria-label="Close menu"
        />
      )}

      {/* Main */}
      <main className="lg:ml-64 min-h-screen">
        <div className="px-4 md:px-8 py-6 max-w-7xl mx-auto">{children}</div>
      </main>
    </div>
  );
}
