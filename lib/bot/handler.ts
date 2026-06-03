/**
 * Main Telegram bot handler.
 * Called from /api/telegram/webhook with a validated Telegram Update.
 */
import { sendMessage, sendDocument, getFile, downloadFile, inlineKeyboard, editMessageText } from "./telegram";
import { getSession, saveSession, clearSession } from "./session";
import { findCustomerByChatId, upsertCustomer } from "./customers";
import { listActiveProducts, getProductBySku } from "./products";
import { createOrder, listCustomerOrders } from "./orders";
import { generateInvoicePDF, uploadInvoiceToStorage } from "./pdf";
import { getDb, nextOrderRef } from "../db/client";
import { saveFile, absoluteUrl } from "../storage/local";
import type { BotState, CartItem } from "./types";

type TgUpdate = any;

export async function handleUpdate(update: TgUpdate) {
  try {
    if (update.message) await handleMessage(update.message);
    else if (update.callback_query) await handleCallback(update.callback_query);
  } catch (err) {
    console.error("[handler error]", err);
    const chatId = update.message?.chat?.id || update.callback_query?.from?.id;
    if (chatId) {
      await sendMessage(chatId, "⚠️ Oops, something went wrong. Please try again or type /start.").catch(() => {});
    }
  }
}

// ================= MESSAGE =================
async function handleMessage(msg: any) {
  const chatId = String(msg.chat.id);
  const text: string = msg.text || "";
  const state = await getSession(chatId);

  if (msg.photo && msg.photo.length) {
    return handlePaymentScreenshot(chatId, msg.photo[msg.photo.length - 1].file_id, false);
  }
  if (msg.document) {
    return handlePaymentScreenshot(chatId, msg.document.file_id, true);
  }

  if (text.startsWith("/start")) return cmdStart(chatId);
  if (text.startsWith("/menu") || text === "/home") return showMainMenu(chatId);
  if (text.startsWith("/cancel")) {
    await clearSession(chatId);
    return sendMessage(chatId, "Cancelled. Type /start to begin again.");
  }
  if (text.startsWith("/shop") || text.startsWith("/order")) return showCatalogue(chatId);
  if (text.startsWith("/orders") || text.startsWith("/track")) return showMyOrders(chatId);
  if (text.startsWith("/profile") || text.startsWith("/me")) return showProfile(chatId);
  if (text.startsWith("/help")) return cmdHelp(chatId);

  if (state.step === "await_name") return saveName(chatId, text, state);
  if (state.step === "await_phone") return savePhone(chatId, text, state);
  if (state.step === "await_email") return saveEmail(chatId, text, state);
  if (state.step === "await_address") return saveAddress(chatId, text, state);
  if (state.step === "await_qty") return saveCustomQty(chatId, text, state);
  if (state.step === "await_return_reason") return saveReturnReason(chatId, text, state);
  if (state.step === "await_review_comment") return saveReviewComment(chatId, text, state);

  return smartReply(chatId, text);
}

