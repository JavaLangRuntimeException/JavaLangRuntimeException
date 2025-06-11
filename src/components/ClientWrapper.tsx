"use client";

import React from "react";
import { Provider } from "jotai";
import { BackgroundFetcher } from "./BackgroundFetcher";

interface ClientWrapperProps {
    children: React.ReactNode;
}

export const ClientWrapper: React.FC<ClientWrapperProps> = ({ children }) => {
    return (
        <Provider>
            <BackgroundFetcher />
            {children}
        </Provider>
    );
};
