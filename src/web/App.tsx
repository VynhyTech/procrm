import React, { Suspense, useEffect } from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Route, Routes, useParams } from "react-router-dom";
import "./index.css";
import { BASE_PATH } from "../constants";
import { AuthProvider, ProtectedRoute } from "./lib/auth";
import { Layout } from "./components/Layout";
import { PageLoader } from "./components/PageLoader";
import { LoginPage } from "./pages/LoginPage";
import { SignupPage } from "./pages/SignupPage";

// Lazy-load all pages so only the active page's code is downloaded
const DashboardPage = React.lazy(() => import("./pages/DashboardPage").then((m) => ({ default: m.DashboardPage })));
const LeadListPage = React.lazy(() => import("./pages/LeadListPage").then((m) => ({ default: m.LeadListPage })));
const LeadCreatePage = React.lazy(() => import("./pages/LeadCreatePage").then((m) => ({ default: m.LeadCreatePage })));
const LeadDetailPage = React.lazy(() => import("./pages/LeadDetailPage").then((m) => ({ default: m.LeadDetailPage })));
const ContactListPage = React.lazy(() => import("./pages/ContactListPage").then((m) => ({ default: m.ContactListPage })));
const ContactCreatePage = React.lazy(() => import("./pages/ContactCreatePage").then((m) => ({ default: m.ContactCreatePage })));
const ContactDetailPage = React.lazy(() => import("./pages/ContactDetailPage").then((m) => ({ default: m.ContactDetailPage })));
const OpportunityListPage = React.lazy(() => import("./pages/OpportunityListPage").then((m) => ({ default: m.OpportunityListPage })));
const OpportunityDetailPage = React.lazy(() => import("./pages/OpportunityDetailPage").then((m) => ({ default: m.OpportunityDetailPage })));
const OpportunityCreatePage = React.lazy(() => import("./pages/OpportunityCreatePage").then((m) => ({ default: m.OpportunityCreatePage })));
const TaskListPage = React.lazy(() => import("./pages/TaskListPage").then((m) => ({ default: m.TaskListPage })));
const SettingsPage = React.lazy(() => import("./pages/SettingsPage").then((m) => ({ default: m.SettingsPage })));
const TenantManagementPage = React.lazy(() => import("./pages/TenantManagementPage").then((m) => ({ default: m.TenantManagementPage })));
const TenantDetailPage = React.lazy(() => import("./pages/TenantDetailPage").then((m) => ({ default: m.TenantDetailPage })));
const ReportsPage = React.lazy(() => import("./pages/ReportsPage").then((m) => ({ default: m.ReportsPage })));
const ReportTemplatesPage = React.lazy(() => import("./pages/ReportTemplatesPage").then((m) => ({ default: m.ReportTemplatesPage })));
const ReportBuilderPage = React.lazy(() => import("./pages/ReportBuilderPage").then((m) => ({ default: m.ReportBuilderPage })));
const DashboardsPage = React.lazy(() => import("./pages/DashboardsPage").then((m) => ({ default: m.DashboardsPage })));
const DashboardBuilderPage = React.lazy(() => import("./pages/DashboardBuilderPage").then((m) => ({ default: m.DashboardBuilderPage })));
const AuditLogPage = React.lazy(() => import("./pages/AuditLogPage").then((m) => ({ default: m.AuditLogPage })));
const CompliancePage = React.lazy(() => import("./pages/CompliancePage").then((m) => ({ default: m.CompliancePage })));
const AgentPerformancePage = React.lazy(() => import("./pages/AgentPerformancePage").then((m) => ({ default: m.AgentPerformancePage })));
const CampaignListPage = React.lazy(() => import("./pages/CampaignListPage").then((m) => ({ default: m.CampaignListPage })));
const TeamChatPage = React.lazy(() => import("./pages/TeamChatPage").then((m) => ({ default: m.TeamChatPage })));
const InterestListPage = React.lazy(() => import("./pages/InterestListPage").then((m) => ({ default: m.InterestListPage })));
const InterestDetailPage = React.lazy(() => import("./pages/InterestDetailPage").then((m) => ({ default: m.InterestDetailPage })));
const OnboardingPage = React.lazy(() => import("./pages/OnboardingPage").then((m) => ({ default: m.OnboardingPage })));
const RoleManagementPage = React.lazy(() => import("./pages/RoleManagementPage").then((m) => ({ default: m.RoleManagementPage })));
const RoleDetailPage = React.lazy(() => import("./pages/RoleDetailPage").then((m) => ({ default: m.RoleDetailPage })));
const AccountPage = React.lazy(() => import("./pages/AccountPage").then((m) => ({ default: m.AccountPage })));

const ADMIN_SCOPES = ["businessUnits:manage", "teams:manage"];
const PLATFORM_SCOPES = ["tenants:manage"];

function Lazy({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<PageLoader />}>{children}</Suspense>;
}

/** Reads one route param and hands it to `children` — avoids a one-off wrapper component per detail page. */
function WithParam({ name, children }: { name: string; children: (value: string) => React.ReactNode }) {
  const params = useParams();
  return <>{children(params[name] ?? "")}</>;
}

function NotFound() {
  return (
    <div className="flex h-screen items-center justify-center text-foreground-muted">
      Page not found.
    </div>
  );
}

/**
 * index.html sets the initial dark/light class from prefers-color-scheme before React loads.
 * This keeps it in sync if the OS theme changes while the app is open — previously handled by
 * the now-deleted BaseBrowserApp.
 */
