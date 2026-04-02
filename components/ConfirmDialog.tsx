import React from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, X } from 'lucide-react';

interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  onDiscard?: () => void; // Called when user clicks "Don't Save"
  title?: string;
  message?: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'danger' | 'warning' | 'info';
}

const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  isOpen,
  onClose,
  onConfirm,
  onDiscard,
  title = 'Unsaved Changes',
  message = 'You have unsaved changes. Do you want to save before closing?',
  confirmText = 'Save & Exit',
  cancelText = "Don't Save",
  variant = 'warning',
}) => {
  if (!isOpen) return null;

  const variantStyles = {
    danger: {
      icon: 'text-red-600',
      button: 'bg-red-600 hover:bg-red-700',
    },
    warning: {
      icon: 'text-yellow-600',
      button: 'bg-yellow-600 hover:bg-yellow-700',
    },
    info: {
      icon: 'text-blue-600',
      button: 'bg-blue-600 hover:bg-blue-700',
    },
  };

  const styles = variantStyles[variant];

  return createPortal(
    <>
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/70 z-[200]" 
        onClick={onClose}
        style={{ zIndex: 9999 }}
      />

      {/* Dialog */}
      <div 
        className="fixed inset-0 flex items-center justify-center z-[210] p-4"
        style={{ zIndex: 10000 }}
      >
        <div
          className="bg-white rounded-xl shadow-2xl max-w-md w-full animate-fade-in"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-start justify-between p-6 pb-4">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
              <p className="mt-2 text-sm text-gray-600">{message}</p>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition-colors ml-4"
              title="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Actions */}
          <div className="flex flex-col-reverse sm:flex-row gap-3 p-6 pt-4 bg-gray-50 rounded-b-xl">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-100 transition-colors font-medium"
            >
              Cancel
            </button>
            <button
              onClick={() => {
                if (onDiscard) onDiscard();
              }}
              className="flex-1 px-4 py-2.5 bg-red-50 text-red-600 border border-red-300 rounded-lg hover:bg-red-100 transition-colors font-medium"
            >
              {cancelText}
            </button>
            <button
              onClick={() => {
                onConfirm();
                onClose();
              }}
              className="flex-1 px-4 py-2.5 bg-green-50 text-green-600 border border-green-300 rounded-lg hover:bg-green-100 transition-colors font-medium"
            >
              {confirmText}
            </button>
          </div>
        </div>
      </div>
    </>,
    document.body
  );
};

export default ConfirmDialog;
