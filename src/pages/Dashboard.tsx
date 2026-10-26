import { useState, type FormEvent } from "react";
import { BarChart3, ClipboardList, Filter, GitBranch, Loader2, Star } from "lucide-react";
import { CartesianGrid, Line, LineChart, Tooltip, XAxis, YAxis } from "recharts";
import toast from "react-hot-toast";
import { useAdmissionProcesses } from "../hooks/useAdmissionProcesses";
import { useDashboardStatistics } from "../hooks/useDashboardStatistics";
import type { DashboardBreakdownItem } from "../types";
import { formatAdmissionProcess } from "../utils/admissionProcesses";

const toDateInput = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const today = new Date();
const DEFAULT_TO = toDateInput(today);
const DEFAULT_FROM = toDateInput(new Date(today.getFullYear(), today.getMonth(), 1));

const Breakdown = ({ title, items, empty }: { title: string; items: DashboardBreakdownItem[]; empty: string }) => {
  const maximum = Math.max(1, ...items.map((item) => item.count));
  return (
    <section className="rounded-lg border border-gray-100 bg-white p-5 shadow-sm">
      <h2 className="font-semibold text-gray-900">{title}</h2>
      {items.length === 0 ? <p className="mt-4 text-sm text-gray-400">{empty}</p> : (
        <div className="mt-4 space-y-4">
          {items.map((item) => (
            <div key={item.key}>
              <div className="mb-1 flex justify-between gap-3 text-sm"><span className="truncate text-gray-700">{item.label}</span><span className="font-semibold text-gray-900">{item.count}</span></div>
              <div className="h-2 overflow-hidden rounded-full bg-gray-100"><div className="h-full rounded-full bg-[#1A2855]" style={{ width: `${Math.max(3, (item.count / maximum) * 100)}%` }} /></div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
};

const AttentionTrendChart = ({ items, granularity }: { items: DashboardBreakdownItem[]; granularity: "DAY" | "MONTH" }) => {
  if (items.length === 0) return <p className="mt-4 text-sm text-gray-400">No hay periodos disponibles.</p>;

  return (
    <div
      className="mt-4 h-72 min-w-0"
      role="img"
      aria-label={`Atenciones por ${granularity === "DAY" ? "día" : "mes"}`}
    >
      <LineChart
        responsive
        data={items}
        margin={{ top: 12, right: 18, bottom: 4, left: -10 }}
        style={{ width: "100%", height: "100%" }}
      >
        <CartesianGrid stroke="#e5e7eb" strokeDasharray="3 3" vertical={false} />
        <XAxis
          dataKey="label"
          axisLine={false}
          tickLine={false}
          tick={{ fill: "#6b7280", fontSize: 11 }}
          interval="preserveStartEnd"
          minTickGap={granularity === "DAY" ? 28 : 16}
        />
        <YAxis
          allowDecimals={false}
          axisLine={false}
          tickLine={false}
          tick={{ fill: "#6b7280", fontSize: 11 }}
          width={42}
        />
        <Tooltip
          formatter={(value) => [`${Number(value)} atenciones`, "Cantidad"]}
          labelFormatter={(label) => `${granularity === "DAY" ? "Día" : "Mes"}: ${String(label)}`}
          contentStyle={{ borderColor: "#e5e7eb", borderRadius: 8, fontSize: 13 }}
        />
        <Line
          type="monotone"
          dataKey="count"
          name="Atenciones"
          stroke="#1A2855"
          strokeWidth={3}
          dot={items.length <= 35 ? { r: 3, fill: "#2563eb", strokeWidth: 0 } : false}
          activeDot={{ r: 5, fill: "#2563eb", strokeWidth: 0 }}
        />
      </LineChart>
    </div>
  );
};

const Dashboard = () => {
  const processes = useAdmissionProcesses();
  const [draftFrom, setDraftFrom] = useState(DEFAULT_FROM);
  const [draftTo, setDraftTo] = useState(DEFAULT_TO);
  const [draftProcess, setDraftProcess] = useState("");
  const [filters, setFilters] = useState({ dateFrom: DEFAULT_FROM, dateTo: DEFAULT_TO, admissionProcessId: "" });
  const statistics = useDashboardStatistics(filters);

  const applyFilters = (event: FormEvent) => {
    event.preventDefault();
    if (!draftFrom || !draftTo || draftFrom > draftTo) return toast.error("Selecciona un rango de fechas válido.");
    setFilters({ dateFrom: draftFrom, dateTo: draftTo, admissionProcessId: draftProcess });
  };

  const data = statistics.data;
  return (
    <div className="mx-auto max-w-7xl">
      <div className="mb-7">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="mt-1 text-sm text-gray-500">Indicadores agregados del servicio de atención al cliente.</p>
      </div>

      <form onSubmit={applyFilters} className="mb-5 rounded-lg border border-gray-200 bg-white p-3 shadow-sm">
        <div className="grid items-end gap-2 sm:grid-cols-2 lg:grid-cols-[140px_140px_minmax(240px,1fr)_100px]">
          <div><label className="block text-xs font-medium text-gray-600">Desde</label><input type="date" value={draftFrom} onChange={(event) => setDraftFrom(event.target.value)} className="mt-0.5 block h-9 w-full rounded-md border-gray-300 px-2 py-1 text-sm" /></div>
          <div><label className="block text-xs font-medium text-gray-600">Hasta</label><input type="date" value={draftTo} onChange={(event) => setDraftTo(event.target.value)} className="mt-0.5 block h-9 w-full rounded-md border-gray-300 px-2 py-1 text-sm" /></div>
          <div className="sm:col-span-2 lg:col-span-1"><label className="block text-xs font-medium text-gray-600">Proceso de admisión</label><select value={draftProcess} onChange={(event) => setDraftProcess(event.target.value)} className="mt-0.5 block h-9 w-full rounded-md border-gray-300 py-1 pl-2 pr-8 text-sm"><option value="">Todos los procesos</option>{processes.processes.map((process) => <option key={process.id} value={process.id}>{formatAdmissionProcess(process)}</option>)}</select></div>
          <button type="submit" className="inline-flex h-9 items-center justify-center self-end rounded-md bg-[#1A2855] px-4 text-sm font-medium leading-none text-white transition-colors hover:bg-[#27396f] focus:outline-none focus:ring-2 focus:ring-[#1A2855]/40 sm:col-span-2 lg:col-span-1"><Filter size={15} className="mr-1.5" />Filtrar</button>
        </div>
      </form>

      {statistics.isLoading ? <div className="flex items-center justify-center gap-2 py-20 text-gray-500"><Loader2 className="animate-spin" />Calculando estadísticas...</div> : statistics.isError || !data ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-red-700">{statistics.error instanceof Error ? statistics.error.message : "No se pudieron cargar las estadísticas."}</div>
      ) : (
        <>
          <div className="mb-5 rounded-md bg-blue-50 p-4 text-sm text-blue-900">
            {data.scope === "GLOBAL" ? "Vista global de administración." : "Se muestran únicamente las atenciones registradas por tu usuario."}
            {" "}Las métricas excluyen atenciones inhabilitadas. Atenciones usan su fecha de registro; derivaciones y encuestas usan la fecha de creación de cada evento.
          </div>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-lg bg-white p-5 shadow-sm"><ClipboardList className="text-blue-700" /><p className="mt-3 text-sm text-gray-500">Atenciones activas</p><p className="text-3xl font-bold">{data.totalAttentions}</p></div>
            <div className="rounded-lg bg-white p-5 shadow-sm"><GitBranch className="text-violet-700" /><p className="mt-3 text-sm text-gray-500">Derivaciones</p><p className="text-3xl font-bold">{data.referrals.total}</p><p className="mt-1 text-xs text-gray-500">{data.referrals.pending} pendientes · {data.referrals.resolved} resueltas</p></div>
            <div className="rounded-lg bg-white p-5 shadow-sm"><Star className="text-amber-500" /><p className="mt-3 text-sm text-gray-500">Satisfacción general</p><p className="text-3xl font-bold">{data.satisfaction.score === null ? "Sin datos" : `${data.satisfaction.score}%`}</p><p className="mt-1 text-xs text-gray-500">Base: {data.satisfaction.validResponses} respuestas válidas</p></div>
            <div className="rounded-lg bg-white p-5 shadow-sm"><BarChart3 className="text-emerald-700" /><p className="mt-3 text-sm text-gray-500">Encuestas completadas</p><p className="text-3xl font-bold">{data.surveys.reduce((sum, item) => sum + item.completed, 0)}</p><p className="mt-1 text-xs text-gray-500">Atención y derivación</p></div>
          </div>

          <section className="mt-6 rounded-lg border border-gray-100 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-baseline justify-between gap-2"><h2 className="font-semibold text-gray-900">Atenciones por {data.trendGranularity === "DAY" ? "día" : "mes"}</h2><p className="text-xs text-gray-500">Los periodos sin atenciones se muestran en cero.</p></div>
            <AttentionTrendChart items={data.attentionTrend} granularity={data.trendGranularity} />
          </section>

          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <Breakdown title="Atenciones por medio" items={data.byChannel} empty="Sin atenciones en el periodo." />
            <Breakdown title="Atenciones por mesa" items={data.byWorkstation} empty="Sin mesas asociadas en el periodo." />
            <Breakdown title="Atenciones por proceso" items={data.byAdmissionProcess} empty="No hay etiquetas asignadas en el periodo." />
            <Breakdown title="Distribución de satisfacción" items={data.satisfaction.responses} empty="Sin respuestas válidas." />
          </div>

          <section className="mt-6 rounded-lg border border-gray-100 bg-white p-5 shadow-sm">
            <h2 className="font-semibold text-gray-900">Estado de encuestas</h2>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              {data.surveys.map((survey) => <div key={survey.kind} className="rounded-md border p-4"><h3 className="font-medium">{survey.kind === "ATTENTION" ? "Encuestas de atención" : "Encuestas de derivación"}</h3><dl className="mt-3 grid grid-cols-2 gap-3 text-sm"><div><dt className="text-gray-500">Completadas</dt><dd className="text-xl font-semibold">{survey.completed}</dd></div><div><dt className="text-gray-500">Omitidas</dt><dd className="text-xl font-semibold">{survey.skipped}</dd></div><div><dt className="text-gray-500">Pendientes</dt><dd className="text-xl font-semibold">{survey.pending}</dd></div><div><dt className="text-gray-500">Canceladas</dt><dd className="text-xl font-semibold">{survey.cancelled}</dd></div></dl></div>)}
            </div>
            <p className="mt-4 text-xs text-gray-500">El indicador usa 100 puntos para “Muy satisfecho”, 75 para “Satisfecho”, 25 para “Insatisfecho” y 0 para “Muy insatisfecho”. Las encuestas pendientes, omitidas o canceladas no se consideran respuestas válidas.</p>
          </section>
        </>
      )}
    </div>
  );
};

export default Dashboard;
