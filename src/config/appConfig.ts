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
  name: "Registro de Atención al Cliente",
  fullName: "Sistema de Registro de Atención al Cliente de CEPRUNSA",
  tagline: "Atenciones, derivaciones y satisfacción en un solo lugar",
  description:
    "Plataforma institucional para registrar y dar seguimiento a las atenciones brindadas por CEPRUNSA. Centraliza la identificación del cliente, las consultas, las derivaciones entre áreas y las encuestas de satisfacción.",
  features: [
    { text: "Registro y seguimiento de atenciones con código RAC" },
    { text: "Consulta de DNI y gestión de datos del cliente" },
    { text: "Derivaciones y buzón de trabajo por áreas" },
    { text: "Encuestas de satisfacción por tablet y correo" },
    { text: "Administración de usuarios, áreas y mesas de atención" },
    { text: "Acceso institucional con roles y permisos" },
  ],
  loginButtonLabel: "Iniciar sesión con Google",
  supportText: "Para soporte técnico, comunícate con el administrador del sistema de CEPRUNSA.",
};

export default appConfig;
