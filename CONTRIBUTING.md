# Contributing

Thanks for taking the time to contribute. Here's what you need to know.

## Getting started

Follow the setup steps in [README.md](README.md) to get the project running locally. You'll need valid ElevenLabs and Twilio credentials — the project won't function without them.

## Workflow

1. **Open an issue first** for anything non-trivial. Features, API changes, and refactors are much easier to review when there's prior discussion about the approach.
2. Fork the repo and create a branch from `main`.
3. Make your changes. Keep commits focused — one logical change per commit.
4. Open a pull request and fill in the template. Describe *why*, not just *what*.

## Branch naming

```
feat/short-description
fix/short-description
chore/short-description
docs/short-description
```

## Code style

No linter config is enforced yet, but try to match the style of the surrounding code:
- 2-space indent
- Single quotes in JS
- No semicolons in frontend (React files), semicolons optional in backend
- Keep functions small and named clearly

## Pull requests

- Target `main`
- One feature or fix per PR — don't bundle unrelated changes
- Update `.env.example` if you add or remove environment variables
- If you change any API endpoints, update the API table in README.md

## Issues

Search open issues before filing a new one. Include the Node version, OS, and relevant logs when reporting a bug.
