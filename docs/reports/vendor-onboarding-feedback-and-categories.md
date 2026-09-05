# Solicitud de vendedor: feedback, rendimiento y categorías

Fecha: 2026-09-05.

## Corrección del envío

El borrador real inspeccionado contenía el estado estadounidense `fl`. El frontend
lo aceptaba y mostraba `FL`, pero la validación completa del backend solo aceptaba
mayúsculas. Ahora se normaliza el estado en la copia validada, incluyendo
borradores anteriores. La lectura original no se modifica. Una prueba de regresión
cubre este caso; los datos reales leídos también pasan la validación corregida.

## Cambios de experiencia

- El header muestra las solicitudes en borrador o con correcciones como pendientes,
  con color warning e icono. Se puede ocultar el aviso y deshacer esa acción.
  Ocultarlo retira el enlace completo del header, no solo el estilo warning;
  el enlace del menú del usuario se conserva.
- La preferencia es local al navegador y a la solicitud/ciclo de revisión. No borra
  la solicitud ni sus novedades y no requiere peticiones al backend o Redis.
- Sonner, según el patrón shadcn/Radix, muestra feedback semántico en el onboarding,
  formularios de acceso/cuenta y favoritos. Los errores de campo y la recuperación
  de conflictos siguen disponibles dentro del formulario.
- El formulario administrativo de creación de la categoría propuesta también usa
  un toast. No se migraron los otros formularios del admin ni del vendor.
- El paso 3 acepta categorías existentes o una propuesta opcional de hasta 120
  caracteres en una línea. La propuesta aparece en revisión, snapshots e historial
  administrativo; no obliga a seleccionar una categoría existente.
- El administrador puede crear explícitamente una categoría pública y activa con
  el SDK nativo de Medusa. Se comprueban permisos, versión y propuesta enviada.
  No se crean categorías automáticamente al enviar/aprobar la solicitud.

## Rendimiento

Las lecturas del perfil y la solicitud se comparten durante una misma petición
con React.cache, sin caché global de datos privados. El historial se transmite
independientemente mediante Suspense y la ruta tiene un estado de carga.
Los guardados intermedios usan la respuesta autoritativa de la mutación sin
invalidar toda la cuenta y la portada; crear el primer borrador y enviar sí
actualizan la navegación. Se conservan versiones, idempotencia y conflictos.
Las consultas independientes de validación del backend se ejecutan en paralelo.
No se añadió polling, caché Redis ni trabajo periódico. No se midió un antes/después
de latencia en producción.

## Validación y límites

- Web: 50 pruebas; admin: 41; API: 181; vendor: 38.
- Lint y tipos de web/admin/API correctos; API conserva cinco advertencias de
  inventario preexistentes. Tipos del vendor y contratos generados comprobados.
- `pnpm peers check` correcto; Sonner resuelve los peers React 19 de cada app.
- Builds de web, admin y API correctos. El build API deshabilita correo únicamente
  en su proceso de compilación, sin cambiar la configuración del servidor.
- Navegador real: acceso, carga del borrador, warning, ocultación persistente,
  toast informativo, categoría libre, validación local con toast de error y
  ausencia de desbordamiento a 1440 y 390 px. Sin errores de runtime observados.
- No se guardó/envió la solicitud real, no se aprobó una tienda, no se creó una
  categoría real y no se enviaron correos durante esta QA. La operación completa
  de envío y la creación real de categoría quedan para la prueba funcional
  deliberada del usuario; están cubiertas por pruebas de lógica con dobles.

## Seguimiento: login del admin en preview

El log de Next.js confirmó un desajuste entre `x-forwarded-host: localhost:7000`
y el origen `marketplace-v2-3.orca.localhost:6136`. El admin permite ahora ese
origen exacto únicamente en desarrollo; producción conserva los orígenes
configurados explícitamente. Cuatro pruebas cubren desarrollo, producción,
deduplicación y rechazo de URLs no válidas. El login real del administrador
en ese preview llegó al dashboard sin `Invalid Server Actions request`.
Tres pruebas de renderizado cubren la desaparición completa del recordatorio,
su estado visible y la conservación de enlaces que no estén pendientes.
