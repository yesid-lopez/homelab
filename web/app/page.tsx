const stats = [
  { label: "Kubernetes distro", value: "K3s" },
  { label: "Control plane", value: "Minisforum UM690" },
  { label: "Worker", value: "Raspberry Pi 5" },
  { label: "GitOps", value: "Flux CD" },
  { label: "Storage", value: "Longhorn" },
  { label: "Ingress", value: "NGINX + MetalLB" },
];

const hardware = [
  {
    name: "Minisforum UM690",
    role: "Master / control-plane node",
    details: ["16 GB RAM", "1 TB NVMe", "Ubuntu Server", "K3s server with embedded etcd", "Swap disabled"],
  },
  {
    name: "Raspberry Pi 5",
    role: "Worker node",
    details: ["8 GB RAM", "256 GB NVMe", "K3s agent", "Swap disabled", "Memory cgroups enabled via /boot/firmware/cmdline.txt"],
  },
  {
    name: "2.5 Gb unmanaged switch",
    role: "LAN backbone",
    details: ["Router connects to the switch", "Both nodes attach to the same local network", "MetalLB advertises services on the LAN"],
  },
];

const bootstrapCommands = [
  {
    title: "Control plane initialization",
    command: "curl -sfL https://get.k3s.io | sh -s - server --cluster-init --disable=servicelb --disable=traefik",
  },
  {
    title: "Worker join",
    command: "curl -sfL https://get.k3s.io | K3S_URL=https://MASTER_IP:6443 K3S_TOKEN=MY_COOL_TOKEN sh -",
  },
];

const controllers = [
  ["Flux Operator", "Runs Flux as the cluster GitOps control plane and reconciles this repository."],
  ["Flux Operator MCP", "Provides MCP access around Flux operations for automation/debugging workflows."],
  ["Sealed Secrets", "Keeps encrypted Kubernetes secrets in Git while avoiding plaintext secret commits."],
  ["cert-manager", "Automates TLS certificates for public ingress endpoints."],
  ["cert-manager Porkbun webhook", "DNS-01 ACME integration for Porkbun-hosted zones."],
  ["external-dns", "Publishes DNS records from ingress annotations to Porkbun."],
  ["NGINX Ingress Controller", "Primary HTTP ingress controller; Traefik is disabled in K3s."],
  ["MetalLB", "Bare-metal LoadBalancer implementation for the home LAN."],
  ["Longhorn", "Distributed persistent volume storage and default storage class."],
  ["CloudNativePG", "PostgreSQL operator for app databases such as Umami and Lulo CMS."],
  ["Prometheus", "Metrics collection, alerting rules, and Alertmanager endpoints."],
  ["Grafana", "Dashboards for cluster and application observability."],
  ["Loki", "Log aggregation backend."],
  ["Alloy", "Telemetry collection pipeline for metrics/logs."],
  ["System Upgrade Controller", "K3s/node upgrade automation using Rancher upgrade plans."],
];

