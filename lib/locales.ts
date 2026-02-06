export type Language = 'en' | 'es'

export interface LocaleStrings {
  app: {
    title: string
    version: string
    tagline: string
  }
  header: {
    secure: string
    local: string
    remote: string
    offline: string
    connecting: string
  }
  footer: {
    donate: string
    madeWithLove: string
    hashtag: string
  }
  settings: {
    title: string
    desc: string
    wsUrl: string
    wsUrlPlaceholder: string
    wsUrlHint: string
    local: string
    connected: string
    localMode: string
    localModeDesc: string
    remote: string
    remoteMode: string
    remoteModeDesc: string
    joinCode: string
    joinCodePlaceholder: string
    joinCodeHint: string
    generateCode: string
    codeGenerated: string
    shareCode: string
    status: {
      connected: string
      notConnected: string
      connecting: string
      error: string
    }
    button: string
    connecting: string
    password: string
    passwordPlaceholder: string
    language: string
    languageEn: string
    languageEs: string
    desktopAgent: string
    desktopAgentDesc: string
    download: string
    downloadFor: string
    agentNote: string
    clearConnection: string
    clearConnectionDesc: string
    clearConnectionConfirm: string
    linkedCode: string
    recommended: string
    downloadCard: {
      windows: string
      macos: string
      linux: string
      windowsDesc: string
      macosDesc: string
      linuxDesc: string
    }
  }
    toasts: {
      connected: string
      disconnected: string
      connectionError: string
      saved: string
      deleted: string
      orderUpdated: string
      codeGenerated: string
      codeExpired: string
      langChanged: string
      agentNotRunning: string
      searchingAgent: string
      remoteEnabled: string
      localEnabled: string
      waitingForOBS: string
    }
    agent: {
      title: string
      desc: string
      download: string
      downloadLinux: string
      downloadMac: string
      downloadWindows: string
      note: string
    }
    dialogs: {
      editTitle: string
      addTitle: string
      label: string
      action: string
      target: string
      filter: string
      idleColor: string
      activeColor: string
      customColor: string
      buttonName: string
      selectTarget: string
      selectFilter: string
      save: string
      deleteTitle: string
      deleteDesc: string
      cancel: string
      delete: string
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
    ok: string
  }
  help: {
    title: string
    subtitle: string
    desktopTitle: string
    desktopDesc1: string
    desktopDesc2: string
    desktopDesc3: string
    remoteTitle: string
    remoteDesc1: string
    remoteDesc2: string
    remoteDesc3: string
    remoteDesc4: string
    tipsTitle: string
    tip1: string
    tip2: string
    tip3: string
    tip4: string
    gotIt: string
  }
}

