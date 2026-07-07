# Auth API Handoff: New User Nickname Onboarding

This note is for backend/frontend agents coordinating auth changes.

## Current Contract

All auth endpoints that return a session use this response shape:

```json
{
  "user": {
    "id": "1",
    "username": "google_123",
    "email": "user@example.com",
    "authProvider": "google",
    "nickname": "Google user",
    "nicknameOnboarded": false,
    "profileImageUrl": null
  },
  "accessToken": "jwt.access.token",
  "isNewUser": true,
  "needsNickname": true
}
```

## `isNewUser` Meaning

- `POST /api/auth/signup`: returns `isNewUser: true` after creating the local email account.
- `POST /api/auth/google`: returns `isNewUser: true` only when the Google identity creates a new user row.
- `POST /api/auth/kakao`: returns `isNewUser: true` only when the Kakao identity creates a new user row.
- `POST /api/auth/login`: returns `isNewUser: false`.
- `POST /api/auth/guest`: returns `isNewUser: false`; guest onboarding is intentionally skipped.

## `needsNickname` Meaning

- This is the frontend routing flag.
- If `needsNickname: true`, the frontend must show the nickname-only onboarding screen before entering the map.
- If the user closes the app before completing nickname onboarding, later login with the same account should still return `needsNickname: true`.
- After nickname is saved with `PATCH /api/profile/me`, later login should return `needsNickname: false` and enter the map directly with the stored DB nickname.
- Guest users should always return `needsNickname: false`.

## Nickname Flow

The frontend stores the session first, then if `needsNickname === true` and
`user.authProvider` is `local`, `google`, or `kakao`, it shows a nickname-only
screen.

Nickname save reuses the existing profile endpoint:

```http
PATCH /api/profile/me
Authorization: Bearer {accessToken}
Content-Type: application/json

{ "nickname": "고양이탐험가" }
```

The response is the updated public user. Backend should mark
`nickname_onboarded = TRUE` when this request updates `nickname`. No separate
nickname endpoint is required.

## Profile Image Flow

Settings no longer asks users to type a profile image URL. The frontend loads
the user's gallery with `GET /api/gallery/me`, lets the user pick a photo, and
sends that photo's `imageUrl` to profile update.

`PATCH /api/profile/me` must accept:

- `profileImageUrl: "https://..."` for existing social/external images.
- `profileImageUrl: "/uploads/..."` for backend-served gallery photos.
- `profileImageUrl: null` to clear the profile image.

Example:

```http
PATCH /api/profile/me
Authorization: Bearer {accessToken}
Content-Type: application/json

{ "nickname": "고양이탐험가", "profileImageUrl": "/uploads/1712345678-cat.jpg" }
```

## Email Signup Request

The new frontend no longer sends nickname in `POST /api/auth/signup`.

Required fields:

```json
{
  "email": "user@example.com",
  "code": "123456",
  "username": "user@example.com",
  "password": "12345678"
}
```

The backend still accepts optional `nickname` for backward compatibility. When
it is omitted, the backend creates a temporary nickname from the email prefix,
sets `nickname_onboarded = FALSE`, and returns `needsNickname: true`.
