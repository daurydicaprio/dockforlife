export type Language = "en" | "es"

export interface UIStrings {
  app: {
    title: string
    version: string
    tagline: string
  }
  header: {
    secure: string
    online: string
    offline: string
  }
  footer: {
    donate: string
    madeWithLove: string
    hashtag: string
  }
  onboarding: {
    title: string
    subtitle: string
    requirements: string
    req1Title: string
    req1Desc: string
    req2Title: string
    req2Desc: string
    req3Title: string
    req3Desc: string
    remoteTip: string
    remoteTipExample: string
    setupButton: string
    gotIt: string
  }
  security: {
    title: string
    localData: string
    localDataDesc: string
    noDataCollection: string
    noDataCollectionDesc: string
    directConnection: string
    directConnectionDesc: string
    offlineMode: string
    offlineModeDesc: string
    privacyNote: string
    ok: string
  }
  buttonConfig: {
    title: string
    label: string
    action: string
    target: string
    filter: string
    color: string
    save: string
    delete: string
    actions: {
      mute: string
      visibility: string
      filter: string
      scene: string
      record: string
      stream: string
    }
  }
  settings: {
    title: string
    wsUrl: string
    wsUrlPlaceholder: string
    wsUrlHint: string
    remoteUrl: string
    remoteUrlPlaceholder: string
    remoteUrlHint: string
    joinCode: string
    joinCodePlaceholder: string
    joinCodeHint: string
    password: string
    passwordPlaceholder: string
    status: {
      connected: string
      notConnected: string
      localMode: string
      remoteMode: string
    }
    language: string
    languageSelect: string
    languageEn: string
    languageEs: string
    desktopAgent: string
    desktopAgentDesc: string
    download: string
    downloadFor: string
    noInstall: string
    agentNote: string
    button: string
    connecting: string
  }
  toasts: {
    connected: string
    connectionError: string
    saved: string
    deleted: string
    orderUpdated: string
    notConnected: string
    actionFailed: string
    notFound: string
    langChanged: string
  }
  dialogs: {
    deleteTitle: string
    deleteDesc: string
    cancel: string
    delete: string
  }
}

