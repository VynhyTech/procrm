import React, { useEffect, useState, useCallback, useRef } from "react";
import { useAuth } from "../lib/auth";
import { trpc } from "../trpc";
import { FormModal, FormField } from "../components/FormModal";
import { EmptyState } from "../components/EmptyState";
import { Plus, Send, MessageSquare, Hash, Users, X, Paperclip, LogOut } from "lucide-react";

type Channel = Awaited<ReturnType<typeof trpc.internalChat.getChannels.query>>[number];
type ChatMessage = Awaited<ReturnType<typeof trpc.internalChat.getChannelMessages.query>>[number];
type Member = Awaited<ReturnType<typeof trpc.internalChat.listChannelMembers.query>>[number];
type OrgMember = Awaited<ReturnType<typeof trpc.orgSettings.getOrgMembers.query>>[number];

function Avatar({ picture, name, email, size = 7 }: { picture: string | null; name: string | null; email?: string | null; size?: number }) {
  const sizeClass = size === 8 ? "h-8 w-8" : "h-7 w-7";
  if (picture) {
    return <img src={picture} className={`${sizeClass} shrink-0 rounded-full`} referrerPolicy="no-referrer" alt="" />;
  }
  return (
    <div className={`flex ${sizeClass} shrink-0 items-center justify-center rounded-full bg-primary-accent text-xs font-bold text-white`}>
      {(name ?? email ?? "?")[0].toUpperCase()}
    </div>
  );
}