const apps = [
  {
    name: "Resumelo",
    namespace: "resumelo / resumelo-dev",
    purpose: "Resume/CV product deployed with separate production and development overlays.",
    details: [
      "Base Kubernetes deployment with overlay-specific image patches.",
      "Production image currently tracks registry.yesidlopez.de/resumelo:0.9.1.",
      "Development image tracks registry.yesidlopez.de/resumelo-dev with Flux image automation.",
      "Development environment includes MongoDB 7.0.5 with persistent storage.",
      "Application resources: 100m CPU / 128Mi requests and 500m CPU / 512Mi limits in the base deployment.",
    ],
  },
  {
    name: "Macondo",
    namespace: "macondo",
    purpose: "Application served from the private registry with multiple external integrations.",
    details: [
      "Image: registry.yesidlopez.de/macondo:1.3.3 with Flux image policy comments.",
      "Ingress-enabled service with TLS and external DNS annotations.",
      "Uses sealed secrets for R2, Replicate, RevenueCat, Supabase, and registry credentials.",
      "Resource envelope: 100m CPU / 128Mi requests and 500m CPU / 512Mi limits.",
    ],
  },
  {
    name: "Tayrona",
    namespace: "tayrona",
    purpose: "Custom application deployed from the private registry.",
    details: [
      "Image: registry.yesidlopez.de/tayrona:0.1.1.",
      "Ingress + service + namespace managed through Kustomize.",
      "Uses sealed secrets for OpenAI and registry credentials.",
      "Resource envelope: 100m CPU / 128Mi requests and 500m CPU / 512Mi limits.",
    ],
  },
  {
    name: "Lulo CMS",
    namespace: "lulo-cms",
    purpose: "Payload/CMS-style backend with a CloudNativePG PostgreSQL database.",
    details: [
      "Image: registry.yesidlopez.de/lulo-cms:1.0.1.",
      "CloudNativePG cluster requests 250m CPU / 512Mi and limits 500m CPU / 1Gi.",
      "Application requests 100m CPU / 128Mi and limits 500m CPU / 512Mi.",
      "Uses sealed Payload secrets and sealed registry credentials.",
    ],
  },
  {
    name: "Umami",
    namespace: "umami",
    purpose: "Self-hosted analytics stack with Postgres and weekly reporting automation.",
    details: [
      "HelmRelease-managed Umami deployment with custom values.",
      "CloudNativePG PostgreSQL database with 250m CPU / 512Mi requests and 500m CPU / 1Gi limits.",
      "Ingress host: umami.yesidlopez.de.",
      "Includes a CronJob to sync the admin password and a Python weekly report CronJob for Discord notifications.",
      "Application resources: 100m CPU / 128Mi requests and 500m CPU / 512Mi limits.",
    ],
  },
  {
    name: "Docker Registry + UI",
    namespace: "registry",
    purpose: "Private image registry for homelab applications and a web UI for browsing/deleting images.",
    details: [
      "Registry is installed from twuni/docker-registry.helm v3.0.0.",
      "Persistent storage is enabled on Longhorn with a 20Gi volume.",
      "Registry host: registry.yesidlopez.de.",
      "UI chart: joxit/docker-registry-ui v1.1.4.",
      "UI host: registry-ui.yesidlopez.de.",
      "Registry deletion is enabled and CORS is configured for the UI origin.",
    ],
  },
  {
    name: "eBay Kleinanzeigen API",
    namespace: "ebay-kleinanzeigen-api",
    purpose: "Internal API service used for Kleinanzeigen scraping/search workflows.",
    details: [
      "Image: registry.yesidlopez.de/ebay-kleinanzeigen-api:v1.0.1 with Flux image automation.",
      "ClusterIP service, namespace, deployment, and sealed registry secret managed by Kustomize.",
      "Resource envelope: 250m CPU / 256Mi requests and 1000m CPU / 512Mi limits.",
    ],
  },
  {
    name: "Gotenberg",
    namespace: "gotenberg",
    purpose: "Document/PDF conversion service deployed by HelmRelease.",
    details: [
      "Custom Helm values configure workload resources.",
      "Resource envelope: 200m CPU / 512Mi requests and 500m CPU / 1Gi limits.",
    ],
  },
  {
    name: "DDNS Updater",
    namespace: "ddns-updater",
    purpose: "Dynamic DNS updater for keeping external DNS targets in sync with the home connection.",
    details: [
      "Image: qmcgaw/ddns-updater:latest.",
      "Config is injected through a SealedSecret-backed Kubernetes Secret.",
      "ClusterIP service exposes port 80 to container port 8000.",
      "Resource envelope: 100m CPU / 64Mi requests and 200m CPU / 128Mi limits.",
    ],
  },
];

const ingressHosts = [
  "homelab.yesidlopez.de",
  "grafana.yesidlopez.de",
  "umami.yesidlopez.de",
  "registry.yesidlopez.de",
  "registry-ui.yesidlopez.de",
  "prometheus.homelab.yesidlopez.de",
  "alertmanager.homelab.yesidlopez.de",
  "langfuse.yesidlopez.de",
];

