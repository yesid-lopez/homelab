# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Overview

This is a Kubernetes homelab setup using GitOps principles with Flux CD, running on a hybrid cluster with K3s. The infrastructure is managed as code using Kustomize and Helm.

## Hardware Architecture

- **Master Node**: Minisforum UM690 (16GB RAM, 1TB NVMe, Ubuntu Server)
- **Worker Node**: Raspberry Pi 5 (8GB RAM, 256GB NVMe)
- **Network**: 2.5Gb unmanaged switch

## Technology Stack

- **Kubernetes Distribution**: K3s (master node with `--cluster-init`, worker node joined via token)
- **GitOps**: Flux CD for continuous deployment
- **Configuration Management**: Kustomize for resource management
- **Package Management**: Helm charts for complex applications
- **Secret Management**: Sealed Secrets for secure secret storage
- **Ingress**: NGINX Ingress Controller (currently NodePort, planned LoadBalancer)
- **Storage**: Longhorn for persistent volumes
- **Load Balancing**: MetalLB (disabled K3s servicelb)
- **DNS**: External DNS with Porkbun provider
- **Certificates**: cert-manager with Let's Encrypt and Porkbun webhook

## Ingress Configuration

### Domain Strategy
- **Primary domains**: `resumelo.me` and `yesidlopez.de`
- **Subdomain pattern**: Use `homelab.resumelo.me` or `homelab.yesidlopez.de` depending on the application
- Choose domain based on application context and ownership

### Certificate Issuers
- **acme-issuer**: Use for `yesidlopez.de` domains
- **resumelo-issuer**: Use for `resumelo.me` domains

## Directory Structure

```
homelab/
├── apps/production/          # Application deployments
│   ├── resumelo/            # Multi-environment app (dev/prod)
│   ├── langfuse/            # AI observability platform
│   ├── umami/               # Web analytics
│   └── ...                  # Other applications
├── infrastructure/
│   ├── controllers/         # Infrastructure controllers (MetalLB, NGINX, etc.)
│   └── configs/             # Configuration resources (cluster issuers, etc.)
├── clusters/production/     # Flux CD cluster configuration
│   ├── apps.yaml           # Application deployments
│   └── infrastructure.yaml # Infrastructure deployments
└── docs/                   # Documentation
```

## Essential Commands

### Secret Management

```bash
# Encrypt secrets using Sealed Secrets
make encrypt INPUT=secret.yaml [OUTPUT=sealed-secret.yaml]

# Validate sealed secrets
make validate-sealed INPUT=sealed-secret.yaml

# Manual encryption (if Makefile unavailable)
kubeseal --format yaml --controller-namespace flux-system --controller-name sealed-secrets-controller < secret.yaml > sealed-secret.yaml
```

### Kubernetes Operations

```bash
# Check cluster status
kubectl get nodes
kubectl get pods -A

# Check Flux CD status
flux get sources git
flux get kustomizations

# Check application status
kubectl get kustomizations -n flux-system
```

## Architecture Patterns

### GitOps Flow

1. **Infrastructure Controllers**: Deployed first (MetalLB, NGINX, cert-manager, etc.)
2. **Infrastructure Configs**: Deployed second (cluster issuers, IP pools, etc.)
3. **Applications**: Deployed last, depends on infrastructure being ready

### Application Structure

- **Base**: Common resources (namespace, deployment, service, ingress)
- **Overlays**: Environment-specific patches (dev/prod)
- **Sealed Secrets**: Encrypted secrets per environment
- **Image Automation**: Flux CD automatic image updates for dev environments

### Helm Integration

Applications using Helm charts follow this pattern:
- `helmrepository.yaml`: Chart repository definition
- `helmrelease.yaml`: Release configuration
- `configmap-helm-values.yaml`: Values configuration

## Current Limitations

### External DNS
- Porkbun webhook only supports single domain (yesidlopez.de)
- Multiple domains (resumelo.me, luloai.com) planned but blocked by webhook limitation

### Ingress Controller
- Currently using NodePort due to router limitations
- Planned migration to LoadBalancer when new FritzBox router arrives

## Security Considerations

- All secrets are managed through Sealed Secrets
- Never commit plain text secrets to repository
- Sealed secrets are namespace/name specific and cluster-bound
- Private keys for sealed secrets are stored in cluster only

## Development Workflow

1. Make changes to YAML manifests
2. For secrets: create plain secret → encrypt with kubeseal → commit sealed secret
3. Commit changes to git
4. Flux CD automatically syncs changes to cluster
5. Monitor deployment status with `flux get kustomizations`

## Key Applications

- **resumelo**: Multi-environment Node.js application with MongoDB
- **langfuse**: AI observability platform with PostgreSQL
- **umami**: Web analytics with PostgreSQL
- **docker-registry**: Private Docker registry with UI
- **ddns-updater**: Dynamic DNS updates
- **gotenberg**: PDF generation service