import React, { useEffect, useRef, useState } from 'react';
import { Button } from './Button';
import { Mail, Lock, Github, Chrome } from 'lucide-react';
import { apiUrl, studioFetch } from '../lib/apiBase';

interface LoginPageProps {
  onLoginSuccess?: () => void;
}

export const LoginPage: React.FC<LoginPageProps> = ({ onLoginSuccess }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [mode, setMode] = useState<'login' | 'forgot' | 'signup'>('login');
  const [googleAuthLoading, setGoogleAuthLoading] = useState(false);
  const [googleAuthError, setGoogleAuthError] = useState('');
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState('');
  const [forgotBusy, setForgotBusy] = useState(false);
  const [forgotError, setForgotError] = useState('');
  const [forgotMsg, setForgotMsg] = useState('');
  const [forgotOtp, setForgotOtp] = useState('');
  const [forgotNewPassword, setForgotNewPassword] = useState('');
  const [forgotConfirmPassword, setForgotConfirmPassword] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const googleTokenClientRef = useRef<any>(null);

  const viteEnv = (import.meta as any).env ?? {};
  const googleClientId = (
    viteEnv.VITE_GOOGLE_CLIENT_ID ||
    viteEnv.GOOGLE_CLIENT_ID ||
    viteEnv.REACT_APP_GOOGLE_CLIENT_ID
  ) as string | undefined;
  const githubClientId = (
    viteEnv.VITE_GITHUB_CLIENT_ID ||
    viteEnv.GITHUB_CLIENT_ID ||
    viteEnv.REACT_APP_GITHUB_CLIENT_ID
  ) as string | undefined;

  const fallbackNameFromEmail = (value: string) => {
    const local = String(value || '').split('@')[0]?.trim();
    if (!local) {
      return 'User';
    }
    return local
      .replace(/[._-]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/\b\w/g, (m) => m.toUpperCase());
  };

  const finalizeLogin = async (payload?: { fullName?: string; email?: string; avatarUrl?: string }) => {
    if (payload?.email) {
      let prev: Record<string, unknown> = {};
      try {
        prev = JSON.parse(localStorage.getItem('active_user_profile') || '{}') as Record<string, unknown>;
        if (!prev || typeof prev !== 'object') prev = {};
      } catch {
        prev = {};
      }
      const cachedProfile = {
        ...prev,
        fullName: String(payload.fullName || '').trim(),
        email: String(payload.email || '').trim().toLowerCase(),
        avatarUrl: String(payload.avatarUrl || '').trim(),
      };
      localStorage.setItem('active_user_profile', JSON.stringify(cachedProfile));
    }
    onLoginSuccess?.();
  };

  useEffect(() => {
    if (!googleClientId) {
      return;
    }

    const initializeGoogleAuth = () => {
      const googleApi = (window as any).google;
      if (!googleApi?.accounts?.oauth2) {
        return;
      }

      googleTokenClientRef.current = googleApi.accounts.oauth2.initTokenClient({
        client_id: googleClientId,
        scope: 'openid email profile',
        callback: async (response: any) => {
          setGoogleAuthLoading(false);

          if (response?.error) {
            setGoogleAuthError('Google login failed. Please try again.');
            return;
          }

          try {
            setAuthBusy(true);
            setAuthError('');
            let loginPayload: any = {};
            const accessToken = String(response?.access_token || '').trim();
            try {
              const loginRes = await studioFetch(apiUrl('/api/auth/google'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ accessToken }),
              });
              loginPayload = await loginRes.json().catch(() => ({}));
              if (!loginRes.ok) {
                throw new Error(loginPayload?.message || 'Google authentication failed.');
              }
            } catch {
              // Fallback: still validate token directly against Google userinfo.
              const userInfoRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
                headers: { Authorization: `Bearer ${accessToken}` },
              });
              const userInfo = await userInfoRes.json().catch(() => ({}));
              if (!userInfoRes.ok) {
                throw new Error('Google authentication failed.');
              }
              loginPayload = {
                user: {
                  fullName: String(userInfo?.name || '').trim(),
                  email: String(userInfo?.email || '').trim(),
                  avatarUrl: String(userInfo?.picture || '').trim(),
                },
              };
            }
            setGoogleAuthError('');
            await finalizeLogin({
              fullName: loginPayload?.user?.fullName,
              email: loginPayload?.user?.email,
              avatarUrl: loginPayload?.user?.avatarUrl,
            });
          } catch (error) {
            const message = error instanceof Error ? error.message : 'Google authentication failed.';
            setGoogleAuthError(message);
          } finally {
            setAuthBusy(false);
          }
        },
      });
    };

    const googleApi = (window as any).google;
    if (googleApi?.accounts?.oauth2) {
      initializeGoogleAuth();
      return;
    }

    const existingScript = document.getElementById('google-identity-services');
    if (existingScript) {
      existingScript.addEventListener('load', initializeGoogleAuth);
      return () => existingScript.removeEventListener('load', initializeGoogleAuth);
    }

    const script = document.createElement('script');
    script.id = 'google-identity-services';
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.addEventListener('load', initializeGoogleAuth);
    document.body.appendChild(script);

    return () => script.removeEventListener('load', initializeGoogleAuth);
  }, [googleClientId, onLoginSuccess]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const state = params.get('state');
    const provider = params.get('provider');
    if (!code || provider !== 'github') {
      return;
    }

    const expectedState = sessionStorage.getItem('github_oauth_state');
    if (!state || !expectedState || state !== expectedState) {
      setAuthError('GitHub authentication failed. Invalid state.');
      return;
    }

    const redirectUri = `${window.location.origin}${window.location.pathname}?provider=github`;
    const completeGithubLogin = async () => {
      try {
        setAuthBusy(true);
        setAuthError('');
        const res = await studioFetch(apiUrl('/api/auth/github'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code, redirectUri }),
        });
        const payload = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(payload?.message || 'GitHub authentication failed.');
        }
        await finalizeLogin({
          fullName: payload?.user?.fullName,
          email: payload?.user?.email,
          avatarUrl: payload?.user?.avatarUrl,
        });
      } catch (error) {
        setAuthError(error instanceof Error ? error.message : 'GitHub authentication failed.');
      } finally {
        setAuthBusy(false);
        sessionStorage.removeItem('github_oauth_state');
        const cleanUrl = `${window.location.origin}${window.location.pathname}`;
        window.history.replaceState({}, document.title, cleanUrl);
      }
    };
    void completeGithubLogin();
  }, [onLoginSuccess]);

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setAuthBusy(true);
      setAuthError('');
      const res = await studioFetch(apiUrl('/api/auth/login'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(payload?.message || 'Login failed.');
      }
      await finalizeLogin({
        fullName: payload?.user?.fullName || fallbackNameFromEmail(email),
        email: payload?.user?.email || email,
        avatarUrl: payload?.user?.avatarUrl || '',
      });
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'Login failed.');
    } finally {
      setAuthBusy(false);
    }
  };

  const handleGoogleLogin = () => {
    if (!googleClientId) {
      setGoogleAuthError(
        'Missing Google client ID. Add VITE_GOOGLE_CLIENT_ID to your .env.local file.'
      );
      return;
    }

    if (!googleTokenClientRef.current) {
      setGoogleAuthError('Google login is not ready yet. Please try again.');
      return;
    }

    setGoogleAuthError('');
    setGoogleAuthLoading(true);
    googleTokenClientRef.current.requestAccessToken({ prompt: 'select_account' });
  };

  const handleGithubLogin = () => {
    if (!githubClientId) {
      setAuthError('Missing GitHub client ID. Add VITE_GITHUB_CLIENT_ID to your .env.local file.');
      return;
    }
    const state = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
    sessionStorage.setItem('github_oauth_state', state);
    const redirectUri = `${window.location.origin}${window.location.pathname}?provider=github`;
    const githubUrl = new URL('https://github.com/login/oauth/authorize');
    githubUrl.searchParams.set('client_id', githubClientId);
    githubUrl.searchParams.set('redirect_uri', redirectUri);
    githubUrl.searchParams.set('scope', 'read:user user:email');
    githubUrl.searchParams.set('state', state);
    window.location.assign(githubUrl.toString());
  };

  const handleSignup = () => {
    setMode('signup');
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setForgotBusy(true);
      setForgotError('');
      setForgotMsg('');
      const requestRes = await studioFetch(apiUrl('/api/auth/forgot-password/request-otp'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const requestPayload = await requestRes.json().catch(() => ({}));
      if (!requestRes.ok) {
        throw new Error(requestPayload?.message || 'Unable to send OTP.');
      }
      setOtpSent(true);
      const devOtp = String(requestPayload?.otp || '').trim();
      setForgotOtp(devOtp);
      setForgotMsg(
        devOtp
          ? `OTP sent. (Dev OTP: ${devOtp})`
          : 'OTP sent to your email. Enter it below to reset password.'
      );
    } catch (error) {
      setForgotError(error instanceof Error ? error.message : 'Unable to send OTP.');
    } finally {
      setForgotBusy(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (!otpSent) {
        setForgotError('Request OTP first.');
        return;
      }
      if (!forgotOtp.trim()) {
        setForgotError('Enter OTP.');
        return;
      }
      if (forgotNewPassword.length < 6) {
        setForgotError('New password must be at least 6 characters.');
        return;
      }
      if (forgotNewPassword !== forgotConfirmPassword) {
        setForgotError('New password and confirm password do not match.');
        return;
      }
      setForgotBusy(true);
      setForgotError('');
      const resetRes = await studioFetch(apiUrl('/api/auth/forgot-password/reset'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          otp: forgotOtp.trim(),
          newPassword: forgotNewPassword,
        }),
      });
      const resetPayload = await resetRes.json().catch(() => ({}));
      if (!resetRes.ok) {
        throw new Error(resetPayload?.message || 'Unable to reset password.');
      }
      setForgotMsg(resetPayload?.message || 'Password reset successful.');
      setMode('login');
      setPassword('');
      setForgotOtp('');
      setForgotNewPassword('');
      setForgotConfirmPassword('');
      setOtpSent(false);
    } catch (error) {
      setForgotError(error instanceof Error ? error.message : 'Unable to reset password.');
    } finally {
      setForgotBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
      <div className="max-w-6xl w-full bg-white rounded-3xl shadow-xl overflow-hidden grid grid-cols-1 lg:grid-cols-2">
        {/* Left - Login / Forgot Password */}
        <div className="px-8 sm:px-12 py-10 flex flex-col">
          <div className="mb-10">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-gradient-to-r from-indigo-600 via-purple-500 to-pink-500 flex items-center justify-center text-white font-bold text-xl">
                xo
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-slate-400">welcome back</p>
                <p className="text-2xl font-bold text-slate-900 leading-tight">
                  XeroCode.ai
                </p>
              </div>
            </div>
          </div>

          {mode === 'login' ? (
            <>
              <div className="mb-6">
                <h2 className="text-2xl font-semibold text-slate-900 mb-1">Welcome Back</h2>
                <p className="text-sm text-slate-500">
                  Welcome back! Please enter your details.
                </p>
              </div>

              <form
                onSubmit={handleEmailLogin}
                className="space-y-5 flex-1 flex flex-col rounded-2xl border border-slate-200 p-6 sm:p-7 bg-white/50"
              >
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-slate-700">Email</label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-3 flex items-center text-slate-400">
                      <Mail className="w-4 h-4" />
                    </span>
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      placeholder="Enter your email"
                      className="w-full pl-10 pr-3 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm bg-slate-50/80"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-slate-700">Password</label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-3 flex items-center text-slate-400">
                      <Lock className="w-4 h-4" />
                    </span>
                    <input
                      type="password"
                      required
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      placeholder="Enter your password"
                      className="w-full pl-10 pr-3 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm bg-slate-50/80"
                    />
                  </div>
                  <div className="flex justify-end">
                    <button
                      type="button"
                      className="text-xs font-medium text-indigo-600 hover:text-indigo-700"
                      onClick={() => setMode('forgot')}
                    >
                      Forgot password
                    </button>
                  </div>
                </div>

                <div className="space-y-3 pt-2">
                  {(googleAuthError || authError) && (
                    <p className="text-xs text-rose-600 bg-rose-50 border border-rose-100 rounded-lg px-3 py-2">
                      {googleAuthError || authError}
                    </p>
                  )}

                  <Button type="submit" className="w-full py-3 text-sm font-semibold rounded-xl" disabled={authBusy}>
                    {authBusy ? 'Validating...' : 'Login'}
                  </Button>

                  <div className="relative text-center text-xs text-slate-400">
                    <span className="absolute inset-x-0 top-1/2 border-t border-slate-200" />
                    <span className="relative bg-white px-2">or continue with</span>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <Button
                      type="button"
                      variant="secondary"
                      className="w-full py-2.5 text-xs rounded-xl"
                      onClick={handleGoogleLogin}
                      disabled={googleAuthLoading || authBusy}
                      leftIcon={<Chrome className="w-4 h-4" />}
                    >
                      {googleAuthLoading ? 'Connecting...' : 'Google'}
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      className="w-full py-2.5 text-xs rounded-xl"
                      onClick={handleGithubLogin}
                      leftIcon={<Github className="w-4 h-4" />}
                    >
                      GitHub
                    </Button>
                  </div>
                </div>

                <div className="pt-4 text-center text-xs text-slate-500">
                  Don&apos;t have an account?{' '}
                  <button
                    type="button"
                    onClick={handleSignup}
                    className="font-semibold text-indigo-600 hover:text-indigo-700"
                  >
                    Sign up
                  </button>
                </div>
              </form>
            </>
          ) : mode === 'forgot' ? (
            <form
              onSubmit={otpSent ? handleResetPassword : handleForgotPassword}
              className="space-y-6 flex-1 flex flex-col max-w-md rounded-2xl border border-slate-200 p-6 sm:p-7 bg-white/50"
            >
              <div className="mb-2">
                <h2 className="text-2xl font-semibold text-slate-900 mb-2">Forgot Password</h2>
                <p className="text-sm text-slate-500">
                  Enter your email to receive an OTP.
                </p>
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium text-slate-700">Email</label>
                <div className="relative">
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="Enter your email"
                    className="w-full px-4 py-3 rounded-2xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm bg-slate-50/80"
                  />
                </div>
              </div>

              {otpSent && (
                <>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-slate-700">OTP</label>
                    <input
                      type="text"
                      required
                      value={forgotOtp}
                      onChange={(e) => setForgotOtp(e.target.value)}
                      placeholder="Enter 6-digit OTP"
                      className="w-full px-4 py-3 rounded-2xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm bg-slate-50/80"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-slate-700">New Password</label>
                    <input
                      type="password"
                      required
                      value={forgotNewPassword}
                      onChange={(e) => setForgotNewPassword(e.target.value)}
                      placeholder="Enter new password"
                      className="w-full px-4 py-3 rounded-2xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm bg-slate-50/80"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-slate-700">Confirm New Password</label>
                    <input
                      type="password"
                      required
                      value={forgotConfirmPassword}
                      onChange={(e) => setForgotConfirmPassword(e.target.value)}
                      placeholder="Confirm new password"
                      className="w-full px-4 py-3 rounded-2xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm bg-slate-50/80"
                    />
                  </div>
                </>
              )}

              {(forgotError || forgotMsg) && (
                <p className={`text-xs rounded-lg px-3 py-2 border ${forgotError ? 'text-rose-600 bg-rose-50 border-rose-100' : 'text-emerald-700 bg-emerald-50 border-emerald-100'}`}>
                  {forgotError || forgotMsg}
                </p>
              )}

              <Button type="submit" className="w-full py-3 text-sm font-semibold rounded-2xl" disabled={forgotBusy}>
                {forgotBusy ? 'Processing...' : otpSent ? 'Reset Password' : 'Send OTP'}
              </Button>

              <button
                type="button"
                onClick={() => setMode('login')}
                className="mt-2 text-xs font-medium text-indigo-600 hover:text-indigo-700 self-center"
              >
                Back to Login
              </button>
            </form>
          ) : (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (password !== confirmPassword) {
                  setAuthError('Password and confirm password do not match.');
                  return;
                }
                try {
                  setAuthBusy(true);
                  setAuthError('');
                  const res = await studioFetch(apiUrl('/api/auth/signup'), {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      fullName: name,
                      email,
                      password,
                    }),
                  });
                  const payload = await res.json().catch(() => ({}));
                  if (!res.ok) {
                    throw new Error(payload?.message || 'Signup failed.');
                  }
                  await finalizeLogin({
                    fullName: payload?.user?.fullName || name,
                    email: payload?.user?.email || email,
                    avatarUrl: payload?.user?.avatarUrl || '',
                  });
                } catch (error) {
                  setAuthError(error instanceof Error ? error.message : 'Signup failed.');
                } finally {
                  setAuthBusy(false);
                }
              }}
              className="space-y-6 flex-1 flex flex-col max-w-md rounded-2xl border border-slate-200 p-6 sm:p-7 bg-white/50"
            >
              <div className="mb-2">
                <h2 className="text-2xl font-semibold text-slate-900 mb-2">Register</h2>
                <p className="text-sm text-slate-500">
                  Welcome! Please enter your details.
                </p>
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium text-slate-700">Name</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="Enter your name"
                  className="w-full px-4 py-3 rounded-2xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm bg-slate-50/80"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium text-slate-700">Email</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="Enter your email"
                  className="w-full px-4 py-3 rounded-2xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm bg-slate-50/80"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium text-slate-700">Password</label>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  className="w-full px-4 py-3 rounded-2xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm bg-slate-50/80"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium text-slate-700">Confirm Password</label>
                <input
                  type="password"
                  required
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  placeholder="Enter your password again"
                  className="w-full px-4 py-3 rounded-2xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm bg-slate-50/80"
                />
              </div>

              {authError && (
                <p className="text-xs text-rose-600 bg-rose-50 border border-rose-100 rounded-lg px-3 py-2">
                  {authError}
                </p>
              )}

              <Button type="submit" className="w-full py-3 text-sm font-semibold rounded-2xl" disabled={authBusy}>
                {authBusy ? 'Creating account...' : 'Register'}
              </Button>

              <div className="mt-2 text-xs text-slate-500 text-center">
                Already have an account?{' '}
                <button
                  type="button"
                  onClick={() => setMode('login')}
                  className="font-semibold text-indigo-600 hover:text-indigo-700"
                >
                  Sign in
                </button>
              </div>
            </form>
          )}
        </div>

        {/* Right - Hero section */}
        <div className="bg-slate-900 text-white relative overflow-hidden flex items-center justify-center p-10">
          <div className="absolute inset-0 opacity-70 bg-gradient-to-br from-indigo-600 via-slate-900 to-amber-400" />
          <div className="relative z-10 max-w-md space-y-6">
            <p className="uppercase tracking-[0.25em] text-xs text-slate-200">
              infinite solution for infinite ideas
            </p>
            <h2 className="text-3xl sm:text-4xl font-bold leading-tight">
              Accelerate, innovate, integrate, build
            </h2>
            <p className="text-sm sm:text-base text-slate-100">
              Effortlessly build cutting-edge agentic AI systems with intuitive workflow
              and no-code tools in minutes.
            </p>
            <div className="mt-6">
              <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-xs backdrop-blur">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                <span>Workflows → UI → UX</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};


