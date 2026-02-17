import type { Metadata } from "next";
import { Noto_Sans_JP, Noto_Serif_JP } from "next/font/google";
import "./globals.css";

const notoSansJP = Noto_Sans_JP({
  subsets: ["latin"],
  weight: ["500", "700", "900"],
  variable: "--font-noto",
});

const notoSerifJP = Noto_Serif_JP({
  subsets: ["latin"],
  weight: ["700", "900"],
  variable: "--font-noto-serif",
});

const appName = process.env.NEXT_PUBLIC_APP_NAME || "Agri-Buddy";

export const metadata: Metadata = {
  title: appName,
  description: "営農パートナー",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ja" style={{ colorScheme: 'light' }}>
      <body className={`${notoSansJP.variable} ${notoSerifJP.variable} font-sans antialiased min-h-screen bg-stone-100`}>
        <div className="fixed inset-0 z-0">
          <img
            src="https://images.unsplash.com/photo-1500382017468-9049fed747ef?w=1200&q=80"
            alt="" className="absolute inset-0 w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-stone-900/50 via-stone-800/40 to-stone-900/70" />
        </div>
        <div className="relative z-10">{children}</div>
      </body>
    </html>
  );
}
