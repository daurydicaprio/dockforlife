# Análisis Técnico: OBS-Dock Online - Arquitectura WebSocket & Cloudflare Workers

## 📊 Resumen Ejecutivo

Este análisis identifica la **causa raíz** del fallo en conexiones móviles mediante códigos de emparejamiento y propone una arquitectura de Relay optimizada para minimizar la latencia.

**Estado Actual**: El sistema funciona en modo local (Desktop ↔ OBS) pero falla completamente en modo remoto (Móvil → Worker → Proxy → OBS).

---

## 🗺️ 1. MAPEO DEL FLUJO DE DATOS

### 1.1 Arquitectura General

```
┌─────────────────┐     WSS      ┌──────────────────┐     WS       ┌─────────────┐     WS       ┌─────────────┐
│                 │──────────────│                  │──────────────│             │──────────────│             │
│  Móvil/Navegador│   HTTPS      │  Cloudflare      │              │  Proxy Go   │              │  OBS Studio │
│  (Cliente)      │              │  Worker (Relay)  │              │  (Agente)   │              │  (Puerto    │
│                 │              │                  │              │             │              │   4455)     │
└─────────────────┘              └──────────────────┘              └─────────────┘              └─────────────┘
        │                                 │                               │                           │
        │  1. connectToWorker()          │  2. WebSocketPair             │  3. connectWorker()       │
        │  2. Envia register{type,role}  │  4. Espera peer(host)         │  4. Envia register{type}  │  5. OBS Protocol
        │  5. Recibe peer_connected      │  5. Reenvía mensajes          │  6. Recibe obs_data       │  6. Responde
        │  6. Recibe obs_data            │                               │                           │
```

### 1.2 Componentes Identificados

| Componente | Archivo Clave | Estado | Función |
|------------|--------------|---------|---------|
| **Worker Cloudflare** | `worker/src/index.ts:147` | ✅ Implementado | Relay WebSocket usando Durable Objects |
| **Proxy Go** | `proxy/main.go:734` | ✅ Implementado | Agente local que conecta OBS ↔ Worker |
| **Frontend Desktop** | `lib/local-strategy.ts:208` | ✅ Funciona | Conexión directa OBS WebSocket |
| **Frontend Remoto** | `lib/remote-strategy.ts:129` | ❌ **STUB** | **NO IMPLEMENTADO** - Solo placeholders |
| **Connection Manager** | `lib/connection-manager.ts:195` | ⚠️ Parcial | Fallback a remote no funciona |
| **Controlador OBS** | `components/obs-controller.tsx` | ⚠️ Parcial | Implementa conexión manual al Worker |

---

## 🚨 2. CAUSA RAÍZ DEL FALLO EN MÓVILES

### 2.1 Problema Crítico: RemoteStrategy NO Implementado

**Archivo**: `lib/remote-strategy.ts` (líneas 21-128)

```typescript
async connect(url: string, password?: string, joinCode?: string): Promise<void> {
  // TODO: Implement WebSocket connection to Cloudflare Worker  // ← ❌ NUNCA IMPLEMENTADO
  console.log("[RemoteStrategy] Connection not yet implemented")
  
  // Simula conexión exitosa sin hacer NADA
  await new Promise((resolve) => setTimeout(resolve, 500))
  this.state = "connected"
}

async send(method: string, params?: Record<string, unknown>): Promise<unknown> {
  // TODO: Implement actual WebSocket send
  console.log("[RemoteStrategy] Would send:", method, params)
  throw new Error("RemoteStrategy not implemented yet")  // ← ❌ SIEMPRE FALLA
}
```

**Impacto**: 
- Cuando el ConnectionManager intenta fallback a modo remoto (línea 64 de `connection-manager.ts`), la estrategia simula éxito pero no establece conexión real
- Todas las operaciones remotas lanzan `Error: RemoteStrategy not implemented yet`

### 2.2 Problema Secundario: Implementación Duplicada

**Archivo**: `components/obs-controller.tsx` (líneas 307-430)

Existe una implementación **funcional pero incompleta** de conexión al Worker directamente en el componente React (`connectToWorker`), pero:
- No está integrada con el `ConnectionManager`
- No implementa la interfaz `IConnectionStrategy`
- Tiene lógica de reintentos y manejo de estado duplicada

### 2.3 Problema de Seguridad: Mixed Content (WS vs WSS)

**Archivo**: `lib/config.ts` (línea 1)

```typescript
const WORKER_URL = process.env.NEXT_PUBLIC_WORKER_URL || 'wss://remote.daurydicaprio.com/ws'
```

**Análisis**:
- ✅ El Worker usa `wss://` (WebSocket seguro) - CORRECTO
- ✅ El Proxy Go intenta conectar con `wss://` (línea 128 de `main.go`)
- ⚠️ **PROBLEMA**: Si el frontend se sirve desde HTTP (desarrollo local), algunos navegadores móviles bloquean conexiones WSS por políticas de seguridad

