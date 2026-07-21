import React, { useState, useEffect } from "react";
import { UserMenu } from "./UserMenu";
import { useApp, useAuth } from "../lib/auth";
import { applyBrandingColor } from "../lib/branding";
import { trpc } from "../trpc";
import {
  LayoutDashboard,
  Users,
  Contact,
  TrendingUp,
  CheckSquare,
  Settings,
  Shield,
  ChevronLeft,
  ChevronRight,
  Menu,
  BarChart3,
  FileText,
  ShieldCheck,
  MessageSquare,
  Home,
} from "lucide-react";
import { ErrorBoundary } from "./ErrorBoundary";

interface NavItem {
  label: string;
  href: string;
  icon: React.ReactNode;
  requiredScopes?: string[];
}

// ====== CUSTOMER NAV (brokerages using the CRM) ======
const CRM_NAV: NavItem[] = [
  { label: "Homepage", href: "/", icon: <LayoutDashboard className="h-4 w-4" /> },
  { label: "Campaigns", href: "/campaigns", icon: <BarChart3 className="h-4 w-4" />, requiredScopes: ["campaigns:view"] },
  { label: "Leads", href: "/leads", icon: <Users className="h-4 w-4" /> },
  { label: "Interests", href: "/interests", icon: <Home className="h-4 w-4" /> },
  { label: "Contacts", href: "/contacts", icon: <Contact className="h-4 w-4" /> },
  { label: "Opportunities", href: "/opportunities", icon: <TrendingUp className="h-4 w-4" /> },
  { label: "Tasks", href: "/tasks", icon: <CheckSquare className="h-4 w-4" /> },
  { label: "Team Chat", href: "/team-chat", icon: <MessageSquare className="h-4 w-4" /> },
  { label: "Reports", href: "/reports", icon: <BarChart3 className="h-4 w-4" />, requiredScopes: ["reports:view"] },
  { label: "Dashboards", href: "/dashboards", icon: <LayoutDashboard className="h-4 w-4" />, requiredScopes: ["reports:view"] },
  { label: "Agent Performance", href: "/agent-performance", icon: <Users className="h-4 w-4" />, requiredScopes: ["agents:viewPerformance"] },
];

const CUSTOMER_ADMIN_NAV: NavItem[] = [
  { label: "Settings", href: "/settings", icon: <Settings className="h-4 w-4" />, requiredScopes: ["businessUnits:manage", "teams:manage"] },
  { label: "Roles & Permissions", href: "/roles", icon: <ShieldCheck className="h-4 w-4" />, requiredScopes: ["roles:view"] },
  { label: "Audit Log", href: "/audit", icon: <FileText className="h-4 w-4" />, requiredScopes: ["audit:view"] },
  { label: "Compliance", href: "/compliance", icon: <ShieldCheck className="h-4 w-4" />, requiredScopes: ["compliance:manage"] },
];

// ====== PLATFORM ADMIN NAV (your team managing SaaS customers) ======
const PLATFORM_NAV: NavItem[] = [
  { label: "Tenants", href: "/platform/tenants", icon: <Shield className="h-4 w-4" /> },
];

interface LayoutProps {
  children: React.ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const { basePath } = useApp();
  const { scopes } = useAuth();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const currentPath = window.location.pathname.replace(basePath, "") || "/";
  const [branding, setBranding] = useState<{ name: string; logoUrl: string | null; primaryColor: string | null } | null>(null);
  const [checkedOnboarding, setCheckedOnboarding] = useState(false);
  const [viewMode, setViewMode] = useState<"platform" | "customer">("customer");
  const navigate = (path: string) => { window.history.pushState({}, "", basePath.concat(path)); window.dispatchEvent(new PopStateEvent("popstate")); };

  // Check if user needs onboarding + load branding
  useEffect(() => {
    trpc.onboarding.checkStatus.query().then((status) => {
      if (status.needsOnboarding && currentPath !== "/onboard") {
        navigate("/onboard");
      }
      setCheckedOnboarding(true);
    }).catch(() => setCheckedOnboarding(true));

    trpc.onboarding.getBranding.query().then((b) => {
      if (b) setBranding(b);
    }).catch(() => {});
  }, [basePath, currentPath]);

  // Apply branding color
  useEffect(() => {
    applyBrandingColor(branding?.primaryColor);
  }, [branding?.primaryColor]);

  if (!checkedOnboarding) return <div className="flex h-screen items-center justify-center bg-background"><div className="h-6 w-6 animate-spin rounded-full border-2 border-primary-300 border-t-primary-600" /></div>;

  const hasPlatformAccess = scopes.includes("tenants:manage");
  const isPlatformAdmin = hasPlatformAccess && viewMode === "platform";

  const hasScope = (requiredScopes?: string[]) => {
    if (!requiredScopes || requiredScopes.length === 0) return true;
    return requiredScopes.some((s) => scopes.includes(s));
  };

  const isActive = (href: string) => {
    if (href === "/") return currentPath === "/";
    return currentPath.startsWith(href);
  };

  const visibleCustomerAdmin = CUSTOMER_ADMIN_NAV.filter((item) => hasScope(item.requiredScopes));

