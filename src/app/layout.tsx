// app/layout.tsx
"use client";
import React from "react";
import "./globals.css";
import { Provider as JotaiProvider } from "jotai";

export default function RootLayout({
                                       children,
                                   }: {
    children: React.ReactNode;
}) {
    return (
        <html lang="ja">
        <head>
            <title>taramanji (JavaLangRuntimeException) ポートフォリオリンク集</title>
            <meta name="viewport" content="width=device-width, initial-scale=1" />
        </head>
        <body className="min-h-screen w-full">
        <JotaiProvider>{children}</JotaiProvider>
        </body>
        </html>
    );
}