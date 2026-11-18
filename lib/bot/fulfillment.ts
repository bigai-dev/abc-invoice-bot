/**
 * Turns a PAID Stripe checkout session into a fulfilled order:
 * order row → stock decrement → invoice number → PDF → Telegram messages.
 *
 * Idempotent: the same session can be delivered by Stripe multiple times
 * (retries, dashboard resends) but only ever produces one order. The
 * check-then-insert is backed by a UNIQUE index on orders.stripe_session_id.
 */
import type Stripe from "stripe";
import { sendMessage, sendDocument } from "./telegram";
import { getSession, saveSession } from "./session";
import { findCustomerByChatId } from "./customers";
import { getProductBySku } from "./products";
import { createOrder } from "./orders";
import { generateInvoicePDF, uploadInvoiceToStorage } from "./pdf";
import { showMainMenu } from "./handler";
import { getDb } from "../db/client";
import type { CartItem } from "./types";

export async function fulfillStripeSession(session: Stripe.Checkout.Session) {
  const chatId = session.metadata?.chat_id;
  const cartRaw = session.metadata?.cart;
  if (!chatId || !cartRaw) {
    // Not one of ours (or malformed) — acknowledge so Stripe stops retrying.
    console.error("[stripe fulfill] session missing metadata", session.id);
    return;
  }

  const db = getDb();

  // Idempotency: already fulfilled? Then this is a retry — nothing to do.
  const existing = db
    .prepare(`select id from orders where stripe_session_id = ?`)
    .get(session.id) as { id: string } | undefined;
  if (existing) return;

  const customer = await findCustomerByChatId(chatId);
  if (!customer) {
    // Profile is required at checkout, so this is practically unreachable.
    // Throw → webhook returns 500 → Stripe retries later.
    throw new Error(`[stripe fulfill] customer not found for chat ${chatId}`);
  }

  // Rebuild the cart from the metadata snapshot. Prices are the ones the
  // customer was actually charged (locked when the session was created);
  // names are re-resolved from the catalogue (fallback: the SKU).
  const compact = JSON.parse(cartRaw) as { s: string; q: number; p: number }[];
  const cart: CartItem[] = [];
  for (const c of compact) {
    const product = await getProductBySku(c.s);
    cart.push({ sku: c.s, name: product?.name || c.s, price: c.p, qty: c.q });
  }
  const sstRate = Number(session.metadata?.sst_rate ?? 0.08);

  const { order, base, sst, total, orderRef, invoiceNo } = await createOrder({
    chatId,
    customerId: customer.id,
    cart,
    sstRate,
    flagged: false,
    stripeSessionId: session.id,
  });

  // Payment is done — clear the cart and the pending payment link.
  const st = await getSession(chatId);
  st.cart = [];
  st.lastOrderRef = orderRef;
  st.pendingStripeSessionId = undefined;
  st.step = "idle";
  await saveSession(chatId, st);

  await sendMessage(chatId, "✅ <b>Payment received!</b> Generating your invoice...");

  try {
    const pdfBytes = await generateInvoicePDF({
      orderRef,
      invoiceNo: invoiceNo!,
      customer: {
        name: customer.name,
        phone: customer.phone,
        email: customer.email,
        address: customer.address,
      },
      items: cart,
      base,
      sst,
      total,
    });
    const relativeUrl = await uploadInvoiceToStorage(order.id, pdfBytes);
    db.prepare(`update orders set invoice_pdf_url = ? where id = ?`).run(relativeUrl, order.id);
    // Upload the PDF bytes directly into the chat (no URL fetch needed)
    await sendDocument(chatId, `Invoice-${invoiceNo}.pdf`, pdfBytes, `📄 Invoice ${invoiceNo}`);
  } catch (e) {
    console.error("PDF generation failed", e);
    await sendMessage(chatId, "Invoice is being finalized — it will arrive shortly.");
  }

  await sendMessage(
    chatId,
    `Thank you, <b>${customer.name}</b>! 🙏\n\nYour order <b>${orderRef}</b> is being processed. We'll notify you of delivery updates here!`
  );
  await showMainMenu(chatId);
}

/** FPX (online banking) payment failed after the customer was redirected. */
export async function notifyStripePaymentFailed(session: Stripe.Checkout.Session) {
  const chatId = session.metadata?.chat_id;
  if (!chatId) return;
  await sendMessage(
    chatId,
    "⚠️ Your payment didn't go through — no money was taken. Tap Checkout to try again."
  );
}
