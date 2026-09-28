# Guía de Integración para Frontend

Esta guía detalla cómo interactuar con la API del **Sistema Base**.

## 🚀 Flujo de Autenticación

El sistema utiliza **Supabase Auth** para la autenticación de Google y maneja sesiones mediante **cookies HTTP-only**.

### Paso 1: Login en el Cliente

El frontend debe usar el SDK de Supabase para autenticar al usuario con Google.

```javascript
const { data, error } = await supabase.auth.signInWithOAuth({
  provider: 'google',
  options: {
    redirectTo: window.location.origin,
  },
});
```

### Paso 2: Intercambio de Token (Creación de Sesión)

Una vez obtenido el `access_token` de Supabase, debe enviarse al backend para establecer la cookie de sesión.

- **Endpoint**: `POST /auth/session`
- **Body**:
  ```json
  {
    "access_token": "eyJhbGci..."
  }
  ```
- **Resultado**: El servidor responderá con los datos del usuario y establecerá una cookie llamada `sb-access-token`.

---

## 🛠️ Endpoints de la API

### Autenticación (`/auth`)

#### 1. Crear Sesión

Establece la cookie de sesión en el navegador.

- **URL**: `/auth/session`
- **Método**: `POST`
- **Request Body** (`CreateSessionDto`):
  | Campo | Tipo | Descripción |
  | :--- | :--- | :--- |
  | `access_token` | `string` | Token de acceso de Supabase. |

#### 2. Cerrar Sesión

Limpia la cookie del navegador.

- **URL**: `/auth/logout`
- **Método**: `POST`

#### 3. Obtener Usuario Actual (Breve)

- **URL**: `/auth/me`
- **Método**: `GET`
- **Nota**: Requiere cookie de sesión.

---

### Usuarios (`/users`)

#### 1. Mi Perfil Detallado

- **URL**: `/me`
- **Método**: `GET`
- **Respuesta** (`ProfileResponseDto`):
  ```json
  {
    "id": "uuid",
    "full_name": "Juan Pérez",
    "status": "active",
    "roles": [{ "id": "uuid", "key": "ADMIN", "name": "Administrador" }]
  }
  ```

#### 2. Listar Usuarios (Solo ADMIN)

- **URL**: `/users`
- **Método**: `GET`
- **Query Params**:
  | Parámetro | Default | Descripción |
  | :--- | :--- | :--- |
  | `page` | `1` | Número de página. |
  | `limit` | `20` | Usuarios por página (máx 100). |

#### 3. Invitar/Crear Usuario (Solo ADMIN)

- **URL**: `/users`
- **Método**: `POST`
- **Body**:
  ```json
  {
    "email": "usuario@unsa.edu.pe",
    "roleKey": "USER"
  }
  ```

#### 4. Cambiar Rol (Solo ADMIN)

- **URL**: `/users/:id/role`
- **Método**: `PATCH`
- **Body**: `{ "roleKey": "ADMIN" }`

---

### Roles (`/roles`)

#### 1. Listar Roles (Solo ADMIN)

- **URL**: `/roles`
- **Método**: `GET`

---

## 📦 Modelos de Datos (TypeScript)

Puedes copiar estas interfaces en tu proyecto frontend:

```typescript
export interface Role {
  id: string;
  key: string;
  name: string;
}

export interface UserProfile {
  id: string;
  full_name: string | null;
  status: string;
  roles: Role[];
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
```

## ⚠️ Errores Comunes

| Código             | Descripción                                                  |
| :----------------- | :----------------------------------------------------------- |
| `401 Unauthorized` | El usuario no ha iniciado sesión o el token expiró.          |
| `403 Forbidden`    | El usuario no tiene el rol necesario (ej. requiere `ADMIN`). |
| `400 Bad Request`  | Faltan campos en el body o no cumplen con la validación.     |
| `500 Server Error` | Error no manejado en el servidor.                            |

---

## 📄 Documentación Interactiva

Puedes ver el detalle técnico y probar los endpoints en:
[http://localhost:3000/api](http://localhost:3000/api) (Swagger)
