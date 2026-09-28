"use client";

import { useState, useRef, type KeyboardEvent } from "react";
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from "lucide-react";
import type { PaginationState } from "../types";

export const PAGE_SIZE_OPTIONS = [2, 5, 10, 15, 20];

interface PaginationProps {
  pagination: PaginationState;
  onPageChange: (page: number) => void;
  onLimitChange: (limit: number) => void;
  /**
   * false -> version completa (arriba de la tabla)
   * true  -> version compacta (abajo de la tabla) - valor por defecto
   */
  bottom?: boolean;
}

const Pagination = ({
  pagination,
  onPageChange,
  onLimitChange,
  bottom = true,
}: PaginationProps) => {
  const { page, limit, totalPages, total } = pagination;
  const safeTotal = totalPages || 1;
  const from = total === 0 ? 0 : (page - 1) * limit + 1;
  const to = Math.min(page * limit, total);

  const [jumpValue, setJumpValue] = useState("");
  const jumpRef = useRef<HTMLInputElement>(null);

  const handleJump = () => {
    const target = parseInt(jumpValue, 10);
    if (
      !isNaN(target) &&
      target >= 1 &&
      target <= safeTotal &&
      target !== page
    ) {
      onPageChange(target);
    }
    setJumpValue("");
    jumpRef.current?.blur();
  };

  const handleJumpKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") handleJump();
  };

  const allPages = Array.from({ length: safeTotal }, (_, i) => i + 1);

  const renderNavigationControls = () => (
    <div className="flex items-center justify-end gap-1.5 flex-wrap">
      <span className="text-sm text-gray-400 whitespace-nowrap">
        Pag. <span className="font-medium text-gray-600">{page}</span> de{" "}
        <span className="font-medium text-gray-600">{safeTotal}</span>
      </span>

      <button
        onClick={() => onPageChange(1)}
        disabled={page <= 1}
        className="p-1.5 rounded-md border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        title="Primera pagina"
      >
        <ChevronsLeft size={15} />
      </button>
      <button
        onClick={() => onPageChange(page - 1)}
        disabled={page <= 1}
        className="p-1.5 rounded-md border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        title="Pagina anterior"
      >
        <ChevronLeft size={15} />
      </button>

      {allPages.map((n) => (
        <button
          key={n}
          onClick={() => onPageChange(n)}
          className={`min-w-[32px] h-8 px-1 rounded-md text-sm font-medium border transition-colors ${
            n === page
              ? "bg-primary-dark text-white border-primary shadow-sm"
              : "border-gray-200 text-gray-600 hover:bg-gray-50"
          }`}
        >
          {n}
        </button>
      ))}

      <button
        onClick={() => onPageChange(page + 1)}
        disabled={page >= safeTotal}
        className="p-1.5 rounded-md border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        title="Pagina siguiente"
      >
        <ChevronRight size={15} />
      </button>
      <button
        onClick={() => onPageChange(safeTotal)}
        disabled={page >= safeTotal}
        className="p-1.5 rounded-md border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        title="Ultima pagina"
      >
        <ChevronsRight size={15} />
      </button>

      {safeTotal > 3 && (
        <div className="flex items-center gap-1.5 ml-1 whitespace-nowrap text-sm text-gray-400">
          <span>Ir a</span>
          <input
            ref={jumpRef}
            type="number"
            min={1}
            max={safeTotal}
            value={jumpValue}
            onChange={(e) => setJumpValue(e.target.value)}
            onKeyDown={handleJumpKey}
            onBlur={handleJump}
            placeholder="#"
            className="w-14 text-center border border-gray-200 rounded-md py-1 text-sm text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
          />
        </div>
      )}
    </div>
  );

  if (bottom) {
    if (safeTotal <= 1) return null;

    return (
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mt-2 px-1">
        <span className="text-xs text-gray-400">
          Pag. <span className="font-medium text-gray-600">{page}</span>
          {" / "}
          {safeTotal}
          {" - "}
          <span className="font-medium text-gray-600">{total}</span> registros
        </span>

        {renderNavigationControls()}
      </div>
    );
  }

  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-3 px-1">
      <div className="flex items-center gap-3 text-sm text-gray-500 flex-wrap">
        <label className="flex items-center gap-2 whitespace-nowrap">
          <span>Filas por pagina:</span>
          <div className="relative inline-flex items-center">
            <select
              value={limit}
              onChange={(e) => onLimitChange(Number(e.target.value))}
              style={{
                WebkitAppearance: "none",
                MozAppearance: "none",
                appearance: "none",
              }}
              className="border border-gray-200 rounded-md pl-3 pr-7 py-1 text-sm text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 cursor-pointer"
            >
              {PAGE_SIZE_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
        </label>

        <span className="text-gray-300">|</span>

        <span>
          Mostrando{" "}
          <strong className="text-gray-700">
            {from}-{to}
          </strong>{" "}
          de <strong className="text-gray-700">{total}</strong> registros
        </span>
      </div>

      {renderNavigationControls()}
    </div>
  );
};

export default Pagination;
