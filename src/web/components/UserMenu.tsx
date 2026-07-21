import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Building2, ChevronDown, LogOut, UserCog } from "lucide-react";
import { useAuth } from "../lib/auth";
import { trpc } from "../trpc";

interface OrgOption {
  id: string;
  name: string;
}

export function UserMenu() {
  const { user, currentOrgId, refresh, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [orgs, setOrgs] = useState<OrgOption[]>([]);

  useEffect(() => {
    if (open) {
      trpc.auth.myOrgs.query().then(setOrgs).catch(() => setOrgs([]));
    }
  }, [open]);

  if (!user) return null;

  const handleSwitchOrg = async (orgId: string) => {
    await trpc.auth.switchOrg.mutate({ orgId });
    await refresh();
    setOpen(false);
    // Org-scoped data is fetched ad hoc per page (no central cache to invalidate — confirmed
    // in Phase 5's audit that this app doesn't use tRPC's React Query bindings), so a full
    // reload is the simplest way to guarantee every open page re-fetches under the new org.
    window.location.reload();
  };

  const handleLogout = async () => {
    await logout();
    navigate("/login", { replace: true });
  };

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-foreground-muted hover:bg-background-secondary hover:text-foreground"
      >
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary-100 text-xs font-medium text-primary-text">
          {(user.name ?? user.email ?? "?").slice(0, 1).toUpperCase()}
        </span>
        <span className="hidden sm:inline">{user.name ?? user.email}</span>
        <ChevronDown className="h-3.5 w-3.5" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-modal-backdrop" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-modal mt-2 w-56 rounded-lg border border-border bg-background shadow-lg">
            <div className="border-b border-border px-3 py-2">
              <p className="truncate text-sm font-medium text-foreground">{user.name ?? "—"}</p>
              <p className="truncate text-xs text-foreground-muted">{user.email}</p>
            </div>

            {orgs.length > 0 && (
              <div className="border-b border-border py-1">
                {orgs.map((org) => (
                  <button
                    key={org.id}
                    onClick={() => handleSwitchOrg(org.id)}
                    className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-background-secondary ${
                      org.id === currentOrgId ? "font-medium text-foreground" : "text-foreground-muted"
                    }`}
                  >
                    <Building2 className="h-3.5 w-3.5" />
                    {org.name}
                  </button>
                ))}
              </div>
            )}

            <div className="border-b border-border py-1">
              <button
                onClick={() => { setOpen(false); navigate("/account"); }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-foreground-muted hover:bg-background-secondary hover:text-foreground"
              >
                <UserCog className="h-3.5 w-3.5" />
                My Account
              </button>
            </div>

            <button
              onClick={handleLogout}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-foreground-muted hover:bg-background-secondary hover:text-foreground"
            >
              <LogOut className="h-3.5 w-3.5" />
              Log out
            </button>
          </div>
        </>
      )}
    </div>
  );
}
