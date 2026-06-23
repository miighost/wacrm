import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { canSendMessages } from "@/lib/auth/roles";
import { HormuudClient } from "@/lib/sms/hormuud-api";
import { findExistingContact } from "@/lib/contacts/dedupe";

async function resolveAccountMeta(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
) {
  const { data, error } = await supabase
    .from("profiles")
    .select("account_id, account_role, id")
    .eq("user_id", userId)
    .maybeSingle();
  if (error || !data) return null;
  return data;
}

let _adminClient: any = null;
function supabaseAdmin() {
  if (!_adminClient) {
    _adminClient = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
  }
  return _adminClient;
}

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

    const accountMeta = await resolveAccountMeta(supabase, user.id);
    if (!accountMeta || !accountMeta.account_id) {
      return NextResponse.json({ error: "Account not resolved" }, { status: 400 });
    }

    const { account_id, account_role, id: profileId } = accountMeta;

    // Verify minimum role requirements to send messages (agent+)
    if (!account_role || !canSendMessages(account_role)) {
      return NextResponse.json({ error: "Unauthorized: Viewers cannot send messages." }, { status: 403 });
    }

    const body = await request.json();
    const { recipients, message, senderId } = body; // recipients: Array<{ name: string, phone: string, contactId?: string }>

    if (!recipients || !Array.isArray(recipients) || recipients.length === 0) {
      return NextResponse.json({ error: "At least one recipient is required." }, { status: 400 });
    }

    if (!message || message.trim().length === 0) {
      return NextResponse.json({ error: "Message body cannot be empty." }, { status: 400 });
    }

    // 1. Fetch active SMS configuration for this account
    const db = supabaseAdmin();
    const { data: config, error: configErr } = await db
      .from("sms_config")
      .select("username, password_encrypted, sender_id, is_active")
      .eq("account_id", account_id)
      .maybeSingle();

    if (configErr || !config || !config.is_active) {
      return NextResponse.json(
        { error: "SMS channel is disabled or not configured in settings." },
        { status: 400 }
      );
    }

    const client = new HormuudClient({
      username: config.username,
      passwordEncrypted: config.password_encrypted,
      senderId: senderId || config.sender_id,
    });

    let successCount = 0;
    const errors: string[] = [];

    // 2. Loop and send messages
    for (const recipient of recipients) {
      try {
        const phoneNormalized = recipient.phone.replace(/\D/g, "");
        if (!phoneNormalized) {
          errors.push(`Invalid phone number format for recipient: ${recipient.name}`);
          continue;
        }

        // Send SMS via Hormuud
        const refId = `b-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
        const sendOutcome = await client.sendSMS({
          mobile: phoneNormalized,
          message: message,
          refId,
        });

        // Find or create contact
        let contactId = recipient.contactId;
        if (!contactId) {
          const existing = await findExistingContact(db, account_id, phoneNormalized);
          if (existing) {
            contactId = existing.id;
          } else {
            const { data: newContact, error: createError } = await db
              .from("contacts")
              .insert({
                account_id,
                user_id: user.id,
                phone: recipient.phone,
                name: recipient.name || recipient.phone,
              })
              .select("id")
              .single();

            if (createError) {
              console.error("[sms-send] Contact creation failed:", createError);
              errors.push(`Failed to save contact for ${recipient.name}`);
              continue;
            }
            contactId = newContact.id;
          }
        }

        // Find or create conversation
        const { data: existingConv } = await db
          .from("conversations")
          .select("id")
          .eq("account_id", account_id)
          .eq("contact_id", contactId)
          .maybeSingle();

        let conversationId: string;
        if (existingConv) {
          conversationId = existingConv.id;
        } else {
          const { data: newConv, error: createError } = await db
            .from("conversations")
            .insert({
              account_id,
              user_id: user.id,
              contact_id: contactId,
              channel_type: "sms",
            })
            .select("id")
            .single();

          if (createError) {
            console.error("[sms-send] Conversation creation failed:", createError);
            errors.push(`Failed to establish thread for ${recipient.name}`);
            continue;
          }
          conversationId = newConv.id;
        }

        // Save sent message to messages DB table
        const { error: msgErr } = await db.from("messages").insert({
          conversation_id: conversationId,
          sender_type: "agent",
          sender_id: profileId,
          content_type: "text",
          content_text: message,
          message_id: sendOutcome.messageId, // Stash Hormuud's MessageID to match webhooks later
          status: "sending",
          channel_type: "sms",
          created_at: new Date().toISOString(),
        });

        if (msgErr) {
          console.error("[sms-send] Failed to write message row:", msgErr);
        }

        // Update conversation summary
        await db
          .from("conversations")
          .update({
            last_message_text: message,
            last_message_at: new Date().toISOString(),
            channel_type: "sms",
            updated_at: new Date().toISOString(),
          })
          .eq("id", conversationId);

        successCount++;
      } catch (err) {
        console.error(`[sms-send] Failed to send to ${recipient.name}:`, err);
        errors.push(err instanceof Error ? err.message : `API error sending to ${recipient.name}`);
      }
    }

    if (successCount === 0) {
      return NextResponse.json({ error: "Failed to send messages.", details: errors }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      sent_count: successCount,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (err) {
    console.error("[sms-send] Fatal error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
