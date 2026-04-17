import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { sendMessage, inlineKeyboard } from "@/lib/bot/telegram";

async function requireAdmin() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || (process.env.ADMIN_EMAIL && user.email !== process.env.ADMIN_EMAIL)) {
    return null;
  }
  return user;
}

async function log(actor: string, action: string, details: string) {
  await createAdminClient().from("audit_log").insert({ actor, action, details });
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireAdmin();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const body = await req.json();
  const admin = createAdminClient();

  const { data: order } = await admin.from("orders").select("*, order_items(*)").eq("id", id).single();
  if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });

  const chatId = order.telegram_chat_id;

  switch (body.op) {
    case "approve": {
      await admin.from("orders").update({
        status: "confirmed",
        delivery_status: "processing",
        is_flagged: false,
        confirmed_at: new Date().toISOString(),
      }).eq("id", id);
      await log(user.email!, "Order approved", `${order.order_reference}`);
      await sendMessage(chatId, `✅ Good news! Your order <b>${order.order_reference}</b> has been approved. Invoice will be sent shortly.`);
      break;
    }
    case "cancel": {
      await admin.from("orders").update({ status: "cancelled" }).eq("id", id);
      await log(user.email!, "Order cancelled", `${order.order_reference}`);
      await sendMessage(chatId, `🚫 Your order <b>${order.order_reference}</b> has been cancelled. Contact us if you have questions.`);
      break;
    }
    case "advance_delivery": {
      await admin.from("orders").update({
        delivery_status: body.to,
        delivered_at: body.to === "delivered" ? new Date().toISOString() : null,
      }).eq("id", id);
      await log(user.email!, "Delivery updated", `${order.order_reference} → ${body.to}`);
      const msgs: Record<string, string> = {
        packed: `📦 Your order <b>${order.order_reference}</b> has been packed!`,
        out_for_delivery: `🚚 Your order <b>${order.order_reference}</b> is out for delivery today!`,
        delivered: `✅ Your order <b>${order.order_reference}</b> has been delivered! Enjoy your products! 💚`,
      };
      if (msgs[body.to]) await sendMessage(chatId, msgs[body.to]);

      // Ask for a review after delivery
      if (body.to === "delivered") {
        await sendMessage(
          chatId,
          `🌟 How was your experience? Your feedback helps us improve!\nTap a rating below:`,
          {
            reply_markup: inlineKeyboard([
              [1, 2, 3, 4, 5].map((n) => ({ text: "⭐".repeat(n), data: `rate:${order.id}:${n}` })),
              [{ text: "Skip", data: "rate_skip" }],
            ]),
          }
        );
      }
      break;
    }
    case "refund_approve": {
      await admin.from("orders").update({ return_status: "refunded" }).eq("id", id);
      await log(user.email!, "Refund approved", `${order.order_reference} — RM ${Number(order.total_amount).toFixed(2)}`);
      await sendMessage(chatId, `💸 Refund approved for <b>${order.order_reference}</b>. Funds will reach your bank in 5–7 working days.`);
      break;
    }
    case "refund_reject": {
      await admin.from("orders").update({ return_status: "rejected" }).eq("id", id);
      await log(user.email!, "Refund rejected", `${order.order_reference} — ${body.reason}`);
      await sendMessage(chatId, `⚠️ Refund for <b>${order.order_reference}</b> cannot be approved.\nReason: ${body.reason}`);
      break;
    }
    default:
      return NextResponse.json({ error: "Unknown op" }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
