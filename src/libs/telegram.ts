const TELEGRAM_API = "https://api.telegram.org";

/** 텔레그램 봇 API로 메시지 전송 */
export async function sendMessage(
  chatId: string,
  text: string,
): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    console.warn("TELEGRAM_BOT_TOKEN not set, skipping message");
    return false;
  }

  try {
    const res = await fetch(`${TELEGRAM_API}/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "HTML",
      }),
    });

    if (!res.ok) {
      const error = await res.text();
      console.error("Telegram send failed:", error);
      return false;
    }

    return true;
  } catch (error) {
    console.error("Telegram send error:", error);
    return false;
  }
}

/** CEO에게 리마인더 알림 전송 */
export async function sendReminder(
  title: string,
  message: string,
): Promise<boolean> {
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!chatId) {
    console.warn("TELEGRAM_CHAT_ID not set, skipping reminder");
    return false;
  }

  const text = `🔔 <b>${escapeHtml(title)}</b>\n${escapeHtml(message)}`;
  return sendMessage(chatId, text);
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