**Verificación necesaria**:
- El Worker debe forzar WSS mediante upgrade headers
- El frontend debe manejar errores de certificado/SSL

### 2.4 Problema de Handshake: Secuencia de Mensajes

**Flujo Esperado** (según `worker/src/index.ts:69-86`):
1. Cliente envía: `{type: "register", code: "XXXX", role: "client"}`
2. Worker responde: `{type: "waiting"}` (si no hay host)
3. Cuando host se conecta: `{type: "peer_connected"}` a ambos
4. Host envía datos OBS: `{type: "obs_data", scenes: [...], inputs: [...]}`

**Problema**: El `remote-strategy.ts` nunca envía el mensaje `register`, por lo tanto nunca recibe `peer_connected`.

---

## 🗑️ 3. ARCHIVOS BASURA Y LÓGICA REDUNDANTE

### 3.1 Código Muerto

| Archivo | Razón | Acción Recomendada |
|---------|-------|-------------------|
| `lib/remote-strategy.ts` | Stub sin implementación | **Reescribir completamente** usando lógica de `obs-controller.tsx` |
| `public/control_obs.html` | Versión legacy/vieja del controlador | **Eliminar** o mover a `archive/` |
| `lib/connection-types.ts:22` | `send()` en interfaz pero no se usa estrategia | Revisar si necesario |

### 3.2 Duplicación de Código

**Duplicado**: Lógica de conexión WebSocket
- **Ubicación A**: `components/obs-controller.tsx:307-430` (funcional pero desordenada)
- **Ubicación B**: `lib/remote-strategy.ts` (stub vacío)
- **Debería estar**: Solo en `lib/remote-strategy.ts`, usado por `ConnectionManager`

**Duplicado**: Tipos de comandos OBS
- **Ubicación A**: `lib/obs-contract.ts` (definiciones de tipos)
- **Ubicación B**: `lib/connection-types.ts:15-33` (interfaz de estrategia)
- **Recomendación**: Consolidar en `lib/obs-contract.ts`

### 3.3 Imports No Usados

En `lib/connection-manager.ts`:
```typescript
// Líneas 10-11: Importados pero nunca usados
import { LocalConnectionStrategy } from "./local-strategy"
import { RemoteConnectionStrategy } from "./remote-strategy"
```

En realidad se instancian inline en las líneas 36 y 61, pero los imports en la parte superior son innecesarios (aunque no dañan).

---

## 🏗️ 4. ARQUITECTURA DE RELAY OPTIMIZADA

### 4.1 Propuesta: Consolidación del Modo Remoto

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              NAVEGADOR                                       │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    ConnectionManager (Singleton)                    │   │
│  │  ┌──────────────┐         ┌──────────────────┐                     │   │
│  │  │   STRATEGY   │◄────────│   IConnection    │                     │   │
│  │  │   PATTERN    │         │   Strategy       │                     │   │
│  │  └──────┬───────┘         └────────┬─────────┘                     │   │
│  │         │                          │                               │   │
│  │    ┌────┴────┐              ┌──────┴──────┐                        │   │
│  │    │         │              │             │                        │   │
│  │ ┌──▼──┐   ┌──▼──┐        ┌──▼──┐      ┌──▼──┐                     │   │
│  │ │Local│   │Local│        │WS to│      │WS to│                     │   │
│  │ │Strategy   │Strategy    │Worker     │Worker                        │   │
│  │ │(Direct)│  │(Proxy)│    │(Remote)│   │(Direct)│                   │   │
│  │ └──┬──┘   └──┬──┘        └──┬──┘      └──┬──┘                     │   │
│  │    │         │              │            │                          │   │
│  │    └────┬────┘              └─────┬──────┘                          │   │
│  │         │                         │                                  │   │
│  │    ┌────▼────┐               ┌────▼────┐                             │   │
│  │    │  OBS    │               │  OBS    │                             │   │
│  │    │WebSocket│               │WebSocket│                             │   │
│  │    │ (obs-   │               │ (obs-   │                             │   │
│  │    │websocket│               │websocket│                             │   │
│  │    │  -js)   │               │  -js)   │                             │   │
│  │    └────┬────┘               └────┬────┘                             │   │
│  │         │                         │                                  │   │
│  │         └───────────┬─────────────┘                                  │   │
│  │                     │                                                │   │
│  │              ┌──────▼──────┐                                         │   │
│  │              │   Event     │                                         │   │
│  │              │   Emitter   │                                         │   │
│  │              └──────┬──────┘                                         │   │
│  │                     │                                                │   │
│  └─────────────────────┼────────────────────────────────────────────────┘   │
│                        │                                                     │
│  ┌─────────────────────▼────────────────────────────────────────────────┐   │
│  │                    obs-controller.tsx                                │   │
│  │  ┌──────────────────────────────────────────────────────────────┐   │   │
│  │  │                      UI Layer                                │   │   │
│  │  │   ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  │   │   │
│  │  │   │  Grid    │  │ Settings │  │  Modals  │  │  Status  │  │   │   │
│  │  │   │  Deck    │  │ Dialog   │  │          │  │   Bar    │  │   │   │
│  │  │   └──────────┘  └──────────┘  └──────────┘  └──────────┘  │   │   │
│  │  └──────────────────────────────────────────────────────────────┘   │   │
│  └────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      │ WSS
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         CLOUDFLARE WORKER (Edge)                            │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    RelaySession (Durable Object)                    │   │
│  │                                                                     │   │
│  │   ┌─────────────┐         ┌─────────────┐         ┌─────────────┐   │   │
│  │   │ Host Socket │◄───────►│   Relay     │◄───────►│Client Socket│   │   │
│  │   │ (Proxy Go)  │         │  Logic      │         │ (Móvil)     │   │   │
│  │   └─────────────┘         └─────────────┘         └─────────────┘   │   │
│  │          │                                              │            │   │
│  │          │ WebSocket Messages                           │            │   │
│  │          │ (register, obs_data,                         │            │   │
│  │          │  obs_command, etc.)                          │            │   │
│  │          │                                              │            │   │
│  └──────────┼──────────────────────────────────────────────┼────────────┘   │
│             │                                              │                │
└─────────────┼──────────────────────────────────────────────┼────────────────┘
              │                                              │
              │ WS                                           │ WSS
              ▼                                              ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              PROXY GO (Local)                               │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                          Agent                                      │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐              │   │
