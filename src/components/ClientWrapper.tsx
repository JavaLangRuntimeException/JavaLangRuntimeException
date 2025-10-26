"use client";

import React from "react";
import { AppProviders } from "../processes/app-providers";

interface ClientWrapperProps {
    children: React.ReactNode;
}

export const ClientWrapper: React.FC<ClientWrapperProps> = ({ children }) => {
    return (
        <AppProviders>
            {children}
        </AppProviders>
    );
};
