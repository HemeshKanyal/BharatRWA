import { Inter, Playfair_Display } from "next/font/google";
import "./globals.css";
import { WalletProvider } from "@/components/WalletProvider";
import { ToastProvider } from "@/components/ToastProvider";
import Navbar from "@/components/Navbar";
import TestnetBanner from "@/components/TestnetBanner";

const inter = Inter({ subsets: ["latin"] });
const playfair = Playfair_Display({ subsets: ["latin"], variable: "--font-playfair" });

const description =
  "Open-source testnet prototype for compliant real-world-asset tokens on Ethereum (ERC-7943) and Solana (Token-2022), with zero-knowledge KYC.";

export const metadata = {
  metadataBase: new URL("https://bharatrwa.hemeshkanyal.com"),
  title: { default: "BharatRWA: compliant RWA tokens with ZK-KYC", template: "%s | BharatRWA" },
  description,
  openGraph: {
    title: "BharatRWA",
    description,
    url: "/",
    siteName: "BharatRWA",
    type: "website",
  },
  twitter: { card: "summary_large_image", title: "BharatRWA", description },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className={`${inter.className} ${playfair.variable}`}>
        <WalletProvider>
          <ToastProvider>
            <TestnetBanner />
            <Navbar />
            <main>{children}</main>
          </ToastProvider>
        </WalletProvider>
      </body>
    </html>
  );
}
