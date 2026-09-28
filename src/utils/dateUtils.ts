import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";

/**
 * Formatea una fecha ISO (UTC por defecto en backend) a un formato legible local
 * @param dateString - Fecha en formato ISO (ej. 2024-03-01T12:00:00Z)
 * @param formatStr - Formato deseado (default: dd/MM/yyyy HH:mm)
 * @returns Fecha formateada o "N/A" si es inválida
 */
export const formatLocalDate = (
  dateString?: string | null,
  formatStr: string = "dd/MM/yyyy HH:mm",
): string => {
  if (!dateString) return "N/A";

  try {
    const date = parseISO(dateString);
    return format(date, formatStr, { locale: es });
  } catch (error) {
    console.error("Error formatting date:", error);
    return "N/A";
  }
};

/**
 * Formatea solo la fecha (sin hora)
 */
export const formatOnlyDate = (dateString?: string | null): string => {
  return formatLocalDate(dateString, "dd/MM/yyyy");
};

/**
 * Formatea una fecha para mostrar cuánto tiempo ha pasado (ej. "hace 2 días")
 * Útil para otras vistas pero requiere instalar formatDistanceToNow
 */
// export const formatRelativeDate = (dateString?: string | null): string => {
//   if (!dateString) return "N/A";
//   try {
//     const date = parseISO(dateString);
//     return formatDistanceToNow(date, { addSuffix: true, locale: es });
//   } catch (error) {
//     return "N/A";
//   }
// };