// ================= CALLBACK =================
async function handleCallback(cb: any) {
  const chatId = String(cb.from.id);
  const data: string = cb.data;
  const messageId: number | undefined = cb.message?.message_id;

  await fetch(
    `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/answerCallbackQuery`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ callback_query_id: cb.id }),
    }
  );

  if (data === "noop") return;
  if (data === "menu") return showMainMenu(chatId);
  if (data === "shop") return showCatalogue(chatId);
  if (data === "orders") return showMyOrders(chatId);
  if (data === "profile") return showProfile(chatId);
  if (data === "profile_update") return askName(chatId);
  if (data === "profile_confirm") return showMainMenu(chatId);
  if (data === "new_profile") return askName(chatId);

  if (data === "cat") {
    if (messageId) await updateCatalogueMessage(chatId, messageId);
    return;
  }
  if (data.startsWith("pick:")) {
    const sku = data.slice(5);
    if (messageId) await showQtyPicker(chatId, messageId, sku);
    return;
  }
  if (data.startsWith("set:")) {
    const [, sku, nStr] = data.split(":");
    if (nStr === "custom") {
      const st = await getSession(chatId);
      st.step = "await_qty";
      st.selectedSku = sku;
      await saveSession(chatId, st);
      const p = await getProductBySku(sku);
      await sendMessage(
        chatId,
        `Type the quantity for <b>${p?.name || sku}</b> (1–${p?.stock || 0}):`
      );
      return;
    }
    const n = parseInt(nStr, 10);
    if (Number.isFinite(n)) {
      await setCartQty(chatId, sku, n);
      if (messageId) await updateCatalogueMessage(chatId, messageId);
    }
    return;
  }
  if (data === "cart_clear") {
    const st = await getSession(chatId);
    st.cart = [];
    await saveSession(chatId, st);
    if (messageId) await updateCatalogueMessage(chatId, messageId);
    return;
  }
  if (data === "checkout") return checkout(chatId);
  if (data.startsWith("rate:")) {
    const [, orderId, starsStr] = data.split(":");
    return submitRating(chatId, orderId, parseInt(starsStr));
  }
  if (data === "rate_skip") {
    await sendMessage(chatId, "No problem — thanks for shopping with us!");
    return showMainMenu(chatId);
  }
  if (data === "review_no_comment") {
    const st = await getSession(chatId);
    st.step = "idle";
    st.pendingReviewId = undefined;
    await saveSession(chatId, st);
    await sendMessage(chatId, "🎉 Thanks for your feedback!");
    return showMainMenu(chatId);
  }
  if (data.startsWith("return:")) {
    const ref = data.slice(7);
    const st = await getSession(chatId);
    st.step = "await_return_reason";
    st.lastOrderRef = ref;
    await saveSession(chatId, st);
    return sendMessage(
      chatId,
      `Please describe the issue with order <b>${ref}</b>:`
    );
  }
}

async function setCartQty(chatId: string, sku: string, qty: number) {
  const p = await getProductBySku(sku);
  if (!p) return;
  const st = await getSession(chatId);
  st.cart = st.cart || [];
  const capped = Math.max(0, Math.min(qty, p.stock));
  if (capped === 0) {
    st.cart = st.cart.filter((c) => c.sku !== sku);
  } else {
    const existing = st.cart.find((c) => c.sku === sku);
    if (existing) existing.qty = capped;
    else st.cart.push({ sku, name: p.name, price: Number(p.price), qty: capped });
  }
  await saveSession(chatId, st);
}

// ================= FLOWS =================

async function cmdStart(chatId: string) {
  await clearSession(chatId);
  const c = await findCustomerByChatId(chatId);
  if (c) {
    await sendMessage(
      chatId,
      `Welcome back, <b>${c.name}</b>! 😊\n\nWe recognized you from your Telegram ID.\n📱 ${c.phone}\n📧 ${c.email}\n📍 ${c.address}`,
      {
        reply_markup: inlineKeyboard([
          [{ text: "✅ Yes, continue", data: "profile_confirm" }],
          [{ text: "✏️ Update details", data: "profile_update" }],
          [{ text: "🚫 Not me", data: "new_profile" }],
        ]),
      }
    );
  } else {
    await sendMessage(
      chatId,
      "Welcome to <b>ABC Sdn Bhd</b>! 🌿\n\nPremium health supplements.\n\nLet's set up your profile first!"
    );
    await askName(chatId);
  }
}

async function cmdHelp(chatId: string) {
  await sendMessage(
    chatId,
    "🤖 <b>Commands:</b>\n" +
      "/start — Main menu\n" +
      "/shop — Browse products\n" +
      "/orders — View your orders\n" +
      "/profile — Your saved details\n" +
      "/cancel — Cancel current flow\n" +
      "/help — Show this message"
  );
}

async function askName(chatId: string) {
  const st = await getSession(chatId);
  st.step = "await_name";
  await saveSession(chatId, st);
  await sendMessage(chatId, "Please share your details so we can deliver your orders.\n\n📝 What's your <b>full name</b>?");
}

async function saveName(chatId: string, text: string, _state: BotState) {
  if (!text || text.length < 2) return sendMessage(chatId, "Please enter a valid name:");
  const st = await getSession(chatId);
  st.step = "await_phone";
  (st as any)._tempName = text;
  await saveSession(chatId, st);
  await sendMessage(chatId, "Great! 👍\n\n📱 What's your <b>phone number</b>? (e.g. +60 12-345 6789)");
}

