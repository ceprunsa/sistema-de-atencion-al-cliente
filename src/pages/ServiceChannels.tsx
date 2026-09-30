import { useState, type FormEvent } from "react";
import {
  Ban,
  Headphones,
  Pencil,
  Plus,
  RotateCcw,
  X,
} from "lucide-react";
import toast from "react-hot-toast";
import ConfirmModal from "../components/ConfirmModal";
import { useServiceChannels } from "../hooks/useServiceChannels";
import type { ServiceChannel } from "../types";

const getErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : "No se pudo completar la operación.";

const ServiceChannels = () => {
  const {
    channels,
    isLoading,
    isError,
    createChannel,
    updateChannel,
    setChannelStatus,
    isSaving,
    isChangingStatus,
  } = useServiceChannels();

  const [name, setName] = useState("");
  const [detail, setDetail] = useState("");
  const [editingChannel, setEditingChannel] =
    useState<ServiceChannel | null>(null);
  const [channelToChange, setChannelToChange] =
    useState<ServiceChannel | null>(null);

  const resetForm = () => {
    setName("");
    setDetail("");
    setEditingChannel(null);
  };

  const startEditing = (channel: ServiceChannel) => {
    setEditingChannel(channel);
    setName(channel.name);
    setDetail(channel.detail);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const values = { name: name.trim(), detail: detail.trim() };
    if (!values.name || !values.detail) {
      toast.error("El nombre y el detalle son obligatorios.");
      return;
    }

    try {
      if (editingChannel) {
        await updateChannel({ id: editingChannel.id, values });
        toast.success("Medio de atención actualizado.");
      } else {
        await createChannel(values);
        toast.success("Medio de atención creado.");
      }
      resetForm();
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };

  const confirmStatusChange = async () => {
    if (!channelToChange) return;

    const nextStatus = !channelToChange.isActive;
    try {
      await setChannelStatus({
        id: channelToChange.id,
        isActive: nextStatus,
      });
      toast.success(
        nextStatus
          ? "Medio de atención reactivado."
          : "Medio de atención inhabilitado.",
      );
      if (editingChannel?.id === channelToChange.id) resetForm();
      setChannelToChange(null);
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };

  return (
    <div className="w-full max-w-5xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">
          Medios de Atención
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Administra los canales disponibles para registrar nuevas atenciones.
        </p>
      </div>

      <form
        onSubmit={handleSubmit}
        className="mb-6 bg-white border border-gray-100 shadow rounded-lg p-5"
      >
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <h2 className="font-medium text-gray-900">
              {editingChannel ? "Editar medio" : "Nuevo medio"}
            </h2>
            <p className="text-xs text-gray-500 mt-1">
              Ejemplo: Teléfono fijo y el número utilizado como detalle.
            </p>
          </div>
          {editingChannel && (
            <button
              type="button"
              onClick={resetForm}
              className="p-2 rounded-md text-gray-500 hover:bg-gray-100"
              title="Cancelar edición"
            >
              <X size={18} />
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label htmlFor="channelName" className="block text-sm font-medium text-gray-700">
              Nombre
            </label>
            <input
              id="channelName"
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={120}
              required
              placeholder="Ej. Teléfono fijo"
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
            />
          </div>
          <div>
            <label htmlFor="channelDetail" className="block text-sm font-medium text-gray-700">
              Detalle
            </label>
            <input
              id="channelDetail"
              value={detail}
              onChange={(event) => setDetail(event.target.value)}
              maxLength={250}
              required
              placeholder="Ej. (054) 123456"
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
            />
          </div>
        </div>

        <div className="mt-4 flex justify-end gap-2">
          {editingChannel && (
            <button type="button" onClick={resetForm} className="btn btn-secondary">
              Cancelar
            </button>
          )}
          <button
            type="submit"
            disabled={isSaving}
            className="btn btn-primary inline-flex items-center disabled:opacity-60"
          >
            <Plus size={17} className="mr-1" />
            {isSaving
              ? "Guardando..."
              : editingChannel
                ? "Actualizar"
                : "Agregar"}
          </button>
        </div>
      </form>

      <div className="bg-white border border-gray-100 shadow rounded-lg overflow-hidden">
        {isLoading ? (
          <div className="p-10 text-center text-gray-500">
            Cargando medios de atención...
          </div>
        ) : isError ? (
          <div className="p-6 text-red-700 bg-red-50">
            No se pudieron cargar los medios de atención.
          </div>
        ) : channels.length === 0 ? (
          <div className="p-10 text-center text-gray-400">
            No hay medios de atención registrados.
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {channels.map((channel) => (
              <div
                key={channel.id}
                className={`flex flex-col sm:flex-row sm:items-center justify-between gap-4 px-5 py-4 ${
                  channel.isActive ? "hover:bg-gray-50" : "bg-gray-50/70"
                }`}
              >
                <div className="flex items-start min-w-0">
                  <div
                    className={`h-10 w-10 shrink-0 rounded-md flex items-center justify-center mr-3 ${
                      channel.isActive
                        ? "bg-blue-50 text-blue-700"
                        : "bg-gray-200 text-gray-500"
                    }`}
                  >
                    <Headphones size={19} />
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-gray-900">
                        {channel.name}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                          channel.isActive
                            ? "bg-green-100 text-green-700"
                            : "bg-gray-200 text-gray-600"
                        }`}
                      >
                        {channel.isActive ? "Activo" : "Inhabilitado"}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-gray-500 break-words">
                      {channel.detail}
                    </p>
                    {!channel.isActive && channel.disabledByName && (
                      <p className="mt-1 text-xs text-gray-400">
                        Inhabilitado por {channel.disabledByName}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex justify-end gap-1 shrink-0">
                  <button
                    onClick={() => startEditing(channel)}
                    className="p-2 rounded-md text-blue-600 hover:bg-blue-50"
                    title="Editar medio"
                  >
                    <Pencil size={18} />
                  </button>
                  <button
                    onClick={() => setChannelToChange(channel)}
                    className={`p-2 rounded-md ${
                      channel.isActive
                        ? "text-red-600 hover:bg-red-50"
                        : "text-green-600 hover:bg-green-50"
                    }`}
                    title={channel.isActive ? "Inhabilitar medio" : "Reactivar medio"}
                  >
                    {channel.isActive ? <Ban size={18} /> : <RotateCcw size={18} />}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <ConfirmModal
        isOpen={!!channelToChange}
        onClose={() => setChannelToChange(null)}
        onConfirm={confirmStatusChange}
        title={channelToChange?.isActive ? "Inhabilitar medio" : "Reactivar medio"}
        message={
          channelToChange?.isActive
            ? `¿Deseas inhabilitar ${channelToChange.name}? Ya no podrá seleccionarse en nuevas atenciones, pero seguirá visible en el historial.`
            : `¿Deseas reactivar ${channelToChange?.name || "este medio"}? Volverá a estar disponible para nuevas atenciones.`
        }
        confirmLabel={channelToChange?.isActive ? "Inhabilitar" : "Reactivar"}
        isDanger={channelToChange?.isActive}
        isLoading={isChangingStatus}
      />
    </div>
  );
};

export default ServiceChannels;
