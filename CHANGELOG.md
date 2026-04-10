# Registro de cambios

Todos los cambios notables de este proyecto se documentan en este archivo.

El formato se basa en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/),
y este proyecto sigue [Versionado Semantico](https://semver.org/lang/es/).

> English version: [CHANGELOG.en.md](CHANGELOG.en.md)

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