│  │  │   OBS Conn   │  │  Worker Conn │  │   Command    │              │   │
│  │  │   Handler    │  │   Handler    │  │   Processor  │              │   │
│  │  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘              │   │
│  │         │                 │                 │                      │   │
│  │         │ WS              │ WSS            │                      │   │
│  │         ▼                 ▼                 ▼                      │   │
│  │    ┌─────────┐       ┌──────────┐     ┌──────────┐                 │   │
│  │    │  OBS    │       │  Worker  │     │ Commands │                 │   │
│  │    │ WebSocket      │  (Cloudflare    │ (Toggle, │                 │   │
│  │    │ (4455)  │       │  Worker)       │  Scene,  │                 │   │
│  │    └─────────┘       └──────────┘     │  etc.)   │                 │   │
│  │                                        └──────────┘                 │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 4.2 Cambios Necesarios

#### 4.2.1 Reescribir `lib/remote-strategy.ts`

**Eliminar** el stub actual y **migrar** la lógica funcional desde `obs-controller.tsx`:

```typescript
// NUEVA IMPLEMENTACIÓN NECESARIA
export class RemoteConnectionStrategy implements IConnectionStrategy {
  private ws: WebSocket | null = null
  private messageQueue: any[] = []
  
  async connect(workerUrl: string, password?: string, joinCode?: string): Promise<void> {
    // 1. Construir URL con parámetros
    const url = new URL(workerUrl)
    url.searchParams.set("code", joinCode!.toUpperCase())
    url.searchParams.set("role", "client")
    
    // 2. Crear WebSocket
    this.ws = new WebSocket(url.toString())
    
    // 3. Enviar register al abrir
    this.ws.onopen = () => {
      this.ws!.send(JSON.stringify({
        type: "register",
        code: joinCode,
        role: "client"
      }))
    }
    
    // 4. Esperar peer_connected
    return new Promise((resolve, reject) => {
      this.ws!.onmessage = (event) => {
        const data = JSON.parse(event.data)
        if (data.type === "peer_connected") {
          resolve()
        } else if (data.type === "error") {
          reject(new Error(data.message))
        }
      }
      
      this.ws!.onerror = (error) => reject(error)
      this.ws!.onclose = () => {
        this.state = "disconnected"
        this.emit("stateChange", "disconnected")
      }
    })
  }
  
  async send(method: string, params?: Record<string, unknown>): Promise<unknown> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error("Not connected")
    }
    
    const command = {
      type: "obs_command",
      command: method,
      args: params
    }
    
    this.ws.send(JSON.stringify(command))
    return { success: true }
  }
}
```

#### 4.2.2 Refactorizar `obs-controller.tsx`

**Eliminar** la implementación duplicada en `connectToWorker` (líneas 307-430) y **usar** el `ConnectionManager`:

