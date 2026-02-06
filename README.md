# DockForLife v0.001 BETA

Controla tu OBS Studio desde cualquier dispositivo usando Cloudflare Workers y un agente local ligero.

## 🚀 Arquitectura

- **Next.js App**: Interfaz de control (Móvil/Web).
- **Cloudflare Worker**: Relay de WebSockets para comunicación en tiempo real.
- **Local Agent**: Puente entre Cloudflare y tu OBS local.

## 🛠️ Instalación Rápida

### 1. Clonar el repositorio
```bash
git clone https://github.com/daurydicaprio/dockforlife.git
cd dockforlife
```

### 2. Configurar Agente Local
```bash
cp config.example.json config.json
# Edita config.json con tu contraseña de OBS
```

### 3. Instalar dependencias y correr
```bash
# Instalar todo
npm install

# Instalar dependencias del agente
cd agent
npm install
npm run build
cd ..

# Iniciar agente (deja esta terminal abierta)
npm run agent:start
```

### 4. Configurar Worker (Opcional si usas el oficial)
```bash
cd worker
npm install
npx wrangler deploy
```

## 📱 Uso

1. Abre la app en tu móvil (`https://dockforlife.vercel.app` o tu despliegue).
2. Ve a **Settings** -> **Remote Mode**.
3. Ingresa el código que te muestra el Agente en la terminal.
4. ¡Controla tu stream!

## 🔒 Seguridad

- **config.json** está ignorado por git. NO lo subas.
- La comunicación es vía WSS (WebSocket Seguro).
- El código de emparejamiento es único por sesión.
