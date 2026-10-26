import { useState, type FormEvent } from "react";
import { MonitorSmartphone, Pencil, Plus, Power, Unplug, UserRound, X } from "lucide-react";
import toast from "react-hot-toast";
import { useWorkstations } from "../hooks/useWorkstations";
import { formatLocalDate } from "../utils/dateUtils";

type ModalAction = "EDIT" | "UNASSIGN" | "DEACTIVATE_TABLET";

interface ModalState {
  action: ModalAction;
  workstationId: string;
  workstationName: string;
  assignedUserName: string | null;
}

interface WorkstationActionModalProps {
  modal: ModalState;
  value: string;
  isSaving: boolean;
  onChange: (value: string) => void;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}

const WorkstationActionModal = ({ modal, value, isSaving, onChange, onClose, onSubmit }: WorkstationActionModalProps) => {
  const isEdit = modal.action === "EDIT";
  const isUnassign = modal.action === "UNASSIGN";
  const title = isEdit ? "Editar mesa de atención" : isUnassign ? "Liberar mesa de atención" : "Desvincular tablet";
  const description = isEdit
    ? `Modifica el nombre con el que se identifica “${modal.workstationName}”.`
    : isUnassign
      ? `Se finalizará la asignación de ${modal.assignedUserName || "este usuario"} en “${modal.workstationName}” y se desvinculará su tablet activa.`
      : `La tablet dejará de recibir encuestas de “${modal.workstationName}”.`;
  const label = isEdit ? "Nombre de la mesa *" : "Motivo *";
  const confirmLabel = isEdit ? "Guardar cambios" : isUnassign ? "Liberar mesa" : "Desvincular tablet";

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center overflow-y-auto bg-gray-900/60 px-4 py-8" role="dialog" aria-modal="true" aria-labelledby="workstation-modal-title">
      <button type="button" className="fixed inset-0 cursor-default" onClick={onClose} aria-label="Cerrar modal" disabled={isSaving} />
      <form onSubmit={onSubmit} className="relative w-full max-w-lg rounded-xl bg-white p-6 text-left shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="workstation-modal-title" className="text-xl font-bold text-gray-900">{title}</h2>
            <p className="mt-1 text-sm leading-5 text-gray-500">{description}</p>
          </div>
          <button type="button" onClick={onClose} disabled={isSaving} aria-label="Cerrar" className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 disabled:opacity-50"><X size={20} /></button>
        </div>

        <label htmlFor="workstation-modal-value" className="mt-5 block text-sm font-medium text-gray-700">{label}</label>
        {isEdit ? (
          <input id="workstation-modal-value" autoFocus required maxLength={100} value={value} onChange={(event) => onChange(event.target.value)} className="mt-1 block w-full rounded-md border-gray-300" />
        ) : (
          <textarea id="workstation-modal-value" autoFocus required rows={4} maxLength={1000} value={value} onChange={(event) => onChange(event.target.value)} placeholder="Describe brevemente el motivo" className="mt-1 block w-full resize-y rounded-md border-gray-300" />
        )}

        {isUnassign && <p className="mt-2 text-xs text-amber-700">La mesa no podrá liberarse mientras tenga una encuesta presencial pendiente.</p>}

        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" onClick={onClose} disabled={isSaving} className="btn btn-secondary">Cancelar</button>
          <button type="submit" disabled={isSaving || !value.trim()} className={`inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50 ${isEdit ? "bg-[#1A2855] hover:bg-[#27396f]" : "bg-red-600 hover:bg-red-700"}`}>
            {isSaving ? "Procesando..." : confirmLabel}
          </button>
        </div>
      </form>
    </div>
  );
};