export const strings: Record<Language, UIStrings> = {
  en: {
    app: {
      title: "DockForLife",
      version: "v0.001 BETA",
      tagline: "OBS Control",
    },
    header: {
      secure: "Secure",
      online: "ONLINE",
      offline: "OFFLINE",
    },
    footer: {
      donate: "Donate",
      madeWithLove: "Made with love by",
      hashtag: "#verygoodforlife",
    },
    onboarding: {
      title: "Welcome to DockForLife",
      subtitle: "Control OBS from any device on your local network",
      requirements: "Requirements:",
      req1Title: "OBS Studio running",
      req1Desc: "Make sure OBS is running",
      req2Title: "WebSocket Server active",
      req2Desc: "In OBS: Tools > WebSocket Server Settings",
      req3Title: "Port 4455 (default)",
      req3Desc: "You can change it in settings",
      remoteTip: "To use from another device:",
      remoteTipExample: "Use your PC's IP instead of 127.0.0.1",
      setupButton: "Setup Connection",
      gotIt: "Got it",
    },
    security: {
      title: "Security & Privacy",
      localData: "100% Local",
      localDataDesc:
        "All your data is stored ONLY on your device using localStorage. We don't use external servers.",
      noDataCollection: "No data collection",
      noDataCollectionDesc:
        "We don't collect, store, or transmit any personal or usage information.",
      directConnection: "Direct connection",
      directConnectionDesc:
        "The app connects directly to OBS on your local network. There are no intermediaries.",
      offlineMode: "Works offline",
      offlineModeDesc:
        "Once installed, the app works without internet. You only need a connection to your local network for OBS.",
      privacyNote:
        "Your configuration and buttons are saved locally. You can delete them anytime by clearing site data.",
      ok: "Got it",
    },
    buttonConfig: {
      title: "Configure Button",
      label: "Label",
      action: "Action",
      target: "Target",
      filter: "Filter",
      color: "Color",
      save: "Save",
      delete: "Delete",
      actions: {
        mute: "Mute Audio",
        visibility: "Toggle Visibility",
        filter: "Toggle Filter",
        scene: "Switch Scene",
        record: "Record",
        stream: "Stream",
      },
    },
    settings: {
      title: "OBS Connection",
      wsUrl: "WebSocket URL",
      wsUrlPlaceholder: "ws://127.0.0.1:4455",
      wsUrlHint: "Use your PC's IP for another device",
      remoteUrl: "Remote URL (Cloudflare)",
      remoteUrlPlaceholder: "wss://your-worker.workers.dev",
      remoteUrlHint: "Optional: Connect via Cloudflare Worker",
      joinCode: "Join Code",
      joinCodePlaceholder: "abc123-xxy789",
      joinCodeHint: "Optional: Code from your Cloudflare tunnel",
      password: "Password (optional)",
      passwordPlaceholder: "OBS WebSocket password",
      status: {
        connected: "Connected to OBS",
        notConnected: "Not connected",
        localMode: "Local Mode",
        remoteMode: "Remote Mode",
      },
      language: "Language",
      languageSelect: "Select language",
      languageEn: "English",
      languageEs: "Español",
      desktopAgent: "Desktop Agent",
      desktopAgentDesc: "Download the local agent for remote access",
      download: "Download",
      downloadFor: "Download for",
      noInstall: "No installation required",
      agentNote: "Small executable (~7MB). Runs in background.",
      button: "Connect",
      connecting: "Connecting...",
    },
    toasts: {
      connected: "Connected to OBS",
      connectionError: "Failed to connect to OBS",
      saved: "Button saved",
      deleted: "Button deleted",
      orderUpdated: "Order updated",
      notConnected: "Not connected to OBS",
      actionFailed: "Action failed",
      notFound: "not found",
      langChanged: "Language changed",
    },
    dialogs: {
      deleteTitle: "Delete button?",
      deleteDesc: "This action cannot be undone.",
      cancel: "Cancel",
      delete: "Delete",
    },
  },
  es: {
    app: {
      title: "DockForLife",
      version: "v0.001 BETA",
      tagline: "Control OBS",
    },
    header: {
      secure: "Seguro",
      online: "ONLINE",
      offline: "OFFLINE",
    },
    footer: {
      donate: "Donar",
      madeWithLove: "Hecho con amor por",
      hashtag: "#verygoodforlife",
    },
    onboarding: {
      title: "Bienvenido a DockForLife",
      subtitle: "Controla OBS desde cualquier dispositivo en tu red local",
      requirements: "Requisitos:",
      req1Title: "OBS Studio abierto",
      req1Desc: "Asegúrate de tener OBS ejecutándose",
      req2Title: "WebSocket Server activo",
      req2Desc: "En OBS: Herramientas > Configuración de WebSocket Server",
      req3Title: "Puerto 4455 (por defecto)",
      req3Desc: "Puedes cambiarlo en configuración",
      remoteTip: "Para usar desde otro dispositivo:",
      remoteTipExample: "Usa la IP de tu PC en lugar de 127.0.0.1",
      setupButton: "Configurar conexión",
      gotIt: "Entendido",
    },
    security: {
      title: "Seguridad y Privacidad",
      localData: "100% Local",
      localDataDesc:
        "Todos tus datos se almacenan SOLO en tu dispositivo usando localStorage. No usamos servidores externos.",
      noDataCollection: "Sin recolección de datos",
      noDataCollectionDesc:
        "No recopilamos, almacenamos ni transmitimos ninguna información personal o de uso.",
      directConnection: "Conexión directa",
      directConnectionDesc:
        "La app se conecta directamente a OBS en tu red local. No hay intermediarios.",
      offlineMode: "Funciona offline",
      offlineModeDesc:
        "Una vez instalada, la app funciona sin internet. Solo necesitas conexión a tu red local para OBS.",
      privacyNote:
        "Tu configuración y botones se guardan localmente. Puedes borrarlos en cualquier momento limpiando los datos del sitio.",
      ok: "Entendido",
    },
    buttonConfig: {
      title: "Configurar botón",
      label: "Etiqueta",
      action: "Acción",
      target: "Objetivo",
      filter: "Filtro",
      color: "Color",
      save: "Guardar",
      delete: "Eliminar",
      actions: {
        mute: "Silenciar Audio",
        visibility: "Alternar Visibilidad",
        filter: "Alternar Filtro",
        scene: "Cambiar Escena",
        record: "Grabar",
        stream: "Transmitir",
      },
    },
    settings: {
      title: "Conexión OBS",
      wsUrl: "URL WebSocket",
      wsUrlPlaceholder: "ws://127.0.0.1:4455",
      wsUrlHint: "Para otro dispositivo usa la IP de tu PC",
      remoteUrl: "URL Remota (Cloudflare)",
      remoteUrlPlaceholder: "wss://tu-worker.workers.dev",
      remoteUrlHint: "Opcional: Conectar vía Cloudflare Worker",
      joinCode: "Código de Unión",
      joinCodePlaceholder: "abc123-xxy789",
      joinCodeHint: "Opcional: Código de tu túnel Cloudflare",
      password: "Contraseña (opcional)",
      passwordPlaceholder: "Contraseña de WebSocket OBS",
      status: {
        connected: "Conectado a OBS",
        notConnected: "No conectado",
        localMode: "Modo Local",
        remoteMode: "Modo Remoto",
      },
      language: "Idioma",
      languageSelect: "Seleccionar idioma",
      languageEn: "English",
      languageEs: "Español",
      desktopAgent: "Agente de Escritorio",
      desktopAgentDesc: "Descarga el agente local para acceso remoto",
      download: "Descargar",
      downloadFor: "Descargar para",
      noInstall: "No requiere instalación",
      agentNote: "Ejecutable pequeño (~7MB). Funciona en segundo plano.",
      button: "Conectar",
      connecting: "Conectando...",
    },
    toasts: {
      connected: "Conectado a OBS",
      connectionError: "Error al conectar con OBS",
      saved: "Botón guardado",
      deleted: "Botón eliminado",
      orderUpdated: "Orden actualizado",
      notConnected: "No conectado a OBS",
      actionFailed: "Acción fallida",
      notFound: "no encontrado",
      langChanged: "Idioma cambiado",
    },
    dialogs: {
      deleteTitle: "¿Eliminar botón?",
      deleteDesc: "Esta acción no se puede deshacer.",
      cancel: "Cancelar",
      delete: "Eliminar",
    },
  },
}

export function getStrings(lang: Language): UIStrings {
  return strings[lang]
}

export function detectBrowserLanguage(): Language {
  if (typeof window === "undefined") return "en"
  
  const browserLang = navigator.language?.toLowerCase() || ""
  
  if (browserLang.startsWith("es")) {
    return "es"
  }
  return "en"
}
