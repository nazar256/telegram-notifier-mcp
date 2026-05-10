# Security Policy

## Supported versions

Only the latest state of the `main` branch is currently supported.

## Reporting a vulnerability

Please do not open a public GitHub issue for security-sensitive reports.

Instead, report vulnerabilities privately via one of these channels:

- GitHub Security Advisories / private vulnerability report for this repository
- direct contact with the maintainer if a private channel is already established

Please include:

- affected endpoint or flow
- reproduction steps
- expected vs actual behavior
- impact assessment
- any suggested fix or mitigation

## Security notes for operators

- Rotate `OAUTH_JWT_SIGNING_KEY_B64`, `UPSTREAM_CONFIG_ENC_KEY_B64`, and `CSRF_SIGNING_KEY_B64` if compromise is suspected.
- Rotating those keys invalidates existing OAuth artifacts and access tokens.
- Keep `OAUTH_REDIRECT_HTTPS_HOSTS` narrowly scoped to intended OAuth clients.
- Keep access-token TTLs as short as practical for your deployment.
- Do not use this server to send secrets, credentials, or regulated/sensitive user data through Telegram.
