import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';

const ActivityCommentModal = ({ isOpen, onClose, activityId, currentUserId, allProfiles }) => {
    const [comments, setComments] = useState([]);
    const [reads, setReads] = useState([]);
    const [reactions, setReactions] = useState([]);
    const [newComment, setNewComment] = useState('');
    const [editingCommentId, setEditingCommentId] = useState(null);
    const [editText, setEditText] = useState('');
    const [showOriginalId, setShowOriginalId] = useState(null);
    const [replyTo, setReplyTo] = useState(null);
    const [showMentions, setShowMentions] = useState(false);
    const [mentionSearch, setMentionSearch] = useState('');
    const [mentionIndex, setMentionIndex] = useState(0);
    const [isLoading, setIsLoading] = useState(false);
    const scrollRef = useRef(null);

    // Optimized filtering with useMemo
    const mentionSuggestions = useMemo(() => {
        if (!showMentions) return [];
        return allProfiles?.filter(p => 
            p.name?.toLowerCase().includes(mentionSearch.toLowerCase())
        ).slice(0, 5) || [];
    }, [allProfiles, mentionSearch, showMentions]);

    // Optimize reads and reactions lookup by indexing them
    const readsByComment = useMemo(() => {
        const map = {};
        reads.forEach(r => {
            if (!map[r.comment_id]) map[r.comment_id] = [];
            map[r.comment_id].push(r);
        });
        return map;
    }, [reads]);

    const reactionsByComment = useMemo(() => {
        const map = {};
        reactions.forEach(r => {
            if (!map[r.comment_id]) map[r.comment_id] = {};
            map[r.comment_id][r.reaction] = (map[r.comment_id][r.reaction] || 0) + 1;
        });
        return map;
    }, [reactions]);

    const handleInputChanges = (val) => {
        setNewComment(val);
        const lastAtIndices = val.lastIndexOf('@');
        if (lastAtIndices !== -1 && (lastAtIndices === 0 || val[lastAtIndices - 1] === ' ')) {
            const searchText = val.slice(lastAtIndices + 1);
            if (!searchText.includes(' ')) {
                setShowMentions(true);
                setMentionSearch(searchText);
                setMentionIndex(0); // Reset selection
                return;
            }
        }
        setShowMentions(false);
    };

    const handleKeyDown = (e) => {
        if (showMentions && mentionSuggestions.length > 0) {
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                setMentionIndex(prev => (prev + 1) % mentionSuggestions.length);
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setMentionIndex(prev => (prev - 1 + mentionSuggestions.length) % mentionSuggestions.length);
            } else if (e.key === 'Enter') {
                e.preventDefault();
                selectMention(mentionSuggestions[mentionIndex]);
            } else if (e.key === 'Escape') {
                setShowMentions(false);
            }
        }
    };

    const selectMention = (profile) => {
        const lastAtIndices = newComment.lastIndexOf('@');
        const updated = newComment.slice(0, lastAtIndices) + `@${profile.name} ` + newComment.slice(lastAtIndices + mentionSearch.length + 1);
        setNewComment(updated);
        setShowMentions(false);
    };

    const renderCommentText = (text) => {
        if (!text) return null;
        const parts = text.split(/(@\w+(?:\s\w+)?)/g);
        return parts.map((part, i) => {
            if (part.startsWith('@')) {
                return <span key={i} className="font-bold text-indigo-200 bg-indigo-600/30 px-1 rounded mx-0.5">{part}</span>;
            }
            return part;
        });
    };

    useEffect(() => {
        if (isOpen && activityId) {
            fetchAllData();
        }
    }, [isOpen, activityId]);

    const fetchComments = async () => {
        try {
            const res = await fetch(`/api/activity_comments?activity_id=${activityId}`);
            if (res.ok) {
                const data = await res.json();
                const sorted = data.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
                setComments(sorted);
                return sorted;
            }
        } catch (err) {
            console.error("Error fetching comments:", err);
        }
        return [];
    };

    const fetchReactions = async () => {
        try {
            const res = await fetch('/api/activity_comment_reactions');
            if (res.ok) {
                const data = await res.json();
                setReactions(data);
                return data;
            }
        } catch (err) {
            console.error("Error fetching reactions:", err);
        }
        return [];
    };

    const fetchReads = async () => {
        try {
            const res = await fetch(`/api/activity_comment_reads?user_id=${currentUserId}`);
            if (res.ok) {
                const data = await res.json();
                setReads(data);
                return data;
            }
        } catch (err) {
            console.error("Error fetching reads:", err);
        }
        return [];
    };

    const fetchAllData = async () => {
        setIsLoading(true);
        try {
            const [fetchedComments, fetchedReads, fetchedReactions] = await Promise.all([
                fetchComments(),
                fetchReads(),
                fetchReactions()
            ]);

            // Efficient unread check using a Set for IDs
            const myReadIds = new Set(
                fetchedReads
                    .filter(r => r.user_id === currentUserId)
                    .map(r => r.comment_id)
            );

            const unreadComments = fetchedComments.filter(c => 
                c.user_id !== currentUserId && !myReadIds.has(c.id)
            );

            if (unreadComments.length > 0) {
                try {
                    await fetch('/api/activity_comment_reads/bulk', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ userId: currentUserId })
                    });
                } catch (err) {
                    console.error("Error marking all read:", err);
                }
            }
        } catch (error) {
            console.error("Error fetching data:", error);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        if (scrollRef.current) {
            const node = scrollRef.current;
            requestAnimationFrame(() => {
                node.scrollTop = node.scrollHeight;
            });
        }
    }, [comments]);

    const handleReaction = async (commentId, reaction) => {
        try {
            const existingReaction = reactions.find(r => r.comment_id === commentId && r.user_id === currentUserId && r.reaction === reaction);
            
            await fetch('/api/activity_comment_reactions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    comment_id: commentId, 
                    user_id: currentUserId, 
                    reaction, 
                    action: existingReaction ? 'delete' : 'add' 
                })
            });
            fetchReactions();
        } catch (error) {
            console.error("Error toggling reaction:", error);
        }
    };

    const handleSend = async (e) => {
        e.preventDefault();
        if (!newComment.trim()) return;

        const commentData = {
            id: (crypto.randomUUID?.() ?? (Date.now().toString(36) + Math.random().toString(36).slice(2))),
            activity_id: activityId,
            user_id: currentUserId,
            comment_text: newComment.trim(),
            reply_to_id: replyTo?.id || null
        };

        try {
            const response = await fetch('/api/activity_comments', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(commentData)
            });

            if (response.ok) {
                setNewComment('');
                setReplyTo(null);
                fetchComments();
            }
        } catch (error) {
            console.error("Error posting comment:", error);
        }
    };

    const handleEdit = (commentId, text) => {
        setEditingCommentId(commentId);
        setEditText(text);
    };

    const submitEdit = async (e) => {
        e.preventDefault();
        if (!editText.trim()) return;
        const originalComment = comments.find(c => c.id === editingCommentId);
        try {
            const response = await fetch(`/api/activity_comments/${editingCommentId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    comment_text: editText.trim(),
                    old_comment_text: originalComment?.comment_text || null,
                    is_edited: true
                })
            });

            if (response.ok) {
                setEditingCommentId(null);
                setEditText('');
                fetchComments();
            }
        } catch (error) {
            console.error("Error editing comment:", error);
        }
    };

    const handleDelete = async (commentId) => {
        if (!window.confirm("Are you sure you want to delete this message?")) return;
        try {
            const response = await fetch(`/api/activity_comments/${commentId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    comment_text: "(A deleted message)",
                    is_deleted: true 
                })
            });

            if (response.ok) {
                fetchComments();
            }
        } catch (error) {
            console.error("Error deleting comment:", error);
        }
    };

    if (!isOpen) return null;

    return createPortal(
        <div className="fixed inset-0 z-[1100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-lg flex flex-col h-[600px] max-h-[85vh] overflow-hidden border border-gray-200 dark:border-slate-700">
                {/* Header */}
                <div className="p-4 border-b border-gray-100 dark:border-slate-700 flex items-center justify-between bg-gray-50 dark:bg-slate-800/50">
                    <h3 className="text-lg font-bold text-gray-800 dark:text-gray-100 flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center">
                            <svg className="w-5 h-5 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                            </svg>
                        </div>
                        Discussion Hub
                    </h3>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors p-2 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-full">
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {/* Comments List */}
                <div 
                    ref={scrollRef}
                    className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50 dark:bg-slate-900/50 custom-scrollbar"
                >
                    {isLoading && comments.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full space-y-3">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
                            <span className="text-xs text-gray-400 font-medium animate-pulse">Gathering thoughts...</span>
                        </div>
                    ) : comments.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full text-center py-12">
                            <div className="w-20 h-20 bg-gray-200/50 dark:bg-slate-700/50 rounded-full flex items-center justify-center mb-4 transition-transform hover:scale-110">
                                <svg className="w-10 h-10 text-gray-400 dark:text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M17 8h2a2 2 0 012 2v6a2 2 0 01-2 2h-2v4l-4-4H9a1.994 1.994 0 01-1.414-.586m0 0L11 14h4a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2v4l.586-.586z" />
                                </svg>
                            </div>
                            <div className="text-gray-300 dark:text-slate-600 mb-2 font-black text-2xl tracking-tighter">QUIET HERE...</div>
                            <p className="text-gray-500 dark:text-slate-400 text-xs font-medium max-w-[200px]">Be the first one to start the conversation on this activity!</p>
                        </div>
                    ) : (
                        comments.map((comment) => {
                            const isMe = comment.user_id === currentUserId;
                            const profile = allProfiles?.find(p => p.id === comment.user_id);
                            const isEditing = editingCommentId === comment.id;

                            return (
                                <div key={comment.id} className={`flex items-end gap-2 ${isMe ? 'flex-row-reverse' : 'flex-row'} animate-in slide-in-from-${isMe ? 'right' : 'left'}-4 duration-300`}>
                                    {!isMe && (
                                        <div className="w-6 h-6 rounded-full bg-gray-200 dark:bg-slate-700 overflow-hidden flex-shrink-0">
                                            {profile?.avatar ? (
                                                <img src={profile.avatar} alt={profile.name} className="w-full h-full object-cover" />
                                            ) : (
                                                <div className="w-full h-full flex items-center justify-center text-[10px] font-bold text-gray-500 bg-gray-100 dark:bg-slate-600">
                                                    {profile?.name?.charAt(0) || 'U'}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                    <div className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} max-w-[80%]`}>
                                        <div className="flex items-center gap-2 mb-1 px-2">
                                            <span className={`text-[10px] font-bold uppercase tracking-tight ${isMe ? 'text-indigo-600 dark:text-indigo-400' : 'text-gray-500 dark:text-slate-400'}`}>
                                                {isMe ? 'You' : (profile?.name || 'User')}
                                            </span>
                                            <span className="text-[9px] text-gray-400 font-medium">
                                                {new Date(comment.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                            </span>
                                        </div>
                                        
                                        {/* Message Bubble */}
                                        <div className={`relative group p-3 px-4 rounded-3xl text-[13px] leading-relaxed shadow-sm transition-all ${
                                            isMe 
                                                ? (Boolean(comment.is_deleted) ? 'bg-gray-400 text-gray-200' : 'bg-indigo-500 text-white') + ' rounded-br-none' 
                                                : (Boolean(comment.is_deleted) ? 'bg-gray-100 dark:bg-slate-700 text-gray-400' : 'bg-indigo-50 dark:bg-slate-800 text-gray-800 dark:text-gray-200 border border-indigo-100 dark:border-slate-700') + ' rounded-bl-none'
                                        }`}>
                                            {/* Quoted Message */}
                                            {comment.reply_to_id && !Boolean(comment.is_deleted) && (
                                                <div className="mb-2 p-2 bg-black/10 dark:bg-white/5 rounded-xl text-[11px] border-l-2 border-white/50 dark:border-indigo-500/50 opacity-80 italic">
                                                    {(() => {
                                                        const parent = comments.find(c => c.id === comment.reply_to_id);
                                                        const parentUser = allProfiles?.find(p => p.id === parent?.user_id);
                                                        return (
                                                            <>
                                                                <span className="font-bold block mb-0.5 opacity-70">{parentUser?.name || 'User'}</span>
                                                                <span className="line-clamp-1">{parent?.comment_text || '(Message deleted)'}</span>
                                                            </>
                                                        );
                                                    })()}
                                                </div>
                                            )}

                                            {isEditing ? (
                                                <form onSubmit={submitEdit} className="flex flex-col gap-2 min-w-[200px]">
                                                    <textarea 
                                                        value={editText}
                                                        onChange={(e) => setEditText(e.target.value)}
                                                        className="w-full bg-white dark:bg-slate-900 border border-indigo-300 dark:border-slate-600 rounded-lg p-2 text-xs text-gray-800 dark:text-gray-100 focus:ring-1 focus:ring-indigo-400 outline-none"
                                                        rows="2"
                                                        autoFocus
                                                    />
                                                    <div className="flex justify-end gap-2">
                                                        <button type="button" onClick={() => setEditingCommentId(null)} className="text-[10px] text-gray-300 hover:text-white uppercase font-bold">Cancel</button>
                                                        <button type="submit" className="text-[10px] bg-white text-indigo-600 px-2 py-1 rounded uppercase font-bold">Save</button>
                                                    </div>
                                                </form>
                                            ) : (
                                                <>
                                                    <div className={Boolean(comment.is_deleted) ? 'italic' : ''}>
                                                        {showOriginalId === comment.id && comment.old_comment_text ? (
                                                            <div className="flex flex-col gap-1">
                                                                <span className="text-[10px] font-bold uppercase opacity-50">Original:</span>
                                                                <span>{renderCommentText(comment.old_comment_text)}</span>
                                                                <button onClick={() => setShowOriginalId(null)} className="text-[9px] underline text-left mt-1 opacity-70">Show edited</button>
                                                            </div>
                                                        ) : (
                                                            <>
                                                                {renderCommentText(comment.comment_text)}
                                                                {Boolean(comment.is_edited) && !Boolean(comment.is_deleted) && (
                                                                    <div className="flex items-center gap-1 mt-1">
                                                                        <span className="text-[9px] opacity-70 font-medium italic">(edited)</span>
                                                                        {comment.old_comment_text && (
                                                                            <button onClick={() => setShowOriginalId(comment.id)} className="text-[9px] underline opacity-50 hover:opacity-100">View original</button>
                                                                        )}
                                                                    </div>
                                                                )}
                                                            </>
                                                        )}
                                                    </div>
                                                    
                                                    {/* Tool Actions (Edit/Delete/Reply) */}
                                                    {!Boolean(comment.is_deleted) && (
                                                        <div className={`absolute -top-6 ${isMe ? 'right-0' : 'left-0'} flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity bg-white dark:bg-slate-700 shadow-md rounded-full px-2 py-1 border border-gray-100 dark:border-slate-600 z-10`}>
                                                            <button onClick={() => setReplyTo(comment)} title="Reply" className="text-gray-400 hover:text-indigo-500 transition-colors">
                                                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M3 10h10a8 8 0 018 8v2M3 10l5 5m-5-5l5-5" /></svg>
                                                            </button>
                                                            {isMe && (
                                                                <>
                                                                    <button onClick={() => handleEdit(comment.id, comment.comment_text)} className="text-gray-400 hover:text-blue-500 transition-colors">
                                                                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                                                                    </button>
                                                                    <button onClick={() => handleDelete(comment.id)} className="text-gray-400 hover:text-red-500 transition-colors">
                                                                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                                                                    </button>
                                                                </>
                                                            )}
                                                        </div>
                                                    )}

                                                    {/* Reaction Buttons */}
                                                    {!comment.is_deleted && (
                                                        <div className={`absolute bottom-0 ${isMe ? '-left-8' : '-right-8'} flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity`}>
                                                            {['👍', '❤️', '😂', '😮'].map(emoji => (
                                                                <button key={emoji} onClick={() => handleReaction(comment.id, emoji)} className="text-xs hover:scale-125 transition-transform">{emoji}</button>
                                                            ))}
                                                        </div>
                                                    )}

                                        {/* Show Active Reactions */}
                                        <div className="flex -space-x-1 mt-1 text-[10px]">
                                            {Object.entries(reactionsByComment[comment.id] || {}).map(([emoji, count]) => (
                                                <span key={emoji} className="bg-white/80 dark:bg-slate-900/80 rounded-full px-1 border border-indigo-100 dark:border-slate-700">{emoji} {count}</span>
                                            ))}
                                        </div>
                                                </>
                                            )}
                                        </div>

                                        {!isEditing && (
                                            <div className={`mt-1 px-2 text-[9px] text-gray-400 flex flex-wrap gap-1 ${isMe ? 'justify-end' : 'justify-start'}`}>
                                                {(readsByComment[comment.id] || []).map(r => {
                                                    const seenProfile = allProfiles?.find(p => p.id === r.user_id);
                                                    const isReaderMe = r.user_id === currentUserId;
                                                    if (isReaderMe) return null;
                                                    const seenTime = new Date(r.seen_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                                                    return (
                                                        <span key={r.user_id} className="flex items-center gap-1 bg-gray-100/50 dark:bg-slate-700/30 px-1.5 py-0.5 rounded-full border border-gray-200/50 dark:border-slate-600/50 whitespace-nowrap">
                                                            <svg className="w-2 h-2 text-indigo-400" fill="currentColor" viewBox="0 0 20 20">
                                                                <path d="M10 12a2 2 0 100-4 2 2 0 000 4z" />
                                                                <path fillRule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clipRule="evenodd" />
                                                            </svg>
                                                            <span className="font-bold">{seenProfile?.name?.split(' ')[0] || 'User'}</span>
                                                            <span className="opacity-60 font-medium">at {seenTime}</span>
                                                        </span>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>

                {/* Input Area */}
                <div className="p-4 border-t border-gray-100 dark:border-slate-700 bg-white dark:bg-slate-800 relative">
                    {/* Mention Suggestions */}
                    {showMentions && mentionSuggestions.length > 0 && (
                        <div className="absolute bottom-full left-4 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl shadow-xl w-64 mb-2 overflow-hidden z-10 animate-in slide-in-from-bottom-2">
                            <div className="p-2 border-b border-gray-100 dark:border-slate-700 bg-gray-50 dark:bg-slate-900/50">
                                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest px-2">Mention Team Member</span>
                            </div>
                            {mentionSuggestions.map((p, idx) => (
                                <button 
                                    key={p.id} 
                                    onClick={() => selectMention(p)} 
                                    onMouseEnter={() => setMentionIndex(idx)}
                                    className={`w-full flex items-center gap-3 p-3 transition-colors text-left border-b border-gray-50 dark:border-slate-700/50 last:border-0 group ${
                                        mentionIndex === idx ? 'bg-indigo-50 dark:bg-indigo-900/30' : 'hover:bg-gray-50 dark:hover:bg-slate-700'
                                    }`}
                                >
                                    <div className="w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center text-indigo-600 dark:text-indigo-400 font-bold text-xs uppercase group-hover:scale-110 transition-transform overflow-hidden">
                                        {p.avatar ? (
                                            <img src={p.avatar} alt={p.name} className="w-full h-full object-cover" />
                                        ) : (
                                            p.name?.charAt(0)
                                        )}
                                    </div>
                                    <div className="flex flex-col min-w-0">
                                        <span className={`text-xs font-bold truncate ${mentionIndex === idx ? 'text-indigo-600 dark:text-indigo-400' : 'text-gray-800 dark:text-gray-100'}`}>{p.name}</span>
                                        <span className="text-[10px] text-gray-400 truncate">@{p.name?.toLowerCase().replace(/\s/g, '_')}</span>
                                    </div>
                                </button>
                            ))}
                        </div>
                    )}

                    {/* Reply Preview */}
                    {replyTo && (
                        <div className="flex items-center gap-3 bg-indigo-50 dark:bg-indigo-900/10 p-3 rounded-xl mb-3 border border-indigo-100 dark:border-indigo-900/30 animate-in slide-in-from-bottom-2">
                            <div className="w-1 bg-indigo-500 rounded-full self-stretch"></div>
                            <div className="flex-1 min-w-0">
                                <span className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 uppercase">Replying to {allProfiles?.find(p => p.id === replyTo.user_id)?.name || 'User'}</span>
                                <p className="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5 italic">{replyTo.comment_text}</p>
                            </div>
                            <button onClick={() => setReplyTo(null)} className="p-1.5 hover:bg-white dark:hover:bg-slate-700 rounded-full text-indigo-400 transition-colors shadow-sm">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"/></svg>
                            </button>
                        </div>
                    )}

                    <form onSubmit={handleSend} className="flex gap-2 relative">
                        <input
                            type="text"
                            value={newComment}
                            onChange={(e) => handleInputChanges(e.target.value)}
                            onKeyDown={handleKeyDown}
                            placeholder="Type @ to mention, click message to reply..."
                            className="flex-1 bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl pl-4 pr-12 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:text-gray-100 placeholder:text-gray-400 transition-all font-medium"
                        />
                        <button 
                            type="submit"
                            disabled={!newComment.trim()}
                            className="absolute right-1.5 top-1.5 bottom-1.5 aspect-square bg-indigo-600 text-white rounded-lg flex items-center justify-center hover:bg-indigo-700 disabled:bg-gray-200 dark:disabled:bg-slate-700 disabled:text-gray-400 transition-all shadow-sm active:scale-90 group"
                        >
                            <svg className="w-4 h-4 transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                            </svg>
                        </button>
                    </form>
                    <p className="mt-2 text-[9px] text-center text-gray-400 font-medium uppercase tracking-widest">Team Collaboration Hub</p>
                </div>
            </div>
        </div>,
        document.body
    );
};

export default ActivityCommentModal;