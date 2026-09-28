"use client";

import { AlertCircle } from "lucide-react";

interface ConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  isDanger?: boolean;
  isLoading?: boolean;
}

const ConfirmModal = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = "Confirmar",
  cancelLabel = "Cancelar",
  isDanger = false,
  isLoading = false,
}: ConfirmModalProps) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
        {/* Overlay */}
        <div
          className="fixed inset-0 bg-gray-500/75 backdrop-blur-sm transition-opacity"
          onClick={onClose}
        />

        {/* Centering hack */}
        <span
          className="hidden sm:inline-block sm:align-middle sm:h-screen"
          aria-hidden="true"
        >
          &#8203;
        </span>

        {/* Modal */}
        <div className="inline-block align-bottom bg-white rounded-xl text-left overflow-hidden shadow-2xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full animate-in fade-in zoom-in duration-200">
          <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
            <div className="sm:flex sm:items-start">
              <div
                className={`mx-auto flex-shrink-0 flex items-center justify-center h-12 w-12 rounded-full sm:mx-0 sm:h-10 sm:w-10 ${
                  isDanger
                    ? "bg-red-100 text-red-600"
                    : "bg-[#1A2855]/10 text-[#1A2855]"
                }`}
              >
                <AlertCircle size={24} />
              </div>
              <div className="mt-3 text-center sm:mt-0 sm:ml-4 sm:text-left font-outfit">
                <h3 className="text-xl font-bold text-gray-900 leading-6">
                  {title}
                </h3>
                <div className="mt-2 text-sm text-gray-500">
                  <p>{message}</p>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse gap-3 font-outfit">
            <button
              onClick={onConfirm}
              disabled={isLoading}
              className={`w-full inline-flex justify-center rounded-lg border border-transparent shadow-sm px-5 py-2.5 text-sm font-semibold text-white focus:outline-none focus:ring-2 focus:ring-offset-2 transition-all duration-200 sm:ml-3 sm:w-auto ${
                isDanger
                  ? "bg-red-600 hover:bg-red-700 focus:ring-red-500"
                  : "bg-[#1A2855] hover:bg-[#1A2855]/90 focus:ring-[#1A2855]"
              } disabled:opacity-50`}
            >
              {isLoading ? "Procesando..." : confirmLabel}
            </button>
            <button
              onClick={onClose}
              disabled={isLoading}
              className="mt-3 w-full inline-flex justify-center rounded-lg border border-gray-300 shadow-sm px-5 py-2.5 bg-white text-sm font-semibold text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 transition-all duration-200 sm:mt-0 sm:w-auto"
            >
              {cancelLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ConfirmModal;
