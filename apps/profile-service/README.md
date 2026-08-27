# profile-service

Profile and onboarding data service.

Ownership:

- profile CRUD
- nickname and onboarding state
- profile completeness projection

Current HTTP surface:

- `GET /v1/profiles/:userId`
- `GET /v1/profiles/:userId/completion`
- `PUT /v1/profiles/:userId`
- `GET /v1/health/live`
- `GET /v1/health/ready`
