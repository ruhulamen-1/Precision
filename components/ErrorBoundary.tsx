import React, { Component, ErrorInfo, ReactNode } from "react";

interface Props { children: ReactNode; }
interface State { hasError: boolean; }

export class ErrorBoundary extends Component<Props, State> {
    public state: State = { hasError: false };

    public static getDerivedStateFromError(_: Error): State {
        return { hasError: true };
    }

    public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error("Uncaught error:", error, errorInfo);
    }

    public render() {
        if (this.state.hasError) {
            return (
                <div className="flex items-center justify-center min-h-[60vh] px-4">
                    <div className="bg-white border border-slate-200 rounded-xl p-8 max-w-sm w-full text-center shadow-sm">
                        <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-4">
                            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-slate-400">
                                <circle cx="12" cy="12" r="10" />
                                <line x1="12" y1="8" x2="12" y2="12" />
                                <line x1="12" y1="16" x2="12.01" y2="16" />
                            </svg>
                        </div>
                        <h2 className="text-lg font-semibold text-slate-800 mb-1">Something went wrong</h2>
                        <p className="text-sm text-slate-500 mb-6">An unexpected error occurred. Please refresh the page.</p>
                        <button
                            className="w-full py-2 px-4 rounded-lg text-sm font-medium bg-slate-800 text-white hover:bg-slate-700 transition-colors"
                            onClick={() => window.location.reload()}
                        >
                            Refresh page
                        </button>
                    </div>
                </div>
            );
        }
        return this.props.children;
    }
}