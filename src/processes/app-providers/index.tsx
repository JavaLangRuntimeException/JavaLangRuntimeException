"use client";

import React from "react";
import { Provider } from "jotai";

export const AppProviders: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
    <Provider>
      {children}
    </Provider>
  );
};


