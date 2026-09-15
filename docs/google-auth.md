# Acceso con Google

La tienda, el panel de operadores y el portal de vendedores admiten Google junto al acceso existente con correo y contraseña. La integración usa los proveedores nativos de Medusa 2.18.0 y las sesiones HttpOnly de cada aplicación.

Esta guía describe código y configuración esperada; no confirma el estado actual de Google Cloud ni una nueva ejecución del flujo. Consultar [Autenticación](../AUTHENTICATION.md) para las sesiones y Resend, y [el progreso de desarrollo](develpment/development-progress.md) para verificaciones pendientes. El aislamiento de carrito al cambiar de cliente (F05) sigue pendiente aunque el login OAuth sea correcto.

El login de la tienda conserva su panel izquierdo y presenta el formulario de correo y contraseña a la derecha, seguido del acceso con Google. El icono local `apps/web/public/icons/google.png` procede de los [recursos oficiales de Google](https://developers.google.com/identity/branding-guidelines).

## Configuración local

Guardar únicamente en el `.env` ignorado de la raíz:

```dotenv
GOOGLE_CLIENT_ID=<client-id de una aplicación web de Google>
GOOGLE_CLIENT_SECRET=<client-secret>
GOOGLE_CALLBACK_URL=http://localhost:3000/auth/google/callback
```

Cada frontend usa su `.env.local`, con valores públicos:

| Aplicación    | `NEXT_PUBLIC_GOOGLE_CALLBACK_URL`            |
| ------------- | -------------------------------------------- |
| `apps/web`    | `http://localhost:3000/auth/google/callback` |
| `apps/admin`  | `http://localhost:7000/auth/google/callback` |
| `apps/vendor` | `http://localhost:7001/auth/google/callback` |

En los tres frontends, `NEXT_PUBLIC_MEDUSA_BACKEND_URL=http://localhost:9000`. La tienda también necesita su `NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY` existente. No copiar secretos a los frontends.

En Google Cloud Console → Google Auth Platform:

1. Configurar Branding y Audience. Para usuarios externos a una organización, elegir External; en pruebas, agregar los correos de prueba.
2. Crear un cliente de tipo **Web application**.
3. Registrar las tres URLs locales de la tabla como **Authorized redirect URIs**, con coincidencia exacta. El flujo de redirección del servidor no necesita cargar Google Identity Services en el navegador.

El backend registra Google cuando están presentes las tres variables. Si solo se configura alguna, falla al arrancar con un mensaje que identifica los nombres faltantes. El botón se muestra cuando el frontend tiene una URL de callback válida. Reiniciar los procesos después de cambiar variables si no se recargan automáticamente:

```powershell
pnpm dev
```

## Comportamiento de las cuentas

- Un cliente nuevo puede crear su cuenta mediante Google; se utiliza el workflow nativo de registro de Medusa.
- En la tienda, un Gmail verificado por el proveedor nativo se vincula automáticamente a la cuenta existente de correo y contraseña cuando coincide exactamente el correo normalizado y hay una única identidad compatible. Se conserva la identidad original, incluidos datos, contraseña, verificación, MFA y relación cliente–vendedor. No se eliminan puntos ni sufijos del correo para buscar coincidencias.
- Los otros correos y los accesos de los paneles mantienen la confirmación de la cuenta existente. Google también admite correos de proveedores externos, para los que un `email_verified` histórico no acredita por sí solo la titularidad actual. La integración nativa instalada no conserva `hd`, por lo que no se infiere la titularidad de Google Workspace por el dominio.
- El panel de operadores y el de vendedores nunca crean usuarios, miembros ni permisos durante el acceso con Google. Se comprueban las cuentas y membresías existentes.
- Cliente y vendedor usan el proveedor `google`. Operadores usan otra instancia nativa, `google-admin`, con las mismas credenciales OAuth. Esto permite usar una misma cuenta Google en una cuenta de operador y otra de cliente sin mezclar sus identidades o segundos factores.
- Una identidad Google ya asociada a otra cuenta no se fusiona ni reemplaza la sesión durante la vinculación.
- Las solicitudes de vendedor existentes admiten el correo verificado del proveedor Google. Se mantienen la aprobación y los controles de membresía.

## Flujo y protección

### Acceso desde el perfil al panel de vendedores

En `/account/sell`, **Ir al panel de vendedores** utiliza la sesión de cliente actual, tanto si se inició con contraseña como con Google. La API comprueba que la misma identidad tenga un miembro activo y acceso a una tienda habilitada antes de emitir un código de un solo uso, válido como máximo 60 segundos. No se crean permisos ni se vinculan cuentas por correo durante este acceso.

El navegador envía el código por formulario POST al portal configurado; no se incluyen tokens ni códigos en la URL. El portal acepta únicamente el origen de la tienda configurado y canjea el código para establecer su sesión HttpOnly habitual. Se mantienen la verificación del miembro y la selección de tienda cuando hay varias membresías.

Se usan las variables públicas existentes `NEXT_PUBLIC_VENDOR_URL` de la tienda y `NEXT_PUBLIC_STOREFRONT_URL` del portal vendedor. En local deben valer `http://localhost:7001` y `http://localhost:3000`, respectivamente; en Railway deben contener los orígenes HTTPS reales. No hacen falta secretos adicionales. El documento de traspaso usa `Referrer-Policy: strict-origin` para que el POST conserve el encabezado `Origin`; cambiarlo a `no-referrer` impide validar el origen.

### Acceso con Google

El botón ejecuta una Server Action que llama a `sdk.auth.login`, valida la URL devuelta y guarda una cookie HttpOnly temporal con `state`, destino local y, para vinculación, el hash de la sesión que la inició. El callback compara el estado y su vencimiento antes de llamar a `sdk.auth.callback`. Un cambio de sesión invalida la vinculación.

`POST /auth/google/complete` recibe un bearer token Google validado por Medusa y el tipo de actor. Para un cliente con Gmail verificado, busca la cuenta y su identidad de correo y contraseña sin ambigüedades; para la vinculación explícita exige además un token de la cuenta existente que haya completado sus verificaciones. El workflow mueve el proveedor a esa identidad y devuelve un token sin permisos; `sdk.auth.refresh` aplica las verificaciones y MFA nativos antes de que el frontend consulte el perfil y establezca la sesión.

Los contratos de esta ruta se publican en `@marketplace-v2/api/auth-contracts`. Para regenerarlos o comprobarlos:

```powershell
pnpm --filter @marketplace-v2/api run auth:contracts:generate
pnpm --filter @marketplace-v2/api run auth:contracts:check
```

## Prueba manual

1. Abrir `http://localhost:3000/login`, `http://localhost:7000/login` o `http://localhost:7001/seller/login`.
2. Pulsar **Continuar con Google** sin rellenar el formulario de contraseña.
3. Completar el acceso en Google con una cuenta de prueba autorizada.
4. Para un Gmail con cuenta de cliente existente, comprobar que entra directamente y conserva sus datos, sin pedir la contraseña. Si hay MFA, debe solicitar el segundo factor.
5. Cuando corresponda la vinculación explícita, aparecerá **Vincula Google a tu cuenta** en la tienda. Escribir el correo y la contraseña actuales y pulsar **Confirmar mi cuenta**; luego confirmar **Vincular Google** con la misma cuenta de Google. Esta pantalla no ofrece repetir el acceso con Google antes de confirmar la cuenta. Volver a entrar con Google tras cerrar sesión.
6. Comprobar que conserva datos y permisos y que un vendedor inactivo no obtiene acceso.
7. Cancelar un intento y comprobar el mensaje local. Reutilizar un callback o cambiar su `state` debe fallar sin crear sesión.
8. Con sesión de cliente y acceso de vendedor aprobado, abrir `/account/sell` y pulsar **Ir al panel de vendedores**. Debe abrir su tienda o el selector de tiendas sin pedir otra contraseña. Repetir con una sesión iniciada mediante Google. Un miembro desactivado o una tienda sin acceso no debe obtener sesión de vendedor mediante el traspaso.

La suite HTTP `packages/api/integration-tests/http/google-auth.spec.ts` usa una base PostgreSQL descartable y Redis TLS local dedicado. Está desactivada por defecto para no ejecutar fixtures contra la base compartida; las variables y comprobaciones de aislamiento están en el encabezado del archivo. Las pruebas unitarias forman parte de `pnpm test:api`.

## Railway

`.railway/railway.ts` contiene las referencias de configuración. Antes de desplegar, definir las variables compartidas `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` y:

```dotenv
GOOGLE_CALLBACK_URL=https://storefront.example.com/auth/google/callback
```

API y worker consumen las tres variables. Cada frontend recibe su callback público correspondiente. Registrar también en el cliente OAuth de Google:

```text
https://storefront.example.com/auth/google/callback
https://admin.example.com/auth/google/callback
https://vendor.example.com/auth/google/callback
```

Los dominios anteriores son placeholders, no destinos configurados. Usar los orígenes reales de cada entorno tanto en Google como en las variables. Los orígenes deben estar incluidos en la configuración CORS del backend. Las variables `NEXT_PUBLIC_*` se incorporan al build, por lo que los frontends deben reconstruirse al cambiarlas. La configuración definitiva de producción no forma parte de las fases obligatorias de cierre funcional.

## Fuentes de implementación

- [Configuración Google](../packages/api/src/lib/google-auth-configuration.ts) y [registro de proveedores](../packages/api/medusa-config.ts).
- [Ruta de completion](../packages/api/src/api/auth/google/complete/route.ts), [workflow](../packages/api/src/workflows/complete-google-auth.ts) y [step de vinculación](../packages/api/src/workflows/steps/complete-google-auth.ts).
- [Transacción OAuth de la tienda](../apps/web/lib/google-auth.ts), [operador](../apps/admin/src/lib/google-auth.ts) y [vendedor](../apps/vendor/src/lib/google-auth.ts).
- [Traspaso desde la tienda](../apps/web/lib/vendor-session.ts) y [recepción en el portal](../apps/vendor/src/lib/storefront-session.ts).

Referencias: [proveedor Google de Medusa](https://docs.medusajs.com/resources/commerce-modules/auth/auth-providers/google), [OAuth para aplicaciones de servidor de Google](https://developers.google.com/identity/protocols/oauth2/web-server), [verificación de identidad y titularidad del correo](https://developers.google.com/identity/gsi/web/guides/verify-google-id-token).
