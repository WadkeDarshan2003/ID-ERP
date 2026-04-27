import React, { createContext, useContext, useState } from 'react';

interface LoadingContextValue {
  loading: boolean;
  showLoading: (msg?: string) => void;
  hideLoading: () => void;
  message?: string | null;
}

const LoadingContext = createContext<LoadingContextValue>({
  loading: false,
  showLoading: () => {},
  hideLoading: () => {},
  message: null
});

export const LoadingProvider: React.FC<{children: React.ReactNode}> = ({ children }) => {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const showLoading = (msg?: string) => {
    if (msg) setMessage(msg);
    setLoading(true);
    // prevent background scroll
    try { document.body.style.overflow = 'hidden'; } catch(e) {}
  };
  const hideLoading = () => {
    setLoading(false);
    setMessage(null);
    try { document.body.style.overflow = ''; } catch(e) {}
  };

  return (
    <LoadingContext.Provider value={{ loading, showLoading, hideLoading, message }}>
      {children}
    </LoadingContext.Provider>
  );
};

export const useLoading = () => useContext(LoadingContext);
