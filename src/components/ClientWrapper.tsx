"use client";

import React from "react";
import {AppProviders} from "../processes/app-providers";
import dynamic from "next/dynamic";
import {usePathname} from "next/navigation";
import {PageviewBeacon} from "./PageviewBeacon";

const BackgroundFetcher = dynamic(
    () => import("./BackgroundFetcher").then((m) => m.BackgroundFetcher),
    {ssr: false}
);

interface ClientWrapperProps {
    children: React.ReactNode;
}

export const ClientWrapper: React.FC<ClientWrapperProps> = ({children}) => {
    const pathname = usePathname();
    // 管理画面では公開ページ用のデータを先読みしない
    const isAdmin = pathname === "/admin" || pathname.startsWith("/admin/");
    return (
        <AppProviders>
            {children}
            {!isAdmin && <BackgroundFetcher/>}
            <PageviewBeacon/>
        </AppProviders>
    );
};
