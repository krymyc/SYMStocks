import type {Metadata} from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SYMStocks — US Market Tracker",
  description: "Track US stocks, follow market activity and manage personal watchlists.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
