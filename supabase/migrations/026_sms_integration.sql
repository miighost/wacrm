-- ============================================================
-- 026_sms_integration.sql — Hormuud SMS Integration
-- ============================================================

-- ============================================================
-- SMS_CONFIG
-- ============================================================
CREATE TABLE IF NOT EXISTS sms_config (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  username TEXT NOT NULL,
  password_encrypted TEXT NOT NULL,
  sender_id TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(account_id)
);

ALTER TABLE sms_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sms_config_select ON sms_config;
DROP POLICY IF EXISTS sms_config_insert ON sms_config;
DROP POLICY IF EXISTS sms_config_update ON sms_config;
DROP POLICY IF EXISTS sms_config_delete ON sms_config;

CREATE POLICY sms_config_select ON sms_config FOR SELECT USING (is_account_member(account_id));
CREATE POLICY sms_config_insert ON sms_config FOR INSERT WITH CHECK (is_account_member(account_id, 'admin'));
CREATE POLICY sms_config_update ON sms_config FOR UPDATE USING (is_account_member(account_id, 'admin'));
CREATE POLICY sms_config_delete ON sms_config FOR DELETE USING (is_account_member(account_id, 'admin'));

DROP TRIGGER IF EXISTS set_updated_at ON sms_config;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON sms_config
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- CONVERSATIONS & MESSAGES TYPE UPDATES
-- ============================================================
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS channel_type TEXT NOT NULL DEFAULT 'whatsapp' CHECK (channel_type IN ('whatsapp', 'sms'));
ALTER TABLE messages ADD COLUMN IF NOT EXISTS channel_type TEXT NOT NULL DEFAULT 'whatsapp' CHECK (channel_type IN ('whatsapp', 'sms'));

CREATE INDEX IF NOT EXISTS idx_conversations_channel_type ON conversations(channel_type);
CREATE INDEX IF NOT EXISTS idx_messages_channel_type ON messages(channel_type);
