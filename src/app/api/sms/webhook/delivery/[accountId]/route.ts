import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

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
    const body = await request.json(); // MessageID, Origin, Destination, Message, DLRStatus, DLRTime

    const { MessageID, DLRStatus } = body;
    if (!MessageID || !DLRStatus) {
      return NextResponse.json({ error: "Missing required webhook parameters" }, { status: 400 });
    }

    const statusMap: Record<string, string> = {
      "Delivered": "delivered",
      "Sent": "sent",
      "Failed": "failed",
    };

    const status = statusMap[DLRStatus] || "sent";

    // Update the message status in the DB.
    // The service-role client is used to bypass RLS policies on the messages table.
    const { error } = await supabaseAdmin()
      .from("messages")
      .update({ status })
      .eq("message_id", MessageID);

    if (error) {
      console.error("[sms-delivery-webhook] Failed to update message:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[sms-delivery-webhook] Webhook failed:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
