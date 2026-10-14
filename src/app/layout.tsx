import type { Metadata } from "next";
import { Geist_Mono, Inter } from "next/font/google";
import { Providers } from "@/components/providers";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Lighter Testnet Terminal",
  description: "A perps trading terminal for the Lighter testnet, backed by exchange-aggregator.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // Browser extensions stamp attributes onto <html>/<body> before React
    // hydrates (e.g. bis_register, __processed_*), which React reports as a
    // mismatch. suppressHydrationWarning silences exactly that, one level deep.
    <html lang="en" className={`${inter.variable} ${geistMono.variable} h-full antialiased`} suppressHydrationWarning>
      <body className="h-full" suppressHydrationWarning>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