async function savePhone(chatId: string, text: string, _state: BotState) {
  if (!text || text.length < 6) return sendMessage(chatId, "Please enter a valid phone number:");
  const st: any = await getSession(chatId);
  st.step = "await_email";
  st._tempPhone = text;
  await saveSession(chatId, st);
  await sendMessage(chatId, "📧 What's your <b>email address</b>?");
}

async function saveEmail(chatId: string, text: string, _state: BotState) {
  if (!/^\S+@\S+\.\S+$/.test(text)) return sendMessage(chatId, "Please enter a valid email:");
  const st: any = await getSession(chatId);
  st.step = "await_address";
  st._tempEmail = text;
  await saveSession(chatId, st);
  await sendMessage(chatId, "📍 What's your <b>delivery address</b>?");
}

async function saveAddress(chatId: string, text: string, _state: BotState) {
  if (!text || text.length < 10) return sendMessage(chatId, "Please enter a complete address:");
  const st: any = await getSession(chatId);
  const customer = await upsertCustomer({
    chatId,
    name: st._tempName,
    phone: st._tempPhone,
    email: st._tempEmail,
    address: text,
  });
  await clearSession(chatId);
  await sendMessage(chatId, `✅ Profile saved, <b>${customer.name}</b>!`);
  await showMainMenu(chatId);
}

async function showMainMenu(chatId: string) {
  await sendMessage(chatId, "What would you like to do?", {
    reply_markup: inlineKeyboard([
      [{ text: "🛒 Shop Products", data: "shop" }],
      [{ text: "📋 My Orders", data: "orders" }],
      [{ text: "👤 My Profile", data: "profile" }],
    ]),
  });
}

async function showProfile(chatId: string) {
  const c = await findCustomerByChatId(chatId);
  if (!c) return cmdStart(chatId);
  await sendMessage(
    chatId,
    `👤 <b>Your Profile</b>\n\n` +
      `Name: ${c.name}\nPhone: ${c.phone}\nEmail: ${c.email}\nAddress: ${c.address}`,
    {
      reply_markup: inlineKeyboard([
        [{ text: "✏️ Update Profile", data: "profile_update" }],
        [{ text: "🔙 Main Menu", data: "menu" }],
      ]),
    }
  );
}

function shortName(name: string) {
  return name
    .replace(/^Premium\s+/i, "")
    .replace(/\s*\(\s*(\d+)\s*(bottles|sachets|caps)\s*\)/i, " ($1)")
    .replace(/ABC\s+Wellness\s+Bundle/i, "Wellness Bundle")
    .replace(/Collagen Drink — Sakura Rose/i, "Collagen");
}

async function renderCatalogue(chatId: string) {
  const products = await listActiveProducts();
  const st = await getSession(chatId);
  const cart = st.cart || [];

  let text = "🛍️ <b>Our Products</b>\n\n";
  if (cart.length) {
    text += "<b>🛒 Your Cart:</b>\n";
    for (const c of cart) text += `• ${shortName(c.name)} ×${c.qty} — RM ${(c.price * c.qty).toFixed(2)}\n`;
    const sub = cart.reduce((s, c) => s + c.price * c.qty, 0);
    text += `\n<b>Subtotal: RM ${sub.toFixed(2)}</b>\n\n`;
  } else {
    text += "<i>Cart is empty.</i>\n\n";
  }
  text += "Tap a product to set quantity.";

  const rows: { text: string; data: string }[][] = [];
  for (const p of products) {
    const qty = cart.find((c) => c.sku === p.sku)?.qty || 0;
    const stockMark = p.stock === 0 ? " ❌" : p.stock < 5 ? ` ⚠${p.stock}` : "";
    const qtyMark = qty > 0 ? ` ✓×${qty}` : "";
    rows.push([
      {
        text: `${shortName(p.name)} — RM ${Number(p.price).toFixed(0)}${qtyMark}${stockMark}`,
        data: p.stock === 0 ? "noop" : `pick:${p.sku}`,
      },
    ]);
  }

  if (cart.length) {
    rows.push([
      { text: "✅ Checkout", data: "checkout" },
      { text: "🗑 Clear", data: "cart_clear" },
    ]);
  }
  rows.push([{ text: "🔙 Main Menu", data: "menu" }]);

  return { text, reply_markup: inlineKeyboard(rows) };
}

