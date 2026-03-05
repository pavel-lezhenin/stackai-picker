# Issues Found in Assignment Environment

Bugs and undocumented behaviors discovered in the provided test environment.
Each issue caused deviation from the planned implementation timeline.

| ID                                             | Severity | Title                                                                     | Time Lost |
| ---------------------------------------------- | -------- | ------------------------------------------------------------------------- | --------- |
| [ISS-1](ISS-1-env-password-hash.md)            | Blocker  | Password with `#` breaks dotenv parsing                                   | ~30 min   |
| [ISS-2](ISS-2-wrong-api-domain.md)             | Blocker  | API base URL in assignment is wrong                                       | ~1 hours  |
| [ISS-3](ISS-3-undocumented-v1-prefix.md)       | Blocker  | Endpoints require `/v1/` prefix                                           | ~20 min   |
| [ISS-4](ISS-4-response-shape-mismatch.md)      | Major    | API response shapes differ from docs                                      | ~40 min   |
| [ISS-5](ISS-5-kb-endpoint-hyphen.md)           | Blocker  | KB create endpoint uses hyphens, not underscores                          | ~30 min   |
| [ISS-6](ISS-6-sync-endpoint-shape.md)          | Blocker  | Sync endpoint is POST, not GET, with wrong path structure                 | ~10 min   |
| [ISS-7](ISS-7-kb-resources-endpoint-hyphen.md) | Blocker  | KB resources/delete endpoints use underscores in docs, hyphens in reality | ~5 min    |
