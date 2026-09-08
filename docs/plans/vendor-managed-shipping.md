# Envíos configurados por cada vendedor

## Alcance aprobado

Cada vendedor administra sus perfiles y opciones de envío desde su panel. Se
utiliza exclusivamente el almacén aprobado de su tienda, Estados Unidos como
destino y USD como moneda. El operador no configura tarifas por tienda.

## Implementación

1. Reutilizar los perfiles, zonas, opciones, precios y vínculos nativos de
   Mercur 2.3.3 / Medusa 2.18.0. El perfil agrupa ofertas; las opciones definen
   el servicio y su tarifa.
2. Añadir configuración de envíos al panel vendor: crear perfiles y crear o
   editar opciones con nombre, descripción y tarifa fija (incluido cero).
   Preparar automáticamente las relaciones técnicas con el único almacén y
   una zona para Estados Unidos, sin exigir intervención del administrador.
3. Validar en el servidor propiedad de todos los recursos, membresía activa,
   país y moneda. Las mutaciones pasan por workflows y mantienen las reglas
   de autorización de Mercur.
4. Enlazar la configuración desde Ajustes y desde las ofertas sin perfil.
   Mantener carga progresiva, mensajes Sonner y componentes shadcn.
5. Verificar aislamiento entre vendedores, límites de país/moneda, tarifas,
   reintentos, lectura de la configuración y compatibilidad con las ofertas
   y el checkout nativos. Ejecutar los controles de API y vendor.

## Límites

La tarifa inicial es fija y la elige el vendedor. Las cotizaciones automáticas
de transportistas requieren una integración adicional; no se inventan tarifas
ni se asigna un precio de envío por defecto al vendedor.

## Resultado

Implementación realizada en API y vendor. Ver la
[verificación y límites](../reports/vendor-managed-shipping-qa.md).