  const renderNavItems = (items: NavItem[]) => items.map((item) => (
    <a key={item.href} href={basePath + item.href}
      onClick={(e) => {
        // Plain left-click: route client-side so in-memory state (like the platform/CRM
        // toggle below) survives — modified clicks (open in new tab, etc.) fall through to
        // the browser's native handling via the real href.
        if (e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey) {
          e.preventDefault();
          setMobileOpen(false);
          navigate(item.href);
        }
      }}
      className={`mx-2 mb-0.5 flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors ${
        isActive(item.href) ? "bg-primary-50 dark:bg-primary-950 text-primary-text font-medium" : "text-foreground-muted hover:bg-background-secondary hover:text-foreground"
      } ${collapsed ? "justify-center" : ""}`}
      title={collapsed ? item.label : undefined}
    >
      {item.icon}
      {!collapsed && <span>{item.label}</span>}
    </a>
  ));

  const navContent = isPlatformAdmin ? (
    /* ====== PLATFORM ADMIN VIEW ====== */
    <>
      <div className="mb-1 px-3 py-2">
        {!collapsed && <span className="text-2xs font-semibold uppercase tracking-wider text-foreground-subtle">Platform</span>}
      </div>
      {renderNavItems(PLATFORM_NAV)}
    </>
  ) : (
    /* ====== CUSTOMER VIEW ====== */
    <>
      <div className="mb-1 px-3 py-2">
        {!collapsed && <span className="text-2xs font-semibold uppercase tracking-wider text-foreground-subtle">CRM</span>}
      </div>
      {renderNavItems(CRM_NAV)}

      {visibleCustomerAdmin.length > 0 && (
        <>
          <div className="mx-3 my-2 border-t border-border" />
          <div className="mb-1 px-3 py-2">
            {!collapsed && <span className="text-2xs font-semibold uppercase tracking-wider text-foreground-subtle">Admin</span>}
          </div>
          {renderNavItems(visibleCustomerAdmin)}
        </>
      )}
    </>
  );

  return (
    <div className="flex h-screen bg-background">
      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-modal-backdrop bg-modal-overlay md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-modal flex flex-col border-r border-border bg-background transition-all md:static ${
          mobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        } ${collapsed ? "w-16" : "w-56"}`}
      >
        {/* Sidebar header */}
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-border px-3">
          {!collapsed && (
            <div className="flex items-center gap-2">
              {isPlatformAdmin ? (
                <>
                  <Shield className="h-5 w-5 text-primary-text" />
                  <span className="text-sm font-medium text-foreground">Platform Admin</span>
                </>
              ) : (
                <>
                  {branding?.logoUrl ? (
                    <img src={branding.logoUrl} alt="" className="h-6 w-6 rounded object-contain" />
                  ) : (
                    <img src={`${basePath}/favicon.svg`} alt="" className="h-5 w-5" />
                  )}
                  <span className="text-sm font-medium text-foreground truncate">{branding?.name ?? "Real Estate CRM"}</span>
                </>
              )}
            </div>
          )}
          {collapsed && (
            <div className="flex w-full justify-center">
              {isPlatformAdmin ? (
                <Shield className="h-5 w-5 text-primary-text" />
              ) : branding?.logoUrl ? (
                <img src={branding.logoUrl} alt="" className="h-6 w-6 rounded object-contain" />
              ) : (
                <img src={`${basePath}/favicon.svg`} alt="" className="h-5 w-5" />
              )}
            </div>
          )}
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-2">{navContent}</nav>

        {/* View mode toggle (platform admin only) */}
        {hasPlatformAccess && !collapsed && (
          <div className="border-t border-border p-2">
            <button
              onClick={() => setViewMode(viewMode === "platform" ? "customer" : "platform")}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium transition-colors bg-background-secondary text-foreground-muted hover:text-foreground"
            >
              {viewMode === "platform" ? (
                <><LayoutDashboard className="h-3.5 w-3.5" /> Switch to CRM</>
              ) : (
                <><Shield className="h-3.5 w-3.5" /> Switch to Platform</>
              )}
            </button>
          </div>
        )}
        {hasPlatformAccess && collapsed && (
          <div className="border-t border-border p-2">
            <button
              onClick={() => setViewMode(viewMode === "platform" ? "customer" : "platform")}
              className="flex w-full items-center justify-center rounded-lg p-2 text-foreground-muted transition-colors hover:bg-background-secondary hover:text-foreground"
              title={viewMode === "platform" ? "Switch to CRM" : "Switch to Platform"}
            >
              {viewMode === "platform" ? <LayoutDashboard className="h-4 w-4" /> : <Shield className="h-4 w-4" />}
            </button>
          </div>
        )}

        {/* Collapse toggle */}
        <div className="hidden border-t border-border p-2 md:block">
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="flex w-full items-center justify-center rounded-lg p-2 text-foreground-muted transition-colors hover:bg-background-secondary hover:text-foreground"
          >
            {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </button>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Header */}
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-border px-4">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setMobileOpen(true)}
              className="rounded-lg p-2 text-foreground-muted transition-colors hover:bg-background-secondary md:hidden"
            >
              <Menu className="h-5 w-5" />
            </button>
          </div>
          <div className="flex items-center gap-2">
            <UserMenu />
          </div>
        </header>

        {/* Content area */}
        <main className="flex-1 overflow-y-auto"><ErrorBoundary>{children}</ErrorBoundary></main>
      </div>
    </div>
  );
}
