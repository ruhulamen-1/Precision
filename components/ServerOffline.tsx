import React, { useState, useEffect } from 'react';

interface Props {
    onRetry?: () => void;
}

export default function ServerOffline({ onRetry }: Props) {
    const [dots, setDots] = useState('');
    const [retrying, setRetrying] = useState(false);
    const [countdown, setCountdown] = useState(30);

    // Animated dots
    useEffect(() => {
        const interval = setInterval(() => {
            setDots(d => d.length >= 3 ? '' : d + '.');
        }, 500);
        return () => clearInterval(interval);
    }, []);

    // Auto-retry countdown
    useEffect(() => {
        const interval = setInterval(() => {
            setCountdown(c => {
                if (c <= 1) {
                    handleRetry();
                    return 30;
                }
                return c - 1;
            });
        }, 1000);
        return () => clearInterval(interval);
    }, []);

    const handleRetry = async () => {
        setRetrying(true);
        try {
            const res = await fetch('/api/dashboard-settings', { signal: AbortSignal.timeout(3000) });
            if (res.ok) {
                window.location.reload();
                return;
            }
        } catch {}
        setRetrying(false);
        setCountdown(30);
        onRetry?.();
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
            <div className="max-w-md w-full text-center">

                {/* Icon */}
                <div className="relative inline-flex items-center justify-center w-24 h-24 mb-8">
                    <div className="absolute inset-0 rounded-full bg-slate-100 border border-slate-200" />
                    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="relative text-slate-400">
                        <path d="M20 16v-4a8 8 0 1 0-16 0v4" />
                        <rect x="2" y="16" width="20" height="4" rx="2" />
                        <line x1="12" y1="20" x2="12" y2="20" />
                        <line x1="2" y1="2" x2="22" y2="22" stroke="currentColor" strokeWidth="1.5" />
                    </svg>
                </div>

                {/* Title */}
                <h1 className="text-2xl font-semibold text-slate-800 mb-2">
                    Server unavailable
                </h1>
                <p className="text-slate-500 text-sm mb-1">
                    Cannot connect to the Precision UI server.
                </p>
                <p className="text-slate-400 text-xs mb-8">
                    Make sure the server is running on the correct port.
                </p>

                {/* Status */}
                <div className="bg-white border border-slate-200 rounded-xl p-4 mb-6 text-left">
                    <div className="flex items-center gap-3 mb-3">
                        <div className="w-2 h-2 rounded-full bg-red-400 animate-pulse" />
                        <span className="text-xs font-medium text-slate-600 uppercase tracking-wider">Connection status</span>
                    </div>
                    <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                            <span className="text-slate-400">Server</span>
                            <span className="text-red-500 font-medium">Offline</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-slate-400">Auto-retry in</span>
                            <span className="text-slate-600 font-medium tabular-nums">{countdown}s</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-slate-400">Status</span>
                            <span className="text-slate-500">Checking{dots}</span>
                        </div>
                    </div>
                </div>

                {/* Retry button */}
                <button
                    onClick={handleRetry}
                    disabled={retrying}
                    className="w-full py-2.5 px-4 rounded-xl text-sm font-medium transition-all duration-200 bg-slate-800 text-white hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed mb-3"
                >
                    {retrying ? 'Connecting…' : 'Retry now'}
                </button>

                <p className="text-xs text-slate-400">
                    Run <code className="bg-slate-100 px-1.5 py-0.5 rounded text-slate-600 font-mono">npm run dev</code> to start the server
                </p>
            </div>
        </div>
    );
}
