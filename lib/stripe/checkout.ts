import type Stripe from "stripe";
import { getStripe } from "./client";
import type { CartItem } from "../bot/types";

// Stripe metadata values are capped at 500 chars; with an 8-product catalogue
// the compact cart JSON stays well under this. Guard anyway.
const MAX_CART_METADATA = 480;

/**
 * Create a Stripe Checkout Session for the customer's cart.
 *
 * - Amounts are in sen (RM × 100), currency MYR.
 * - SST is added as its own line item using the same rounding as the bot's
 *   order summary, so the Stripe page total always equals the bot's total.
 * - The cart snapshot travels in the session's metadata; the order row is
 *   only created when the payment-confirmed webhook arrives (see fulfillment).
 */
export async function createCheckoutSessionForCart(input: {
  chatId: string;
  cart: CartItem[];
  sstRate: number;
}): Promise<Stripe.Checkout.Session> {
  const stripe = getStripe();

  const base = input.cart.reduce((s, c) => s + c.price * c.qty, 0);
  const sst = +(base * input.sstRate).toFixed(2);

  const compactCart = JSON.stringify(
    input.cart.map((c) => ({ s: c.sku, q: c.qty, p: c.price }))
  );
  if (compactCart.length > MAX_CART_METADATA) {
    throw new Error("Cart too large for checkout metadata");
  }

  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/$/, "");

  const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = input.cart.map((c) => ({
    price_data: {
      currency: "myr",
      product_data: { name: c.name },
      unit_amount: Math.round(c.price * 100),
    },
    quantity: c.qty,
  }));
  if (sst > 0) {
    lineItems.push({
      price_data: {
        currency: "myr",
        product_data: { name: `SST (${(input.sstRate * 100).toFixed(0)}%)` },
        unit_amount: Math.round(sst * 100),
      },
      quantity: 1,
    });
  }

  const params: Stripe.Checkout.SessionCreateParams = {
    mode: "payment",
    payment_method_types: ["card", "fpx"],
    line_items: lineItems,
    metadata: {
      chat_id: input.chatId,
      sst_rate: String(input.sstRate),
      cart: compactCart,
    },
    success_url: `${appUrl}/pay/success`,
    cancel_url: `${appUrl}/pay/cancelled`,
  };

  try {
    return await stripe.checkout.sessions.create(params);
  } catch (e: any) {
    // FPX not enabled on this Stripe account — fall back to card-only.
    if (/fpx/i.test(String(e?.message || ""))) {
      console.warn("[stripe] FPX unavailable — falling back to card only:", e?.message);
      return await stripe.checkout.sessions.create({
        ...params,
        payment_method_types: ["card"],
      });
    }
    throw e;
  }
}

/**
 * Expire a previously-issued (still open) checkout session so a customer
 * can't pay a stale link after re-checkout. Safe to call on paid/expired
 * sessions — errors are ignored.
 */
export async function expireCheckoutSession(sessionId: string) {
  try {
    await getStripe().checkout.sessions.expire(sessionId);
  } catch {
    /* already completed or expired — nothing to do */
  }
}
