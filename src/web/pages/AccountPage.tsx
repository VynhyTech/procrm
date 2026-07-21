import React, { useState } from "react";
import { useAuth } from "../lib/auth";
import { trpc } from "../trpc";
import { User, Lock } from "lucide-react";

export function AccountPage() {
  const { user, refresh } = useAuth();

  const [name, setName] = useState(user?.name ?? "");
  const [picture, setPicture] = useState(user?.picture ?? "");
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileSaved, setProfileSaved] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);
  const [passwordSaved, setPasswordSaved] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  const inputClass = "w-full rounded-lg border border-input-border bg-input-bg px-3 py-2 text-sm text-input-text placeholder:text-input-placeholder outline-none transition-colors focus:border-input-borderFocus";

  const handleSaveProfile = async () => {
    if (!name.trim()) return;
    setSavingProfile(true);
    setProfileError(null);
    setProfileSaved(false);
    try {
      await trpc.auth.updateProfile.mutate({ name: name.trim(), picture: picture.trim() || null });
      await refresh();
      setProfileSaved(true);
      setTimeout(() => setProfileSaved(false), 2500);
    } catch (err) {
      setProfileError(err instanceof Error ? err.message : "Failed to update profile");
    } finally {
      setSavingProfile(false);
    }
  };

  const handleChangePassword = async () => {
    setPasswordError(null);
    setPasswordSaved(false);
    if (newPassword.length < 8) {
      setPasswordError("New password must be at least 8 characters");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError("New password and confirmation don't match");
      return;
    }
    setChangingPassword(true);
    try {
      await trpc.auth.changePassword.mutate({ currentPassword, newPassword });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setPasswordSaved(true);
      setTimeout(() => setPasswordSaved(false), 2500);
    } catch (err) {
      setPasswordError(err instanceof Error ? err.message : "Failed to change password");
    } finally {
      setChangingPassword(false);
    }
  };

  if (!user) return null;

  return (
    <div className="mx-auto max-w-2xl p-6">
      <h1 className="mb-6 text-lg font-semibold text-foreground">Account Settings</h1>

      <div className="mb-6 rounded-xl border border-card-border bg-card p-5 shadow-card">
        <h2 className="mb-4 flex items-center gap-1.5 text-sm font-semibold text-foreground">
          <User className="h-4 w-4 text-foreground-subtle" /> Profile
        </h2>
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            {picture ? (
              <img src={picture} className="h-14 w-14 rounded-full object-cover" referrerPolicy="no-referrer" alt="" />
            ) : (
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary-100 text-lg font-medium text-primary-text">
                {(name || user.email || "?").slice(0, 1).toUpperCase()}
              </div>
            )}
            <div className="flex-1">
              <label className="mb-1.5 block text-xs font-medium text-foreground-subtle">Picture URL</label>
              <input type="text" value={picture} onChange={(e) => setPicture(e.target.value)} className={inputClass} placeholder="https://..." />
            </div>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-foreground-subtle">Name</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} className={inputClass} placeholder="Your name" />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-foreground-subtle">Email</label>
            <input type="text" value={user.email ?? ""} disabled className={inputClass + " opacity-60"} />
          </div>
          {profileError && <p className="text-xs text-error-500">{profileError}</p>}
          <div className="flex items-center gap-3">
            <button
              onClick={handleSaveProfile}
              disabled={savingProfile || !name.trim()}
              className="rounded-lg bg-button-primary-bg px-4 py-2 text-sm font-medium text-button-primary-text transition-colors hover:bg-button-primary-hover disabled:opacity-50"
            >
              {savingProfile ? "Saving..." : "Save Profile"}
            </button>
            {profileSaved && <span className="text-xs font-medium text-success-600">Saved</span>}
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-card-border bg-card p-5 shadow-card">
        <h2 className="mb-4 flex items-center gap-1.5 text-sm font-semibold text-foreground">
          <Lock className="h-4 w-4 text-foreground-subtle" /> Change Password
        </h2>
        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-foreground-subtle">Current Password</label>
            <input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-foreground-subtle">New Password</label>
            <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className={inputClass} placeholder="At least 8 characters" />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-foreground-subtle">Confirm New Password</label>
            <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className={inputClass} />
          </div>
          {passwordError && <p className="text-xs text-error-500">{passwordError}</p>}
          <div className="flex items-center gap-3">
            <button
              onClick={handleChangePassword}
              disabled={changingPassword || !currentPassword || !newPassword || !confirmPassword}
              className="rounded-lg bg-button-primary-bg px-4 py-2 text-sm font-medium text-button-primary-text transition-colors hover:bg-button-primary-hover disabled:opacity-50"
            >
              {changingPassword ? "Saving..." : "Change Password"}
            </button>
            {passwordSaved && <span className="text-xs font-medium text-success-600">Saved</span>}
          </div>
        </div>
      </div>
    </div>
  );
}
