import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, Loader2, LogIn, LogOut, Maximize2, Minimize2, MonitorSmartphone, Star, Sun } from "lucide-react";
import toast, { Toaster } from "react-hot-toast";
import Logo from "../components/Logo";
import { surveysApi } from "../api/surveys";
import { supabase } from "../supabase/config";
import { useAuthStore } from "../store/authStore";
import type { SurveyResponse, TabletBinding, TabletSurvey } from "../types";

const RESPONSES: Array<{ value: SurveyResponse; label: string; color: string }> = [
  { value: "VERY_SATISFIED", label: "Muy satisfecho", color: "bg-green-600 hover:bg-green-700" },
  { value: "SATISFIED", label: "Satisfecho", color: "bg-lime-600 hover:bg-lime-700" },
  { value: "DISSATISFIED", label: "Insatisfecho", color: "bg-orange-500 hover:bg-orange-600" },
  { value: "VERY_DISSATISFIED", label: "Muy insatisfecho", color: "bg-red-600 hover:bg-red-700" },
];

type WakeLockSentinelLike = {
  release: () => Promise<void>;
  addEventListener: (type: "release", listener: () => void) => void;
};

type NavigatorWithWakeLock = Navigator & {
  wakeLock?: { request: (type: "screen") => Promise<WakeLockSentinelLike> };
};

