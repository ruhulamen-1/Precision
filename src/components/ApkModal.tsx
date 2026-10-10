import React from 'react';
import { Smartphone, X, Terminal, CheckCircle2, Download } from 'lucide-react';

interface ApkModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ApkModal: React.FC<ApkModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl">
        <div className="p-6 border-b border-slate-800 flex justify-between items-center sticky top-0 bg-slate-900 z-10">
          <div className="flex items-center space-x-3">
            <div className="bg-emerald-600/20 text-emerald-400 p-2 rounded-xl">
              <Smartphone className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white">Android APK Build Guide (Capacitor)</h3>
              <p className="text-xs text-slate-400">Convert this web app into a native Android APK</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6 text-sm text-slate-300">
          <div className="space-y-3">
            <h4 className="font-semibold text-white flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-indigo-600 text-white flex items-center justify-center text-xs">1</span>
              Install Capacitor CLI & Android Packages
            </h4>
            <div className="bg-slate-950 p-3.5 rounded-xl font-mono text-xs text-indigo-300 border border-slate-800">
              npm install @capacitor/core @capacitor/cli @capacitor/android
            </div>
          </div>

          <div className="space-y-3">
            <h4 className="font-semibold text-white flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-indigo-600 text-white flex items-center justify-center text-xs">2</span>
              Build Frontend Bundle
            </h4>
            <div className="bg-slate-950 p-3.5 rounded-xl font-mono text-xs text-indigo-300 border border-slate-800">
              npm run build
            </div>
          </div>

          <div className="space-y-3">
            <h4 className="font-semibold text-white flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-indigo-600 text-white flex items-center justify-center text-xs">3</span>
              Add Android Platform
            </h4>
            <div className="bg-slate-950 p-3.5 rounded-xl font-mono text-xs text-indigo-300 border border-slate-800">
              npx cap add android
            </div>
          </div>

          <div className="space-y-3">
            <h4 className="font-semibold text-white flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-indigo-600 text-white flex items-center justify-center text-xs">4</span>
              Open in Android Studio & Generate APK
            </h4>
            <div className="bg-slate-950 p-3.5 rounded-xl font-mono text-xs text-indigo-300 border border-slate-800">
              npx cap open android
            </div>
            <p className="text-xs text-slate-400">
              Once Android Studio opens, go to <strong className="text-white">Build &gt; Build Bundle(s) / APK(s) &gt; Build APK(s)</strong>.
            </p>
          </div>

          <div className="bg-indigo-950/30 border border-indigo-500/30 rounded-xl p-4 text-xs text-indigo-200">
            <p className="font-semibold mb-1">Single Codebase Advantage:</p>
            The same React codebase powers both Web and Android APK. Both platforms connect to your MySQL backend REST API, and authentication automatically routes users to their respective Admin or User dashboards.
          </div>
        </div>

        <div className="p-6 border-t border-slate-800 bg-slate-950 flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-xl transition-all"
          >
            Got It
          </button>
        </div>
      </div>
    </div>
  );
};
