"use client";

import { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import {
  Eye,
  EyeOff,
  Copy,
  CheckCircle2,
  XCircle,
  Loader2,
  AlertTriangle,
  Mail,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { SettingsPanelHead } from "./settings-panel-head";
import { Switch } from "@/components/ui/switch";

const MASKED_PASSWORD = "••••••••••••••••";

type ConnectionStatus = "connected" | "disconnected" | "unknown";

export function SMSConfig() {
  const supabase = createClient();
  const { accountId, loading: authLoading } = useAuth();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("unknown");
  const [statusMessage, setStatusMessage] = useState<string>("");

  // Form states
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [senderId, setSenderId] = useState("");
  const [isActive, setIsActive] = useState(true);

  const fetchConfig = useCallback(async () => {
    if (!accountId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("sms_config")
        .select("*")
        .eq("account_id", accountId)
        .maybeSingle();

      if (error) {
        console.error("Failed to load SMS config:", error);
      }

      if (data) {
        setUsername(data.username || "");
        setPassword(MASKED_PASSWORD);
        setSenderId(data.sender_id || "");
        setIsActive(data.is_active ?? true);
      } else {
        setUsername("");
        setPassword("");
        setSenderId("");
        setIsActive(true);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [accountId, supabase]);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  // Test Connection API
  const handleTestConnection = async () => {
    setTesting(true);
    setConnectionStatus("unknown");
    setStatusMessage("");
    try {
      const res = await fetch("/api/sms/config", { method: "GET" });
      const payload = await res.json();

      if (payload.connected) {
        setConnectionStatus("connected");
        setStatusMessage(payload.message || "Successfully connected to SMS Gateway API!");
      } else {
        setConnectionStatus("disconnected");
        setStatusMessage(payload.message || "Failed to establish connection.");
      }
    } catch (err) {
      setConnectionStatus("disconnected");
      setStatusMessage("Network error connecting to verification API.");
    } finally {
      setTesting(false);
    }
  };

  // Save Settings
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) {
      toast.error("Username and Password are required");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/sms/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username,
          password: password === MASKED_PASSWORD ? MASKED_PASSWORD : password,
          sender_id: senderId,
          is_active: isActive,
        }),
      });

      const payload = await res.json();
      if (!res.ok) {
        toast.error(payload.error || "Failed to save configuration");
      } else {
        toast.success("SMS configurations saved successfully!");
        fetchConfig();
        setConnectionStatus("unknown");
        setStatusMessage("");
      }
    } catch (err) {
      toast.error("Network error saving configuration");
    } finally {
      setSaving(false);
    }
  };

  const webhookInboundUrl =
    typeof window !== "undefined" && accountId
      ? `${window.location.origin}/api/sms/webhook/inbound/${accountId}`
      : "";

  const webhookDeliveryUrl =
    typeof window !== "undefined" && accountId
      ? `${window.location.origin}/api/sms/webhook/delivery/${accountId}`
      : "";

  if (authLoading || loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <SettingsPanelHead
        title="SMS Gateway Configuration"
        description="Connect your account with the SMS Gateway API and configure webhook endpoints."
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        
        {/* Config Form */}
        <div className="lg:col-span-3 space-y-6">
          <form onSubmit={handleSave}>
            <Card className="border-border bg-card">
              <CardHeader>
                <CardTitle className="text-lg">API Credentials</CardTitle>
                <CardDescription>Enter the username and API password labeled on your SMS provider portal.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                
                {/* Active Toggle */}
                <div className="flex items-center justify-between rounded-lg border border-border p-4 bg-muted/20">
                  <div className="space-y-0.5">
                    <Label className="text-sm font-semibold">Enable SMS Channel</Label>
                    <p className="text-xs text-muted-foreground">Allows agents to choose SMS as a channel in the inbox.</p>
                  </div>
                  <Switch checked={isActive} onCheckedChange={setIsActive} />
                </div>

                {/* Username */}
                <div className="space-y-2">
                  <Label htmlFor="username">Username</Label>
                  <Input
                    id="username"
                    placeholder="Enter API Username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    required
                  />
                </div>

                {/* Password */}
                <div className="space-y-2">
                  <Label htmlFor="password">API Password / Key</Label>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      placeholder="Enter API password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-2.5 text-muted-foreground hover:text-foreground"
                    >
                      {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                    </button>
                  </div>
                </div>

                {/* Sender ID */}
                <div className="space-y-2">
                  <Label htmlFor="senderId">Approved Sender ID (Optional)</Label>
                  <Input
                    id="senderId"
                    placeholder="E.g. HALMARDIR"
                    value={senderId}
                    onChange={(e) => setSenderId(e.target.value)}
                  />
                </div>

                <div className="flex gap-2 pt-2">
                  <Button type="submit" disabled={saving} className="bg-primary text-primary-foreground hover:bg-primary/90 flex-1">
                    {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Save Config
                  </Button>
                  
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleTestConnection}
                    disabled={testing || username.trim() === ""}
                    className="border-border hover:bg-muted text-foreground flex-1"
                  >
                    {testing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Test Connection
                  </Button>
                </div>

              </CardContent>
            </Card>
          </form>

          {/* Connection Status Indicator */}
          {connectionStatus !== "unknown" && (
            <Alert
              variant={connectionStatus === "connected" ? "default" : "destructive"}
              className={connectionStatus === "connected" ? "border-green-500/30 bg-green-500/10 text-green-400" : ""}
            >
              {connectionStatus === "connected" ? (
                <CheckCircle2 className="h-4 w-4 text-green-400" />
              ) : (
                <XCircle className="h-4 w-4" />
              )}
              <AlertTitle>{connectionStatus === "connected" ? "Connection Successful" : "Connection Failed"}</AlertTitle>
              <AlertDescription className="text-xs">{statusMessage}</AlertDescription>
            </Alert>
          )}
        </div>

        {/* Webhooks Helper */}
        <div className="lg:col-span-2 space-y-6">
          <Card className="border-border bg-card">
            <CardHeader>
              <CardTitle className="text-lg">Developer Webhooks</CardTitle>
              <CardDescription>Paste these endpoints in your SMS Developers Portal to sync messages.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              
              {/* Inbound URL */}
              <div className="space-y-2">
                <Label className="text-xs font-semibold text-muted-foreground">Inbound Message Webhook</Label>
                <div className="relative">
                  <Input readOnly value={webhookInboundUrl} className="pr-10 text-xs font-mono bg-muted" />
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(webhookInboundUrl);
                      toast.success("Inbound Webhook copied!");
                    }}
                    className="absolute right-3 top-2.5 text-muted-foreground hover:text-foreground"
                  >
                    <Copy className="size-4" />
                  </button>
                </div>
              </div>

              {/* Delivery URL */}
              <div className="space-y-2">
                <Label className="text-xs font-semibold text-muted-foreground">Delivery Report Webhook</Label>
                <div className="relative">
                  <Input readOnly value={webhookDeliveryUrl} className="pr-10 text-xs font-mono bg-muted" />
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(webhookDeliveryUrl);
                      toast.success("Delivery Webhook copied!");
                    }}
                    className="absolute right-3 top-2.5 text-muted-foreground hover:text-foreground"
                  >
                    <Copy className="size-4" />
                  </button>
                </div>
              </div>

              <div className="rounded-lg border border-border p-4 bg-muted/20 text-xs leading-relaxed text-muted-foreground">
                <p className="font-semibold text-foreground flex items-center gap-1.5 mb-1.5">
                  <AlertTriangle className="size-3.5 text-amber-500" /> Webhook Setup Notice:
                </p>
                Inbound and delivery messages will not sync until these endpoints are registered on the SMS provider dashboard. Choose `POST` method when configuring them.
              </div>

            </CardContent>
          </Card>
        </div>

      </div>
    </div>
  );
}
