import { useState, type FormEvent } from "react";
import { Building2, Pencil, Plus, Trash2, X } from "lucide-react";
import toast from "react-hot-toast";
import ConfirmModal from "../components/ConfirmModal";
import { useAreas } from "../hooks/useAreas";
import type { Area } from "../types";

const getErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : "No se pudo completar la operación.";

const Areas = () => {
  const {
    areas,
    isLoading,
    isError,
    createArea,
    updateArea,
    deleteArea,
    isSaving,
    isDeleting,
  } = useAreas();
  const [name, setName] = useState("");
  const [editingArea, setEditingArea] = useState<Area | null>(null);
  const [areaToDelete, setAreaToDelete] = useState<Area | null>(null);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalizedName = name.trim();
    if (!normalizedName) {
      toast.error("El nombre del área es obligatorio.");
      return;
    }

    try {
      if (editingArea) {
        await updateArea({ id: editingArea.id, name: normalizedName });
        toast.success("Área actualizada.");
      } else {
        await createArea(normalizedName);
        toast.success("Área creada.");
      }
      setName("");
      setEditingArea(null);
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };

  const confirmDelete = async () => {
    if (!areaToDelete) return;
    try {
      await deleteArea(areaToDelete.id);
      toast.success("Área eliminada.");
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setAreaToDelete(null);
    }
  };

  const startEditing = (area: Area) => {
    setEditingArea(area);
    setName(area.name);
  };

  const cancelEditing = () => {
    setEditingArea(null);
    setName("");
  };

  return (
    <div className="w-full max-w-5xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Gestión de Áreas</h1>
        <p className="mt-1 text-sm text-gray-500">
          Cada usuario puede pertenecer opcionalmente a una sola área.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="mb-6 bg-white border border-gray-100 shadow rounded-lg p-5">
        <label htmlFor="areaName" className="block text-sm font-medium text-gray-700">
          {editingArea ? "Editar nombre del área" : "Nueva área"}
        </label>
        <div className="mt-2 flex flex-col sm:flex-row gap-3">
          <input
            id="areaName"
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={120}
            required
            autoFocus={!!editingArea}
            placeholder="Ej. Administración"
            className="flex-1 rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
          />
          <div className="flex gap-2">
            {editingArea && (
              <button type="button" onClick={cancelEditing} className="btn btn-secondary inline-flex items-center">
                <X size={17} className="mr-1" /> Cancelar
              </button>
            )}
            <button type="submit" disabled={isSaving} className="btn btn-primary inline-flex items-center disabled:opacity-60">
              <Plus size={17} className="mr-1" />
              {isSaving ? "Guardando..." : editingArea ? "Actualizar" : "Agregar"}
            </button>
          </div>
        </div>
      </form>

      <div className="bg-white border border-gray-100 shadow rounded-lg overflow-hidden">
        {isLoading ? (
          <div className="p-10 text-center text-gray-500">Cargando áreas...</div>
        ) : isError ? (
          <div className="p-6 text-red-700 bg-red-50">No se pudieron cargar las áreas.</div>
        ) : areas.length === 0 ? (
          <div className="p-10 text-center text-gray-400">No hay áreas registradas.</div>
        ) : (
          <div className="divide-y divide-gray-100">
            {areas.map((area) => (
              <div key={area.id} className="flex items-center justify-between px-5 py-4 hover:bg-gray-50">
                <div className="flex items-center min-w-0">
                  <div className="h-9 w-9 rounded-md bg-blue-50 text-blue-700 flex items-center justify-center mr-3">
                    <Building2 size={18} />
                  </div>
                  <span className="font-medium text-gray-900 truncate">{area.name}</span>
                </div>
                <div className="flex gap-1">
                  <button onClick={() => startEditing(area)} className="p-2 rounded-md text-blue-600 hover:bg-blue-50" title="Editar área">
                    <Pencil size={18} />
                  </button>
                  <button onClick={() => setAreaToDelete(area)} className="p-2 rounded-md text-red-600 hover:bg-red-50" title="Eliminar área">
                    <Trash2 size={18} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <ConfirmModal
        isOpen={!!areaToDelete}
        onClose={() => setAreaToDelete(null)}
        onConfirm={confirmDelete}
        title="Eliminar área"
        message={`¿Deseas eliminar el área ${areaToDelete?.name || ""}? Solo será posible si no tiene usuarios relacionados.`}
        confirmLabel="Eliminar"
        isDanger
        isLoading={isDeleting}
      />
    </div>
  );
};

export default Areas;
