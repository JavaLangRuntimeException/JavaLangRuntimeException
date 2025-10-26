// app/layout.tsx
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { ClientWrapper } from "../components/ClientWrapper";
import { BasicPageTransition } from "../components/SimplePageTransition";
import { IntroProvider } from "../shared/contexts/IntroContext";
import { LoadingProvider } from "../shared/contexts/LoadingContext";
import { ConditionalHeader } from "../components/ConditionalHeader";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "taramanji",
  description: "エンジニア・コミュニティディレクター taramanji のポートフォリオ。プロフィール・実績・記事・登壇・SNSリンクと打ち合わせ予約情報を掲載。",
  icons: {
    icon: "/image.ico",
    shortcut: "/image.ico",
    apple: "/image.png",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" type="image/x-icon" href="/image.ico" />
      </head>
      <body className={`${inter.className} min-h-screen w-full`}>
        <LoadingProvider>
          <IntroProvider>
            <ClientWrapper>
              <ConditionalHeader />
              <BasicPageTransition>
                {children}
              </BasicPageTransition>
            </ClientWrapper>
          </IntroProvider>
        </LoadingProvider>
      </body>
    </html>
  );
}
