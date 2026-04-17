import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { createAdminClient } from "../supabase/admin";

type InvoiceInput = {
  orderRef: string;
  invoiceNo: string;
  customer: { name: string; phone: string; email: string; address: string };
  items: { name: string; sku: string; price: number; qty: number }[];
  base: number;
  sst: number;
  total: number;
};

export async function generateInvoicePDF(input: InvoiceInput): Promise<Uint8Array> {
  const supabase = createAdminClient();
  const { data: settings } = await supabase.from("invoice_settings").select("*").eq("id", 1).single();

  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595.28, 841.89]); // A4
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const { width, height } = page.getSize();
  const margin = 50;
  let y = height - margin;

  // Try to embed logo (optional — won't break if missing)
  try {
    const logoUrl = (process.env.NEXT_PUBLIC_APP_URL || "") + "/logo.png";
    const res = await fetch(logoUrl);
    if (res.ok) {
      const buf = await res.arrayBuffer();
      const img = await pdf.embedPng(buf);
      const logoSize = 60;
      page.drawImage(img, { x: margin, y: y - logoSize + 8, width: logoSize, height: logoSize });
    }
  } catch { /* no logo — fallback to text only */ }

  // Header (offset right of logo)
  const textX = margin + 75;
  page.drawText(settings?.company_name || "ABC Sdn Bhd", {
    x: textX, y: y - 4, size: 22, font: bold, color: rgb(0.15, 0.45, 0.30),  // deep green
  });
  page.drawText(`SSM: ${settings?.ssm_number || ""}`, { x: textX, y: y - 22, size: 10, font, color: rgb(0.4, 0.4, 0.4) });
  page.drawText(`Premium Wellness & Supplements`, { x: textX, y: y - 36, size: 9, font, color: rgb(0.6, 0.5, 0.2) });  // gold accent

  // Invoice title (right aligned)
  page.drawText("INVOICE", { x: width - margin - 90, y, size: 22, font: bold, color: rgb(0.15, 0.45, 0.30) });
  page.drawText(input.invoiceNo, { x: width - margin - 90, y: y - 18, size: 10, font });
  page.drawText(`Date: ${new Date().toLocaleDateString("en-GB")}`, { x: width - margin - 90, y: y - 32, size: 10, font });

  y = height - margin - 80;

  // Separator
  page.drawLine({ start: { x: margin, y }, end: { x: width - margin, y }, thickness: 1, color: rgb(0.85, 0.85, 0.85) });
  y -= 24;

  // Bill to
  page.drawText("BILL TO", { x: margin, y, size: 10, font: bold, color: rgb(0.4, 0.4, 0.4) });
  y -= 14;
  page.drawText(input.customer.name, { x: margin, y, size: 12, font: bold });
  y -= 14;
  page.drawText(input.customer.phone, { x: margin, y, size: 10, font });
  y -= 12;
  page.drawText(input.customer.email, { x: margin, y, size: 10, font });
  y -= 12;
  // Wrap address
  const addr = input.customer.address;
  const wrapped = wrapText(addr, 60);
  for (const line of wrapped) {
    page.drawText(line, { x: margin, y, size: 10, font });
    y -= 12;
  }
  y -= 20;

  // Order ref
  page.drawText(`Order Reference: ${input.orderRef}`, { x: margin, y, size: 10, font });
  y -= 24;

  // Items table header
  const colX = { item: margin, qty: 330, price: 400, total: 480 };
  page.drawRectangle({ x: margin - 4, y: y - 4, width: width - 2 * margin + 8, height: 22, color: rgb(0.95, 0.96, 0.98) });
  page.drawText("ITEM", { x: colX.item, y, size: 10, font: bold });
  page.drawText("QTY", { x: colX.qty, y, size: 10, font: bold });
  page.drawText("PRICE", { x: colX.price, y, size: 10, font: bold });
  page.drawText("SUBTOTAL", { x: colX.total, y, size: 10, font: bold });
  y -= 22;

  // Items
  for (const it of input.items) {
    page.drawText(`${it.name}`, { x: colX.item, y, size: 10, font });
    page.drawText(`(${it.sku})`, { x: colX.item, y: y - 11, size: 8, font, color: rgb(0.5, 0.5, 0.5) });
    page.drawText(String(it.qty), { x: colX.qty, y, size: 10, font });
    page.drawText(`RM ${it.price.toFixed(2)}`, { x: colX.price, y, size: 10, font });
    page.drawText(`RM ${(it.price * it.qty).toFixed(2)}`, { x: colX.total, y, size: 10, font });
    y -= 28;
  }

  // Separator
  page.drawLine({ start: { x: margin, y }, end: { x: width - margin, y }, thickness: 0.5, color: rgb(0.85, 0.85, 0.85) });
  y -= 18;

  // Totals
  const totalsX = 400;
  page.drawText("Subtotal:", { x: totalsX, y, size: 10, font });
  page.drawText(`RM ${input.base.toFixed(2)}`, { x: colX.total, y, size: 10, font });
  y -= 14;
  page.drawText(`SST (${((settings?.sst_rate || 0.08) * 100).toFixed(0)}%):`, { x: totalsX, y, size: 10, font });
  page.drawText(`RM ${input.sst.toFixed(2)}`, { x: colX.total, y, size: 10, font });
  y -= 18;
  page.drawText("TOTAL:", { x: totalsX, y, size: 12, font: bold });
  page.drawText(`RM ${input.total.toFixed(2)}`, { x: colX.total, y, size: 12, font: bold, color: rgb(0.15, 0.5, 0.3) });

  y -= 50;

  // Bank details
  page.drawLine({ start: { x: margin, y }, end: { x: width - margin, y }, thickness: 0.5, color: rgb(0.85, 0.85, 0.85) });
  y -= 18;
  page.drawText("PAYMENT DETAILS", { x: margin, y, size: 10, font: bold, color: rgb(0.4, 0.4, 0.4) });
  y -= 14;
  page.drawText(`Bank: ${settings?.bank_name || ""}`, { x: margin, y, size: 10, font });
  y -= 12;
  page.drawText(`Account: ${settings?.bank_account || ""}`, { x: margin, y, size: 10, font });
  y -= 12;
  page.drawText(`Name: ${settings?.bank_holder || ""}`, { x: margin, y, size: 10, font });

  // Footer
  if (settings?.footer_notes) {
    page.drawText(settings.footer_notes, { x: margin, y: 40, size: 9, font, color: rgb(0.5, 0.5, 0.5) });
  }

  return await pdf.save();
}

function wrapText(text: string, maxChars: number): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let current = "";
  for (const w of words) {
    if ((current + " " + w).length > maxChars) {
      lines.push(current.trim());
      current = w;
    } else {
      current += " " + w;
    }
  }
  if (current.trim()) lines.push(current.trim());
  return lines;
}

export async function uploadInvoiceToStorage(
  orderId: string,
  pdfBytes: Uint8Array
): Promise<string> {
  const supabase = createAdminClient();
  const path = `${orderId}.pdf`;
  const { error } = await supabase.storage
    .from("invoices")
    .upload(path, pdfBytes, { contentType: "application/pdf", upsert: true });
  if (error) throw error;
  const signed = await supabase.storage.from("invoices").createSignedUrl(path, 60 * 60 * 24 * 30);
  return signed.data?.signedUrl || "";
}
