import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db/client";
import { isAuthed, ADMIN_ACTOR } from "@/lib/auth";
import { sendMessage, inlineKeyboard } from "@/lib/bot/telegram";

export const runtime = "nodejs";

function logAction(action: string, details: string) {
  const db = getDb();
  db.prepare(
    `insert into audit_log (id, actor, action, details, created_at) values (?, ?, ?, ?, ?)`
  ).run(crypto.randomUUID(), ADMIN_ACTOR, action, details, new Date().toISOString());
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!(await isAuthed())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const body = await req.json();
  const db = getDb();

  const order = db.prepare(`select * from orders where id = ?`).get(id) as any | undefined;
  if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });

  const chatId = order.telegram_chat_id;

  switch (body.op) {
    case "approve": {
      db.prepare(
        `update orders set status = 'confirmed', delivery_status = 'processing', is_flagged = 0, confirmed_at = ? where id = ?`
      ).run(new Date().toISOString(), id);
      logAction("Order approved", `${order.order_reference}`);
      await sendMessage(chatId, `✅ Good news! Your order <b>${order.order_reference}</b> has been approved. Invoice will be sent shortly.`);
      break;
    }
    case "cancel": {
      db.prepare(`update orders set status = 'cancelled' where id = ?`).run(id);
      logAction("Order cancelled", `${order.order_reference}`);
      await sendMessage(chatId, `🚫 Your order <b>${order.order_reference}</b> has been cancelled. Contact us if you have questions.`);
      break;
    }
    case "advance_delivery": {
      const deliveredAt = body.to === "delivered" ? new Date().toISOString() : null;
      db.prepare(`update orders set delivery_status = ?, delivered_at = ? where id = ?`).run(
        body.to,
        deliveredAt,
        id
      );
      logAction("Delivery updated", `${order.order_reference} → ${body.to}`);
      const msgs: Record<string, string> = {
        packed: `📦 Your order <b>${order.order_reference}</b> has been packed!`,
        out_for_delivery: `🚚 Your order <b>${order.order_reference}</b> is out for delivery today!`,
        delivered: `✅ Your order <b>${order.order_reference}</b> has been delivered! Enjoy your products! 💚`,
      };
      if (msgs[body.to]) await sendMessage(chatId, msgs[body.to]);

      if (body.to === "delivered") {
        const labels = ["Poor", "Okay", "Good", "Great", "Excellent"];
        await sendMessage(
          chatId,
          `🌟 How was your experience? Your feedback helps us improve!\nTap a rating below:`,
          {
            reply_markup: inlineKeyboard([
              ...[1, 2, 3, 4, 5].map((n) => [
                {
                  text: `${"⭐".repeat(n)}${"☆".repeat(5 - n)}  ${labels[n - 1]}`,
                  data: `rate:${order.id}:${n}`,
                },
              ]),
              [{ text: "Skip", data: "rate_skip" }],
            ]),
          }
        );
      }
      break;
    }
    case "refund_approve": {
      db.prepare(`update orders set return_status = 'refunded' where id = ?`).run(id);
      logAction("Refund approved", `${order.order_reference} — RM ${Number(order.total_amount).toFixed(2)}`);
      await sendMessage(chatId, `💸 Refund approved for <b>${order.order_reference}</b>. Funds will reach your bank in 5–7 working days.`);
      break;
    }
    case "refund_reject": {
      db.prepare(`update orders set return_status = 'rejected' where id = ?`).run(id);
      logAction("Refund rejected", `${order.order_reference} — ${body.reason}`);
      await sendMessage(chatId, `⚠️ Refund for <b>${order.order_reference}</b> cannot be approved.\nReason: ${body.reason}`);
      break;
    }
    default:
      return NextResponse.json({ error: "Unknown op" }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
