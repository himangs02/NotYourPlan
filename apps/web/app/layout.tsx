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
    <html lang="en" className="dark">
      <body className="bg-slate-950 text-slate-100 min-h-screen antialiased selection:bg-indigo-600 selection:text-white">
        {children}
      </body>
    </html>
  );
}