async function showCatalogue(chatId: string) {
  const { text, reply_markup } = await renderCatalogue(chatId);
  await sendMessage(chatId, text, { reply_markup });
}

async function updateCatalogueMessage(chatId: string, messageId: number) {
  const { text, reply_markup } = await renderCatalogue(chatId);
  await editMessageText(chatId, messageId, text, { reply_markup });
}

async function showQtyPicker(chatId: string, messageId: number, sku: string) {
  const p = await getProductBySku(sku);
  if (!p) return;
  const st = await getSession(chatId);
  const cur = (st.cart || []).find((c) => c.sku === sku)?.qty || 0;

  const text =
    `🛍️ <b>${p.name}</b>\n\n` +
    `Price: RM ${Number(p.price).toFixed(2)} each\n` +
    `Stock: ${p.stock}\n` +
    `Currently in cart: <b>${cur}</b>\n\n` +
    `<i>Tap a number to set the quantity.</i>`;

  // Quick-pick numbers — capped to stock; 0 = remove
  const presets = [0, 1, 2, 3, 5, 10, 15, 20].filter((n) => n === 0 || n <= p.stock);
  const rows: { text: string; data: string }[][] = [];
  for (let i = 0; i < presets.length; i += 4) {
    rows.push(
      presets.slice(i, i + 4).map((n) => ({
        text: n === cur ? `• ${n} •` : String(n),
        data: `set:${sku}:${n}`,
      }))
    );
  }
  rows.push([
    { text: "✏️ Type", data: `set:${sku}:custom` },
    { text: "🔙 Back", data: "cat" },
  ]);

  await editMessageText(chatId, messageId, text, { reply_markup: inlineKeyboard(rows) });
}

async function saveCustomQty(chatId: string, text: string, state: BotState) {
  const qty = parseInt(text);
  if (isNaN(qty) || qty < 0) return sendMessage(chatId, "Please enter a valid number (0 to remove):");
  if (!state.selectedSku) return sendMessage(chatId, "Please pick a product first. /shop");
  const p = await getProductBySku(state.selectedSku);
  if (!p) return sendMessage(chatId, "Product not found.");
  if (qty > p.stock) return sendMessage(chatId, `Only ${p.stock} in stock. Please enter a smaller number:`);
  await setCartQty(chatId, state.selectedSku, qty);
  const st = await getSession(chatId);
  st.step = "idle";
  st.selectedSku = undefined;
  await saveSession(chatId, st);
  return showCatalogue(chatId);
}

async function checkout(chatId: string) {
  const st = await getSession(chatId);
  if (!st.cart || !st.cart.length) return sendMessage(chatId, "Your cart is empty. /shop to start.");
  const db = getDb();
  const settings = db.prepare(`select * from invoice_settings where id = 1`).get() as any;
  const sstRate = Number(settings?.sst_rate || 0.08);
  const base = st.cart.reduce((s, c) => s + c.price * c.qty, 0);
  const sst = +(base * sstRate).toFixed(2);
  const total = +(base + sst).toFixed(2);

  // Preview the next ref (not yet committed)
  st.lastOrderRef = nextOrderRef();
  await saveSession(chatId, st);

  await sendMessage(
    chatId,
    `🧾 <b>Order Summary</b>\n\n` +
      st.cart.map((c) => `• ${c.name} ×${c.qty} — RM ${(c.price * c.qty).toFixed(2)}`).join("\n") +
      `\n\nSubtotal: RM ${base.toFixed(2)}\nSST (${(sstRate * 100).toFixed(0)}%): RM ${sst.toFixed(2)}\n<b>Total: RM ${total.toFixed(2)}</b>\n\n` +
      `🏦 <b>Payment Details</b>\n` +
      `Bank: ${settings?.bank_name}\nAccount: ${settings?.bank_account}\nName: ${settings?.bank_holder}\n` +
      `Amount: <b>RM ${total.toFixed(2)}</b>\nReference: <b>${st.lastOrderRef}</b>\n\n` +
      `📸 Upload your payment screenshot when done!`
  );
}

