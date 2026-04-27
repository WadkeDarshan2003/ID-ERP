import React from 'react';
import './loader.css';
import { useLoading } from '../contexts/LoadingContext';

const Loader: React.FC<{ message?: string }> = ({ message }) => {
  const { loading, message: ctxMessage } = useLoading();
  if (!loading) return null;
  return (
    <div className="loader-overlay" role="status" aria-live="polite">
      <div className="loader-circle" />
      <div className="loader-message">{message || ctxMessage || 'Loading...'}</div>
    </div>
  );
};

export default Loader;
export { Loader };
