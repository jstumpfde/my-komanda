-- Настройки голоса ассистента Нэнси (TTS Yandex SpeechKit)
-- voice: alena | filipp | oksana | jane | zahar | ermil
-- emotion: good | neutral | evil
-- speed: 0.8..1.5
-- ttsEnabled: включить/выключить озвучку

ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS nancy_voice_json jsonb NOT NULL DEFAULT '{}';
