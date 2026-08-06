import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Precious Promises Dashboard",
  description: "Content and growth dashboard for Precious Promises.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
