# Kubernetes manifests (`infra/k8s/`)

Production-quality Kubernetes manifests for self-hosting JGAIR on a single
cluster. These are opinionated defaults, not a Helm chart — small enough that
you can read and audit every field before applying them.

Sibling deployment scenarios elsewhere in the repo:

- `../fly/` — Fly.io single-region deployment (backend + Fly Postgres).
- `../../docker-compose.prod.yml` — single-node self-host, no orchestrator.
- `../../render.yaml`, `../../frontend/vercel.json` — hosted (Render + Vercel).

## What this deploys

| Resource                          | Purpose                                        |
| --------------------------------- | ---------------------------------------------- |
| `namespace.yaml`                  | Isolates all workloads in the `jgair` namespace |
| `backend-deployment.yaml`         | FastAPI app, 2 replicas                        |
| `backend-service.yaml`            | ClusterIP for the backend on port 8000         |
| `frontend-deployment.yaml`        | nginx serving the pre-built React bundle       |
| `frontend-service.yaml`           | ClusterIP for the frontend on port 80          |
| `ingress.yaml`                    | nginx-ingress + cert-manager TLS               |
| `postgres-statefulset.yaml`       | Postgres 15 for dev clusters (see caveats)     |
| `backend-cronjob-scheduled.yaml`  | Hourly tick that calls `/scheduled-tasks/run`  |
| `backend-cronjob-backup.yaml`     | Nightly `pg_dump` (02:00 UTC)                  |
| `secrets.example.yaml`            | Commented sample of required env vars          |

## Prerequisites

- Kubernetes 1.27+ (any conformant distro — kind, k3s, EKS, GKE, AKS all fine).
- [`ingress-nginx`](https://kubernetes.github.io/ingress-nginx/) installed
  cluster-wide (`ingressClassName: nginx`).
- [`cert-manager`](https://cert-manager.io/) installed with a
  `ClusterIssuer` named `letsencrypt-prod`. Create your own — this repo does
  not ship it.
- A published backend image at
  `ghcr.io/vasudev-2468/journal_management_system-backend:latest`
  (adjust the `image:` field if you push to a different registry).
- A frontend image with the built static bundle baked into
  `nginx:1.27-alpine` (see `../../frontend/Dockerfile` — build it and push
  as e.g. `ghcr.io/vasudev-2468/journal_management_system-frontend:latest`).

## First-time apply

```bash
# 1. Copy the sample secret file, fill in real values, and apply it
#    OUT-OF-BAND (do NOT check the filled-in copy into git).
cp infra/k8s/secrets.example.yaml /tmp/jgair-backend-env.yaml
$EDITOR /tmp/jgair-backend-env.yaml
kubectl apply -f /tmp/jgair-backend-env.yaml

# 2. Apply everything else via kustomize.
kubectl apply -k infra/k8s/

# 3. Wait for rollout.
kubectl -n jgair rollout status deploy/backend
kubectl -n jgair rollout status deploy/frontend

# 4. Run migrations once (kubectl exec into one backend pod).
kubectl -n jgair exec deploy/backend -- alembic upgrade head
```

## Health probes

The backend Deployment probes:

- Liveness: `GET /system/health/live` — is the process alive?
- Readiness: `GET /system/health/ready` — can it serve traffic (DB reachable)?

These paths are prescribed for the deployment. Wire real handlers on the app
side under `/system/health/*` before rolling out. Until they exist, probes
will fail — do a one-off swap to `/health` in the Deployment if you need to
bring the cluster up first.

## Postgres in production

`postgres-statefulset.yaml` is fine for dev / staging / a single-node
homelab. For anything you care about, delete it and point `DATABASE_URL`
at a managed service (Neon, RDS, Cloud SQL, Supabase). Managed Postgres
gets you PITR, HA, and connection pooling that a StatefulSet-with-PVC
doesn't.

## Scheduled work

- `backend-cronjob-scheduled.yaml` runs hourly and POSTs to
  `/scheduled-tasks/run` with the `X-Scheduled-Tasks-Secret` header. This
  replaces the GitHub Actions cron for on-cluster deployments.
- `backend-cronjob-backup.yaml` runs `pg_dump` nightly using the same
  `postgres:15` image as the docker-compose backup sidecar. Dumps land on
  an emptyDir by default — swap it for a PVC or an S3 upload step in
  your own copy.

## Customisation

Every teammate should copy this directory into an overlay
(e.g. `infra/k8s/overlays/prod/kustomization.yaml`) rather than editing
these base files, so a `git pull` doesn't clobber their tweaks:

```yaml
# infra/k8s/overlays/prod/kustomization.yaml
resources:
  - ../..
images:
  - name: ghcr.io/vasudev-2468/journal_management_system-backend
    newTag: v1.4.2
  - name: ghcr.io/vasudev-2468/journal_management_system-frontend
    newTag: v1.4.2
```

Then `kubectl apply -k infra/k8s/overlays/prod/`.
