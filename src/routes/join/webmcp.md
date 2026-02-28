---
route: "/join"
title: "Join Match Invite"
description: "Página para aceptar invitaciones a partidas amistosas via código/QR."
---

## Contexto de Agente (WebMCP)
> **ATENCIÓN IA / AGENTE**: Página simple de aceptación de invitaciones.
> Accesible via `/join?invite=XXXXXX` (código de 6 caracteres).

## Estructura y Componentes
- **ScorekinoleLogo**: Branding centrado en la cabecera.
- **join-card**: Tarjeta principal con estados condicionales:
  - **Loading**: Spinner mientras carga la invitación y espera auth.
  - **Error**: Muestra mensaje según tipo (`not_found`, `expired`, `already_used`, `own_invite`, `already_accepted`).
  - **Success**: Confirmación con icono check, descripción del rol y avatar del host.
  - **Invite details**: Info del host, configuración del match (modo, puntos/rondas, Bo, rol), botón de aceptar.

## Flujo
1. Se extrae `invite` del query param `?invite=XXXXXX`.
2. Espera a `authInitialized` (Firebase Auth).
3. Carga la invitación desde Firestore (`getInviteByCode`).
4. Valida: no expirada, status `pending`, no es propia.
5. Si el usuario no está logueado → muestra botón "Continuar con Google".
6. Si está logueado → muestra botón "Aceptar invitación".
7. Al aceptar → `acceptInvite()` → muestra estado success.

## Estados
| Variable | Tipo | Descripción |
| :--- | :--- | :--- |
| `isLoading` | boolean | Cargando invitación |
| `isAccepting` | boolean | Procesando aceptación |
| `isSigningIn` | boolean | Sign-in en curso |
| `invite` | MatchInvite \| null | Datos de la invitación |
| `error` | string \| null | Tipo de error |
| `success` | boolean | Invitación aceptada |

## Dependencias
- `$lib/firebase/matchInvites.ts`: `getInviteByCode`, `acceptInvite`, `isInviteExpired`
- `$lib/firebase/auth.ts`: `currentUser`, `signInWithGoogle`, `authInitialized`
- `$lib/firebase/userProfile.ts`: `getPlayerName`
- `$lib/types/matchInvite.ts`: `MatchInvite`

## Invite Types (Doubles)
- `opponent`: Invitar al oponente (singles o main del equipo contrario).
- `my_partner`: Invitar al compañero de equipo propio.
- `opponent_partner`: Invitar al compañero del equipo contrario.
