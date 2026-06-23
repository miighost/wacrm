import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { findExistingContact } from "@/lib/contacts/dedupe";

let _adminClient: any = null;
function supabaseAdmin() {
  if (!_adminClient) {
    _adminClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
  }
  return _adminClient;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ accountId: string }> }
) {
  try {
    const { accountId } = await params;
    const body = await request.json(); // Sender, MessageText, ShortCode, TimeSent

    const { Sender, MessageText, ShortCode, TimeSent } = body;
    if (!Sender || !MessageText) {
      return NextResponse.json({ error: "Missing required webhook parameters" }, { status: 400 });
    }

    const phoneNormalized = Sender.replace(/\D/g, "");
    if (!phoneNormalized) {
      return NextResponse.json({ error: "Invalid sender phone number" }, { status: 400 });
    }

    const db = supabaseAdmin();

    // 1. Resolve a default user/owner ID from the account profiles.
    // We fetch the account owner's user_id as a stable default audit field.
    const { data: ownerProfile, error: profileErr } = await db
      .from("profiles")
      .select("user_id")
      .eq("account_id", accountId)
      .eq("account_role", "owner")
      .maybeSingle();

    if (profileErr || !ownerProfile) {
      console.error("[sms-inbound-webhook] Failed to resolve account owner:", profileErr);
      return NextResponse.json({ error: "Invalid account or owner not found" }, { status: 400 });
    }

    const defaultUserId = ownerProfile.user_id;

    // 2. Find or create the contact in the account.
    const existingContact = await findExistingContact(db, accountId, phoneNormalized);
    let contactId: string;

    if (existingContact) {
      contactId = existingContact.id;
    } else {
      const { data: newContact, error: createError } = await db
        .from("contacts")
        .insert({
          account_id: accountId,
          user_id: defaultUserId,
          phone: Sender,
          name: Sender,
        })
        .select()
        .single();

      if (createError) {
        console.error("[sms-inbound-webhook] Contact creation failed:", createError);
        return NextResponse.json({ error: "Failed to create contact" }, { status: 500 });
      }
      contactId = newContact.id;
    }

    // 3. Find or create the conversation (scoped to account and contact).
    const { data: existingConv, error: convFindError } = await db
      .from("conversations")
      .select("id, unread_count")
      .eq("account_id", accountId)
      .eq("contact_id", contactId)
      .maybeSingle();

    let conversationId: string;
    let currentUnread = 0;

    if (existingConv) {
      conversationId = existingConv.id;
      currentUnread = existingConv.unread_count || 0;
    } else {
      const { data: newConv, error: createError } = await db
        .from("conversations")
        .insert({
          account_id: accountId,
          user_id: defaultUserId,
          contact_id: contactId,
          channel_type: "sms",
        })
        .select()
        .single();

      if (createError) {
        console.error("[sms-inbound-webhook] Conversation creation failed:", createError);
        return NextResponse.json({ error: "Failed to create conversation" }, { status: 500 });
      }
      conversationId = newConv.id;
    }

    // 4. Insert message with sender_type='customer' and channel_type='sms'
    const messageId = `sms-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const { error: msgError } = await db.from("messages").insert({
      conversation_id: conversationId,
      sender_type: "customer",
      content_type: "text",
      content_text: MessageText,
      message_id: messageId,
      status: "delivered",
      channel_type: "sms",
      created_at: TimeSent ? new Date(TimeSent).toISOString() : new Date().toISOString(),
    });

    if (msgError) {
      console.error("[sms-inbound-webhook] Message insert failed:", msgError);
      return NextResponse.json({ error: "Failed to save message" }, { status: 500 });
    }

    // 5. Update conversation with last message details, unread count, and channel_type
    const { error: convError } = await db
      .from("conversations")
      .update({
        last_message_text: MessageText,
        last_message_at: new Date().toISOString(),
        unread_count: currentUnread + 1,
        channel_type: "sms",
        updated_at: new Date().toISOString(),
      })
      .eq("id", conversationId);

    if (convError) {
      console.error("[sms-inbound-webhook] Conversation update failed:", convError);
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[sms-inbound-webhook] Webhook failed:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
