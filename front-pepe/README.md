# Front Pepe (React + TypeScript + Vite)

Interfaz de voz para conversar con Pepe usando:
- reconocimiento de voz del navegador,
- síntesis de voz del navegador,
- backend HTTP en `/api/text/process`.

## Requisitos

- Node.js 20+
- Backend corriendo (por defecto en `http://localhost:8088`)

## Variables de entorno

Crea un archivo `.env` en `front-pepe/`:

```bash
VITE_BACKEND_URL=http://localhost:8088
```

> Si no defines la variable, la app usará `http://localhost:8088`.

## Scripts

```bash
npm run dev        # desarrollo
npm run build      # build de producción
npm run preview    # sirve build local
npm run lint       # eslint
npm run typecheck  # chequeo de tipos
```

## Mejoras de estabilidad aplicadas

- Timeout de red para evitar requests colgadas.
- Manejo de errores en UI (sin `alert`).
- Limpieza de timers/voz/reconocimiento al desmontar.
- Fallback manual para enviar texto sin voz.
- URL de backend configurable por entorno.

## Notas de producción

- Usa HTTPS para evitar restricciones de APIs de audio/voz.
- Verifica compatibilidad de `SpeechRecognition` en tu navegador objetivo.
- Considera monitoreo de errores frontend (Sentry u otro) para observabilidad.
