import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { encrypt } from "@/lib/whatsapp/encryption";
import { HormuudClient } from "@/lib/sms/hormuud-api";

async function resolveAccountId(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("account_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (error || !data?.account_id) return null;
  return data.account_id as string;
}

/**
 * GET /api/sms/config
 *
 * Verifies the health of the saved Hormuud SMS configuration.
 */
export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const accountId = await resolveAccountId(supabase, user.id);
    if (!accountId) {
      return NextResponse.json(
        { connected: false, reason: "no_account", message: "User account not resolved." },
        { status: 200 },
      );
    }

    const { data: config, error: configError } = await supabase
      .from("sms_config")
      .select("username, password_encrypted, sender_id, is_active")
      .eq("account_id", accountId)
      .maybeSingle();

    if (configError) {
      return NextResponse.json(
        { connected: false, reason: "db_error", message: "Database error fetching configuration." },
        { status: 200 },
      );
    }

    if (!config) {
      return NextResponse.json(
        { connected: false, reason: "no_config", message: "No SMS configuration set up yet." },
        { status: 200 },
      );
    }

    // Run connection test against Hormuud
    const client = new HormuudClient({
      username: config.username,
      passwordEncrypted: config.password_encrypted,
      senderId: config.sender_id,
    });

    const test = await client.testConnection();
    return NextResponse.json(
      {
        connected: test.success,
        username: config.username,
        sender_id: config.sender_id,
        is_active: config.is_active,
        message: test.message,
      },
      { status: 200 },
    );
  } catch (err) {
    console.error("[sms-config] GET failed:", err);
    const errMsg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { connected: false, reason: "server_error", message: `Server error checking configuration: ${errMsg}` },
      { status: 500 },
    );
  }
}

/**
 * POST /api/sms/config
 *
 * Upserts the Hormuud SMS config row. Enforces admin RLS check automatically.
 */
export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const accountId = await resolveAccountId(supabase, user.id);
    if (!accountId) {
      return NextResponse.json({ error: "User account not resolved." }, { status: 400 });
    }

    const body = await request.json();
    const { username, password, sender_id, is_active } = body;

    if (!username || !password) {
      return NextResponse.json({ error: "Username and Password are required." }, { status: 400 });
    }

    // Encrypt the password before writing to the DB
    const passwordEncrypted = password.startsWith("••••")
      ? undefined // Keep existing password if not updated
      : encrypt(password);

    const payload: Record<string, unknown> = {
      account_id: accountId,
      username,
      sender_id: sender_id || null,
      is_active: is_active ?? true,
      updated_at: new Date().toISOString(),
    };

    if (passwordEncrypted) {
      payload.password_encrypted = passwordEncrypted;
    }

    const { error: upsertError } = await supabase
      .from("sms_config")
      .upsert(payload, { onConflict: "account_id" });

    if (upsertError) {
      console.error("[sms-config] POST upsert failed:", upsertError);
      return NextResponse.json({ error: upsertError.message }, { status: 400 });
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (err) {
    console.error("[sms-config] POST failed:", err);
    const errMsg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Internal server error: ${errMsg}` }, { status: 500 });
  }
}