export const locales: Record<Language, LocaleStrings> = {
  en: {
    app: {
      title: 'DockForLife',
      version: 'v1.0.0-beta',
      tagline: 'OBS Control',
    },
    header: {
      secure: 'Secure',
      local: 'LOCAL',
      remote: 'REMOTE',
      offline: 'OFFLINE',
      connecting: 'CONNECTING',
    },
    footer: {
      donate: 'Donate',
      madeWithLove: 'Made with love by',
      hashtag: '#verygoodforlife',
    },
    settings: {
      title: 'OBS Connection',
      desc: 'Configure how to connect to OBS',
      wsUrl: 'Local WebSocket URL',
      wsUrlPlaceholder: 'ws://127.0.0.1:4455',
      wsUrlHint: 'Default: ws://127.0.0.1:4455',
      local: 'Local',
      connected: 'Connected',
      localMode: 'Local Mode',
      localModeDesc: 'Connect directly to OBS on this device',
      remote: 'Remote',
      remoteMode: 'Remote Mode',
      remoteModeDesc: 'Generate a code to control OBS from another device',
      joinCode: 'Control Code',
      joinCodePlaceholder: 'Enter 8-character code',
      joinCodeHint: 'Share this code with another device',
      generateCode: 'Generate Remote Code',
      codeGenerated: 'Code generated! Share it with your mobile device',
      shareCode: 'Share this code:',
      status: {
        connected: 'Connected to OBS',
        notConnected: 'Not connected',
        connecting: 'Connecting...',
        error: 'Connection error',
      },
      button: 'Connect',
      connecting: 'Connecting...',
      password: 'Password (optional)',
      passwordPlaceholder: 'OBS WebSocket password',
      language: 'Language',
      languageEn: 'English',
      languageEs: 'Español',
      desktopAgent: 'Desktop Agent',
      desktopAgentDesc: 'Download for permanent remote access',
      download: 'Download',
      downloadFor: 'Download for',
      agentNote: 'Small executable (~7MB). No installation required.',
      clearConnection: 'Clear Connection',
      clearConnectionDesc: 'Remove the saved pairing code and disconnect',
      clearConnectionConfirm: 'Are you sure you want to clear the connection?',
      linkedCode: 'Linked Agent Code',
      recommended: 'Recommended',
      downloadCard: {
        windows: 'Windows',
        macos: 'macOS',
        linux: 'Linux',
        windowsDesc: 'For Windows 10/11',
        macosDesc: 'For macOS 11+',
        linuxDesc: 'For Ubuntu, Fedora, Debian',
      },
    },
    toasts: {
      connected: 'Connected to OBS',
      disconnected: 'Disconnected',
      connectionError: 'Failed to connect',
      saved: 'Button saved',
      deleted: 'Button deleted',
      orderUpdated: 'Order updated',
      codeGenerated: 'Remote code generated successfully',
      codeExpired: 'Code has expired. Please generate a new one.',
      langChanged: 'Language changed',
      agentNotRunning: 'Agent not running on this network',
      searchingAgent: 'Searching for local agent...',
      remoteEnabled: 'Remote mode enabled',
      localEnabled: 'Local mode enabled',
      waitingForOBS: 'Waiting for OBS data...',
    },
    agent: {
      title: 'Local Agent Required',
      desc: 'To connect remotely, you need the DockForLife agent running on your network.',
      download: 'Download Agent',
      downloadLinux: 'Download for Linux',
      downloadMac: 'Download for macOS',
      downloadWindows: 'Download for Windows',
      note: 'Small executable (~7MB). No installation required.',
    },
    dialogs: {
      editTitle: 'Edit Button',
      addTitle: 'Add Button',
      label: 'Label',
      action: 'Action',
      target: 'Target',
      filter: 'Filter',
      idleColor: 'Normal',
      activeColor: 'Active',
      customColor: 'Custom color',
      buttonName: 'Button name',
      selectTarget: 'Select target',
      selectFilter: 'Select filter',
      save: 'Save',
      deleteTitle: 'Delete button?',
      deleteDesc: 'This action cannot be undone.',
      cancel: 'Cancel',
      delete: 'Delete',
    },
    onboarding: {
      title: 'Welcome to DockForLife',
      subtitle: 'Control OBS from any device on your local network',
      requirements: 'Requirements:',
      req1Title: 'OBS Studio running',
      req1Desc: 'Make sure OBS is running',
      req2Title: 'WebSocket Server active',
      req2Desc: 'In OBS: Tools > WebSocket Server Settings',
      req3Title: 'Port 4455 (default)',
      req3Desc: 'You can change it in settings',
      setupButton: 'Setup Connection',
      gotIt: 'Got it',
    },
    security: {
      title: 'Security & Privacy',
      localData: '100% Local',
      localDataDesc: 'All data stored locally on your device.',
      noDataCollection: 'No data collection',
      noDataCollectionDesc: 'We do not collect any personal information.',
      directConnection: 'Direct connection',
      directConnectionDesc: 'Connects directly to OBS on your network.',
      offlineMode: 'Works offline',
      offlineModeDesc: 'App works without internet once loaded.',
      ok: 'Got it',
    },
    help: {
      title: 'How to use DockForLife',
      subtitle: 'Control OBS from any device',
      desktopTitle: 'Desktop / Web Mode',
      desktopDesc1: 'Connect directly to OBS via WebSocket (port 4455)',
      desktopDesc2: 'Create buttons for your favorite actions',
      desktopDesc3: 'Double-tap buttons to edit, drag to reorder',
      remoteTitle: 'Mobile / Remote Mode',
      remoteDesc1: 'Download the Local Agent on your computer',
      remoteDesc2: 'Run the agent - it will connect automatically',
      remoteDesc3: 'Enter the code on your phone to connect',
      remoteDesc4: 'Control OBS from anywhere!',
      tipsTitle: 'Tips',
      tip1: 'Double-tap any button to edit its action',
      tip2: 'Drag buttons to reorder them',
      tip3: 'Use the + button to add new actions',
      tip4: 'Available actions: Mute, Record, Stream, Change Scene, Toggle Filters',
      gotIt: 'Got it!',
    },
  },
  es: {
    app: {
      title: 'DockForLife',
      version: 'v1.0.0-beta',
      tagline: 'Control OBS',
    },
    header: {
      secure: 'Seguro',
      local: 'LOCAL',
      remote: 'REMOTO',
      offline: 'DESCONECTADO',
      connecting: 'CONECTANDO',
    },
    footer: {
      donate: 'Donar',
      madeWithLove: 'Hecho con amor por',
      hashtag: '#verygoodforlife',
    },
    settings: {
      title: 'Conexión OBS',
      desc: 'Configura cómo conectar a OBS',
      wsUrl: 'URL WebSocket Local',
      wsUrlPlaceholder: 'ws://127.0.0.1:4455',
      wsUrlHint: 'Por defecto: ws://127.0.0.1:4455',
      local: 'Local',
      connected: 'Conectado',
      localMode: 'Modo Local',
      localModeDesc: 'Conectar directamente a OBS en este dispositivo',
      remote: 'Remoto',
      remoteMode: 'Modo Remoto',
      remoteModeDesc: 'Generar un código para controlar OBS desde otro dispositivo',
      joinCode: 'Código de Control',
      joinCodePlaceholder: 'Ingresa código de 8 caracteres',
      joinCodeHint: 'Comparte este código con otro dispositivo',
      generateCode: 'Generar Código Remoto',
      codeGenerated: '¡Código generado! Compártelo con tu móvil',
      shareCode: 'Comparte este código:',
      status: {
        connected: 'Conectado a OBS',
        notConnected: 'No conectado',
        connecting: 'Conectando...',
        error: 'Error de conexión',
      },
      button: 'Conectar',
      connecting: 'Conectando...',
      password: 'Contraseña (opcional)',
      passwordPlaceholder: 'Contraseña de WebSocket OBS',
      language: 'Idioma',
      languageEn: 'English',
      languageEs: 'Español',
      desktopAgent: 'Agente de Escritorio',
      desktopAgentDesc: 'Descarga para acceso remoto permanente',
      download: 'Descargar',
      downloadFor: 'Descargar para',
      agentNote: 'Ejecutable pequeño (~7MB). No requiere instalación.',
      clearConnection: 'Limpiar Conexión',
      clearConnectionDesc: 'Eliminar el código de emparejamiento guardado',
      clearConnectionConfirm: '¿Estás seguro de que deseas limpar la conexión?',
      linkedCode: 'Código de Agente Vinculado',
      recommended: 'Recomendado',
      downloadCard: {
        windows: 'Windows',
        macos: 'macOS',
        linux: 'Linux',
        windowsDesc: 'Para Windows 10/11',
        macosDesc: 'Para macOS 11+',
        linuxDesc: 'Para Ubuntu, Fedora, Debian',
      },
    },
    toasts: {
      connected: 'Conectado a OBS',
      disconnected: 'Desconectado',
      connectionError: 'Error al conectar',
      saved: 'Botón guardado',
      deleted: 'Botón eliminado',
      orderUpdated: 'Orden actualizado',
      codeGenerated: 'Código remoto generado correctamente',
      codeExpired: 'El código ha expirado. Genera uno nuevo.',
      langChanged: 'Idioma cambiado',
      agentNotRunning: 'Agente no disponible en esta red',
      searchingAgent: 'Buscando agente local...',
      remoteEnabled: 'Modo remoto activado',
      localEnabled: 'Modo local activado',
      waitingForOBS: 'Esperando datos de OBS...',
    },
    agent: {
      title: 'Se Requiere Agente Local',
      desc: 'Para conectar remotamente, necesitas el agente de DockForLife corriendo en tu red.',
      download: 'Descargar Agente',
      downloadLinux: 'Descargar para Linux',
      downloadMac: 'Descargar para macOS',
      downloadWindows: 'Descargar para Windows',
      note: 'Ejecutable pequeño (~7MB). No requiere instalación.',
    },
    dialogs: {
      editTitle: 'Editar Botón',
      addTitle: 'Añadir Botón',
      label: 'Etiqueta',
      action: 'Acción',
      target: 'Objetivo',
      filter: 'Filtro',
      idleColor: 'Normal',
      activeColor: 'Activo',
      customColor: 'Color personalizado',
      buttonName: 'Nombre del botón',
      selectTarget: 'Seleccionar objetivo',
      selectFilter: 'Seleccionar filtro',
      save: 'Guardar',
      deleteTitle: '¿Eliminar botón?',
      deleteDesc: 'Esta acción no se puede deshacer.',
      cancel: 'Cancelar',
      delete: 'Eliminar',
    },
    onboarding: {
      title: 'Bienvenido a DockForLife',
      subtitle: 'Controla OBS desde cualquier dispositivo en tu red',
      requirements: 'Requisitos:',
      req1Title: 'OBS Studio abierto',
      req1Desc: 'Asegúrate de tener OBS ejecutándose',
      req2Title: 'WebSocket Server activo',
      req2Desc: 'En OBS: Herramientas > WebSocket Server Settings',
      req3Title: 'Puerto 4455 (por defecto)',
      req3Desc: 'Puedes cambiarlo en configuración',
      setupButton: 'Configurar conexión',
      gotIt: 'Entendido',
    },
    security: {
      title: 'Seguridad y Privacidad',
      localData: '100% Local',
      localDataDesc: 'Todos los datos se almacenan localmente.',
      noDataCollection: 'Sin recolección de datos',
      noDataCollectionDesc: 'No recopilamos información personal.',
      directConnection: 'Conexión directa',
      directConnectionDesc: 'Conecta directamente a OBS en tu red.',
      offlineMode: 'Funciona offline',
      offlineModeDesc: 'La app funciona sin internet una vez cargada.',
      ok: 'Entendido',
    },
    help: {
      title: 'Cómo usar DockForLife',
      subtitle: 'Controla OBS desde cualquier dispositivo',
      desktopTitle: 'Modo Escritorio / Web',
      desktopDesc1: 'Conecta directamente a OBS vía WebSocket (puerto 4455)',
      desktopDesc2: 'Crea botones para tus acciones favoritas',
      desktopDesc3: 'Doble toque para editar, arrastra para reordenar',
      remoteTitle: 'Modo Móvil / Remoto',
      remoteDesc1: 'Descarga el Agente Local en tu computadora',
      remoteDesc2: 'Ejecuta el agente - se conectará automáticamente',
      remoteDesc3: 'Ingresa el código en tu teléfono para conectar',
      remoteDesc4: '¡Controla OBS desde cualquier lugar!',
      tipsTitle: 'Consejos',
      tip1: 'Doble toque en cualquier botón para editar su acción',
      tip2: 'Arrastra los botones para reordenarlos',
      tip3: 'Usa el botón + para agregar nuevas acciones',
      tip4: 'Acciones disponibles: Mute, Grabar, Transmitir, Cambiar Escena, Filtros',
      gotIt: '¡Entendido!',
    },
  },
}

export function detectBrowserLanguage(): Language {
  if (typeof window === 'undefined') return 'en'
  
  const browserLang = navigator.language?.toLowerCase() || ''
  
  if (browserLang.startsWith('es')) {
    return 'es'
  }
  return 'en'
}

export function getLocaleStrings(lang: Language): LocaleStrings {
  return locales[lang]
}