async function handlePaymentScreenshot(chatId: string, fileId: string, flagged: boolean) {
  const st = await getSession(chatId);
  if (!st.cart || !st.cart.length) {
    return sendMessage(chatId, "Please place an order first. /shop");
  }
  const customer = await findCustomerByChatId(chatId);
  if (!customer) return sendMessage(chatId, "Please complete your profile first. /start");

  // Download from Telegram, save to local storage
  let screenshotUrl: string | undefined;
  try {
    const fileInfo = await getFile(fileId);
    if (fileInfo.file_path) {
      const buf = await downloadFile(fileInfo.file_path);
      const ext = fileInfo.file_path.split(".").pop() || "jpg";
      const name = `${chatId}-${Date.now()}.${ext}`;
      screenshotUrl = await saveFile("screenshots", name, buf);
    }
  } catch (e) {
    console.error("Screenshot upload failed", e);
  }

  const db = getDb();
  const settings = db.prepare(`select * from invoice_settings where id = 1`).get() as any;
  const sstRate = Number(settings?.sst_rate || 0.08);

  const { order, base, sst, total, orderRef, invoiceNo } = await createOrder({
    chatId,
    customerId: customer.id,
    cart: st.cart,
    sstRate,
    flagged,
    screenshotUrl,
  });

  // Snapshot the cart for invoice rendering BEFORE clearing
  const cartSnapshot = [...st.cart];

  st.cart = [];
  st.lastOrderRef = orderRef;
  await saveSession(chatId, st);

  if (flagged) {
    await sendMessage(
      chatId,
      `⚠️ Your upload isn't a valid payment screenshot. Your order <b>${orderRef}</b> has been sent for manual review. We'll get back to you soon! 🙏`
    );
    await showMainMenu(chatId);
    return;
  }

  await sendMessage(chatId, "✅ <b>Payment received!</b> Generating your invoice...");

  try {
    const pdfBytes = await generateInvoicePDF({
      orderRef,
      invoiceNo: invoiceNo!,
      customer: { name: customer.name, phone: customer.phone, email: customer.email, address: customer.address },
      items: cartSnapshot,
      base, sst, total,
    });
    const relativeUrl = await uploadInvoiceToStorage(order.id, pdfBytes);
    db.prepare(`update orders set invoice_pdf_url = ? where id = ?`).run(relativeUrl, order.id);
    // Telegram needs a publicly-fetchable URL
    await sendDocument(chatId, absoluteUrl(relativeUrl), `📄 Invoice ${invoiceNo}`);
  } catch (e) {
    console.error("PDF generation failed", e);
    await sendMessage(chatId, "Invoice is being finalized — it will arrive shortly.");
  }

  await sendMessage(chatId, `Thank you, <b>${customer.name}</b>! 🙏\n\nYour order <b>${orderRef}</b> is being processed. We'll notify you of delivery updates here!`);
  await showMainMenu(chatId);
}

async function showMyOrders(chatId: string) {
  const orders = await listCustomerOrders(chatId);
  if (!orders.length) return sendMessage(chatId, "You have no orders yet. /shop to start!");
  let text = `📋 <b>Your Orders</b> (${orders.length})\n\n`;
  const deliveryLabel: Record<string, string> = {
    processing: "⏳ Processing", packed: "📦 Packed", out_for_delivery: "🚚 Out for Delivery",
    delivered: "✅ Delivered", none: "⏸️ Pending Review",
  };
  const returnBtns: { text: string; data: string }[][] = [];
  for (const o of orders.slice(0, 10)) {
    const status = o.return_status === "refunded" ? "💸 Refunded" : o.return_status === "requested" ? "↩️ Return Requested" : deliveryLabel[o.delivery_status] || o.status;
    text += `<b>${o.order_reference}</b> — RM ${Number(o.total_amount).toFixed(2)}\n${status}\n\n`;
    if (o.delivery_status === "delivered" && !o.return_status) {
      returnBtns.push([{ text: `↩️ Return ${o.order_reference}`, data: `return:${o.order_reference}` }]);
    }
  }
  returnBtns.push([{ text: "🔙 Main Menu", data: "menu" }]);
  await sendMessage(chatId, text, { reply_markup: inlineKeyboard(returnBtns) });
}

