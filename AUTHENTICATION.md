# Autenticación

Las tres aplicaciones usan el Medusa JS SDK con JWT y almacenamiento
`nostore`. Los Server Actions guardan el JWT en una cookie `HttpOnly`,
`SameSite=Lax` y con un nombre distinto para cada actor. Los proxies solo hacen
una comprobación optimista de presencia y expiración; los layouts protegidos
validan la identidad contra Medusa/Mercur antes de renderizar.

| Aplicación | Actor | Cookie de sesión | Validación protegida |
| --- | --- | --- | --- |
| `apps/web` | `customer` | `mv2_web_customer_session` | `sdk.store.customer.retrieve()` |
| `apps/admin` | `user` | `mv2_admin_user_session` | `sdk.admin.user.me()` |
| `apps/vendor` | `member` | `mv2_vendor_member_session` | `/vendor/sellers`, `/vendor/sellers/select` y `/vendor/members/me` mediante `sdk.client.fetch` |

El contexto de vendedor se guarda por separado en
`mv2_vendor_seller_context`. Cada restauración comprueba que la membresía siga
activa y pertenezca al seller seleccionado. La autorización y el aislamiento
definitivos continúan a cargo del backend.

Las respuestas multietapa del SDK se procesan sin habilitar políticas nuevas en
el backend: `verification_required` abre la verificación de correo,
`mfa_required` conserva temporalmente el desafío en una cookie `HttpOnly`, y
`location` presenta un enlace únicamente cuando es una URL HTTP(S) válida.

## Variables requeridas

- `NEXT_PUBLIC_MEDUSA_BACKEND_URL`
- `NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY` (solo `apps/web`)
- `STOREFRONT_URL`
- `ADMIN_URL`
- `VENDOR_URL`
- `STORE_CORS`
- `ADMIN_CORS`
- `VENDOR_CORS`
- `AUTH_CORS`

## Correo de autenticación

Los subscribers de `auth.password_reset` y `auth.verification_requested` están
implementados para los templates lógicos `auth-password-reset` y
`auth-email-verification`. La salida permanece deshabilitada hasta conectar un
proveedor de Notification/email. Una vez configurado el proveedor, requiere:

- `AUTH_EMAIL_ENABLED`
- `AUTH_EMAIL_FROM`

`AUTH_EMAIL_ENABLED` debe ser exactamente `true`. Los enlaces de recuperación y
verificación se construyen con la URL correspondiente al actor. El frontend
retira el token o código de la URL en el primer request, lo guarda brevemente en
una cookie `HttpOnly` y nunca lo persiste en almacenamiento del navegador ni lo
registra en logs de la aplicación.
