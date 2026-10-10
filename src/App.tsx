/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { User } from './types';
import { AuthScreen } from './components/AuthScreen';
import { Navbar } from './components/Navbar';
import { UserPanel } from './components/UserPanel';
import { AdminPanel } from './components/AdminPanel';
import { ApkModal } from './components/ApkModal';

export default function App() {
  const [token, setToken] = useState<string | null>(localStorage.getItem('mpr_token'));
  const [user, setUser] = useState<User | null>(() => {
    const saved = localStorage.getItem('mpr_user');
    return saved ? JSON.parse(saved) : null;
  });
  const [isApkModalOpen, setIsApkModalOpen] = useState(false);

  const handleLoginSuccess = (newToken: string, newUser: User) => {
    localStorage.setItem('mpr_token', newToken);
    localStorage.setItem('mpr_user', JSON.stringify(newUser));
    setToken(newToken);
    setUser(newUser);
  };

  const handleLogout = () => {
    localStorage.removeItem('mpr_token');
    localStorage.removeItem('mpr_user');
    setToken(null);
    setUser(null);
  };

  if (!token || !user) {
    return <AuthScreen onLoginSuccess={handleLoginSuccess} />;
  }

  return (
    <div className="min-h-screen bg-[#dceeff] text-slate-900 flex flex-col font-sans selection:bg-indigo-500 selection:text-white">
      <Navbar
        user={user}
        onLogout={handleLogout}
        onOpenApkInfo={() => setIsApkModalOpen(true)}
      />

      <main className="flex-1">
        {user.role === 'admin' ? (
          <AdminPanel token={token} />
        ) : (
          <UserPanel token={token} user={user} />
        )}
      </main>

      <footer className="bg-slate-900 border-t border-slate-800 py-6 text-center text-xs text-slate-500">
        <p>Project & Job MPR Tracker • Powered by MySQL, Express & React • Android APK Ready via Capacitor</p>
      </footer>

      <ApkModal
        isOpen={isApkModalOpen}
        onClose={() => setIsApkModalOpen(false)}
      />
    </div>
  );
}