export interface AppFeature {
  text: string;
}

export interface AppConfig {
  /** Nombre corto que aparece en el encabezado del login */
  name: string;
  /** Nombre completo para el copyright y meta-información */
  fullName: string;
  /** Subtítulo debajo del nombre en el encabezado */
  tagline: string;
  /** Párrafo "Acerca de la aplicación" */
  description: string;
  /** Lista de características que se muestran en el panel izquierdo */
  features: AppFeature[];
  /** Texto del botón de inicio de sesión */
  loginButtonLabel: string;
  /** Texto de soporte visible en el footer */
  supportText: string;
}

const appConfig: AppConfig = {
  name: "Sistema de Atencion al Cliente",
  fullName: "Sistema de Atencion al Cliente",
  tagline: "Sistema de gestión de atención al cliente",
  description:
    "Esta es una aplicación base para la gestión de usuarios y administración de recursos. Utiliza tu cuenta institucional para acceder al sistema y gestionar la información de manera eficiente.",
  features: [
    { text: "Gestión de usuarios y permisos" },
    { text: "Panel de administración intuitivo" },
    { text: "Autenticación segura con Google" },
    { text: "Interfaz responsiva para todos los dispositivos" },
    { text: "Registro de atención al cliente" },
    { text: "Generación de reportes y estadísticas" },
  ],
  loginButtonLabel: "Iniciar sesión con Google",
  supportText: "Para soporte técnico, contacte al administrador del sistema.",
};

export default appConfig;
