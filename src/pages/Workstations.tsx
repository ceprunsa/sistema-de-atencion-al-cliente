import { useState, type FormEvent } from "react";
import { MonitorSmartphone, Pencil, Plus, Power, Unplug, UserRound } from "lucide-react";
import toast from "react-hot-toast";
import { useWorkstations } from "../hooks/useWorkstations";
import { formatLocalDate } from "../utils/dateUtils";

const Workstations = () => {
  const { workstations, users, isLoading, error, create, update, assign, unassign, deactivateTablet, isSaving } = useWorkstations();
  const [name, setName] = useState("");
  const [selectedUsers, setSelectedUsers] = useState<Record<string, string>>({});
  const assignedUserIds = new Set(workstations.map((station) => station.assignedUserId).filter(Boolean));

  const run = async (action: () => Promise<unknown>, success: string) => {
    try { await action(); toast.success(success); }
    catch (value) { toast.error(value instanceof Error ? value.message : "No se pudo completar la operación."); }
  };
  const handleCreate = async (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return toast.error("El nombre de la mesa es obligatorio.");
    await run(() => create(name), "Mesa creada correctamente.");
    setName("");
  };
  const fullName = (user: (typeof users)[number]) => [user.firstName, user.middleName, user.paternalSurname, user.maternalSurname].filter(Boolean).join(" ");

  return <div className="mx-auto max-w-6xl">
    <div className="mb-7"><h1 className="text-2xl font-bold text-gray-900">Mesas de trabajo</h1><p className="mt-1 text-sm text-gray-500">Asigna una mesa por usuario y controla la tablet vinculada.</p></div>
    <form onSubmit={handleCreate} className="mb-6 flex gap-3 rounded-lg border bg-white p-4 shadow-sm">
      <input value={name} onChange={(e) => setName(e.target.value)} maxLength={100} className="flex-1 rounded-md border-gray-300" placeholder="Nombre de la nueva mesa" />
      <button disabled={isSaving} className="btn btn-primary inline-flex items-center"><Plus size={17} className="mr-2" />Crear mesa</button>
    </form>
    {isLoading ? <p className="py-12 text-center text-gray-500">Cargando mesas...</p> : error ? <div className="rounded-md bg-red-50 p-4 text-red-700">{error instanceof Error ? error.message : "No se pudieron cargar las mesas."}</div> :
      <div className="grid gap-4 lg:grid-cols-2">{workstations.map((station) => <section key={station.id} className="rounded-lg border bg-white p-5 shadow-sm">
        <div className="flex items-start justify-between gap-3"><div><h2 className="font-semibold text-gray-900">{station.name}</h2><span className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-xs ${station.isActive ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"}`}>{station.isActive ? "Activa" : "Inactiva"}</span></div>
          <div className="flex"><button type="button" disabled={isSaving} onClick={() => { const nextName = window.prompt("Nuevo nombre de la mesa:", station.name); if (nextName?.trim() && nextName.trim() !== station.name) void run(() => update({ id: station.id, values: { name: nextName } }), "Nombre actualizado."); }} className="rounded-md p-2 text-gray-600 hover:bg-gray-100" title="Editar nombre"><Pencil size={18} /></button><button type="button" disabled={isSaving || !!station.assignedUserId} onClick={() => run(() => update({ id: station.id, values: { isActive: !station.isActive } }), "Estado actualizado.")} className="rounded-md p-2 text-gray-600 hover:bg-gray-100 disabled:opacity-40" title={station.assignedUserId ? "Libera la mesa antes de inhabilitarla" : "Cambiar estado"}><Power size={18} /></button></div></div>
        <div className="mt-4 rounded-md bg-gray-50 p-3 text-sm"><div className="flex items-center gap-2 font-medium text-gray-700"><UserRound size={17} />{station.assignedUserName || "Sin usuario asignado"}</div></div>
        {!station.assignedUserId && station.isActive ? <div className="mt-3 flex gap-2"><select value={selectedUsers[station.id] || ""} onChange={(e) => setSelectedUsers((v) => ({ ...v, [station.id]: e.target.value }))} className="min-w-0 flex-1 rounded-md border-gray-300 text-sm"><option value="">Selecciona un usuario</option>{users.filter((user) => !assignedUserIds.has(user.id)).map((user) => <option key={user.id} value={user.id}>{fullName(user)}</option>)}</select><button type="button" disabled={isSaving || !selectedUsers[station.id]} onClick={() => run(() => assign({ workstationId: station.id, userId: selectedUsers[station.id] }), "Usuario asignado.")} className="btn btn-secondary">Asignar</button></div> : null}
        {station.assignedUserId ? <button type="button" disabled={isSaving} onClick={() => { const reason = window.prompt("Motivo para liberar la mesa:"); if (reason?.trim()) void run(() => unassign({ workstationId: station.id, reason }), "Mesa liberada."); }} className="mt-3 text-sm font-medium text-red-600 hover:underline">Liberar asignación</button> : null}
        <div className="mt-4 border-t pt-4"><div className="flex items-center gap-2 text-sm font-medium text-gray-700"><MonitorSmartphone size={17} />{station.tabletBindingId ? "Tablet vinculada" : "Sin tablet vinculada"}</div>{station.tabletLastSeenAt && <p className="mt-1 text-xs text-gray-500">Última actividad: {formatLocalDate(station.tabletLastSeenAt)}</p>}{station.tabletBindingId && <button type="button" disabled={isSaving} onClick={() => { const reason = window.prompt("Motivo para desvincular la tablet:"); if (reason?.trim()) void run(() => deactivateTablet({ workstationId: station.id, reason }), "Tablet desvinculada."); }} className="mt-2 inline-flex items-center text-sm font-medium text-red-600 hover:underline"><Unplug size={15} className="mr-1" />Desvincular tablet</button>}</div>
      </section>)}</div>}
  </div>;
};

export default Workstations;