const gitopsFlow = [
  "Changes are committed to GitHub in yesid-lopez/homelab.",
  "Flux watches cluster, infrastructure, and app Kustomizations from clusters/production.",
  "Infrastructure controllers are reconciled from infrastructure/controllers.",
  "Cluster configuration such as issuers, Longhorn classes, and MetalLB pools is reconciled from infrastructure/configs.",
  "Applications are reconciled from apps/production with per-app Kustomize folders and HelmRelease resources.",
  "Secrets are committed only as SealedSecrets; plaintext secrets are intentionally excluded.",
  "Validation runs yamllint, kubeconform, and kustomize build on pull requests.",
];

const storageAndData = [
  ["Longhorn", "Default persistent storage layer for workloads that need volumes."],
  ["Docker Registry PVC", "20Gi Longhorn-backed ReadWriteOnce volume for image storage."],
  ["CloudNativePG", "Operator-managed PostgreSQL clusters for apps such as Umami and Lulo CMS."],
  ["MongoDB", "Resumelo development overlay includes a MongoDB 7.0.5 instance with a persistent volume claim."],
];

const validation = ["yamllint", "kubeconform with Kubernetes 1.31 schemas", "Flux CRD schemas", "kustomize build for infrastructure, apps, and clusters"];

function Section({ id, eyebrow, title, children }: { id: string; eyebrow: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="section">
      <p className="eyebrow">{eyebrow}</p>
      <h2>{title}</h2>
      {children}
    </section>
  );
}

function CodeBlock({ children }: { children: string }) {
  return <pre><code>{children}</code></pre>;
}

