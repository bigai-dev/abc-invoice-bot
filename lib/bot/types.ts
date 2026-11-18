export type CartItem = {
  sku: string;
  name: string;
  price: number;
  qty: number;
};

export type BotState = {
  step?:
    | "idle"
    | "await_name"
    | "await_phone"
    | "await_email"
    | "await_address"
    | "await_qty"
    | "await_payment"
    | "await_return_reason"
    | "await_review_comment";
  cart?: CartItem[];
  lastOrderRef?: string;
  selectedSku?: string;
  pendingReviewId?: string;
  /** Open (unpaid) Stripe checkout session — expired when a new checkout is made. */
  pendingStripeSessionId?: string;
};
