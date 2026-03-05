# ISS-1: Password with `#` breaks dotenv parsing

**Severity:** Blocker
**Found:** 2026-03-05
**Time lost:** ~30 min

## Problem

The provided password contains a `#` character. Dotenv treats `#` as an inline comment delimiter, so:

```
STACK_AI_PASSWORD=some_pass#rest
```

is parsed as `some_pass` — silently truncating everything after `#`. Auth returns `400 Bad Request` with no indication that the password was mangled.

## Fix

Wrap the value in double quotes in `.env.local`:

```
STACK_AI_PASSWORD="<password-with-hash>"
```