export default function Home() {
  return (
    <main>
      <section className="hero">
        <div className="heroGrid">
          <div>
            <p className="eyebrow">K3s · GitOps · Bare metal</p>
            <h1>Yesid&apos;s Homelab</h1>
            <p className="lead">
              A production-style Kubernetes homelab running on compact hardware, managed entirely through Flux CD,
              Kustomize, HelmRelease resources, Sealed Secrets, Longhorn storage, MetalLB networking, automated DNS,
              TLS certificates, observability, and self-hosted applications.
            </p>
            <div className="actions">
              <a href="https://github.com/yesid-lopez/homelab">GitHub repository</a>
              <a href="#apps" className="secondary">Explore apps</a>
            </div>
          </div>
          <div className="heroCard" aria-label="Homelab summary stats">
            {stats.map((item) => (
              <div key={item.label}>
                <span>{item.label}</span>
                <strong>{item.value}</strong>
              </div>
            ))}
          </div>
        </div>
      </section>

      <Section id="architecture" eyebrow="Architecture" title="Two-node K3s cluster behind a home router">
        <div className="architecture">
          <div className="node internet">Internet</div>
          <div className="line" />
          <div className="node">Router / entry point</div>
          <div className="line" />
          <div className="node">2.5 Gb unmanaged switch</div>
          <div className="split">
            {hardware.slice(0, 2).map((item) => (
              <article className="card" key={item.name}>
                <p className="tag">{item.role}</p>
                <h3>{item.name}</h3>
                <ul>
                  {item.details.map((detail) => <li key={detail}>{detail}</li>)}
                </ul>
              </article>
            ))}
          </div>
        </div>
        <div className="grid three">
          {hardware.map((item) => (
            <article className="card" key={item.name}>
              <p className="tag">{item.role}</p>
              <h3>{item.name}</h3>
              <ul>{item.details.map((detail) => <li key={detail}>{detail}</li>)}</ul>
            </article>
          ))}
        </div>
      </Section>

      <Section id="bootstrap" eyebrow="Bootstrap" title="K3s is installed with the built-in load balancer and Traefik disabled">
        <p>
          The cluster keeps K3s lean and delegates load balancing and ingress to dedicated controllers. Swap is disabled
          on both nodes, and the Raspberry Pi has memory cgroups enabled for Kubernetes compatibility.
        </p>
        <div className="grid two">
          {bootstrapCommands.map((item) => (
            <article className="card" key={item.title}>
              <h3>{item.title}</h3>
              <CodeBlock>{item.command}</CodeBlock>
            </article>
          ))}
        </div>
      </Section>

      <Section id="gitops" eyebrow="GitOps" title="Everything flows through Git, Flux, Kustomize, and HelmRelease resources">
        <ol className="timeline">
          {gitopsFlow.map((item) => <li key={item}>{item}</li>)}
        </ol>
        <div className="note">
          No cluster mutation is required for normal changes. The repository is the source of truth; Flux reconciles the
          declared state into the cluster.
        </div>
      </Section>

      <Section id="controllers" eyebrow="Platform controllers" title="Infrastructure building blocks">
        <div className="grid two">
          {controllers.map(([name, description]) => (
            <article className="card compact" key={name}>
              <h3>{name}</h3>
              <p>{description}</p>
            </article>
          ))}
        </div>
      </Section>

      <Section id="networking" eyebrow="Networking, DNS, TLS" title="Public ingress with NGINX, MetalLB, external-dns, and cert-manager">
        <p>
          K3s ServiceLB and Traefik are disabled so the cluster can use MetalLB for LoadBalancer semantics and NGINX for
          ingress. external-dns publishes records to Porkbun, while cert-manager and the Porkbun webhook handle ACME DNS
          validation for TLS certificates.
        </p>
        <div className="chips">
          {ingressHosts.map((host) => <span key={host}>{host}</span>)}
        </div>
      </Section>

      <Section id="storage" eyebrow="Storage and data" title="Persistent data is handled by Longhorn and database operators">
        <div className="grid two">
          {storageAndData.map(([name, description]) => (
            <article className="card compact" key={name}>
              <h3>{name}</h3>
              <p>{description}</p>
            </article>
          ))}
        </div>
      </Section>

      <Section id="apps" eyebrow="Applications" title="Production workloads deployed from apps/production">
        <div className="appList">
          {apps.map((app) => (
            <article className="appCard" key={app.name}>
              <div>
                <p className="tag">Namespace: {app.namespace}</p>
                <h3>{app.name}</h3>
                <p>{app.purpose}</p>
              </div>
              <ul>{app.details.map((detail) => <li key={detail}>{detail}</li>)}</ul>
            </article>
          ))}
        </div>
      </Section>

      <Section id="observability" eyebrow="Observability" title="Metrics, logs, dashboards, alerting, and reports">
        <div className="grid two">
          <article className="card">
            <h3>Metrics and dashboards</h3>
            <p>
              Prometheus collects metrics, Alertmanager exposes alerts, and Grafana provides dashboards. Public/internal
              endpoints include prometheus.homelab.yesidlopez.de, alertmanager.homelab.yesidlopez.de, and grafana.yesidlopez.de.
            </p>
          </article>
          <article className="card">
            <h3>Logs and telemetry</h3>
            <p>
              Loki and Alloy provide the logging/telemetry pipeline. Umami adds product analytics, plus a scheduled weekly
              report workflow that sends summaries through a sealed Discord webhook.
            </p>
          </article>
        </div>
      </Section>

      <Section id="secrets" eyebrow="Security" title="Secrets stay encrypted in Git">
        <p>
          The repository uses Bitnami Sealed Secrets. Plain Kubernetes Secrets are generated locally, encrypted with the
          cluster&apos;s public key, committed as SealedSecret resources, and decrypted only by the in-cluster controller.
          Secret material is intentionally not displayed on this page.
        </p>
        <CodeBlock>{`kubectl create secret generic mysecret --from-literal=password=mypass --dry-run=client -o yaml > secret.yaml
make encrypt INPUT=secret.yaml OUTPUT=infrastructure/configs/sealed-mysecret.yaml
rm secret.yaml`}</CodeBlock>
      </Section>

      <Section id="validation" eyebrow="Quality gates" title="Pull requests validate manifests before merge">
        <div className="chips">
          {validation.map((item) => <span key={item}>{item}</span>)}
        </div>
        <p>
          The CI workflow validates YAML, Flux CRDs, Kubernetes schemas, and every Kustomize overlay under infrastructure,
          apps, and clusters.
        </p>
      </Section>

      <footer>
        <p>Built with Next.js from the public homelab GitOps repository.</p>
        <a href="https://github.com/yesid-lopez/homelab">github.com/yesid-lopez/homelab</a>
      </footer>
    </main>
  );
}
