import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Document Summary Assistant",
  description:
    "Upload PDFs and images to generate clear summaries, key points, and improvement suggestions.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}