function useSystemThemeSync() {
  useEffect(() => {
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = (e: MediaQueryListEvent) => {
      document.documentElement.classList.toggle("dark", e.matches);
    };
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);
}

function App() {
  useSystemThemeSync();

  return (
    <AuthProvider>
      <BrowserRouter basename={BASE_PATH}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignupPage />} />

          <Route
            path="/"
            element={
              <ProtectedRoute>
                <Layout><Lazy><DashboardPage /></Lazy></Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/leads"
            element={
              <ProtectedRoute>
                <Layout><Lazy><LeadListPage /></Lazy></Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/leads/new"
            element={
              <ProtectedRoute requiredScopes={["leads:edit"]}>
                <Layout><Lazy><LeadCreatePage /></Lazy></Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/leads/:id"
            element={
              <ProtectedRoute>
                <Layout><Lazy><WithParam name="id">{(id) => <LeadDetailPage id={id} />}</WithParam></Lazy></Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/interests"
            element={
              <ProtectedRoute>
                <Layout><Lazy><InterestListPage /></Lazy></Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/interests/:id"
            element={
              <ProtectedRoute>
                <Layout><Lazy><WithParam name="id">{(id) => <InterestDetailPage id={id} />}</WithParam></Lazy></Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/contacts"
            element={
              <ProtectedRoute>
                <Layout><Lazy><ContactListPage /></Lazy></Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/contacts/new"
            element={
              <ProtectedRoute requiredScopes={["contacts:edit"]}>
                <Layout><Lazy><ContactCreatePage /></Lazy></Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/contacts/:id"
            element={
              <ProtectedRoute>
                <Layout><Lazy><WithParam name="id">{(id) => <ContactDetailPage id={id} />}</WithParam></Lazy></Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/opportunities/new"
            element={
              <ProtectedRoute requiredScopes={["opportunities:edit"]}>
                <Layout><Lazy><OpportunityCreatePage /></Lazy></Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/opportunities"
            element={
              <ProtectedRoute>
                <Layout><Lazy><OpportunityListPage /></Lazy></Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/opportunities/:id"
            element={
              <ProtectedRoute>
                <Layout><Lazy><WithParam name="id">{(id) => <OpportunityDetailPage id={id} />}</WithParam></Lazy></Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/tasks"
            element={
              <ProtectedRoute>
                <Layout><Lazy><TaskListPage /></Lazy></Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/settings"
            element={
              <ProtectedRoute requiredScopes={ADMIN_SCOPES}>
                <Layout><Lazy><SettingsPage /></Lazy></Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/account"
            element={
              <ProtectedRoute>
                <Layout><Lazy><AccountPage /></Lazy></Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/team-chat"
            element={
              <ProtectedRoute>
                <Layout><Lazy><TeamChatPage /></Lazy></Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/reports"
            element={
              <ProtectedRoute>
                <Layout><Lazy><ReportsPage /></Lazy></Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/reports/templates"
            element={
              <ProtectedRoute>
                <Layout><Lazy><ReportTemplatesPage /></Lazy></Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/reports/new"
            element={
              <ProtectedRoute requiredScopes={["reports:edit"]}>
                <Layout><Lazy><ReportBuilderPage /></Lazy></Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/reports/:id"
            element={
              <ProtectedRoute>
                <Layout><Lazy><WithParam name="id">{(id) => <ReportBuilderPage id={id} />}</WithParam></Lazy></Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/dashboards"
            element={
              <ProtectedRoute>
                <Layout><Lazy><DashboardsPage /></Lazy></Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/dashboards/new"
            element={
              <ProtectedRoute requiredScopes={["reports:edit"]}>
                <Layout><Lazy><DashboardBuilderPage /></Lazy></Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/dashboards/:id"
            element={
              <ProtectedRoute>
                <Layout><Lazy><WithParam name="id">{(id) => <DashboardBuilderPage id={id} />}</WithParam></Lazy></Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/campaigns"
            element={
              <ProtectedRoute>
                <Layout><Lazy><CampaignListPage /></Lazy></Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/agent-performance"
            element={
              <ProtectedRoute>
                <Layout><Lazy><AgentPerformancePage /></Lazy></Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/audit"
            element={
              <ProtectedRoute requiredScopes={["audit:view"]}>
                <Layout><Lazy><AuditLogPage /></Lazy></Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/compliance"
            element={
              <ProtectedRoute requiredScopes={["compliance:manage"]}>
                <Layout><Lazy><CompliancePage /></Lazy></Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/platform/tenants"
            element={
              <ProtectedRoute requiredScopes={PLATFORM_SCOPES}>
                <Layout><Lazy><TenantManagementPage /></Lazy></Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/platform/tenants/:id"
            element={
              <ProtectedRoute requiredScopes={PLATFORM_SCOPES}>
                <Layout><Lazy><WithParam name="id">{(id) => <TenantDetailPage id={id} />}</WithParam></Lazy></Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/roles"
            element={
              <ProtectedRoute requiredScopes={["roles:view"]}>
                <Layout><Lazy><RoleManagementPage /></Lazy></Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/roles/:id"
            element={
              <ProtectedRoute requiredScopes={["roles:view"]}>
                <Layout><Lazy><WithParam name="id">{(id) => <RoleDetailPage id={id} />}</WithParam></Lazy></Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/onboard"
            element={
              <ProtectedRoute>
                <Lazy><OnboardingPage /></Lazy>
              </ProtectedRoute>
            }
          />

          <Route
            path="*"
            element={
              <ProtectedRoute>
                <Layout><NotFound /></Layout>
              </ProtectedRoute>
            }
          />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

const container = document.getElementById("app");
if (!container) throw new Error("Root element #app not found");
ReactDOM.createRoot(container).render(<App />);
