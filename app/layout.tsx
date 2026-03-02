import type { Metadata } from "next";
import { Zen_Maru_Gothic, Shippori_Mincho_B1 } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/lib/client/auth";

const zenMaru = Zen_Maru_Gothic({
  subsets: ["latin"],
  weight: ["500", "700", "900"],
  variable: "--font-body",
});

const shippori = Shippori_Mincho_B1({
  subsets: ["latin"],
  weight: ["700", "800"],
  variable: "--font-heading",
});

const appName = process.env.NEXT_PUBLIC_APP_NAME || "Agri-Buddy";

export const metadata: Metadata = {
  title: appName,
  description: "営農パートナー",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ja" style={{ colorScheme: 'light' }}>
      <body className={`${zenMaru.variable} ${shippori.variable} font-sans antialiased min-h-screen bg-stone-100`}>
        <div className="fixed inset-0 z-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/bg-farm.jpg"
            alt="" className="absolute inset-0 w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-stone-900/60 via-stone-800/35 to-stone-900/75" />
        </div>
        <AuthProvider>
          <div className="relative z-10">{children}</div>
        </AuthProvider>
      </body>
    </html>
  );
}
