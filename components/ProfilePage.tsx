import React, { useEffect, useState } from 'react';
import { ArrowLeft, Loader2, Save } from 'lucide-react';
import { apiUrl, readApiJson, studioFetch } from '../lib/apiBase';

type UserProfile = {
  fullName: string;
  email: string;
  phone: string;
  company: string;
  roleTitle: string;
  bio: string;
  avatarUrl: string;
  slackUrl: string;
  discordUrl: string;
  linkedinUrl: string;
  xUrl: string;
};

const EMPTY_PROFILE: UserProfile = {
  fullName: '',
  email: '',
  phone: '',
  company: '',
  roleTitle: '',
  bio: '',
  avatarUrl: '',
  slackUrl: '',
  discordUrl: '',
  linkedinUrl: '',
  xUrl: '',
};

interface ProfilePageProps {
  isDarkMode: boolean;
  onBack: () => void;
}

export const ProfilePage: React.FC<ProfilePageProps> = ({ isDarkMode, onBack }) => {
  const [profile, setProfile] = useState<UserProfile>(EMPTY_PROFILE);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await studioFetch(apiUrl('/api/profile'));
        const data = await readApiJson<{
          ok?: boolean;
          message?: string;
          profile?: UserProfile;
        }>(res);
        if (cancelled) {
          return;
        }
        if (!res.ok || !data?.ok) {
          throw new Error(data?.message || `Could not load profile (HTTP ${res.status})`);
        }
        setProfile({ ...EMPTY_PROFILE, ...(data.profile ?? {}) });
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Could not load profile');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const onSave = async () => {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const res = await studioFetch(apiUrl('/api/profile'), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(profile),
      });
      const data = await readApiJson<{ ok?: boolean; message?: string; profile?: UserProfile }>(res);
      if (!res.ok || !data?.ok) {
        throw new Error(data?.message || `Could not save profile (HTTP ${res.status})`);
      }
      const saved = { ...EMPTY_PROFILE, ...(data.profile ?? {}) };
      setProfile(saved);
      setMessage(data.message || 'Profile saved.');
      try {
        localStorage.setItem(
          'active_user_profile',
          JSON.stringify({
            fullName: saved.fullName || 'User',
            email: saved.email || '',
            avatarUrl: saved.avatarUrl || '',
            slackUrl: saved.slackUrl || '',
            discordUrl: saved.discordUrl || '',
            linkedinUrl: saved.linkedinUrl || '',
            xUrl: saved.xUrl || '',
          })
        );
      } catch {
        /* ignore */
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save profile');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={`min-h-screen ${isDarkMode ? 'bg-black text-slate-100' : 'bg-slate-50 text-slate-900'}`}>
      <header
        className={`flex h-12 items-center justify-between border-b px-4 lg:px-8 ${
          isDarkMode ? 'border-slate-800 bg-black' : 'border-slate-200 bg-white'
        }`}
      >
        <button
          type="button"
          onClick={onBack}
          className={`inline-flex items-center gap-1.5 text-xs ${
            isDarkMode ? 'text-slate-400 hover:text-slate-100' : 'text-slate-500 hover:text-slate-900'
          }`}
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back
        </button>
        <span className="text-sm font-semibold">My Profile</span>
        <button
          type="button"
          onClick={onSave}
          disabled={saving || loading}
          className="inline-flex items-center gap-1.5 rounded-md bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
          Save
        </button>
      </header>

      <main className="mx-auto max-w-3xl p-4 lg:p-8">
        {loading ? (
          <div className="flex items-center gap-2 text-sm">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading profile...
          </div>
        ) : (
          <div
            className={`rounded-xl border p-4 lg:p-6 ${
              isDarkMode ? 'border-slate-800 bg-slate-900/70' : 'border-slate-200 bg-white'
            }`}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="text-xs">
                <span className={isDarkMode ? 'text-slate-400' : 'text-slate-500'}>Full name</span>
                <input
                  value={profile.fullName}
                  onChange={(e) => setProfile((p) => ({ ...p, fullName: e.target.value }))}
                  className={`mt-1 h-10 w-full rounded-md border px-3 text-sm outline-none ${
                    isDarkMode
                      ? 'border-slate-700 bg-slate-950 text-slate-100'
                      : 'border-slate-200 bg-white text-slate-900'
                  }`}
                />
              </label>
              <label className="text-xs">
                <span className={isDarkMode ? 'text-slate-400' : 'text-slate-500'}>Email</span>
                <input
                  value={profile.email}
                  onChange={(e) => setProfile((p) => ({ ...p, email: e.target.value }))}
                  className={`mt-1 h-10 w-full rounded-md border px-3 text-sm outline-none ${
                    isDarkMode
                      ? 'border-slate-700 bg-slate-950 text-slate-100'
                      : 'border-slate-200 bg-white text-slate-900'
                  }`}
                />
              </label>
              <label className="text-xs">
                <span className={isDarkMode ? 'text-slate-400' : 'text-slate-500'}>Phone</span>
                <input
                  value={profile.phone}
                  onChange={(e) => setProfile((p) => ({ ...p, phone: e.target.value }))}
                  className={`mt-1 h-10 w-full rounded-md border px-3 text-sm outline-none ${
                    isDarkMode
                      ? 'border-slate-700 bg-slate-950 text-slate-100'
                      : 'border-slate-200 bg-white text-slate-900'
                  }`}
                />
              </label>
              <label className="text-xs">
                <span className={isDarkMode ? 'text-slate-400' : 'text-slate-500'}>Company</span>
                <input
                  value={profile.company}
                  onChange={(e) => setProfile((p) => ({ ...p, company: e.target.value }))}
                  className={`mt-1 h-10 w-full rounded-md border px-3 text-sm outline-none ${
                    isDarkMode
                      ? 'border-slate-700 bg-slate-950 text-slate-100'
                      : 'border-slate-200 bg-white text-slate-900'
                  }`}
                />
              </label>
            </div>
            <label className="mt-4 block text-xs">
              <span className={isDarkMode ? 'text-slate-400' : 'text-slate-500'}>Role</span>
              <input
                value={profile.roleTitle}
                onChange={(e) => setProfile((p) => ({ ...p, roleTitle: e.target.value }))}
                className={`mt-1 h-10 w-full rounded-md border px-3 text-sm outline-none ${
                  isDarkMode
                    ? 'border-slate-700 bg-slate-950 text-slate-100'
                    : 'border-slate-200 bg-white text-slate-900'
                }`}
              />
            </label>
            <label className="mt-4 block text-xs">
              <span className={isDarkMode ? 'text-slate-400' : 'text-slate-500'}>Avatar URL</span>
              <input
                value={profile.avatarUrl}
                onChange={(e) => setProfile((p) => ({ ...p, avatarUrl: e.target.value }))}
                className={`mt-1 h-10 w-full rounded-md border px-3 text-sm outline-none ${
                  isDarkMode
                    ? 'border-slate-700 bg-slate-950 text-slate-100'
                    : 'border-slate-200 bg-white text-slate-900'
                }`}
              />
            </label>
            <label className="mt-4 block text-xs">
              <span className={isDarkMode ? 'text-slate-400' : 'text-slate-500'}>Slack link</span>
              <input
                value={profile.slackUrl}
                onChange={(e) => setProfile((p) => ({ ...p, slackUrl: e.target.value }))}
                placeholder="https://…"
                className={`mt-1 h-10 w-full rounded-md border px-3 text-sm outline-none ${
                  isDarkMode
                    ? 'border-slate-700 bg-slate-950 text-slate-100'
                    : 'border-slate-200 bg-white text-slate-900'
                }`}
              />
            </label>
            <label className="mt-4 block text-xs">
              <span className={isDarkMode ? 'text-slate-400' : 'text-slate-500'}>Discord invite</span>
              <input
                value={profile.discordUrl}
                onChange={(e) => setProfile((p) => ({ ...p, discordUrl: e.target.value }))}
                placeholder="https://discord.gg/…"
                className={`mt-1 h-10 w-full rounded-md border px-3 text-sm outline-none ${
                  isDarkMode
                    ? 'border-slate-700 bg-slate-950 text-slate-100'
                    : 'border-slate-200 bg-white text-slate-900'
                }`}
              />
            </label>
            <label className="mt-4 block text-xs">
              <span className={isDarkMode ? 'text-slate-400' : 'text-slate-500'}>LinkedIn</span>
              <input
                value={profile.linkedinUrl}
                onChange={(e) => setProfile((p) => ({ ...p, linkedinUrl: e.target.value }))}
                placeholder="https://linkedin.com/…"
                className={`mt-1 h-10 w-full rounded-md border px-3 text-sm outline-none ${
                  isDarkMode
                    ? 'border-slate-700 bg-slate-950 text-slate-100'
                    : 'border-slate-200 bg-white text-slate-900'
                }`}
              />
            </label>
            <label className="mt-4 block text-xs">
              <span className={isDarkMode ? 'text-slate-400' : 'text-slate-500'}>X (Twitter)</span>
              <input
                value={profile.xUrl}
                onChange={(e) => setProfile((p) => ({ ...p, xUrl: e.target.value }))}
                placeholder="https://x.com/…"
                className={`mt-1 h-10 w-full rounded-md border px-3 text-sm outline-none ${
                  isDarkMode
                    ? 'border-slate-700 bg-slate-950 text-slate-100'
                    : 'border-slate-200 bg-white text-slate-900'
                }`}
              />
            </label>
            <label className="mt-4 block text-xs">
              <span className={isDarkMode ? 'text-slate-400' : 'text-slate-500'}>Bio</span>
              <textarea
                value={profile.bio}
                onChange={(e) => setProfile((p) => ({ ...p, bio: e.target.value }))}
                rows={4}
                className={`mt-1 w-full rounded-md border px-3 py-2 text-sm outline-none ${
                  isDarkMode
                    ? 'border-slate-700 bg-slate-950 text-slate-100'
                    : 'border-slate-200 bg-white text-slate-900'
                }`}
              />
            </label>
            {message ? <p className="mt-3 text-xs text-emerald-500">{message}</p> : null}
            {error ? <p className="mt-3 text-xs text-rose-500">{error}</p> : null}
          </div>
        )}
      </main>
    </div>
  );
};

