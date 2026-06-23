import { decrypt } from "@/lib/whatsapp/encryption";

interface SendSMSParams {
  mobile: string;
  message: string;
  senderId?: string;
  refId?: string;
}

export interface HormuudConfig {
  username: string;
  passwordEncrypted: string;
  senderId?: string | null;
}

export class HormuudClient {
  private baseUrl = "https://smsapi.hormuud.com";
  private username: string;
  private passwordDecrypted: string;
  private senderId?: string;

  constructor(config: HormuudConfig) {
    this.username = config.username;
    this.passwordDecrypted = decrypt(config.passwordEncrypted);
    this.senderId = config.senderId || undefined;
  }

  /**
   * Test the connection to the Hormuud token endpoint
   */
  async testConnection(): Promise<{ success: boolean; message: string }> {
    try {
      const response = await fetch(`${this.baseUrl}/token`, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          username: this.username,
          password: this.passwordDecrypted,
          grant_type: "password",
        }).toString(),
      });

      if (!response.ok) {
        const errorText = await response.text();
        return {
          success: false,
          message: `API returned status ${response.status}: ${errorText || "Unknown error"}`,
        };
      }

      const result = await response.json();
      if (result.access_token) {
        return { success: true, message: "Connection successful" };
      }

      return {
        success: false,
        message: result.error_description || "Invalid credentials, token missing in response.",
      };
    } catch (err) {
      console.error("[HormuudClient] connection test failed:", err);
      return {
        success: false,
        message: err instanceof Error ? err.message : "Network error connecting to Hormuud API",
      };
    }
  }

  /**
   * Send outbound SMS using Basic Auth (which is stateless and simpler)
   */
  async sendSMS({ mobile, message, refId, senderId }: SendSMSParams): Promise<{ messageId: string; description: string }> {
    // Hormuud expects digits only e.g. "61xxxxxxx"
    const cleanMobile = mobile.replace(/\D/g, "");
    if (!cleanMobile) {
      throw new Error("Invalid mobile number: no digits found");
    }

    const credentials = Buffer.from(`${this.username}:${this.passwordDecrypted}`).toString("base64");
    const activeSenderId = senderId || this.senderId || "";

    const response = await fetch(`${this.baseUrl}/api/sms/Send`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Basic ${credentials}`,
      },
      body: JSON.stringify({
        refid: refId ?? "0",
        mobile: cleanMobile,
        message: message,
        senderid: activeSenderId,
        validity: 0,
      }),
    });

    if (!response.ok) {
      throw new Error(`Hormuud SMS API returned status ${response.status}`);
    }

    const result = await response.json();

    // Map response codes to clear developer errors
    if (result.ResponseCode !== "200") {
      const errorMsg = result.ResponseMessage || "Unknown SMS error";
      const code = result.ResponseCode;
      
      let friendlyDetail = errorMsg;
      if (code === "201") friendlyDetail = "Authentication Failed";
      if (code === "203") friendlyDetail = "Invalid Sender ID";
      if (code === "204") friendlyDetail = "Zero Balance (Prepaid Account)";
      if (code === "205") friendlyDetail = "Insufficient Balance";
      if (code === "207") friendlyDetail = "Wrong mobile number";

      throw new Error(`SMS Send Failed: ${friendlyDetail} (Code: ${code})`);
    }

    return {
      messageId: result.Data?.MessageID || "unknown-id",
      description: result.Data?.Description || "Success",
    };
  }
}
