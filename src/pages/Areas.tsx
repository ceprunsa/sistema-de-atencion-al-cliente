import { useEffect, useState, type FormEvent } from "react";
import { Building2, Pencil, Plus, Power, ShieldCheck, Trash2, X } from "lucide-react";
import toast from "react-hot-toast";
import ConfirmModal from "../components/ConfirmModal";
import { useAreas } from "../hooks/useAreas";
import type { Area } from "../types";

const getErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : "No se pudo completar la operación.";

const GROUP_EMAIL_PATTERN = /^[^\s@]+@cepr\.unsa\.pe$/i;

const Areas = () => {
  const {
    areas,
    isLoading,
    isError,
    closureAreaId,
    isLoadingClosureArea,
    createArea,
    updateArea,
    deleteArea,
    setAreaStatus,
    setComplaintClosureArea,
    isSaving,
    isDeleting,
    isChangingStatus,
    isSavingClosureArea,
  } = useAreas();
  const [name, setName] = useState("");
  const [groupEmail, setGroupEmail] = useState("");
  const [editingArea, setEditingArea] = useState<Area | null>(null);
  const [areaToDelete, setAreaToDelete] = useState<Area | null>(null);
  const [areaToToggle, setAreaToToggle] = useState<Area | null>(null);
  const [selectedClosureAreaId, setSelectedClosureAreaId] = useState("");

  useEffect(() => {
    setSelectedClosureAreaId(closureAreaId || "");
  }, [closureAreaId]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalizedName = name.trim();
    if (!normalizedName) {
      toast.error("El nombre del área es obligatorio.");
      return;
    }
    const normalizedGroupEmail = groupEmail.trim().toLowerCase();
    if (!GROUP_EMAIL_PATTERN.test(normalizedGroupEmail)) {
      toast.error("Ingresa un correo de grupo válido con dominio @cepr.unsa.pe.");
      return;
    }

    try {
      if (editingArea) {
        await updateArea({
          id: editingArea.id,
          values: { name: normalizedName, groupEmail: normalizedGroupEmail },
        });
        toast.success("Área actualizada.");
      } else {
        await createArea({ name: normalizedName, groupEmail: normalizedGroupEmail });
        toast.success("Área creada.");
      }
      setName("");
      setGroupEmail("");
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

  const confirmStatusChange = async () => {
    if (!areaToToggle) return;
    try {
      await setAreaStatus({
        id: areaToToggle.id,
        isActive: !areaToToggle.isActive,
      });
      toast.success(
        areaToToggle.isActive ? "Área inhabilitada." : "Área reactivada.",
      );
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setAreaToToggle(null);
    }
  };

  const saveClosureArea = async () => {
    if (!selectedClosureAreaId) {
      toast.error("Selecciona un área activa para el cierre de quejas.");
      return;
    }
    try {
      await setComplaintClosureArea(selectedClosureAreaId);
      toast.success("Área de cierre de quejas configurada.");
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };

  const startEditing = (area: Area) => {
    setEditingArea(area);
    setName(area.name);
    setGroupEmail(area.groupEmail || "");
  };

  const cancelEditing = () => {
    setEditingArea(null);
    setName("");
    setGroupEmail("");
  };

  return (
    <div className="w-full max-w-5xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Gestión de Áreas</h1>
        <p className="mt-1 text-sm text-gray-500">
          Cada usuario puede pertenecer opcionalmente a una sola área.
        </p>
      </div>

      <section className="mb-6 rounded-lg border border-blue-100 bg-blue-50 p-5">
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-0.5 shrink-0 text-blue-700" size={22} />
          <div className="flex-1">
            <h2 className="font-semibold text-blue-950">
              Área de seguimiento y cierre de quejas
            </h2>
            <p className="mt-1 text-sm text-blue-800">
              Solo puede existir una. No podrá cambiarse mientras haya quejas
              abiertas.
            </p>
            <div className="mt-4 flex flex-col gap-3 sm:flex-row">
              <select
                value={selectedClosureAreaId}
                onChange={(event) => setSelectedClosureAreaId(event.target.value)}
                disabled={isLoading || isLoadingClosureArea}
                className="block min-w-0 flex-1 rounded-md border-blue-200 bg-white shadow-sm"
              >
                <option value="">Selecciona un área activa</option>
                {areas.filter((area) => area.isActive).map((area) => (
                  <option key={area.id} value={area.id}>
                    {area.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => void saveClosureArea()}
                disabled={
                  !selectedClosureAreaId
                  || selectedClosureAreaId === closureAreaId
                  || isSavingClosureArea
                }
                className="btn btn-primary disabled:opacity-60"
              >
                {isSavingClosureArea ? "Guardando..." : "Guardar configuración"}
              </button>
            </div>
          </div>
        </div>
      </section>

      <form onSubmit={handleSubmit} className="mb-6 bg-white border border-gray-100 shadow rounded-lg p-5">
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label htmlFor="areaName" className="block text-sm font-medium text-gray-700">
              {editingArea ? "Nombre del área" : "Nueva área"}
            </label>
            <input
              id="areaName"
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={120}
              required
              autoFocus={!!editingArea}
              placeholder="Ej. Administración"
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
            />
          </div>
          <div>
            <label htmlFor="areaGroupEmail" className="block text-sm font-medium text-gray-700">
              Correo de grupo Google *
            </label>
            <input
              id="areaGroupEmail"
              type="email"
              value={groupEmail}
              onChange={(event) => setGroupEmail(event.target.value)}
              maxLength={254}
              required
              placeholder="grupo@cepr.unsa.pe"
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
            />
            <p className="mt-1 text-xs text-gray-500">Debe ser único y terminar en @cepr.unsa.pe.</p>
          </div>
        </div>
        <div className="mt-4 flex justify-end gap-2">
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
                  <div className="min-w-0">
                    <p className="font-medium text-gray-900 truncate">{area.name}</p>
                    <p className={`mt-0.5 truncate text-sm ${area.groupEmail ? "text-gray-500" : "text-amber-700"}`}>
                      {area.groupEmail || "Correo de grupo pendiente de configurar"}
                    </p>
                    <span className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                      area.isActive
                        ? "bg-green-100 text-green-800"
                        : "bg-gray-200 text-gray-700"
                    }`}>
                      {area.isActive ? "Activa" : "Inhabilitada"}
                    </span>
                    {closureAreaId === area.id && (
                      <span className="ml-2 inline-flex rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800">
                        Cierre de quejas
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex gap-1">
                  <button
                    onClick={() => setAreaToToggle(area)}
                    className={`p-2 rounded-md ${
                      area.isActive
                        ? "text-amber-700 hover:bg-amber-50"
                        : "text-green-700 hover:bg-green-50"
                    }`}
                    title={area.isActive ? "Inhabilitar área" : "Reactivar área"}
                  >
                    <Power size={18} />
                  </button>
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
      <ConfirmModal
        isOpen={!!areaToToggle}
        onClose={() => setAreaToToggle(null)}
        onConfirm={confirmStatusChange}
        title={areaToToggle?.isActive ? "Inhabilitar área" : "Reactivar área"}
        message={
          areaToToggle?.isActive
            ? "El área dejará de estar disponible para nuevas quejas. No será posible si es el área de cierre o tiene quejas abiertas."
            : "El área volverá a estar disponible para nuevas quejas."
        }
        confirmLabel={areaToToggle?.isActive ? "Inhabilitar" : "Reactivar"}
        isDanger={areaToToggle?.isActive}
        isLoading={isChangingStatus}
      />
    </div>
  );
};

export default Areas;
