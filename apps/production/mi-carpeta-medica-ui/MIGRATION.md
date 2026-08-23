# medidocs-ui → mi-carpeta-medica-ui

Stateless service (no database) — this was a straight cutover, not a
staged migration: `mi-carpeta-medica-ui` now points directly at
`mi-carpeta-medica-api`, and `medidocs-ui`/`medidocs-api` are decommissioned
(their Postgres/MinIO data was deliberately discarded rather than migrated).
