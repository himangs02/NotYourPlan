import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "EventFlow | Crowd-Management Decision Support",
  description: "Test crowd-management plans before opening the gates using SUMO, YugabyteDB, Meko, and Gemini.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-[#f8fafc] text-slate-900 min-h-screen antialiased selection:bg-purple-100 selection:text-purple-900">
        {children}
      </body>
    </html>
  );
}
