# Notificaciones de formularios — admin y vendor

Fecha: 2026-09-05.

## Implementado

- Sonner 2.0.8 con el patrón shadcn, un Toaster por aplicación dentro del proveedor de tema, cierre accesible y posición inferior derecha.
- Colores semánticos success, destructive, warning e información, adaptados al tema claro/oscuro.
- Admin: acceso/MFA, recuperación y verificación de correo, decisiones sobre solicitudes, moderación de productos y categorías propuestas.
- Vendor: acceso/MFA, recuperación y verificación, selección de tienda y todos los formularios que usan MutationForm (productos, existencias, ubicaciones, perfil, dirección y empresa).
- Avisos de sesión vencida y boundaries de errores, sin mostrar detalles internos de excepciones inesperadas.
- Los errores junto a los campos y los enlaces de recuperación/continuación se conservan. Las mutaciones notifican después de recibir su resultado, no antes de guardar.
- Se conserva el evento que actualiza el indicador de solicitudes pendientes en admin.

## Verificación

- Admin: lint, typecheck, 53 pruebas y build correctos.
- Vendor: lint, typecheck, 49 pruebas y build correctos; incluye selección del tipo de toast, estados silenciosos, intentos repetidos, permisos y operaciones existentes.
- `pnpm peers check`: sin problemas de dependencias pares.
- Navegador: warning por sesión vencida y error por contraseña corta en ambas aplicaciones; se conservó aria-invalid y el error de campo.
- Success de admin y MutationForm de vendor verificado mediante respuesta de Server Action simulada en el navegador. No se guardaron cambios de negocio, no se enviaron correos ni se modificó inventario.
- Scripts locales de QA en `.cache/admin-feedback-qa.cjs` y `.cache/vendor-feedback-qa.cjs` (ignorados por Git).

Los avisos no consultan Redis ni ejecutan polling. Los indicadores de carga no anuncian éxito. Una redirección de autenticación sigue siendo una navegación, no un guardado ficticio.

La auditoría de navegación y las optimizaciones pendientes de la API se detallan en [el informe de rendimiento](reports/vendor-navigation-performance.md).