```typescript
// ACTUAL (Duplicado y desordenado)
const connectToWorker = useCallback(async () => {
  // 100+ líneas de lógica duplicada...
}, [joinCode, showToast, strings, isRemoteConnected, connected, startRemoteTimeout, updateOBSData, disconnectWorker])

// NUEVO (Usar ConnectionManager)
const connectRemote = async () => {
  const manager = createConnectionManager()
  
  try {
    const result = await manager.connect({
      remoteUrl: getWorkerUrl(),
      joinCode: joinCode,
      connectionTimeout: 5000
    })
    
    if (result.mode === "remote") {
      setIsRemoteConnected(true)
      setConnectionMode("remote")
    }
  } catch (error) {
    showToast(strings.toasts.connectionError, "error")
  }
}
```

#### 4.2.3 Actualizar `lib/connection-manager.ts`

**Corregir** el orden de parámetros en la llamada a `remoteStrategy.connect()`:

```typescript
// ACTUAL (Línea 64) - Parámetros incorrectos
await remoteStrategy.connect(config.remoteUrl, config.password, config.joinCode)

// DEBERÍA SER
await remoteStrategy.connect(config.remoteUrl, undefined, config.joinCode)
// o simplemente:
await remoteStrategy.connect(config.remoteUrl, config.joinCode)
```

**Además**, la interfaz `IConnectionStrategy.connect` espera `(url, password?, joinCode?)` pero `RemoteConnectionStrategy` implementa solo `(url, password?, joinCode?)` sin usar el password (correcto para modo remoto).

---

## 🔧 5. PLAN DE IMPLEMENTACIÓN

### Fase 1: Corrección Crítica (1-2 horas)
1. ✅ **Reescribir** `lib/remote-strategy.ts` con implementación real
2. ✅ **Mover** lógica de `obs-controller.tsx:connectToWorker` a `remote-strategy.ts`
3. ✅ **Integrar** `ConnectionManager` en `obs-controller.tsx`
4. ✅ **Eliminar** código duplicado de `obs-controller.tsx`

### Fase 2: Testing (30 minutos)
1. ✅ Probar conexión local (regresión)
2. ✅ Probar conexión remota con código de emparejamiento
3. ✅ Verificar mensajes de handshake (register → peer_connected)
4. ✅ Validar envío/recepción de comandos OBS

### Fase 3: Optimizaciones (Opcional)
1. 🔄 Implementar reconnection automático con backoff exponencial
2. 🔄 Agregar queue de mensajes pendientes cuando no hay conexión
3. 🔄 Minimizar tamaño de bundles (tree shaking)

### Fase 4: Limpieza
1. 🗑️ Eliminar `public/control_obs.html`
2. 🗑️ Consolidar tipos duplicados entre `obs-contract.ts` y `connection-types.ts`
3. 🗑️ Remover imports no usados

---

## ⚠️ 6. RIESGOS Y CONSIDERACIONES

### Seguridad
- **✅ WSS forzado**: El Worker y Proxy ya usan WSS correctamente
- **⚠️ Validar**: El Worker debe rechazar conexiones WS (no seguras) en producción
- **⚠️ Rate Limiting**: Implementar en Worker para prevenir abuso

### Compatibilidad
- **✅ OBS Protocol v5**: Implementado correctamente en Proxy
- **⚠️ Mobile Safari**: Puede requerir `user-scalable=no` en viewport (ya está)
- **⚠️ WebSocket Compression**: Verificar si Cloudflare Workers soporta `permessage-deflate`

### Rendimiento
- **✅ Latencia actual**: ~100-200ms (Worker en edge)
- **🔄 Optimización**: Usar Durable Objects affinity para mantener conexiones persistentes
- **🔄 Bundle size**: `obs-websocket-js` es pesado, considerar lazy loading

---

## 📋 7. CHECKLIST PARA PRÓXIMA SESIÓN

- [ ] Reescribir `lib/remote-strategy.ts` con implementación completa
- [ ] Refactorizar `obs-controller.tsx` para usar `ConnectionManager`
- [ ] Eliminar código duplicado de conexión WebSocket
- [ ] Probar conexión móvil con código de emparejamiento real
- [ ] Verificar logs de handshake (register, waiting, peer_connected)
- [ ] Validar flujo completo: Móvil → Worker → Proxy → OBS → Respuesta
- [ ] Eliminar archivos basura (`control_obs.html`)
- [ ] Ejecutar `npm run build` y `npm run lint`
- [ ] Documentar cambios en CHANGELOG

---

## 🎯 CONCLUSIÓN

**El fallo en móviles NO es un problema de WS vs WSS ni de mixed content.** La causa raíz es que **`lib/remote-strategy.ts` nunca fue implementado** - es un stub que simula conexión pero no hace nada.

La solución es **migrar la lógica funcional** desde `components/obs-controller.tsx` (que sí conecta al Worker) hacia `lib/remote-strategy.ts` e integrarlo correctamente con el `ConnectionManager`.

**Tiempo estimado de corrección**: 2-3 horas incluyendo testing.

**Prioridad**: 🔴 CRÍTICA - Sin esto, el modo remoto no funciona.