const Tablet = () => {
  const { user, loading, initialized } = useAuthStore();
  const [binding, setBinding] = useState<TabletBinding | null>(null);
  const [survey, setSurvey] = useState<TabletSurvey | null>(null);
  const [checking, setChecking] = useState(true);
  const [working, setWorking] = useState(false);
  const [finished, setFinished] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [wakeLockActive, setWakeLockActive] = useState(false);
  const wakeLockRef = useRef<WakeLockSentinelLike | null>(null);
  const wakeLockSupported = typeof navigator !== "undefined" && "wakeLock" in navigator;

  const releaseWakeLock = useCallback(async () => {
    const currentLock = wakeLockRef.current;
    wakeLockRef.current = null;
    setWakeLockActive(false);
    if (currentLock) await currentLock.release().catch(() => undefined);
  }, []);

  const requestWakeLock = useCallback(async (showError = true) => {
    const wakeLock = (navigator as NavigatorWithWakeLock).wakeLock;
    if (!wakeLock) {
      if (showError) toast.error("Este navegador no permite impedir la suspensión. Configura manualmente la pantalla de la tablet para que permanezca encendida.");
      return;
    }
    if (wakeLockRef.current) return;
    try {
      const sentinel = await wakeLock.request("screen");
      wakeLockRef.current = sentinel;
      setWakeLockActive(true);
      sentinel.addEventListener("release", () => {
        if (wakeLockRef.current === sentinel) wakeLockRef.current = null;
        setWakeLockActive(false);
      });
    } catch (error) {
      if (showError) {
        toast.error(error instanceof Error
          ? `No se pudo mantener la pantalla activa: ${error.message}`
          : "No se pudo mantener la pantalla activa. Revisa el permiso del navegador.");
      }
    }
  }, []);

  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else {
        await document.documentElement.requestFullscreen();
        await requestWakeLock(false);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo cambiar a pantalla completa.");
    }
  };

  const refresh = useCallback(async () => {
    if (!binding) return;
    try { setSurvey(await surveysApi.getCurrent()); }
    catch (error) { toast.error(error instanceof Error ? error.message : "No se pudo consultar la encuesta."); }
  }, [binding]);

  useEffect(() => {
    if (!initialized || loading) return;
    if (!user) { setBinding(null); setChecking(false); return; }
    void surveysApi.getBinding().then(setBinding).catch((error) => toast.error(error.message)).finally(() => setChecking(false));
  }, [initialized, loading, user]);

  useEffect(() => { if (binding) void refresh(); }, [binding, refresh]);

  useEffect(() => {
    const updateFullscreen = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", updateFullscreen);
    return () => document.removeEventListener("fullscreenchange", updateFullscreen);
  }, []);

  useEffect(() => {
    if (!binding) return;
    void requestWakeLock(false);
    const restoreWakeLock = () => {
      if (document.visibilityState === "visible") void requestWakeLock(false);
    };
    document.addEventListener("visibilitychange", restoreWakeLock);
    return () => document.removeEventListener("visibilitychange", restoreWakeLock);
  }, [binding, requestWakeLock]);

  useEffect(() => () => { void releaseWakeLock(); }, [releaseWakeLock]);

  useEffect(() => {
    if (!binding) return;
    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    void supabase.realtime.setAuth().then(() => {
      if (cancelled) return;
      channel = supabase.channel(`workstation:${binding.workstationId}`, { config: { private: true } })
        .on("broadcast", { event: "survey_changed" }, () => void refresh())
        .subscribe((status) => { if (status === "SUBSCRIBED") void refresh(); });
    });
    const online = () => void refresh();
    window.addEventListener("online", online);
    return () => { cancelled = true; window.removeEventListener("online", online); if (channel) void supabase.removeChannel(channel); };
  }, [binding, refresh]);

  const login = async () => {
    const { error } = await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: `${window.location.origin}/tablet` } });
    if (error) toast.error(error.message);
  };
  const activate = async () => {
    setWorking(true);
    try {
      setBinding(await surveysApi.activate());
      await requestWakeLock(false);
      toast.success("Tablet vinculada correctamente.");
    }
    catch (error) { toast.error(error instanceof Error ? error.message : "No se pudo vincular la tablet."); }
    finally { setWorking(false); }
  };
  const closeSurvey = async (action: () => Promise<void>) => {
    setWorking(true);
    try {
      await action(); setSurvey(null); setFinished(true);
      window.setTimeout(() => { setFinished(false); void refresh(); }, 2500);
    } catch (error) { toast.error(error instanceof Error ? error.message : "No se pudo registrar la respuesta."); }
    finally { setWorking(false); }
  };
  const logout = async () => {
    setWorking(true);
    try { if (binding) await surveysApi.deactivate(); await releaseWakeLock(); await supabase.auth.signOut({ scope: "local" }); setBinding(null); }
    catch (error) { toast.error(error instanceof Error ? error.message : "No se pudo cerrar la sesión."); }
    finally { setWorking(false); }
  };

  if (!initialized || loading || checking) return <div className="flex min-h-screen items-center justify-center bg-slate-50"><Loader2 className="animate-spin text-[#1A2855]" size={42} /></div>;

  return <main className="relative flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 to-blue-100 p-6">
    <Toaster position="top-center" />
    <div className="fixed right-4 top-4 z-20 flex flex-wrap justify-end gap-2">
      {binding && (
        <button
          type="button"
          onClick={() => void requestWakeLock(true)}
          className={`inline-flex items-center rounded-full border px-3 py-2 text-sm font-medium shadow-sm ${wakeLockActive ? "border-green-200 bg-green-50 text-green-700" : "border-gray-200 bg-white text-gray-700"}`}
          title={wakeLockSupported ? "Evitar que la pantalla se suspenda" : "Función no disponible en este navegador"}
        >
          <Sun className="mr-2 h-4 w-4" />
          {wakeLockActive ? "Pantalla activa" : "Mantener activa"}
        </button>
      )}
      <button
        type="button"
        onClick={() => void toggleFullscreen()}
        className="inline-flex items-center rounded-full border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
        title={isFullscreen ? "Salir de pantalla completa" : "Mostrar en pantalla completa"}
      >
        {isFullscreen ? <Minimize2 className="mr-2 h-4 w-4" /> : <Maximize2 className="mr-2 h-4 w-4" />}
        {isFullscreen ? "Salir" : "Pantalla completa"}
      </button>
    </div>
    <section className="w-full max-w-3xl rounded-3xl bg-white p-8 text-center shadow-xl md:p-12">
      <Logo className="mx-auto h-20 w-auto" />
      {!user ? <><h1 className="mt-8 text-3xl font-bold text-[#1A2855]">Tablet de satisfacción</h1><p className="mt-3 text-gray-500">Inicia sesión con la cuenta del usuario responsable de esta mesa.</p><button onClick={login} className="btn btn-primary mt-8 inline-flex items-center"><LogIn size={20} className="mr-2" />Iniciar sesión</button></> : !binding ? <><MonitorSmartphone className="mx-auto mt-8 text-[#1A2855]" size={58} /><h1 className="mt-4 text-2xl font-bold">Activar esta tablet</h1><p className="mt-2 text-gray-500">Sesión de {user.displayName}. La mesa debe estar asignada previamente.</p><button disabled={working} onClick={activate} className="btn btn-primary mt-7">{working ? "Vinculando..." : "Vincular a mi mesa"}</button><button disabled={working} onClick={logout} className="mt-5 block w-full text-sm text-gray-500 hover:underline">Cerrar esta sesión</button></> : finished ? <><CheckCircle2 className="mx-auto mt-8 text-green-600" size={76} /><h1 className="mt-5 text-3xl font-bold text-gray-900">Gracias por tu respuesta</h1><p className="mt-2 text-gray-500">Tu opinión fue registrada correctamente.</p></> : survey ? <><h1 className="mt-7 text-3xl font-bold text-gray-900">¿Qué tan satisfecho estás con la atención recibida?</h1><div className="mt-8 grid gap-4 sm:grid-cols-2">{RESPONSES.map((response) => <button key={response.value} disabled={working} onClick={() => closeSurvey(() => surveysApi.answer(survey.id, response.value))} className={`${response.color} flex min-h-24 items-center justify-center rounded-2xl px-5 text-xl font-semibold text-white shadow disabled:opacity-50`}><Star className="mr-3" />{response.label}</button>)}</div><button disabled={working} onClick={() => closeSurvey(() => surveysApi.skipFromTablet(survey.id))} className="mt-7 text-base font-medium text-gray-500 hover:text-gray-800 hover:underline">Omitir encuesta</button></> : <><div className="mx-auto mt-8 h-20 w-20 animate-pulse rounded-full bg-[#1A2855]/10 p-5"><MonitorSmartphone className="h-full w-full text-[#1A2855]" /></div><h1 className="mt-5 text-3xl font-bold text-[#1A2855]">En espera</h1><p className="mt-2 text-gray-500">Mesa {binding.workstationName}. La próxima encuesta aparecerá automáticamente.</p><button disabled={working} onClick={logout} className="mt-10 inline-flex items-center text-sm text-gray-400 hover:text-red-600"><LogOut size={16} className="mr-2" />Desvincular y cerrar sesión</button></>}
    </section>
  </main>;
};

export default Tablet;
