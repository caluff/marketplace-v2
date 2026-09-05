# Auditoría de navegación del vendedor

Fecha: 2026-09-05.

## Resultado implementado

- `getVendorContext` reutiliza durante un render la consulta de membresías con
  `React.cache`; no guarda sesiones ni permisos entre solicitudes o usuarios.
- La lista nativa `/vendor/sellers` ya está autenticada, filtrada por el actor y
  devuelve identidad, rol y estado de la tienda. Se reutiliza la membresía
  seleccionada de esa respuesta, comprobando identificadores, miembro activo y
  tienda abierta. Se elimina la segunda consulta redundante a `/vendor/members/me`
  en cada navegación normal. El fallback permanece para una selección ausente,
  incluida la explicación de una tienda terminada; nunca concede acceso.
- Las lecturas siguen siendo `no-store`. Cada endpoint de datos y cada mutación
  conserva el middleware nativo de autenticación, alcance del vendedor y RBAC.
  No se cambiaron login, selección de tienda ni validación de permisos del API.
- Inicio y lista de pedidos solicitan solamente las columnas que muestran. Las
  expansiones de artículos, direcciones y envíos permanecen en el detalle.
- Catálogo, pedidos, inventario y ajustes tienen límites `loading.tsx` propios,
  reutilizando el estado de carga existente sin bloquear la navegación lateral.
- No se agregó polling, caché persistente, consulta directa a Redis, dependencia
  de rendimiento ni cambios a `node_modules`.

## Medición acotada

Playwright, Chromium headless, viewport 1440 × 1000, preview Orca del servidor
`pnpm dev` existente. Una sesión y dos pasadas por los cuatro menús antes y después.
Se midió clic en el sidebar → título de contenido visible tras resolver los datos.
No se guardaron formularios ni se modificaron pedidos, inventario o usuarios.

| Menú | Antes, pasada 1 | Después, pasada 1 | Antes, pasada 2 | Después, pasada 2 |
| --- | ---: | ---: | ---: | ---: |
| Catálogo | 8.608 s | 5.481 s | 6.480 s | 5.521 s |
| Pedidos | 9.655 s | 4.462 s | 7.568 s | 4.966 s |
| Inventario | 7.534 s | 4.466 s | 7.515 s | 4.468 s |
| Ajustes | 7.006 s | 3.948 s | 4.509 s | 3.410 s |

Son observaciones locales, no un benchmark de producción: compilación bajo demanda,
HMR, red y carga concurrente pueden variar. Una alternativa intermedia que solo
paralelizaba ambas lecturas de membresía no produjo una mejora clara y se descartó.
La versión final elimina la lectura redundante. No hubo errores de runtime en
las navegaciones verificadas.

Una prueba adicional de solo lectura mediante el SDK, conservando credenciales
únicamente en memoria y sin registrarlas, aisló el costo del API local:

| Endpoint | Duración | Tamaño JSON |
| --- | ---: | ---: |
| `/vendor/sellers` | 347 ms | 1245 bytes |
| `/vendor/members/me` | 3066 ms | 1209 bytes |
| `/vendor/products` | 4688 ms | 221 bytes |

El tiempo de una respuesta tan pequeña confirma que la espera no proviene de
dibujar una tabla grande en React. No se midió separadamente cada consulta SQL
ni el tiempo de Redis, por lo que no se atribuye toda esa duración a un único
servicio.

## Hallazgos y pendientes del backend

1. En Mercur 2.3.3, `ensureSellerMiddleware` ejecuta
   `ensureSellerDefaultRoles` en cada request con alcance de vendedor y RBAC
   habilitado. Ese inicializador consulta secuencialmente roles, todas las
   políticas y sus asociaciones; puede además crear registros faltantes.
   `/vendor/sellers` omite ese middleware, coherente con su menor tiempo observado.
   La comprobación de permisos es necesaria; repetir la preparación global de
   roles en cada lectura es trabajo candidato a salir del camino crítico.
2. El catálogo consulta IDs de productos propios y vínculos `product_seller`
   para aplicar visibilidad antes de la consulta paginada. El helper nativo de
   restricciones recorre todos los vínculos, no solo la página. Es otro costo
   potencial a optimizar conservando catálogo compartido y aislamiento de tiendas.
3. No se encontró un ajuste nativo que desactive únicamente la inicialización
   repetida de roles. No se desactivó RBAC ni se reemplazó su middleware. Una
   corrección upstream o parche de paquete mantenido debe coordinar inicialización
   posterior al registro de políticas, readiness, concurrencia entre procesos,
   fallos/reintentos, actualización de permisos y revocaciones. Un loader adicional
   por sí solo no elimina la llamada existente en cada request.
4. Inventario conserva una consulta paginada de niveles por artículo y una lectura
   por ubicación distinta. Ese patrón N+1 aumenta con los artículos. Antes de
   agruparlo hay que verificar que el endpoint nativo permita preservar el alcance
   de ubicaciones y la paginación completa; no se eliminó la verificación de acceso
   para ocultar ese costo.

No se diagnosticó polling de Redis en esta navegación. Los endpoints sí pueden
usar el caché nativo; esta corrección reduce llamadas al API sin agregar tráfico
periódico. No se consultó la cuota de Redis.

## Validación

- Typecheck de vendor correcto.
- Suite de vendor: 49 pruebas correctas, incluidas ocho de contexto/membresía.
- Lint dirigido de los archivos de rendimiento correcto.
- Tests de contexto cubren reutilización sin segunda lectura, membresías ajenas,
  identificadores inconsistentes, miembro inactivo, tiendas no operativas,
  fallback de tienda terminada, errores de servicio y cambios de estado/rol.
- Los gates generales de notificaciones y build se registran en el informe de
  esa implementación. No se cambiaron archivos backend en esta auditoría.

## Fuentes revisadas

- Next.js instalado 16.3.4: fetching-data y loading; guía de autenticación y caché
  por render consultada mediante Context7.
- Mercur instalado 2.3.3: documentación `content/learn/seller-members.mdx` y rutas
  `api/vendor/sellers/route`, `api/vendor/members/me/route`,
  `api/vendor/products/{route,middlewares,helpers}`; middleware
  `api/utils/ensure-seller-middleware` e inicializador
  `modules/seller/utils/ensure-seller-default-roles`.
