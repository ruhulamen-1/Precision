import React, { useState, useEffect, useMemo, useRef, useCallback, forwardRef } from 'react';
import { createPortal } from 'react-dom';

const RecycleBinModal = ({ entries, onClose, onRestore, onDeletePermanently, employees, isAdmin }) => {
          if (!isAdmin) return null;
          
          return (
              <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex justify-center items-center z-[1000] p-4">
                  <div className="bg-white dark:bg-slate-900 w-full max-w-5xl max-h-[90vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-gray-200 dark:border-slate-800">
                      <div className="p-6 border-b dark:border-slate-800 flex justify-between items-center bg-gray-50 dark:bg-slate-800/50">
                          <div className="flex items-center gap-3">
                              <div className="p-2 bg-red-100 dark:bg-red-900/30 rounded-lg">
                                  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-red-600 dark:text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                  </svg>
                              </div>
                              <div>
                                  <h2 className="text-xl font-bold text-gray-800 dark:text-white">Recycle Bin</h2>
                                  <p className="text-xs text-gray-500 dark:text-gray-400">View and restore accidentally deleted activities</p>
                              </div>
                          </div>
                          <button onClick={onClose} className="p-2 hover:bg-gray-200 dark:hover:bg-slate-700 rounded-full transition-colors">
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                          </button>
                      </div>
                      
                      <div className="flex-1 overflow-auto p-6">
                          {entries.length === 0 ? (
                              <div className="flex flex-col items-center justify-center py-20 text-gray-400">
                                  <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 mb-4 opacity-20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                  </svg>
                                  <p className="text-lg font-medium">Recycle bin is empty</p>
                              </div>
                          ) : (
                              <div className="space-y-4">
                                  {entries.map(entry => {
                                      const entryEmployees = (entry.employeeIds || []).map(id => employees.find(e => e.id === id)).filter(Boolean);
                                      return (
                                          <div key={entry.id} className="bg-gray-50 dark:bg-slate-800/50 p-4 rounded-xl border border-gray-100 dark:border-slate-700 flex flex-col md:flex-row justify-between gap-4">
                                              <div className="flex-1">
                                                  <div className="flex items-center gap-2 mb-2">
                                                      <span className="px-2 py-0.5 bg-gray-200 dark:bg-slate-700 rounded text-[10px] font-bold text-gray-600 dark:text-gray-400 uppercase tracking-wider">{entry.date}</span>
                                                      <span className="px-2 py-0.5 bg-sky-100 dark:bg-sky-900/30 rounded text-[10px] font-bold text-sky-600 dark:text-sky-400">{entry.time}</span>
                                                  </div>
                                                  <h3 className="font-bold text-gray-800 dark:text-gray-200 mb-1">
                                                      {entryEmployees.length > 0 ? entryEmployees.map(e => e.name).join(', ') : 'Unknown Employee'}
                                                  </h3>
                                                  <p className="text-sm text-gray-600 dark:text-gray-400 italic">"{entry.remarks}"</p>
                                                  {entry.deleted_at && (
                                                      <p className="text-[10px] text-red-500 mt-2">Deleted on: {new Date(entry.deleted_at).toLocaleString()}</p>
                                                  )}
                                              </div>
                                              <div className="flex items-center gap-2">
                                                  <button 
                                                      onClick={() => onRestore(entry)}
                                                      className="flex items-center gap-2 px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg text-sm font-bold transition-colors"
                                                  >
                                                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                                      </svg>
                                                      Restore
                                                  </button>
                                                  <button 
                                                      onClick={() => onDeletePermanently(entry.id)}
                                                      className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                                                      title="Delete Permanently"
                                                  >
                                                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                      </svg>
                                                  </button>
                                              </div>
                                          </div>
                                      );
                                  })}
                              </div>
                          )}
                      </div>
                  </div>
              </div>
          );
      };

export default RecycleBinModal;
