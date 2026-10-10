import React, { useState } from 'react';
import { Lottie } from 'lottie-react';
import { Lock, Mail, ArrowRight, Settings, Wifi } from 'lucide-react';
import { apiUrl, getApiBase, setApiBase } from '../lib/api';
import heroAnimation from '../assets/auth-hero.json';

interface AuthScreenProps {
  onLoginSuccess: (token: string, user: any) => void;
}

export const AuthScreen: React.FC<AuthScreenProps> = ({ onLoginSuccess }) => {
  // Accepts either an Email (Admin-created accounts) or a Project Name (bulk-created
  // accounts log in with Project Name + Password, spaces are ignored) — sent to the
  // server as a single "identifier" field.
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Server Address — only needed on the Android APK build, where the app is
  // bundled locally and a plain "/api/..." can't reach a real backend. Leave
  // blank on the Web build (same-origin requests keep working as before).
  // A LAN IP (e.g. 192.168.0.10:3000) only works over the same WiFi as the
  // server; a real/public IP or domain also works over mobile data.
  const [showServerSettings, setShowServerSettings] = useState(false);
  const [serverAddress, setServerAddress] = useState(() => getApiBase());

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    // Save the Server Address (if any) before attempting login, so the login
    // request itself already goes to the right place.
    setApiBase(serverAddress);

    try {
      const res = await fetch(apiUrl('/api/auth/login'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier, password }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Authentication failed');
      }

      onLoginSuccess(data.token, data.user);
    } catch (err: any) {
      setError(
        err instanceof TypeError
          ? "Couldn't reach the server. Check the Server Address below and that the server is running and reachable."
          : err.message || 'Something went wrong'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#dceeff] flex flex-col justify-center py-12 sm:px-6 lg:px-8 relative overflow-hidden text-slate-900">
      <div className="sm:mx-auto sm:w-full sm:max-w-md relative z-10">
        <div className="flex justify-center">
          {/* Vector (Lottie) animation instead of the mp4/GIF — renders crisp at any
              size (no upscale blur) and plays back smoothly since it's driven by
              actual shape/keyframe data rather than decoding video/GIF frames. */}
          <Lottie
            src={heroAnimation}
            loop
            autoplay
            className="w-44 h-44 sm:w-32 sm:h-32"
          />
        </div>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md relative z-10 px-5 sm:px-4">
        <div className="bg-white py-10 px-6 shadow-sm rounded-2xl sm:py-8 sm:px-10 border border-slate-200">

          <h3 className="text-center text-base sm:text-sm font-bold text-slate-800 mb-7 sm:mb-6">
            Sign In
          </h3>

          {error && (
            <div className="mb-5 sm:mb-4 bg-rose-50 border border-rose-200 text-rose-700 text-sm sm:text-xs p-3.5 sm:p-3 rounded-xl flex items-center space-x-2">
              <span>{error}</span>
            </div>
          )}

          <form className="space-y-5 sm:space-y-4" onSubmit={handleSubmit}>
            <div>
              <label className="block text-sm sm:text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1.5">
                Email or Project Name
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 sm:pl-3 flex items-center pointer-events-none text-slate-400">
                  <Mail className="w-5 h-5 sm:w-4 sm:h-4" />
                </div>
                <input
                  type="text"
                  required
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  placeholder="you@company.com or Project Name"
                  className="block w-full pl-11 sm:pl-10 pr-3 py-3 sm:py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent text-base sm:text-sm"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm sm:text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1.5">
                Password
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 sm:pl-3 flex items-center pointer-events-none text-slate-400">
                  <Lock className="w-5 h-5 sm:w-4 sm:h-4" />
                </div>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="block w-full pl-11 sm:pl-10 pr-3 py-3 sm:py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent text-base sm:text-sm"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full mt-2 flex items-center justify-center space-x-2 py-3.5 sm:py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl shadow-sm transition-all text-base sm:text-sm disabled:opacity-50"
            >
              <span>{loading ? 'Signing in...' : 'Sign In to Dashboard'}</span>
              <ArrowRight className="w-5 h-5 sm:w-4 sm:h-4" />
            </button>
          </form>

          {/* Server Address — only relevant on the Android APK build (bundled app,
              can't use a relative /api/... path). Collapsed by default since Web
              users never need it. */}
          <div className="mt-5 pt-4 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setShowServerSettings((v) => !v)}
              className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500 hover:text-blue-600 transition-colors"
            >
              <Settings className="w-3.5 h-3.5" />
              Server Settings {showServerSettings ? '▲' : '▼'}
            </button>

            {showServerSettings && (
              <div className="mt-3 space-y-2">
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700">
                  Server Address <span className="font-normal normal-case text-slate-400">(Android app only)</span>
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                    <Wifi className="w-4 h-4" />
                  </div>
                  <input
                    type="text"
                    value={serverAddress}
                    onChange={(e) => setServerAddress(e.target.value)}
                    placeholder="e.g. 192.168.0.10:3000 or myserver.com"
                    className="block w-full pl-10 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent text-sm font-mono"
                  />
                </div>
                <p className="text-[10px] text-slate-400 leading-relaxed">
                  Leave blank on the Web app. On the Android app: enter your PC's LAN IP (e.g. 192.168.0.10:3000)
                  to use it over the same WiFi as the server, or a real/public IP or domain to use it over
                  mobile data or a different network. This is saved on Sign In.
                </p>
              </div>
            )}
          </div>

          <p className="mt-5 text-center text-[11px] text-slate-400">
            Don't have an account? Contact your Admin to get one created.
          </p>

        </div>

        <div className="mt-6 text-center text-xs text-slate-500">
          <span>MySQL database connection + JWT verification active</span>
        </div>
      </div>
    </div>
  );
};