# Authentication System Documentation

## Overview

ระบบ Authentication ใช้ **PASETO (Platform-Agnostic Security Tokens)** Version 4 Local สำหรับการสร้าง Token โดยมี Token 2 ประเภท:

- **Access Token**: ใช้สำหรับ authenticate API requests (อายุสั้น - ค่า default คือ 1 ชั่วโมง)
- **Refresh Token**: ใช้สำหรับขอ Access Token ใหม่ (อายุยาว - ค่า default คือ 7 วัน)

### Security Standards

- **OWASP ASVS V2**: Authentication Verification Requirements
- **OWASP ASVS V4**: Access Control Verification Requirements
- **RFC 6750**: Bearer Token Usage
- **RFC 9110**: HTTP Semantics
- **NIST SP 800-63B**: Password Guidelines

---

## Sequence Diagrams

### 1. Register Flow

```mermaid
sequenceDiagram
    autonumber
    participant Client
    participant Server as Auth Handler
    participant Validator
    participant AuthService
    participant UserRepo as UserRepository
    participant Argon2 as Argon2 (Password Hasher)
    participant Database as PostgreSQL

    Client->>Server: POST /api/v1/auth/register<br/>{username, password}
    
    Server->>Validator: validate(RegisterRequest)
    
    alt Validation Failed
        Validator-->>Server: ValidationError
        Server-->>Client: 400 Bad Request<br/>{code: "VALIDATION_ERROR"}
    end
    
    Validator-->>Server: Valid
    
    Server->>AuthService: register(pool, request)
    
    AuthService->>UserRepo: username_exists(pool, username)
    UserRepo->>Database: SELECT EXISTS(username)
    Database-->>UserRepo: true/false
    UserRepo-->>AuthService: exists: bool
    
    alt Username Already Exists
        AuthService-->>Server: AuthError::UsernameExists
        Server-->>Client: 409 Conflict<br/>{code: "USERNAME_EXISTS"}
    end
    
    AuthService->>Argon2: hash_password(password)
    Note over Argon2: spawn_blocking<br/>(CPU-intensive operation)
    Argon2-->>AuthService: password_hash (Argon2 format)
    
    AuthService->>UserRepo: create(pool, username, password_hash)
    UserRepo->>Database: INSERT INTO users
    Database-->>UserRepo: User record
    UserRepo-->>AuthService: User
    
    AuthService-->>Server: RegisterResponse<br/>{user_id, username, created_at}
    Server-->>Client: 201 Created<br/>{success: true, data: RegisterResponse}
```

### 2. Login Flow

```mermaid
sequenceDiagram
    autonumber
    participant Client
    participant Server as Auth Handler
    participant Validator
    participant AuthService
    participant UserRepo as UserRepository
    participant Argon2 as Argon2 (Password Verifier)
    participant PASETO as PASETO Token Generator
    participant Database as PostgreSQL

    Client->>Server: POST /api/v1/auth/login<br/>{username, password}
    
    Server->>Validator: validate(LoginRequest)
    
    alt Validation Failed
        Validator-->>Server: ValidationError
        Server-->>Client: 400 Bad Request<br/>{code: "VALIDATION_ERROR"}
    end
    
    Validator-->>Server: Valid
    
    Server->>AuthService: login(pool, jwt_config, request)
    
    AuthService->>UserRepo: find_by_username(pool, username)
    UserRepo->>Database: SELECT * FROM users WHERE username = ?
    Database-->>UserRepo: User record or None
    UserRepo-->>AuthService: Option<User>
    
    alt User Not Found
        AuthService-->>Server: AuthError::InvalidCredentials
        Server-->>Client: 401 Unauthorized<br/>{code: "INVALID_CREDENTIALS"}
    end
    
    AuthService->>Argon2: verify_password(password, password_hash)
    Note over Argon2: spawn_blocking<br/>(CPU-intensive operation)
    Argon2-->>AuthService: is_valid: bool
    
    alt Password Invalid
        AuthService-->>Server: AuthError::InvalidCredentials
        Server-->>Client: 401 Unauthorized<br/>{code: "INVALID_CREDENTIALS"}
    end
    
    AuthService->>PASETO: generate_tokens(user, jwt_config)
    
    Note over PASETO: Key Derivation (HKDF-SHA256):<br/>1. secret → HKDF<br/>2. expand("paseto-v4-local-key")<br/>3. 32-byte symmetric key
    
    PASETO->>PASETO: Build Access Token
    Note over PASETO: Claims:<br/>- exp: now + expiration_hours<br/>- sub: user_id<br/>- username: string<br/>- token_type: "access"
    
    PASETO->>PASETO: Build Refresh Token
    Note over PASETO: Claims:<br/>- exp: now + refresh_expiration_days<br/>- sub: user_id<br/>- token_type: "refresh"
    
    PASETO-->>AuthService: (access_token, refresh_token)
    
    AuthService-->>Server: LoginResponse<br/>{access_token, refresh_token,<br/>expires_in, user}
    
    Server-->>Client: 200 OK<br/>{success: true, data: LoginResponse}
    
    Note over Client: Store tokens securely<br/>(httpOnly cookies or secure storage)
```

