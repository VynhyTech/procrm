import React, { useEffect, useState, useCallback } from "react";
import { useAuth } from "../lib/auth";
import { trpc } from "../trpc";
import { Send, Trash2 } from "lucide-react";

type Comment = Awaited<ReturnType<typeof trpc.internalChat.getComments.query>>[number];

interface InternalCommentsProps {
  objectType: string;
  objectId: string;
}

export function InternalComments({ objectType, objectId }: InternalCommentsProps) {
  const { user } = useAuth();
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [newComment, setNewComment] = useState("");
  const [sending, setSending] = useState(false);

  const fetchComments = useCallback(async () => {
    try {
      setComments(await trpc.internalChat.getComments.query({ objectType, objectId }));
    } catch (err) { console.error(err); } finally { setLoading(false); }
  }, [objectType, objectId]);

  useEffect(() => { fetchComments(); }, [fetchComments]);

  const handleSend = async () => {
    if (!newComment.trim()) return;
    setSending(true);
    try {
      const comment = (await trpc.internalChat.addComment.mutate({ objectType, objectId, content: newComment.trim() })) as Comment;
      setComments((prev) => [comment, ...prev]);
      setNewComment("");
    } catch (err) { console.error(err); } finally { setSending(false); }
  };

  const handleDelete = async (id: string) => {
    try {
      await trpc.internalChat.deleteComment.mutate({ id });
      setComments((prev) => prev.filter((c) => c.id !== id));
    } catch (err) { console.error(err); }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="rounded-xl border border-card-border bg-card p-5 shadow-card">
      <h2 className="mb-4 text-sm font-semibold text-foreground">Internal Notes</h2>

      {/* Compose */}
      <div className="mb-4 flex gap-2">
        <input
          type="text"
          value={newComment}
          onChange={(e) => setNewComment(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Add a note for the team..."
          className="flex-1 rounded-lg border border-input-border bg-input-bg px-3 py-2 text-sm text-input-text placeholder:text-input-placeholder outline-none transition-colors focus:border-input-borderFocus"
        />
        <button
          onClick={handleSend}
          disabled={sending || !newComment.trim()}
          className="flex shrink-0 items-center gap-1 rounded-lg bg-button-primary-bg px-3 py-2 text-sm font-medium text-button-primary-text transition-colors hover:bg-button-primary-hover disabled:opacity-50"
        >
          <Send className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Comments */}
      {loading ? (
        <div className="space-y-2">
          {[1, 2].map((i) => <div key={i} className="skeleton h-14 rounded-lg" />)}
        </div>
      ) : comments.length === 0 ? (
        <p className="py-4 text-center text-xs text-foreground-muted">No internal notes yet</p>
      ) : (
        <div className="space-y-3 max-h-64 overflow-y-auto">
          {comments.map((comment) => (
            <div key={comment.id} className="group flex gap-2.5">
              {comment.author.picture ? (
                <img src={comment.author.picture} className="h-7 w-7 shrink-0 rounded-full" referrerPolicy="no-referrer" alt="" />
              ) : (
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary-accent text-2xs font-bold text-white">
                  {(comment.author.name ?? comment.author.email ?? "?")[0].toUpperCase()}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-foreground">{comment.author.name ?? comment.author.email}</span>
                  <span className="text-2xs text-foreground-subtle">
                    {new Date(comment.createdAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                  </span>
                  {comment.authorId === user?.id && (
                    <button
                      onClick={() => handleDelete(comment.id)}
                      className="opacity-0 transition-opacity group-hover:opacity-100"
                    >
                      <Trash2 className="h-3 w-3 text-foreground-subtle hover:text-error-500" />
                    </button>
                  )}
                </div>
                <p className="mt-0.5 text-xs text-foreground-muted">{comment.content}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
