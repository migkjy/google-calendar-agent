import { NextResponse } from "next/server";

import { handleChatMessage } from "@/libs/chat-handler";

interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    from?: { id: number; first_name: string };
    chat: { id: number; type: string };
    date: number;
    text?: string;
  };
}

export async function POST(request: Request) {
  try {
    const update: TelegramUpdate = await request.json();

    const message = update.message;
    if (!message?.text) {
      return NextResponse.json({ ok: true });
    }

    const chatId = String(message.chat.id);
    const allowedChatId = process.env.TELEGRAM_CHAT_ID;

    // Only respond to the configured chat (CEO)
    if (allowedChatId && chatId !== allowedChatId) {
      console.warn(`Ignoring message from unauthorized chat: ${chatId}`);
      return NextResponse.json({ ok: true });
    }

    // Process the message asynchronously but don't block the webhook response
    const reply = await handleChatMessage(chatId, message.text);

    return NextResponse.json({ ok: true, reply });
  } catch (error) {
    console.error("Telegram webhook error:", error);
    // Always return 200 to Telegram to prevent retries
    return NextResponse.json({ ok: true, error: "Internal error" });
  }
}

// GET for webhook verification
export async function GET() {
  return NextResponse.json({
    status: "Telegram webhook is active",
    endpoint: "/api/telegram/webhook",
  });
}