### 3. Authentication Middleware Flow

```mermaid
sequenceDiagram
    autonumber
    participant Client
    participant Middleware as AuthenticationMiddleware
    participant TokenValidator as Token Validator
    participant PASETO as PASETO Parser
    participant Handler as Protected Handler

    Client->>Middleware: Request with Authorization header<br/>Authorization: Bearer <access_token>
    
    Middleware->>Middleware: extract_bearer_token(request)
    
    alt No Authorization Header
        Middleware-->>Client: 401 Unauthorized<br/>WWW-Authenticate: Bearer<br/>{code: "MISSING_TOKEN"}
    end
    
    alt Invalid Token Format
        Middleware-->>Client: 401 Unauthorized<br/>WWW-Authenticate: Bearer error="invalid_token"<br/>{code: "INVALID_TOKEN_FORMAT"}
    end
    
    Middleware->>TokenValidator: validate_token(token, jwt_config)
    
    TokenValidator->>PASETO: Derive Key (HKDF-SHA256)
    Note over PASETO: secret → HKDF →<br/>"paseto-v4-local-key" →<br/>32-byte key
    
    PASETO->>PASETO: PasetoParser::parse(token, key)
    
    alt Token Decryption Failed
        PASETO-->>TokenValidator: Error
        TokenValidator-->>Middleware: AuthMiddlewareError::InvalidToken
        Middleware-->>Client: 401 Unauthorized<br/>WWW-Authenticate: Bearer error="invalid_token"<br/>{code: "INVALID_TOKEN"}
    end
    
    PASETO-->>TokenValidator: TokenClaims<br/>{sub, username, token_type, exp}
    
    TokenValidator->>TokenValidator: Check token_type == "access"
    
    alt Token Type is NOT "access"
        TokenValidator-->>Middleware: AuthMiddlewareError::InvalidTokenType
        Middleware-->>Client: 401 Unauthorized<br/>WWW-Authenticate: Bearer error="invalid_token"<br/>{code: "INVALID_TOKEN_TYPE",<br/>message: "Access token required"}
    end
    
    TokenValidator->>TokenValidator: Check exp > now
    
    alt Token Expired
        TokenValidator-->>Middleware: AuthMiddlewareError::TokenExpired
        Middleware-->>Client: 401 Unauthorized<br/>WWW-Authenticate: Bearer error="invalid_token",<br/>error_description="The access token expired"<br/>{code: "TOKEN_EXPIRED"}
    end
    
    TokenValidator-->>Middleware: TokenClaims (valid)
    
    Middleware->>Middleware: Create AuthenticatedUser<br/>{user_id, username}
    
    Middleware->>Middleware: req.extensions_mut().insert(user)
    
    Middleware->>Handler: Forward request with AuthenticatedUser
    
    Handler-->>Client: Response (200 OK / etc.)
```

### 4. Token Refresh Flow (Conceptual)

```mermaid
sequenceDiagram
    autonumber
    participant Client
    participant Server as Auth Handler
    participant AuthService
    participant PASETO as PASETO Parser/Generator
    participant UserRepo as UserRepository
    participant Database as PostgreSQL

    Note over Client: Access Token expired<br/>(received 401 TOKEN_EXPIRED)

    Client->>Server: POST /api/v1/auth/refresh<br/>{refresh_token}
    
    Server->>AuthService: refresh(pool, jwt_config, refresh_token)
    
    AuthService->>PASETO: Validate refresh_token
    
    Note over PASETO: Key Derivation (HKDF-SHA256)
    
    PASETO->>PASETO: Parse and decrypt token
    
    alt Token Invalid/Expired
        PASETO-->>AuthService: Error
        AuthService-->>Server: AuthError::InvalidToken
        Server-->>Client: 401 Unauthorized<br/>{code: "INVALID_REFRESH_TOKEN"}
    end
    
    PASETO-->>AuthService: Claims {sub, token_type, exp}
    
    AuthService->>AuthService: Verify token_type == "refresh"
    
    alt Wrong Token Type
        AuthService-->>Server: AuthError::InvalidTokenType
        Server-->>Client: 401 Unauthorized<br/>{code: "INVALID_TOKEN_TYPE"}
    end
    
    AuthService->>UserRepo: find_by_id(pool, user_id)
    UserRepo->>Database: SELECT * FROM users WHERE user_id = ?
    Database-->>UserRepo: User
    UserRepo-->>AuthService: User
    
    alt User Not Found (deleted account)
        AuthService-->>Server: AuthError::UserNotFound
        Server-->>Client: 401 Unauthorized<br/>{code: "USER_NOT_FOUND"}
    end
    
    AuthService->>PASETO: generate_tokens(user, jwt_config)
    
    PASETO-->>AuthService: (new_access_token, new_refresh_token)
    
    AuthService-->>Server: TokenRefreshResponse<br/>{access_token, refresh_token, expires_in}
    
    Server-->>Client: 200 OK<br/>{success: true, data: TokenRefreshResponse}
    
    Note over Client: Replace old tokens with new ones
```

