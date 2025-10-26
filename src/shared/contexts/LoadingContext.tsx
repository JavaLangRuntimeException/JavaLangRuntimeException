"use client";

import React, { createContext, useContext, useState } from "react";

interface LoadingContextType {
  isReserveLoading: boolean;
  isContactLoading: boolean;
  setReserveLoading: (loading: boolean) => void;
  setContactLoading: (loading: boolean) => void;
}

const LoadingContext = createContext<LoadingContextType | undefined>(undefined);

export function LoadingProvider({ children }: { children: React.ReactNode }) {
  const [isReserveLoading, setIsReserveLoading] = useState(false);
  const [isContactLoading, setIsContactLoading] = useState(false);

  const setReserveLoading = (loading: boolean) => {
    setIsReserveLoading(loading);
  };

  const setContactLoading = (loading: boolean) => {
    setIsContactLoading(loading);
  };

  return (
    <LoadingContext.Provider
      value={{
        isReserveLoading,
        isContactLoading,
        setReserveLoading,
        setContactLoading,
      }}
    >
      {children}
    </LoadingContext.Provider>
  );
}

export function useLoading() {
  const context = useContext(LoadingContext);
  if (context === undefined) {
    throw new Error("useLoading must be used within a LoadingProvider");
  }
  return context;
}
