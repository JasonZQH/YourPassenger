# auth-service

Identity and token service.

Ownership:

- Apple and Guest sign-in flows
- identity mapping
- access token and refresh token issuance
- auth identity persistence

Current HTTP surface:

- `POST /v1/auth/apple`
- `POST /v1/auth/guest`
- `GET /v1/me`
- `GET /v1/health/live`
- `GET /v1/health/ready`
