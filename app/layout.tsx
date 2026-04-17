import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "ABC Sdn Bhd — Admin Dashboard",
  description: "Automated invoice & order management",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-gray-50 text-gray-800 min-h-screen">{children}</body>
    </html>
  );
}
