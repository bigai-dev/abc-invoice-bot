import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import { getStripe } from "@/lib/stripe/client";
import { fulfillStripeSession, notifyStripePaymentFailed } from "@/lib/bot/fulfillment";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Stripe webhook endpoint.
 * Stripe POSTs here the moment a checkout session's payment state changes.
 * The signature check guarantees the call really came from Stripe.
 *
 * Registered automatically by `npm run demo` / `npm run webhook:stripe`.
 */
export async function POST(req: NextRequest) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    console.error("[stripe webhook] STRIPE_WEBHOOK_SECRET not set");
    return NextResponse.json({ error: "Webhook not configured" }, { status: 500 });
  }

  // Signature verification needs the raw body, not parsed JSON.
  const body = await req.text();
  const signature = req.headers.get("stripe-signature");

  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(body, signature || "", secret);
  } catch (err: any) {
    console.error("[stripe webhook] invalid signature:", err?.message);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        // Card payments are 'paid' immediately. Async methods (FPX) may
        // complete later via checkout.session.async_payment_succeeded.
        if (session.payment_status === "paid") await fulfillStripeSession(session);
        break;
      }
      case "checkout.session.async_payment_succeeded": {
        await fulfillStripeSession(event.data.object as Stripe.Checkout.Session);
        break;
      }
      case "checkout.session.async_payment_failed": {
        await notifyStripePaymentFailed(event.data.object as Stripe.Checkout.Session);
        break;
      }
      default:
        // Not an event we act on — acknowledge and move on.
        break;
    }
  } catch (err) {
    // Fulfillment failed — return 500 so Stripe retries (fulfillment is idempotent).
    console.error(`[stripe webhook] handler error for ${event.type}:`, err);
    return NextResponse.json({ error: "Handler failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

export async function GET() {
  return NextResponse.json({ ok: true, message: "Stripe webhook endpoint. POST only." });
}
