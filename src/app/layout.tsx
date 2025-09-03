// app/layout.tsx
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { ClientWrapper } from "../components/ClientWrapper";
import { Header } from "../widgets/header";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "taramanji (JavaLangRuntimeException) ポートフォリオリンク集",
  description: "taramanjiのポートフォリオ、プロジェクト、記事へのリンク集",
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
      </head>
      <body className={`${inter.className} min-h-screen w-full`}>
        <ClientWrapper>
          <Header />
          {children}
        </ClientWrapper>
      </body>
    </html>
  );
}
