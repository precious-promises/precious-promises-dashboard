import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Precious Promises Dashboard",
  description: "Content and growth dashboard for Precious Promises.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="flex min-h-full flex-col bg-canvas text-ink-primary">
        {/*
          Keyboard users land here first and can jump past the sidebar and top
          bar in one keystroke. Visible only while focused.
        */}
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-[100] focus:rounded-lg focus:bg-highlight focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-ink"
        >
          Skip to main content
        </a>
        {children}
      </body>
    </html>
  );
}