async function submitRating(chatId: string, orderId: string, stars: number) {
  const db = getDb();
  const customer = await findCustomerByChatId(chatId);

  const existing = db
    .prepare(`select id from reviews where order_id = ?`)
    .get(orderId) as { id: string } | undefined;
  if (existing) {
    await sendMessage(chatId, "You've already reviewed this order. Thank you! 🙏");
    return;
  }

  const reviewId = crypto.randomUUID();
  db.prepare(
    `insert into reviews (id, order_id, customer_id, stars, comment, created_at) values (?, ?, ?, ?, ?, ?)`
  ).run(reviewId, orderId, customer?.id ?? null, stars, "", new Date().toISOString());

  const st = await getSession(chatId);
  st.step = "await_review_comment";
  st.pendingReviewId = reviewId;
  await saveSession(chatId, st);

  await sendMessage(
    chatId,
    `Thanks for the ${"⭐".repeat(stars)} rating!\n\nWould you like to add a comment? Type it now, or tap Skip.`,
    {
      reply_markup: inlineKeyboard([[{ text: "Skip", data: "review_no_comment" }]]),
    }
  );
}

async function saveReviewComment(chatId: string, text: string, state: BotState) {
  if (!state.pendingReviewId) return;
  const db = getDb();
  db.prepare(`update reviews set comment = ? where id = ?`).run(text.slice(0, 500), state.pendingReviewId);
  const st = await getSession(chatId);
  st.step = "idle";
  st.pendingReviewId = undefined;
  await saveSession(chatId, st);
  await sendMessage(chatId, "🎉 Thank you for your feedback! We appreciate it. 💚");
  await showMainMenu(chatId);
}

async function saveReturnReason(chatId: string, text: string, state: BotState) {
  if (!state.lastOrderRef) return;
  const db = getDb();
  db.prepare(
    `update orders set return_status = 'requested', return_reason = ?, return_details = ?
     where order_reference = ?`
  ).run(text.slice(0, 100), text, state.lastOrderRef);
  await clearSession(chatId);
  await sendMessage(chatId, `↩️ Return request submitted for <b>${state.lastOrderRef}</b>. Our team will review within 1–2 working days. 🙏`);
  await showMainMenu(chatId);
}

async function smartReply(chatId: string, text: string) {
  const t = text.toLowerCase().trim();
  if (/^(hi|hello|hey|halo|selamat|ni hao|apa khabar)/.test(t)) {
    const c = await findCustomerByChatId(chatId);
    if (c) await sendMessage(chatId, `Hi <b>${c.name}</b>! 👋 How can I help?`);
    else await cmdStart(chatId);
    return showMainMenu(chatId);
  }
  if (/thank|tq|ty|terima kasih/.test(t)) return sendMessage(chatId, "You're welcome! 💚");
  if (/shop|order|buy|beli/.test(t)) return showCatalogue(chatId);
  if (/my order|track|status|pesanan/.test(t)) return showMyOrders(chatId);
  if (/profile|account|detail/.test(t)) return showProfile(chatId);
  if (/help|tolong|\?/.test(t)) return cmdHelp(chatId);
  if (/price|harga|how much/.test(t)) return showCatalogue(chatId);
  if (/deliver|shipping|bila sampai|ship/.test(t)) {
    return sendMessage(chatId, "📦 We ship within 1–3 working days after payment. Tap /orders to track.");
  }
  if (/bank|pay|bayar/.test(t)) {
    const s = getDb().prepare(`select * from invoice_settings where id = 1`).get() as any;
    return sendMessage(chatId, `🏦 Bank: ${s?.bank_name}\nAccount: ${s?.bank_account}\nName: ${s?.bank_holder}`);
  }
  await sendMessage(chatId, "🤔 I didn't understand. Type /help for commands, or pick an option:");
  await showMainMenu(chatId);
}
