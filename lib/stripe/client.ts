import Stripe from "stripe";

/**
 * Stripe SDK singleton — lazy-initialized like getDb().
 * Using an sk_test_ key means sandbox mode: test cards only, no real money.
 */
let _stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (_stripe) return _stripe;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not set in .env.local");
  _stripe = new Stripe(key);
  return _stripe;
}
