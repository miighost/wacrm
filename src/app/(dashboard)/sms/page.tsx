"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import { MetricCard } from "@/components/dashboard/metric-card";
import { SkeletonCard } from "@/components/dashboard/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { toast } from "sonner";
import {
  Send,
  Users,
  ListFilter,
  FileText,
  Mail,
  Loader2,
  PhoneCall,
  CheckCircle,
  HelpCircle,
  FileSpreadsheet,
  X,
  Search,
} from "lucide-react";
import type { Contact } from "@/types";

interface Recipient {
  name: string;
  phone: string;
  contactId?: string;
}

interface OutboundMessage {
  id: string;
  content_text: string;
  created_at: string;
  status: string;
  message_id: string;
  recipient_phone?: string;
  recipient_name?: string;
}

export default function SMSPage() {
  const supabase = createClient();
  const { accountId, defaultCurrency } = useAuth();

  const [loadingMetrics, setLoadingMetrics] = useState(true);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [sending, setSending] = useState(false);

  const [totalSent, setTotalSent] = useState(0);
  const [totalDelivered, setTotalDelivered] = useState(0);

  const [dbContacts, setDbContacts] = useState<Contact[]>([]);
  const [history, setHistory] = useState<OutboundMessage[]>([]);

  // Send message form state
  const [message, setMessage] = useState("");
  const [sendMode, setSendMode] = useState<"contact" | "quick">("contact");
  const [selectedContactIds, setSelectedContactIds] = useState<string[]>([]);
  const [contactSearch, setContactSearch] = useState("");
  const [quickInput, setQuickInput] = useState(""); // E.g. "John Doe, 612345678" or "615555555"

  // Professional GSM vs Unicode character & segment counter
  const calculateSegments = (text: string) => {
    if (!text) return { chars: 0, isUnicode: false, limit: 160, segments: 1 };
    
    // Standard GSM 03.38 character set check
    const gsmRegexp = /^[A-Za-z0-9\s@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ!"#¤%&'()*+,\-./:;<=>?¡¿ÄÖÑÜ§àäöñüò_^{}\[~\]|\\€]*$/;
    const isUnicode = !gsmRegexp.test(text);
    
    // Some GSM characters escape to 2 characters
    const gsmDoubleChars = /[\^{}\[~\]|\\€]/g;
    let chars = text.length;
    if (!isUnicode) {
      const matches = text.match(gsmDoubleChars);
      if (matches) {
        chars += matches.length;
      }
    }

    const limit = isUnicode ? 70 : 160;
    const concatLimit = isUnicode ? 67 : 153;
    
    let segments = 1;
    if (chars > limit) {
      segments = Math.ceil(chars / concatLimit);
    }
    
    return { chars, isUnicode, limit, segments };
  };

  const { chars, isUnicode, limit, segments } = calculateSegments(message);

  const toggleContactSelection = (contactId: string) => {
    setSelectedContactIds((prev) =>
      prev.includes(contactId) ? prev.filter((id) => id !== contactId) : [...prev, contactId]
    );
  };

  const selectAllContacts = () => {
    if (selectedContactIds.length === dbContacts.length) {
      setSelectedContactIds([]);
    } else {
      setSelectedContactIds(dbContacts.map((c) => c.id));
    }
  };

  // Load metrics & history
  const loadData = useCallback(async () => {
    if (!accountId) return;

    try {
      // 1. Fetch SMS Metrics
      // Fetch total sent SMS (sender_type === 'agent' or 'bot')
      const { count: sentCount, error: sentErr } = await supabase
        .from("messages")
        .select("id", { count: "exact", head: true })
        .eq("channel_type", "sms")
        .in("sender_type", ["agent", "bot"]);

      // Fetch total delivered SMS
      const { count: deliveredCount, error: delivErr } = await supabase
        .from("messages")
        .select("id", { count: "exact", head: true })
        .eq("channel_type", "sms")
        .in("sender_type", ["agent", "bot"])
        .eq("status", "delivered");

      if (!sentErr) setTotalSent(sentCount || 0);
      if (!delivErr) setTotalDelivered(deliveredCount || 0);
      setLoadingMetrics(false);

      // 2. Fetch SMS Message History (with contact hydrated)
      const { data: msgs, error: msgsErr } = await supabase
        .from("messages")
        .select(`
          id,
          content_text,
          created_at,
          status,
          message_id,
          conversation:conversations (
            contact:contacts (
              name,
              phone
            )
          )
        `)
        .eq("channel_type", "sms")
        .in("sender_type", ["agent", "bot"])
        .order("created_at", { ascending: false })
        .limit(50);

      if (!msgsErr && msgs) {
        const formattedHistory: OutboundMessage[] = msgs.map((m: any) => ({
          id: m.id,
          content_text: m.content_text,
          created_at: m.created_at,
          status: m.status,
          message_id: m.message_id,
          recipient_name: m.conversation?.contact?.name,
          recipient_phone: m.conversation?.contact?.phone,
        }));
        setHistory(formattedHistory);
      }
      setLoadingHistory(false);

      // 3. Fetch Contacts list
      const { data: contacts } = await supabase
        .from("contacts")
        .select("id, name, phone")
        .eq("account_id", accountId)
        .order("name", { ascending: true })
        .limit(100);

      if (contacts) {
        setDbContacts(contacts as any);
      }
    } catch (err) {
      console.error("[sms-page] Error loading data:", err);
    }
  }, [accountId, supabase]);

  useEffect(() => {
    loadData();

    // 4. Setup Realtime subscription for messages
    const channel = supabase
      .channel("sms_messages_realtime")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "messages",
          filter: `channel_type=eq.sms`,
        },
        () => {
          loadData();
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [loadData, supabase]);

  // Handle Send Campaign
  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) {
      toast.error("Message cannot be empty");
      return;
    }

    let recipientsList: Recipient[] = [];

    if (sendMode === "contact") {
      if (selectedContactIds.length === 0) {
        toast.error("Please select at least one recipient contact");
        return;
      }
      recipientsList = selectedContactIds
        .map((id): Recipient | null => {
          const selected = dbContacts.find((c) => c.id === id);
          if (selected) {
            return { name: selected.name || "", phone: selected.phone, contactId: selected.id };
          }
          return null;
        })
        .filter((r): r is Recipient => r !== null);
    } else {
      // Quick import parsing (e.g. name,phone per line, or comma-separated names/phones)
      if (!quickInput.trim()) {
        toast.error("Please enter quick recipient information");
        return;
      }

      const lines = quickInput.split("\n");
      for (const line of lines) {
        const cleanLine = line.trim();
        if (!cleanLine) continue;

        const parts = cleanLine.split(",");
        if (parts.length >= 2) {
          recipientsList.push({
            name: parts[0].trim(),
            phone: parts[1].trim(),
          });
        } else if (cleanLine.match(/^\d+$/)) {
          // Pure number line
          recipientsList.push({
            name: cleanLine,
            phone: cleanLine,
          });
        } else {
          toast.error(`Could not parse line: "${cleanLine}". Format must be: Name, Phone`);
          return;
        }
      }
    }

    if (recipientsList.length === 0) {
      toast.error("No valid recipients parsed");
      return;
    }

    setSending(true);
    try {
      const res = await fetch("/api/sms/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipients: recipientsList,
          message: message,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Failed to dispatch SMS campaign");
      } else {
        toast.success(`Successfully queued ${data.sent_count} SMS messages!`);
        setMessage("");
        setQuickInput("");
        setSelectedContactIds([]);
        loadData();
      }
    } catch (err) {
      toast.error("Network error sending campaign");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">SMS Portal</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Send bulk or single transactional text campaigns and track delivery status in real-time.
        </p>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {loadingMetrics ? (
          <>
            <SkeletonCard />
            <SkeletonCard />
          </>
        ) : (
          <>
            <MetricCard title="Total SMS Sent" value={totalSent.toLocaleString()} icon={Mail} />
            <MetricCard title="Total SMS Delivered" value={totalDelivered.toLocaleString()} icon={CheckCircle} />
          </>
        )}
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        
        {/* Left Side: Sender Form */}
        <div className="lg:col-span-2 space-y-6">
          <Card className="border-border bg-card">
            <CardHeader>
              <CardTitle className="text-lg">Compose Campaign</CardTitle>
              <CardDescription>Select recipients and enter your text message.</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSend} className="space-y-4">
                
                {/* Send Mode Toggle */}
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant={sendMode === "contact" ? "default" : "outline"}
                    className="flex-1 text-xs"
                    onClick={() => setSendMode("contact")}
                  >
                    <Users className="mr-1.5 h-3.5 w-3.5" />
                    Database Contact
                  </Button>
                  <Button
                    type="button"
                    variant={sendMode === "quick" ? "default" : "outline"}
                    className="flex-1 text-xs"
                    onClick={() => setSendMode("quick")}
                  >
                    <FileSpreadsheet className="mr-1.5 h-3.5 w-3.5" />
                    Quick Import list
                  </Button>
                </div>

                {/* Mode: database lookup */}
                {sendMode === "contact" ? (
                  <div className="space-y-2 relative">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="contactSearch" className="text-xs font-semibold text-muted-foreground">
                        Recipient Contacts ({selectedContactIds.length} selected)
                      </Label>
                      {dbContacts.length > 0 && (
                        <button
                          type="button"
                          onClick={selectAllContacts}
                          className="text-[10px] text-primary hover:underline font-semibold"
                        >
                          {selectedContactIds.length === dbContacts.length ? "Deselect All" : "Select All"}
                        </button>
                      )}
                    </div>
                    
                    <div className="relative">
                      <Input
                        id="contactSearch"
                        type="text"
                        placeholder="Search contacts by name or phone..."
                        value={contactSearch}
                        onChange={(e) => setContactSearch(e.target.value)}
                        className="text-xs"
                      />
                    </div>

                    {contactSearch.trim() !== "" && (
                      <div className="absolute z-10 w-full max-h-48 overflow-y-auto rounded-md border border-border bg-card shadow-lg p-1 space-y-0.5 mt-1">
                        {dbContacts
                          .filter((c) =>
                            c.name?.toLowerCase().includes(contactSearch.toLowerCase()) ||
                            c.phone.includes(contactSearch)
                          )
                          .map((c) => {
                            const isSelected = selectedContactIds.includes(c.id);
                            return (
                              <button
                                key={c.id}
                                type="button"
                                onClick={() => {
                                  toggleContactSelection(c.id);
                                  setContactSearch("");
                                }}
                                className={cn(
                                  "flex w-full items-center justify-between rounded px-2 py-1.5 text-xs text-left transition-colors",
                                  isSelected
                                    ? "bg-primary/10 text-primary font-medium"
                                    : "hover:bg-muted text-foreground"
                                )}
                              >
                                <span>{c.name} ({c.phone})</span>
                                {isSelected && <span className="text-[10px] bg-primary/20 text-primary px-1 rounded">Selected</span>}
                              </button>
                            );
                          })}
                        {dbContacts.filter((c) =>
                          c.name?.toLowerCase().includes(contactSearch.toLowerCase()) ||
                          c.phone.includes(contactSearch)
                        ).length === 0 && (
                          <div className="text-[11px] text-muted-foreground p-2 text-center">
                            No matching contacts found.
                          </div>
                        )}
                      </div>
                    )}

                    {selectedContactIds.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto p-1.5 rounded-md border border-border bg-muted/20 mt-2">
                        {selectedContactIds.map((id) => {
                          const contact = dbContacts.find((c) => c.id === id);
                          if (!contact) return null;
                          return (
                            <span
                              key={id}
                              className="inline-flex items-center gap-1 rounded bg-primary-soft text-primary px-2 py-0.5 text-xs font-medium"
                            >
                              <span>{contact.name || contact.phone}</span>
                              <button
                                type="button"
                                onClick={() => toggleContactSelection(id)}
                                className="text-primary hover:text-primary/75 focus:outline-none"
                              >
                                <X className="size-3" />
                              </button>
                            </span>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ) : (
                  // Mode: CSV/Copy-Paste list
                  <div className="space-y-2">
                    <Label htmlFor="quickInput" className="text-xs font-semibold text-muted-foreground">
                      Paste List (Name, Phone per line)
                    </Label>
                    <textarea
                      id="quickInput"
                      rows={4}
                      className="flex w-full rounded-md border border-border bg-muted px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      placeholder="E.g.&#10;John Doe, 615555555&#10;Ali Ahmed, 612222222"
                      value={quickInput}
                      onChange={(e) => setQuickInput(e.target.value)}
                    />
                    <p className="text-[10px] text-muted-foreground">
                      Separate name and phone number with a comma. You can also paste pure digits lines.
                    </p>
                  </div>
                )}

                {/* Message Body */}
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <Label htmlFor="smsBody" className="text-xs font-semibold text-muted-foreground">
                      Message Content
                    </Label>
                    <span className="text-[10px] text-muted-foreground flex items-center gap-1.5">
                      <span>{chars} chars</span>
                      <span>•</span>
                      <span>{segments} Part(s)</span>
                      <span>•</span>
                      <span className={cn("px-1 py-0.5 rounded text-[9px] font-semibold uppercase tracking-wider", isUnicode ? "bg-amber-500/10 text-amber-400" : "bg-primary/10 text-primary")}>
                        {isUnicode ? "Unicode" : "GSM"}
                      </span>
                    </span>
                  </div>
                  <textarea
                    id="smsBody"
                    rows={5}
                    maxLength={480}
                    className="flex w-full rounded-md border border-border bg-muted px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    placeholder="Type your text message here..."
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                  />
                </div>

                <Button type="submit" disabled={sending} className="w-full bg-primary text-primary-foreground hover:bg-primary/90 mt-2">
                  {sending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Queuing Send...
                    </>
                  ) : (
                    <>
                      <Send className="mr-2 h-4 w-4" />
                      Send SMS Campaign
                    </>
                  )}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>

        {/* Right Side: Outbound SMS History table */}
        <div className="lg:col-span-3">
          <Card className="border-border bg-card h-full flex flex-col">
            <CardHeader className="shrink-0">
              <CardTitle className="text-lg">Outbound Roster</CardTitle>
              <CardDescription>Live status updates of sent text campaigns.</CardDescription>
            </CardHeader>
            <CardContent className="flex-1 overflow-auto px-0 py-0">
              {loadingHistory ? (
                <div className="flex h-64 items-center justify-center">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              ) : history.length === 0 ? (
                <div className="flex h-64 flex-col items-center justify-center text-center p-6">
                  <Mail className="h-10 w-10 text-muted-foreground/40 mb-3" />
                  <p className="text-sm font-semibold text-muted-foreground">No SMS campaigns sent yet</p>
                  <p className="text-xs text-muted-foreground/60 max-w-xs mt-1">
                    Your sent messages will appear here, and status updates will be rendered live.
                  </p>
                </div>
              ) : (
                <div className="min-w-full overflow-x-auto">
                  <table className="w-full border-collapse text-left text-sm">
                    <thead>
                      <tr className="border-b border-border bg-muted/30 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        <th className="px-4 py-3">Recipient</th>
                        <th className="px-4 py-3">Message</th>
                        <th className="px-4 py-3">Status</th>
                        <th className="px-4 py-3 text-right">Sent Time</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {history.map((h) => {
                        const isDelivered = h.status === "delivered";
                        const isFailed = h.status === "failed";
                        const isSending = h.status === "sending";

                        return (
                          <tr key={h.id} className="hover:bg-muted/10">
                            <td className="px-4 py-3.5">
                              <div className="font-semibold text-foreground">{h.recipient_name || "Unknown"}</div>
                              <div className="text-xs text-muted-foreground">{h.recipient_phone}</div>
                            </td>
                            <td className="px-4 py-3.5 max-w-xs truncate" title={h.content_text}>
                              {h.content_text}
                            </td>
                            <td className="px-4 py-3.5">
                              <span
                                className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium border ${
                                  isDelivered
                                    ? "bg-green-500/10 border-green-500/30 text-green-400"
                                    : isFailed
                                    ? "bg-red-500/10 border-red-500/30 text-red-400"
                                    : "bg-amber-500/10 border-amber-500/30 text-amber-400"
                                }`}
                              >
                                {h.status}
                              </span>
                            </td>
                            <td className="px-4 py-3.5 text-right text-xs text-muted-foreground tabular-nums">
                              {new Date(h.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

      </div>
    </div>
  );
}
