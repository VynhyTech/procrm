import React, { useEffect, useState, useCallback } from "react";
import { useAuth } from "../lib/auth";
import { trpc } from "../trpc";
import { StatusBadge } from "./StatusBadge";
import { MessageSquare, Mail, Smartphone, Send } from "lucide-react";

type Message = Awaited<ReturnType<typeof trpc.communications.getMessages.query>>[number];
type Template = Awaited<ReturnType<typeof trpc.communications.getTemplates.query>>[number];

interface CommunicationPanelProps {
  leadId: string;
  leadEmail: string | null;
  leadPhone: string | null;
  leadFirstName: string;
  leadLastName: string;
  leadPropertyType: string | null;
  leadPreferredArea: string | null;
}

function applyTemplate(body: string, lead: CommunicationPanelProps): string {
  return body
    .replace(/\{\{firstName\}\}/g, lead.leadFirstName)
    .replace(/\{\{lastName\}\}/g, lead.leadLastName)
    .replace(/\{\{propertyType\}\}/g, lead.leadPropertyType ?? "property")
    .replace(/\{\{preferredArea\}\}/g, lead.leadPreferredArea ?? "your preferred area");
}

function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function CommunicationPanel(props: CommunicationPanelProps) {
  const { scopes } = useAuth();
  const canSend = scopes.includes("communications:send");
  const [sendChannel, setSendChannel] = useState<"SMS" | "Email">("SMS");
  const [messages, setMessages] = useState<Message[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");

  useEffect(() => {
    trpc.communications.getTemplates.query({}).then(setTemplates).catch(console.error);
  }, []);

  // Fetch ALL messages (unified view)
  const fetchMessages = useCallback(async () => {
    setLoading(true);
    try {
      const msgs = await trpc.communications.getMessages.query({ leadId: props.leadId, channel: "All" });
      setMessages(msgs);
    } catch (err) { console.error(err); } finally { setLoading(false); }
  }, [props.leadId]);

  useEffect(() => { fetchMessages(); }, [fetchMessages]);

  const handleSend = async () => {
    if (!body.trim()) return;
    const recipientAddress = sendChannel === "Email" ? (props.leadEmail ?? "") : (props.leadPhone ?? "");
    if (!recipientAddress) return;
    setSending(true);
    try {
      await trpc.communications.sendMessage.mutate({
        leadId: props.leadId,
        channel: sendChannel,
        recipientAddress,
        subject: sendChannel === "Email" ? subject : undefined,
        body: body.trim(),
      });
      setBody("");
      setSubject("");
      fetchMessages();
    } catch (err) { console.error(err); } finally { setSending(false); }
  };

  // Top 3 templates as quick chips
  const topTemplates = templates.filter((t) =>
    sendChannel === "SMS" ? t.channel === "SMS" : t.channel === "Email"
  ).slice(0, 3);

  const inputClass = "w-full rounded-lg border border-input-border bg-input-bg px-3 py-2 text-sm text-input-text placeholder:text-input-placeholder outline-none transition-colors focus:border-input-borderFocus";

  return (
    <div>
      {/* Compose area at the top */}
      {canSend && (
        <div className="mb-4 rounded-xl border border-card-border bg-card p-4 shadow-card">
          {/* Channel toggle + recipient */}
          <div className="mb-2 flex items-center gap-2">
            <div className="flex rounded-lg border border-input-border p-0.5">
              <button onClick={() => setSendChannel("SMS")} disabled={!props.leadPhone}
                className={`flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${sendChannel === "SMS" ? "bg-background-secondary text-foreground" : "text-foreground-muted hover:text-foreground"} ${!props.leadPhone ? "opacity-40 cursor-not-allowed" : ""}`}>
                <Smartphone className="h-3 w-3" /> SMS
              </button>
              <button onClick={() => setSendChannel("Email")} disabled={!props.leadEmail}
                className={`flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${sendChannel === "Email" ? "bg-background-secondary text-foreground" : "text-foreground-muted hover:text-foreground"} ${!props.leadEmail ? "opacity-40 cursor-not-allowed" : ""}`}>
                <Mail className="h-3 w-3" /> Email
              </button>
            </div>
            <span className="ml-auto text-2xs text-foreground-subtle">
              To: {sendChannel === "Email" ? (props.leadEmail ?? "no email") : (props.leadPhone ?? "no phone")}
            </span>
          </div>

          {/* Quick template chips */}
          {topTemplates.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-1">
              {topTemplates.map((t) => (
                <button key={t.id} onClick={() => {
                  if (t.subject) setSubject(applyTemplate(t.subject, props));
                  setBody(applyTemplate(t.body, props));
                }}
                  className="rounded-full border border-border bg-background-secondary px-2 py-0.5 text-2xs text-foreground-muted transition-colors hover:bg-background-tertiary">
                  {t.name}
                </button>
              ))}
            </div>
          )}

          {sendChannel === "Email" && (
            <input type="text" placeholder="Subject..." value={subject} onChange={(e) => setSubject(e.target.value)} className={`${inputClass} mb-2`} />
          )}

          <div className="flex gap-2">
            <textarea placeholder={`Type your ${sendChannel.toLowerCase()} message...`} value={body} onChange={(e) => setBody(e.target.value)} rows={2} className={`${inputClass} resize-none`} />
            <button onClick={handleSend} disabled={sending || !body.trim()}
              className="flex shrink-0 items-center gap-1 self-end rounded-lg bg-button-primary-bg px-3 py-2 text-sm font-medium text-button-primary-text transition-colors hover:bg-button-primary-hover disabled:opacity-50">
              <Send className="h-3.5 w-3.5" /> {sending ? "..." : "Send"}
            </button>
          </div>
        </div>
      )}

      {/* Unified conversation thread */}
      <div className="max-h-96 overflow-y-auto">
        {loading ? (
          <div className="space-y-3 p-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex gap-3">
                <div className="skeleton h-7 w-7 rounded-full" />
                <div className="flex-1"><div className="skeleton skeleton-text w-2/3" /></div>
              </div>
            ))}
          </div>
        ) : messages.length === 0 ? (
          <p className="py-6 text-center text-xs text-foreground-muted">No messages yet</p>
        ) : (
          <div className="space-y-3">
            {messages.map((msg) => (
              <div key={msg.id} className={`flex gap-3 ${msg.direction === "inbound" ? "" : "flex-row-reverse"}`}>
                <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
                  msg.channel === "SMS" ? "bg-success-50 dark:bg-success-950 text-success-500" :
                  msg.channel === "Email" ? "bg-info-50 dark:bg-info-950 text-info-500" :
                  "bg-accent-50 dark:bg-accent-950 text-accent-500"
                }`}>
                  {msg.channel === "SMS" && <Smartphone className="h-3.5 w-3.5" />}
                  {msg.channel === "Email" && <Mail className="h-3.5 w-3.5" />}
                  {msg.channel === "Chat" && <MessageSquare className="h-3.5 w-3.5" />}
                </div>
                <div className={`max-w-xs rounded-lg p-3 ${
                  msg.direction === "outbound" ? "bg-primary-50 dark:bg-primary-950" : "bg-background-secondary"
                }`}>
                  {msg.subject && <p className="mb-1 text-xs font-medium text-foreground">{msg.subject}</p>}
                  <p className="text-xs text-foreground-muted">{msg.body}</p>
                  <div className="mt-1.5 flex items-center gap-2">
                    <span className="text-2xs text-foreground-subtle" title={new Date(msg.createdAt).toLocaleString()}>
                      {relativeTime(msg.createdAt)}
                    </span>
                    <StatusBadge status={msg.status} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
