"use client";

import React from "react";
import {AppProviders} from "../processes/app-providers";
import dynamic from "next/dynamic";

const BackgroundFetcher = dynamic(
    () => import("./BackgroundFetcher").then((m) => m.BackgroundFetcher),
    {ssr: false}
);

interface ClientWrapperProps {
    children: React.ReactNode;
}

export const ClientWrapper: React.FC<ClientWrapperProps> = ({children}) => {
    return (
        <AppProviders>
            {children}
            <BackgroundFetcher/>
        </AppProviders>
    );
};