### 5. Complete Authentication Lifecycle

```mermaid
sequenceDiagram
    autonumber
    participant Client
    participant Server
    participant Middleware
    participant ProtectedAPI

    rect rgb(200, 230, 200)
        Note over Client,Server: Registration Phase
        Client->>Server: POST /api/v1/auth/register
        Server-->>Client: 201 Created {user_id, username}
    end

    rect rgb(200, 200, 230)
        Note over Client,Server: Login Phase
        Client->>Server: POST /api/v1/auth/login
        Server-->>Client: 200 OK {access_token, refresh_token, expires_in}
        Note over Client: Store tokens securely
    end

    rect rgb(230, 230, 200)
        Note over Client,ProtectedAPI: Access Protected Resources
        Client->>Middleware: GET /api/v1/folders<br/>Authorization: Bearer <access_token>
        Middleware->>Middleware: Validate access_token
        Middleware->>ProtectedAPI: Forward with AuthenticatedUser
        ProtectedAPI-->>Client: 200 OK {folders data}
    end

    rect rgb(230, 200, 200)
        Note over Client,Server: Token Expired - Refresh
        Client->>Middleware: GET /api/v1/folders<br/>Authorization: Bearer <expired_token>
        Middleware-->>Client: 401 TOKEN_EXPIRED
        
        Client->>Server: POST /api/v1/auth/refresh<br/>{refresh_token}
        Server-->>Client: 200 OK {new_access_token, new_refresh_token}
        
        Client->>Middleware: GET /api/v1/folders<br/>Authorization: Bearer <new_access_token>
        Middleware->>ProtectedAPI: Forward request
        ProtectedAPI-->>Client: 200 OK {folders data}
    end

    rect rgb(220, 220, 220)
        Note over Client,Server: Logout Phase
        Client->>Server: POST /api/v1/auth/logout<br/>Authorization: Bearer <access_token>
        Server-->>Client: 200 OK {message: "Logged out"}
        Note over Client: Discard all tokens from storage
    end
```

---

## Token Structure

### Access Token (PASETO v4.local)

| Claim | Type | Description |
|-------|------|-------------|
| `exp` | RFC 3339 datetime | Expiration time (configurable, default: 1 hour) |
| `sub` | UUID string | User ID |
| `username` | string | Username |
| `token_type` | string | Always `"access"` |

### Refresh Token (PASETO v4.local)

| Claim | Type | Description |
|-------|------|-------------|
| `exp` | RFC 3339 datetime | Expiration time (configurable, default: 7 days) |
| `sub` | UUID string | User ID |
| `token_type` | string | Always `"refresh"` |

---

## Password Requirements (NIST SP 800-63B)

- Minimum **12 characters**
- At least **1 uppercase letter**
- At least **1 lowercase letter**
- At least **1 digit**
- At least **1 special character**

---

## Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `VALIDATION_ERROR` | 400 | Request validation failed |
| `USERNAME_EXISTS` | 409 | Username already taken |
| `INVALID_CREDENTIALS` | 401 | Wrong username or password |
| `MISSING_TOKEN` | 401 | No Authorization header |
| `INVALID_TOKEN_FORMAT` | 401 | Token format invalid (not `Bearer <token>`) |
| `INVALID_TOKEN` | 401 | Token decryption/parsing failed |
| `TOKEN_EXPIRED` | 401 | Token has expired |
| `INVALID_TOKEN_TYPE` | 401 | Wrong token type (e.g., using refresh token as access) |

---

## Configuration

Environment variables for JWT/PASETO configuration:

```env
JWT__SECRET=your-secret-key-at-least-32-characters
JWT__EXPIRATION_HOURS=1
JWT__REFRESH_EXPIRATION_DAYS=7
```

---

## Security Notes

1. **Stateless Authentication**: Server ไม่เก็บ session state, tokens เป็น self-contained
2. **Token Encryption**: ใช้ PASETO v4.local (symmetric encryption) แทน JWT เพื่อความปลอดภัยที่ดีกว่า
3. **Key Derivation**: ใช้ HKDF-SHA256 (RFC 5869) เพื่อ derive key จาก secret
4. **CPU-bound Operations**: Password hashing/verification ใช้ `spawn_blocking` เพื่อไม่ block async runtime
5. **WWW-Authenticate Header**: Response 401 จะมี header ตาม RFC 6750 เพื่อบอก client ว่าต้องทำอย่างไร
