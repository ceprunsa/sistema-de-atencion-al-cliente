import type { Client } from "../types";

type ClientIdentityCardProps = {
  client: Pick<Client, "dni" | "displayName" | "firstName" | "middleName" | "paternalSurname" | "maternalSurname" | "email" | "phone">;
  compact?: boolean;
};

const valueOrEmpty = (value: string | null | undefined) => value?.trim() || "No registrado";

const ClientIdentityCard = ({ client, compact = false }: ClientIdentityCardProps) => {
  const fields = [
    ["DNI", client.dni],
    ["Primer nombre", client.firstName],
    ["Segundo nombre", client.middleName],
    ["Apellido paterno", client.paternalSurname],
    ["Apellido materno", client.maternalSurname],
    ["Correo", client.email],
    ["Teléfono", client.phone],
  ] as const;

  return (
    <div className={compact ? "text-sm" : "rounded-md border border-gray-200 bg-gray-50 p-4"}>
      <p className="font-semibold text-gray-900">{valueOrEmpty(client.displayName)}</p>
      <dl className={`mt-2 grid gap-x-5 gap-y-2 ${compact ? "sm:grid-cols-2" : "md:grid-cols-2"}`}>
        {fields.map(([label, value]) => (
          <div key={label}>
            <dt className="text-xs font-medium text-gray-500">{label}</dt>
            <dd className="break-words text-gray-800">{valueOrEmpty(value)}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
};

export default ClientIdentityCard;
