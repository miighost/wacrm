"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { MessageSquare, Zap, Users, GitBranch, Shield, ArrowRight, Radio } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function LandingPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);

  useEffect(() => {
    const checkUser = async () => {
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (session?.user) {
        setAuthenticated(true);
        router.push("/dashboard");
      } else {
        setLoading(false);
      }
    };
    checkUser();
  }, [router]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <p className="text-sm text-muted-foreground">Loading HalmarDir...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground selection:bg-primary/30">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <MessageSquare className="h-5 w-5" />
            </div>
            <span className="text-lg font-bold tracking-tight text-foreground">
              HalmarDir
            </span>
          </div>

          <div className="flex items-center gap-4">
            <Link href="/login">
              <Button variant="ghost" className="text-sm font-medium text-muted-foreground hover:text-foreground">
                Sign In
              </Button>
            </Link>
            <Link href="/signup">
              <Button className="bg-primary text-primary-foreground hover:bg-primary/90 text-sm font-medium">
                Get Started
              </Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative mx-auto max-w-7xl px-4 py-20 text-center sm:px-6 sm:py-32 lg:px-8">
        {/* Glow Effects */}
        <div className="absolute inset-x-0 -top-40 -z-10 transform-gpu overflow-hidden blur-3xl sm:-top-80" aria-hidden="true">
          <div className="relative left-[calc(50%-11rem)] aspect-1155/678 w-[36rem] -translate-x-1/2 rotate-[30deg] bg-gradient-to-tr from-primary to-accent opacity-20 sm:left-[calc(50%-30rem)] sm:w-[72rem]" />
        </div>

        <div className="mx-auto max-w-3xl">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-4 py-1.5 text-xs font-semibold text-primary">
            <Zap className="h-3.5 w-3.5" />
            <span>Dual-Channel CRM Setup Complete</span>
          </div>
          <h1 className="text-4xl font-extrabold tracking-tight text-foreground sm:text-6xl bg-clip-text">
            The Ultimate WhatsApp & SMS CRM for Teams
          </h1>
          <p className="mt-6 text-lg leading-8 text-muted-foreground max-w-2xl mx-auto">
            Manage your customer relationships over the official WhatsApp Business API and **Carrier SMS** from a single, unified shared inbox. Collaborate with agents, automate workflows, and drive sales.
          </p>
          <div className="mt-10 flex items-center justify-center gap-x-6">
            <Link href="/signup">
              <Button size="lg" className="bg-primary text-primary-foreground hover:bg-primary/90 gap-2 h-12 px-6">
                Start Free Trial <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
            <Link href="/login">
              <Button size="lg" variant="outline" className="border-border hover:bg-muted h-12 px-6">
                Sign In to Account
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Feature Grid */}
      <section className="border-t border-border bg-card-2/30 py-24 sm:py-32">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
              Everything you need to engage customers
            </h2>
            <p className="mt-4 text-muted-foreground">
              Powerful tools built natively on top of Next.js and Supabase for speed, security, and developer control.
            </p>
          </div>

          <div className="mx-auto mt-16 max-w-5xl sm:mt-20 lg:mt-24">
            <div className="grid grid-cols-1 gap-y-12 sm:grid-cols-2 sm:gap-x-8 lg:grid-cols-3 lg:gap-x-12">
              
              {/* Feature 1 */}
              <div className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-6">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <MessageSquare className="h-5 w-5" />
                </div>
                <h3 className="text-lg font-bold text-foreground">Unified Shared Inbox</h3>
                <p className="text-sm text-muted-foreground">
                  Staff a single WhatsApp or Carrier SMS number with multiple agents. Assign chats, set statuses, and store contact notes.
                </p>
              </div>

              {/* Feature 2 */}
              <div className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-6">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Radio className="h-5 w-5" />
                </div>
                <h3 className="text-lg font-bold text-foreground">Bulk Broadcast Campaigns</h3>
                <p className="text-sm text-muted-foreground">
                  Send targeted marketing broadcasts using approved templates or Carrier SMS to custom contact tag filters.
                </p>
              </div>

              {/* Feature 3 */}
              <div className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-6">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Zap className="h-5 w-5" />
                </div>
                <h3 className="text-lg font-bold text-foreground">No-Code Automations</h3>
                <p className="text-sm text-muted-foreground">
                  Build advanced auto-replies, keyword triggers, conditionals, and webhook integrations with our visual rules engine.
                </p>
              </div>

              {/* Feature 4 */}
              <div className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-6">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <GitBranch className="h-5 w-5" />
                </div>
                <h3 className="text-lg font-bold text-foreground">Sales Pipelines</h3>
                <p className="text-sm text-muted-foreground">
                  Drag and drop deals through customizable Kanban board stages to track sales opportunities and forecast revenue.
                </p>
              </div>

              {/* Feature 5 */}
              <div className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-6">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Users className="h-5 w-5" />
                </div>
                <h3 className="text-lg font-bold text-foreground">Team Collaboration</h3>
                <p className="text-sm text-muted-foreground">
                  Invite teammates with link invitations. Set precise roles: Owners, Admins, Agents, or Viewers.
                </p>
              </div>

              {/* Feature 6 */}
              <div className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-6">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Shield className="h-5 w-5" />
                </div>
                <h3 className="text-lg font-bold text-foreground">State of the Art Security</h3>
                <p className="text-sm text-muted-foreground">
                  Features token encryption (AES-256-GCM), Postgres Row Level Security (RLS) on every table, and HMAC-verified webhooks.
                </p>
              </div>

            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border bg-background py-8">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-4 sm:px-6 sm:flex-row lg:px-8">
          <p className="text-xs text-muted-foreground/60">
            &copy; {new Date().getFullYear()} HalmarDir. All rights reserved.
          </p>
          <p className="text-xs text-muted-foreground/60">
            Powered by{" "}
            <a
              href="http://www.miigsolution.so"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:underline font-semibold text-muted-foreground hover:text-foreground transition-colors"
            >
              Miig Solutions
            </a>
          </p>
        </div>
      </footer>
    </div>
  );
}