export function TeamChatPage() {
  const { user } = useAuth();
  const [channels, setChannels] = useState<Channel[]>([]);
  const [selectedChannel, setSelectedChannel] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [msgLoading, setMsgLoading] = useState(false);
  const [newMessage, setNewMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [channelName, setChannelName] = useState("");
  const [channelDescription, setChannelDescription] = useState("");
  const [creating, setCreating] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const [membersPanelOpen, setMembersPanelOpen] = useState(false);
  const [members, setMembers] = useState<Member[]>([]);
  const [orgMembers, setOrgMembers] = useState<OrgMember[]>([]);
  const [addPeopleOpen, setAddPeopleOpen] = useState(false);
  const [addUserId, setAddUserId] = useState("");
  const [addingMember, setAddingMember] = useState(false);

  const fetchChannels = useCallback(async () => {
    setLoading(true);
    try {
      const chs = await trpc.internalChat.getChannels.query();
      setChannels(chs);
      if (chs.length > 0 && !selectedChannel) {
        setSelectedChannel(chs[0].id);
      }
    } catch (err) { console.error(err); } finally { setLoading(false); }
  }, [selectedChannel]);

  useEffect(() => { fetchChannels(); }, [fetchChannels]);

  useEffect(() => {
    trpc.orgSettings.getOrgMembers.query().then(setOrgMembers).catch(console.error);
  }, []);

  const fetchMessages = useCallback(async () => {
    if (!selectedChannel) return;
    setMsgLoading(true);
    try {
      const msgs = await trpc.internalChat.getChannelMessages.query({ channelId: selectedChannel });
      setMessages(msgs.reverse());
    } catch (err) { console.error(err); } finally { setMsgLoading(false); }
  }, [selectedChannel]);

  useEffect(() => { fetchMessages(); }, [fetchMessages]);

  const fetchMembers = useCallback(async () => {
    if (!selectedChannel) return;
    try {
      const m = await trpc.internalChat.listChannelMembers.query({ channelId: selectedChannel });
      setMembers(m);
    } catch (err) { console.error(err); }
  }, [selectedChannel]);

  useEffect(() => { fetchMembers(); }, [fetchMembers]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Poll for new messages every 15 seconds
  useEffect(() => {
    if (!selectedChannel) return;
    const interval = setInterval(() => { if (!document.hidden) fetchMessages(); }, 15000);
    return () => clearInterval(interval);
  }, [selectedChannel, fetchMessages]);

  const handleSend = async () => {
    if (!newMessage.trim() || !selectedChannel) return;
    setSending(true);
    try {
      const msg = (await trpc.internalChat.sendChannelMessage.mutate({ channelId: selectedChannel, content: newMessage.trim() })) as ChatMessage;
      setMessages((prev) => [...prev, msg]);
      setNewMessage("");
    } catch (err) { console.error(err); } finally { setSending(false); }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleCreateChannel = async () => {
    if (!channelName.trim()) return;
    setCreating(true);
    try {
      const ch = await trpc.internalChat.createChannel.mutate({
        name: channelName.trim(),
        description: channelDescription.trim() || undefined,
      });
      setChannels((prev) => [...prev, { ...ch, _count: { messages: 0, members: 1 } }]);
      setSelectedChannel(ch.id);
      setCreateOpen(false);
      setChannelName("");
      setChannelDescription("");
    } catch (err) { console.error(err); } finally { setCreating(false); }
  };

  const handleAddMember = async () => {
    if (!addUserId || !selectedChannel) return;
    setAddingMember(true);
    try {
      await trpc.internalChat.addChannelMember.mutate({ channelId: selectedChannel, userId: addUserId });
      setAddPeopleOpen(false);
      setAddUserId("");
      fetchMembers();
      setChannels((prev) => prev.map((c) => (c.id === selectedChannel ? { ...c, _count: { ...c._count, members: c._count.members + 1 } } : c)));
    } catch (err) { console.error(err); } finally { setAddingMember(false); }
  };

  const handleLeaveChannel = async () => {
    if (!selectedChannel) return;
    try {
      await trpc.internalChat.leaveChannel.mutate({ channelId: selectedChannel });
      setChannels((prev) => prev.filter((c) => c.id !== selectedChannel));
      setSelectedChannel(null);
      setMembersPanelOpen(false);
    } catch (err) { console.error(err); }
  };

  const selectedChannelData = channels.find((c) => c.id === selectedChannel);
  const availableToAdd = orgMembers.filter((m) => !members.some((mm) => mm.userId === m.id));
  const inputClass = "w-full rounded-lg border border-input-border bg-input-bg px-3 py-2 text-sm text-input-text placeholder:text-input-placeholder outline-none transition-colors focus:border-input-borderFocus";

  return (
    <div className="flex h-full">
      {/* Channel sidebar */}
      <div className="flex w-56 shrink-0 flex-col border-r border-border bg-background">
        <div className="flex h-12 items-center justify-between border-b border-border px-3">
          <span className="text-xs font-semibold uppercase tracking-wider text-foreground-subtle">Channels</span>
          <button onClick={() => setCreateOpen(true)} className="rounded-md p-1 text-foreground-muted transition-colors hover:bg-background-secondary hover:text-foreground">
            <Plus className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto py-2">
          {loading ? (
            <div className="space-y-1 px-2">{[1, 2, 3].map((i) => <div key={i} className="skeleton h-8 rounded-lg" />)}</div>
          ) : channels.length === 0 ? (
            <p className="px-3 py-4 text-center text-xs text-foreground-muted">No channels yet</p>
          ) : (
            <>
              <div className="px-3 pb-1 pt-2 text-2xs font-semibold uppercase tracking-wider text-foreground-subtle">Public</div>
              {channels.map((ch) => (
                <button
                  key={ch.id}
                  onClick={() => { setSelectedChannel(ch.id); setMembersPanelOpen(false); }}
                  className={`mx-2 mb-0.5 flex w-[calc(100%-16px)] items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm transition-colors ${
                    selectedChannel === ch.id
                      ? "bg-primary-50 dark:bg-primary-950 text-primary-text font-medium"
                      : "text-foreground-muted hover:bg-background-secondary"
                  }`}
                >
                  <Hash className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{ch.name}</span>
                </button>
              ))}
            </>
          )}
        </div>
      </div>

      {/* Chat area */}
      <div className="flex flex-1 flex-col">
        {selectedChannel && selectedChannelData ? (
          <>
            {/* Channel header */}
            <div className="flex h-12 items-center justify-between border-b border-border px-4">
              <div className="flex min-w-0 items-center">
                <Hash className="mr-1.5 h-4 w-4 shrink-0 text-foreground-subtle" />
                <span className="shrink-0 text-sm font-medium text-foreground">{selectedChannelData.name}</span>
                {selectedChannelData.description && (
                  <span className="ml-1.5 truncate text-sm text-foreground-subtle">— {selectedChannelData.description}</span>
                )}
              </div>
              <button
                onClick={() => setMembersPanelOpen((o) => !o)}
                className={`flex shrink-0 items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors ${
                  membersPanelOpen ? "border-primary-accent text-primary-text" : "border-border text-foreground-muted hover:bg-background-secondary"
                }`}
              >
                <Users className="h-3.5 w-3.5" /> {selectedChannelData._count.members}
              </button>
            </div>

            <div className="flex flex-1 overflow-hidden">
              <div className="flex flex-1 flex-col">
                {/* Messages */}
                <div className="flex-1 overflow-y-auto p-4">
                  {msgLoading && messages.length === 0 ? (
                    <div className="space-y-3">{[1, 2, 3].map((i) => <div key={i} className="skeleton h-12 rounded-lg" />)}</div>
                  ) : messages.length === 0 ? (
                    <div className="flex h-full items-center justify-center">
                      <p className="text-sm text-foreground-muted">No messages yet. Start the conversation!</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {messages.map((msg) => {
                        const isOwn = msg.authorId === user?.id;
                        return (
                          <div key={msg.id} className="flex gap-2.5">
                            <Avatar picture={msg.author.picture} name={msg.author.name} email={msg.author.email} size={8} />
                            <div>
                              <div className="flex items-center gap-2">
                                <span className={`text-xs font-semibold ${isOwn ? "text-primary-text" : "text-foreground"}`}>
                                  {msg.author.name ?? msg.author.email}
                                </span>
                                <span className="text-2xs text-foreground-subtle">
                                  {new Date(msg.createdAt).toLocaleString("en-US", { hour: "numeric", minute: "2-digit" })}
                                </span>
                              </div>
                              <p className="mt-0.5 text-sm text-foreground-muted">{msg.content}</p>
                            </div>
                          </div>
                        );
                      })}
                      <div ref={messagesEndRef} />
                    </div>
                  )}
                </div>

                {/* Input */}
                <div className="border-t border-border p-3">
                  <div className="flex items-center gap-2">
                    <button type="button" disabled title="Attachments coming soon" className="shrink-0 rounded-lg p-2 text-foreground-subtle opacity-50">
                      <Paperclip className="h-4 w-4" />
                    </button>
                    <input
                      type="text"
                      value={newMessage}
                      onChange={(e) => setNewMessage(e.target.value)}
                      onKeyDown={handleKeyDown}
                      placeholder={`Message #${selectedChannelData.name}...`}
                      className={inputClass}
                    />
                    <button
                      onClick={handleSend}
                      disabled={sending || !newMessage.trim()}
                      className="flex shrink-0 items-center gap-1 rounded-lg bg-button-primary-bg px-3 py-2 text-sm font-medium text-button-primary-text transition-colors hover:bg-button-primary-hover disabled:opacity-50"
                    >
                      <Send className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </div>

              {/* Members panel */}
              {membersPanelOpen && (
                <div className="flex w-64 shrink-0 flex-col border-l border-border bg-background">
                  <div className="flex h-12 shrink-0 items-center justify-between border-b border-border px-4">
                    <span className="text-sm font-semibold text-foreground">Members ({members.length})</span>
                    <button onClick={() => setMembersPanelOpen(false)} className="rounded-md p-1 text-foreground-muted hover:bg-background-secondary hover:text-foreground">
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="flex-1 overflow-y-auto p-3">
                    <div className="space-y-2">
                      {members.map((m) => (
                        <div key={m.userId} className="flex items-center gap-2.5">
                          <Avatar picture={m.user.picture} name={m.user.name} email={m.user.email} />
                          <span className="truncate text-sm text-foreground">{m.user.name ?? m.user.email}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="shrink-0 border-t border-border p-3 space-y-2">
                    <button onClick={() => setAddPeopleOpen(true)} className="flex items-center gap-1.5 text-sm font-medium text-primary-text hover:underline">
                      <Plus className="h-3.5 w-3.5" /> Add people
                    </button>
                    <button onClick={handleLeaveChannel} className="flex items-center gap-1.5 text-sm font-medium text-error-500 hover:underline">
                      <LogOut className="h-3.5 w-3.5" /> Leave channel
                    </button>
                  </div>
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center">
            <EmptyState
              title="Select or create a channel"
              description="Chat channels let your team discuss leads, deals, and more"
              icon={<MessageSquare className="h-10 w-10" />}
              action={
                <button onClick={() => setCreateOpen(true)} className="rounded-lg bg-button-primary-bg px-4 py-2 text-sm font-medium text-button-primary-text transition-colors hover:bg-button-primary-hover">
                  Create Channel
                </button>
              }
            />
          </div>
        )}
      </div>

      <FormModal open={createOpen} onClose={() => setCreateOpen(false)} title="Create Channel" onSubmit={handleCreateChannel} submitLabel="Create" submitting={creating}>
        <FormField label="Channel Name" required>
          <input type="text" value={channelName} onChange={(e) => setChannelName(e.target.value)} className={inputClass} placeholder="e.g. general, leads-discussion, closings" />
        </FormField>
        <FormField label="Description">
          <input type="text" value={channelDescription} onChange={(e) => setChannelDescription(e.target.value)} className={inputClass} placeholder="What's this channel for?" />
        </FormField>
      </FormModal>

      <FormModal open={addPeopleOpen} onClose={() => setAddPeopleOpen(false)} title="Add People" onSubmit={handleAddMember} submitLabel="Add" submitting={addingMember}>
        <FormField label="Person" required>
          <select value={addUserId} onChange={(e) => setAddUserId(e.target.value)} className={inputClass}>
            <option value="">Select a person...</option>
            {availableToAdd.map((m) => (
              <option key={m.id} value={m.id}>{m.name ?? m.email}</option>
            ))}
          </select>
        </FormField>
      </FormModal>
    </div>
  );
}
