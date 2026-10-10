import React from 'react';

interface ActionPanelProps {
  onAddRow: () => void;
  onClearAll: () => void;
  canEditActivity: boolean;
  canDeleteActivity: boolean;
}

const ActionPanel = React.forwardRef<HTMLButtonElement, ActionPanelProps>(({
    onAddRow,
    onClearAll,
    canEditActivity,
    canDeleteActivity
}, ref) => {
    return (
        <div className="mt-6 p-5 bg-gray-50 dark:bg-slate-700/50 border-t border-b border-gray-200 dark:border-slate-700 rounded-lg">
            <div className="flex flex-wrap justify-center items-center gap-4">
                {canEditActivity && (
                    <button
                        ref={ref}
                        type="button"
                        onClick={onAddRow}
                        className="flex items-center justify-center gap-2 px-4 py-2 bg-amber-500 text-white font-bold rounded-md hover:bg-amber-600 transition-colors duration-300 text-sm animate-scale-in"
                        id="btn-add-row"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110 2h5V4a1 1 0 011-1z" clipRule="evenodd" /></svg>
                        Add New Row
                    </button>
                )}
                {canDeleteActivity && (
                    <button
                        type="button"
                        onClick={onClearAll}
                        className="flex items-center justify-center gap-2 px-4 py-2 bg-rose-500 text-white font-bold rounded-md hover:bg-rose-600 transition-colors duration-300 text-sm animate-scale-in"
                        id="btn-clear-all"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
                        Clear All
                    </button>
                )}
            </div>
        </div>
    );
});

ActionPanel.displayName = 'ActionPanel';

export default ActionPanel;
