import React from 'react';
import { User } from '../types';
import { Shield, User as UserIcon, LogOut, Smartphone, Database } from 'lucide-react';

interface NavbarProps {
  user: User;
  onLogout: () => void;
  onOpenApkInfo: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({ user, onLogout, onOpenApkInfo }) => {
  return (
    <header className="bg-white border-b border-slate-200 text-slate-900 sticky top-0 z-50 shadow-xs">
      <div className="w-full px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="bg-blue-600 p-2 rounded-xl text-white shadow-sm">
            <Database className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-base font-bold tracking-tight text-slate-900 flex items-center gap-2">
              MPR & Job Tracker
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200 font-medium hidden sm:inline-block">
                MySQL + REST API
              </span>
            </h1>
            <p className="text-xs text-slate-500">Web & Android APK Ready</p>
          </div>
        </div>

        <div className="flex items-center space-x-4">
          <button
            onClick={onOpenApkInfo}
            className="hidden md:flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition-colors border border-slate-200 shadow-2xs"
            title="Android APK Build Instructions"
          >
            <Smartphone className="w-4 h-4 text-emerald-600" />
            <span>APK Guide</span>
          </button>

          <div className="flex items-center space-x-3 pl-4 border-l border-slate-200">
            <div className="text-right hidden sm:block">
              <div className="text-sm font-semibold text-slate-900">{user.name}</div>
              <div className="text-xs text-slate-500">{user.email}</div>
            </div>
            
            <div className="flex items-center space-x-1">
              {user.role === 'admin' ? (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-200">
                  <Shield className="w-3.5 h-3.5 text-amber-600" /> Admin
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-800 border border-blue-200">
                  <UserIcon className="w-3.5 h-3.5 text-blue-600" /> User
                </span>
              )}
            </div>

            <button
              onClick={onLogout}
              className="p-2 rounded-xl text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors"
              title="Logout"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};