const Workstations = () => {
  const { workstations, users, isLoading, error, create, update, assign, unassign, deactivateTablet, isSaving } = useWorkstations();
  const [name, setName] = useState("");
  const [selectedUsers, setSelectedUsers] = useState<Record<string, string>>({});
  const [modal, setModal] = useState<ModalState | null>(null);
  const [modalValue, setModalValue] = useState("");
  const assignedUserIds = new Set(workstations.map((station) => station.assignedUserId).filter(Boolean));

  const run = async (action: () => Promise<unknown>, success: string) => {
    try {
      await action();
      toast.success(success);
      return true;
    } catch (value) {
      toast.error(value instanceof Error ? value.message : "No se pudo completar la operación.");
      return false;
    }
  };

  const handleCreate = async (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return toast.error("El nombre de la mesa es obligatorio.");
    const succeeded = await run(() => create(name), "Mesa creada correctamente.");
    if (succeeded) setName("");
  };

  const openModal = (action: ModalAction, station: (typeof workstations)[number]) => {
    setModal({ action, workstationId: station.id, workstationName: station.name, assignedUserName: station.assignedUserName });
    setModalValue(action === "EDIT" ? station.name : "");
  };

  const closeModal = () => {
    if (isSaving) return;
    setModal(null);
    setModalValue("");
  };

  const handleModalSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!modal) return;
    const value = modalValue.trim();
    if (!value) {
      toast.error(modal.action === "EDIT" ? "El nombre de la mesa es obligatorio." : "El motivo es obligatorio.");
      return;
    }

    let succeeded = false;
    if (modal.action === "EDIT") {
      if (value === modal.workstationName) {
        closeModal();
        return;
      }
      succeeded = await run(() => update({ id: modal.workstationId, values: { name: value } }), "Nombre actualizado.");
    } else if (modal.action === "UNASSIGN") {
      succeeded = await run(() => unassign({ workstationId: modal.workstationId, reason: value }), "Mesa liberada.");
    } else {
      succeeded = await run(() => deactivateTablet({ workstationId: modal.workstationId, reason: value }), "Tablet desvinculada.");
    }

    if (succeeded) {
      setModal(null);
      setModalValue("");
    }
  };

  const fullName = (user: (typeof users)[number]) => [user.firstName, user.middleName, user.paternalSurname, user.maternalSurname].filter(Boolean).join(" ");

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-7">
        <h1 className="text-2xl font-bold text-gray-900">Mesas de trabajo</h1>
        <p className="mt-1 text-sm text-gray-500">Asigna una mesa por usuario y controla la tablet vinculada.</p>
      </div>

      <form onSubmit={handleCreate} className="mb-6 flex gap-3 rounded-lg border bg-white p-4 shadow-sm">
        <input value={name} onChange={(event) => setName(event.target.value)} maxLength={100} className="flex-1 rounded-md border-gray-300" placeholder="Nombre de la nueva mesa" />
        <button disabled={isSaving} className="btn btn-primary inline-flex items-center"><Plus size={17} className="mr-2" />Crear mesa</button>
      </form>

      {isLoading ? (
        <p className="py-12 text-center text-gray-500">Cargando mesas...</p>
      ) : error ? (
        <div className="rounded-md bg-red-50 p-4 text-red-700">{error instanceof Error ? error.message : "No se pudieron cargar las mesas."}</div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {workstations.map((station) => (
            <section key={station.id} className="rounded-lg border bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="font-semibold text-gray-900">{station.name}</h2>
                  <span className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-xs ${station.isActive ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"}`}>{station.isActive ? "Activa" : "Inactiva"}</span>
                </div>
                <div className="flex">
                  <button type="button" disabled={isSaving} onClick={() => openModal("EDIT", station)} className="rounded-md p-2 text-gray-600 hover:bg-gray-100" title="Editar nombre"><Pencil size={18} /></button>
                  <button type="button" disabled={isSaving || !!station.assignedUserId} onClick={() => run(() => update({ id: station.id, values: { isActive: !station.isActive } }), "Estado actualizado.")} className="rounded-md p-2 text-gray-600 hover:bg-gray-100 disabled:opacity-40" title={station.assignedUserId ? "Libera la mesa antes de inhabilitarla" : "Cambiar estado"}><Power size={18} /></button>
                </div>
              </div>

              <div className="mt-4 rounded-md bg-gray-50 p-3 text-sm"><div className="flex items-center gap-2 font-medium text-gray-700"><UserRound size={17} />{station.assignedUserName || "Sin usuario asignado"}</div></div>

              {!station.assignedUserId && station.isActive && (
                <div className="mt-3 flex gap-2">
                  <select value={selectedUsers[station.id] || ""} onChange={(event) => setSelectedUsers((current) => ({ ...current, [station.id]: event.target.value }))} className="min-w-0 flex-1 rounded-md border-gray-300 text-sm">
                    <option value="">Selecciona un usuario</option>
                    {users.filter((user) => !assignedUserIds.has(user.id)).map((user) => <option key={user.id} value={user.id}>{fullName(user)}</option>)}
                  </select>
                  <button type="button" disabled={isSaving || !selectedUsers[station.id]} onClick={() => run(() => assign({ workstationId: station.id, userId: selectedUsers[station.id] }), "Usuario asignado.")} className="btn btn-secondary">Asignar</button>
                </div>
              )}

              {station.assignedUserId && <button type="button" disabled={isSaving} onClick={() => openModal("UNASSIGN", station)} className="mt-3 text-sm font-medium text-red-600 hover:underline">Liberar asignación</button>}

              <div className="mt-4 border-t pt-4">
                <div className="flex items-center gap-2 text-sm font-medium text-gray-700"><MonitorSmartphone size={17} />{station.tabletBindingId ? "Tablet vinculada" : "Sin tablet vinculada"}</div>
                {station.tabletLastSeenAt && <p className="mt-1 text-xs text-gray-500">Última actividad: {formatLocalDate(station.tabletLastSeenAt)}</p>}
                {station.tabletBindingId && <button type="button" disabled={isSaving} onClick={() => openModal("DEACTIVATE_TABLET", station)} className="mt-2 inline-flex items-center text-sm font-medium text-red-600 hover:underline"><Unplug size={15} className="mr-1" />Desvincular tablet</button>}
              </div>
            </section>
          ))}
        </div>
      )}

      {modal && <WorkstationActionModal modal={modal} value={modalValue} isSaving={isSaving} onChange={setModalValue} onClose={closeModal} onSubmit={handleModalSubmit} />}
    </div>
  );
};

export default Workstations;
