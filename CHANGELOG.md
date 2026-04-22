# Registro de cambios

Todos los cambios notables de este proyecto se documentan en este archivo.

El formato se basa en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/),
y este proyecto sigue [Versionado Semantico](https://semver.org/lang/es/).

> English version: [CHANGELOG.en.md](CHANGELOG.en.md)

## [0.2.1] - 2026-04-22

Patch con correcciones al carrusel del dashboard y al logo animado del panel superior.

### Corregido

- **Botones del carrusel no respondian** — el gestor de drag capturaba todo el contenedor e interceptaba los clicks en flechas y puntos. Ahora el pointer solo se escucha en el viewport.
- **Cambio automatico demasiado rapido** — autoplay de 9s a 14s; tras interacion manual, el autoplay se pausa 5s en vez de 3s.
- **Traducciones al español** — reescritas en castellano neutro. Fuera jerga de DJ ("maleta", "pick", "cavando", "Spin the Crate", "tapete"). Mismo tratamiento en ingles: textos mas directos.
- **Movimiento al hacer hover** — eliminado el parallax de chips y orbes del panel hero. Interaccion en hover ahora limitada a un glow suave de borde cian en el viewport, sin desplazar elementos.

### Cambiado

- **Indicador "Siguiente pista" eliminado** — se ha quitado completamente del carrusel.
- **Logo giratorio del panel superior** — aumentado de 3.2rem a 5.25rem (disco de 2.35rem a 4.2rem). Se mantiene la aceleracion al pasar el raton sobre el logo, pero ya no aparece el nombre del genero.

[0.2.1]: https://github.com/SimonBlancoE/discographic/compare/v0.2.0...v0.2.1

## [0.2.0] - 2026-04-22

Release centrada en rendimiento del dashboard y muro, robustez de sincronizacion,
localizacion de importaciones y media, y una refactorizacion amplia que mueve
logica compartida a modulos reutilizables.

### Nuevo

- **Hero Carousel en el dashboard** — carrusel animado de caracteristicas con
  autoplay, navegacion por puntero, teclado y soporte para `prefers-reduced-motion`.
- **VinylBadge** — insignia giratoria con generos destacados de la coleccion,
  animacion pausada bajo `prefers-reduced-motion`.
- **DashboardStatsContext** — proveedor compartido que centraliza la carga de
  estadisticas del dashboard y elimina peticiones duplicadas entre consumidores.
- **Contrato de estadisticas** — `shared/contracts/dashboardStats.js` normaliza
  payloads del backend en una forma estable para el frontend.
- **Virtualizacion del muro de portadas** — `WindowedCoverWallGrid` renderiza
  solo las filas visibles; colecciones grandes desplazan sin cortes.
- **Reconciliacion post-sync** — los sync completos eliminan filas de releases
  que ya no existen en la coleccion del usuario, limpiando las portadas en cache
  asociadas.
- **Localizacion de importaciones y fallbacks de media** — mensajes de
  importacion y textos de fallback de portadas respetan el idioma del usuario.
- **Servicio de notas compartido** — `server/services/notes.js` unifica
  normalizacion, serializacion y limpieza de notas entre sync, import y export.
- **Servicio de media de portadas** — `server/services/coverMedia.js`
  centraliza cache de portadas, variantes (wall/poster) y limpieza.
- **Filtros de releases compartidos** — `server/services/releaseFilters.js` y
  `shared/collectionFilters.js` consolidan filtros usados por stats, collection
  y export.
- **Sync de importaciones** — `server/services/importSync.js` + `src/lib/importSync.js`
  envian notas y puntuaciones importadas de vuelta a Discogs con estado.
- **Contratos tipados en `shared/contracts/`** — primer paso hacia un contrato
  explicito frontend/backend.
- **Tests** — cobertura nueva para filtros de coleccion, reconciliacion, media
  de portadas, parity de export, progreso de import, normalizacion de notas,
  metricas del muro, contrato de stats, badge de generos, migracion de
  marketplace_status y fetch de valor de marketplace. Total: 217 tests.

### Corregido

- **Migracion de `marketplace_status` re-ejecutada en cada arranque** — el
  backfill ahora corre solo cuando la columna se acaba de anadir, preservando
  estados existentes en re-ejecuciones.
- **Errores silenciosos en fetch del marketplace** — `fetchMarketplaceValue`
  registra `releaseId` y `error.message` antes de devolver estado `FAILED`.
- **Renders innecesarios en consumidores del dashboard** — `refresh` envuelto en
  `useCallback`, `badgeGenres` memoizado, y `getDashboardBadgeGenres` reducido a
  un slice puro sin re-normalizar.
- **Parity entre export e import** — notas y campos derivados viajan de ida y
  vuelta sin perder metadatos.
- **Sync de notas en import** — notas importadas se sincronizan de vuelta a
  Discogs correctamente.

### Cambiado

- **Refactor de helpers compartidos** — colecciones, portadas y filtros dejan de
  duplicarse entre rutas y servicios.
- **Dashboard.jsx** — consume el contexto compartido en lugar de gestionar su
  propio fetch de stats.
- **Condicion de enriquecimiento** — centralizada en `server/services/enrichmentQueue.js`
  con constantes de `MARKETPLACE_STATUS` para estado explicito.

### Eliminado

- **Componentes sin uso** — `CompletionRing`, `StatSparkline`, `CountryChart`,
  hook `useAnimatedNumber` y la ruta `/api/value` sin consumidores.

[0.2.0]: https://github.com/SimonBlancoE/discographic/compare/v0.1.0...v0.2.0

## [0.1.0] - 2026-04-10

Primera release etiquetada. Discographic es un gestor de colecciones de Discogs
autoalojado para coleccionistas de vinilo, con sincronizacion, enriquecimiento,
exportacion/importacion y un dashboard con graficas y logros.

### Nuevo

- **Conversion de moneda dinamica** — precios almacenados en EUR, convertidos en
  tiempo real con tasas del BCE con cache de 6 horas, fallback a fecha anterior
  y deduplicacion de peticiones concurrentes. Selector de moneda en la cabecera
  de la coleccion (EUR/USD/GBP) con preferencia persistente por usuario.
- **Columnas configurables** — registro de columnas como fuente unica de verdad,
  popover ColumnToggle (renderizado via portal), preferencias de visibilidad por
  usuario guardadas en base de datos.
- **Listings del marketplace** — sincronizacion de inventario con los listings
  propios del usuario en Discogs, selecciona el mejor por release (prefiere
  "For Sale" sobre "Draft", precio mas bajo), almacena precio original +
  conversion a EUR. Dos columnas nuevas: estado de venta y precio de venta.
- **Exportaciones localizadas** — cabeceras CSV/XLSX con claves i18n en espanol
  e ingles. Tolerancia de importacion cross-locale para que archivos exportados
  en un idioma se importen en el otro.
- **Instancia de test efimera** — `docker-compose.test.yml` con almacenamiento
  tmpfs, `scripts/test-instance.sh` para bootstrap automatizado y creacion de
  usuarios, scripts npm `test:instance:start` / `test:instance:stop`.
- **Gestion de contrasenas** — el admin puede resetear contrasenas de usuarios,
  los usuarios pueden cambiar la suya.
- **Sistema de logros** — hitos de coleccion y desbloqueos secretos con
  animaciones de confeti.
- **Suite de tests** — 77 tests en 9 archivos cubriendo conversion de moneda,
  sincronizacion de inventario, migraciones de DB, serializacion de exports,
  columnas i18n, almacenamiento de preferencias y progreso de enriquecimiento.

### Corregido

- **Bucle infinito de enriquecimiento** — eliminado `country` de la condicion
  de pendientes de enriquecimiento; releases donde Discogs no tiene datos de
  pais ya no re-disparan el enriquecimiento indefinidamente.
- **Fallos silenciosos en sync de inventario** — los errores ahora se reportan
  via estado de sincronizacion en lugar de solo registrarse en consola.
- **Overlay del menu de columnas** — popover de ColumnToggle renderizado via
  portal de React, eliminando la dependencia fragil de z-index.
- **Dockerfile sin directorio shared/** — anadida copia de shared/ en la
  etapa de runtime.

### Cambiado

- **API de preferencias** — restringida a una lista blanca de claves conocidas
  (`collection_visible_columns`, `currency`) en lugar de regex permisiva.
- **Guardado de preferencia de columnas** — debounce de 500ms para agrupar
  toggles rapidos en una sola llamada API.
- **Notificacion de reseteo de orden** — toast informativo cuando el orden se
  resetea a artista al ocultar la columna actualmente ordenada.
- **Proxy dev de Vite** — puerto destino configurable via variable de entorno
  `VITE_API_PORT`, por defecto 3800.
- **Defaults de moneda** — reemplazadas cadenas `'EUR'` hardcodeadas en
  AuthContext y Collection por la constante compartida `DEFAULT_CURRENCY`.

[0.1.0]: https://github.com/SimonBlancoE/discographic/releases/tag/v0.1.0

