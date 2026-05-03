const highlights = [
  { label: "Platform", value: "Kubernetes" },
  { label: "Delivery", value: "GitOps" },
  { label: "Security", value: "Encrypted secrets" },
  { label: "Signals", value: "Metrics + logs" },
];

const platformStats = [
  ["AI-ready", "Self-hosted runtime for experiments, services, and automation."],
  ["Declarative", "Infrastructure and workloads are managed as reviewed code."],
  ["Observable", "Metrics, logs, dashboards, and alerts support operations."],
];

const architectureCards = [
  {
    icon: "◈",
    name: "Compute fabric",
    role: "Cluster foundation",
    details: [
      "Compact machines provide the container runtime layer.",
      "Workloads are scheduled by Kubernetes with a maintainable topology.",
      "Hardware identifiers and exact capacity are intentionally omitted.",
    ],
  },
  {
    icon: "⌁",
    name: "Secure edge",
    role: "Ingress + TLS",
    details: [
      "Selected services are routed through a controlled ingress layer.",
      "TLS lifecycle is automated for published applications.",
      "Public hostnames and DNS details are not listed here.",
    ],
  },
  {
    icon: "◎",
    name: "State layer",
    role: "Persistent workloads",
    details: [
      "Applications that need data use persistent volumes.",
      "Storage is declared and maintained with the rest of the platform.",
      "Operational topology details stay private.",
    ],
  },
];

const controllers = [
  ["GitOps controller", "Reconciles desired state from the repository."],
  ["Secret encryption", "Keeps sensitive values encrypted before commit."],
  ["Certificate automation", "Automates TLS certificate lifecycle."],
  ["Ingress controller", "Routes selected web traffic to services."],
  ["Storage controller", "Provides persistent volumes for stateful workloads."],
  ["Database operator", "Manages application databases declaratively."],
  ["Monitoring stack", "Collects metrics, logs, dashboards, and alerts."],
  ["Upgrade automation", "Helps keep platform components maintained."],
];

const apps = [
  {
    name: "AI/ML experiments",
    purpose: "A private runtime for model-adjacent tools, automation, and technical experiments.",
    details: [
      "Designed like a compact platform engineering lab.",
      "Useful for testing deployment, monitoring, and reliability patterns.",
      "Sensitive runtime configuration is kept out of the public overview.",
    ],
  },
  {
    name: "Product applications",
    purpose: "Custom applications deployed through the same GitOps platform.",
    details: [
      "Built and released through a private delivery workflow.",
      "Managed with environment-specific Kubernetes manifests.",
      "Repository internals and image tags are intentionally hidden.",
    ],
  },
  {
    name: "Analytics and telemetry",
    purpose: "Self-hosted insight layer for owned projects and operations.",
    details: [
      "Combines application signals with platform-level observability.",
      "Supports reporting, debugging, and operational awareness.",
      "Dashboard URLs and service endpoints are not published.",
    ],
  },
  {
    name: "Internal automation",
    purpose: "Private services for operations, delivery, and maintenance workflows.",
    details: [
      "Includes supporting APIs and utility services.",
      "Access is limited to the required network paths.",
      "Implementation details are intentionally abstracted.",
    ],
  },
];

const gitopsFlow = [
  ["01", "Design", "Change is modeled as code."],
  ["02", "Validate", "Automation checks manifests before deployment."],
  ["03", "Reconcile", "GitOps applies the approved desired state."],
  ["04", "Observe", "Metrics, logs, and alerts close the feedback loop."],
];

const securityPractices = [
  "No plaintext secrets in Git",
  "No internal hostnames or IP addresses published",
  "Selected services exposed through a controlled edge",
  "Configuration changes reviewed before deployment",
  "Monitoring and alerts for operational visibility",
  "Sensitive implementation details intentionally redacted",
];

const validation = ["YAML linting", "Kubernetes schema checks", "Manifest build checks", "Pull request validation"];

const navItems = [
  ["Architecture", "#architecture"],
  ["GitOps", "#gitops"],
  ["Workloads", "#apps"],
  ["Security", "#security"],
];

function Section({ id, eyebrow, title, children }: { id: string; eyebrow: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="section reveal">
      <p className="eyebrow">{eyebrow}</p>
      <h2>{title}</h2>
      {children}
    </section>
  );
}

function NeuralArchitecture() {
  return (
    <div className="neuralVisual" aria-label="Animated AI homelab architecture overview">
      <div className="meshLine meshLineA" />
      <div className="meshLine meshLineB" />
      <div className="meshLine meshLineC" />
      <div className="neuron n1" />
      <div className="neuron n2" />
      <div className="neuron n3" />
      <div className="neuron n4" />
      <div className="neuron n5" />
      <div className="signal s1" />
      <div className="signal s2" />
      <div className="signal s3" />

      <div className="visualTopbar">
        <span>AI platform view</span>
        <div><i /><i /><i /></div>
      </div>

      <div className="brainCore">
        <span className="brainRing ringOne" />
        <span className="brainRing ringTwo" />
        <div className="brainChip">
          <small>Homelab</small>
          <strong>K8s</strong>
        </div>
      </div>

      <div className="orbitCard orbitCardOne">
        <span>Edge</span>
        <strong>Ingress + TLS</strong>
      </div>
      <div className="orbitCard orbitCardTwo">
        <span>Delivery</span>
        <strong>GitOps</strong>
      </div>
      <div className="orbitCard orbitCardThree">
        <span>Data</span>
        <strong>Volumes</strong>
      </div>
      <div className="orbitCard orbitCardFour">
        <span>Signals</span>
        <strong>Observability</strong>
      </div>

      <div className="terminalCard">
        <div className="terminalHeader"><span /> platform status</div>
        <code>
          <b>desired_state</b>: reconciled{"\n"}
          <b>secrets</b>: encrypted{"\n"}
          <b>public_details</b>: redacted
        </code>
      </div>
    </div>
  );
}

function ArchitectureSystemMap() {
  const workloads = ["AI tools", "Apps", "Analytics", "Automation"];
  const platform = ["GitOps", "Secrets", "TLS", "Storage", "Metrics", "DB operator"];

  return (
    <div className="systemMap" aria-label="Visual architecture map of the sanitized homelab platform">
      <div className="mapGlow mapGlowOne" />
      <div className="mapGlow mapGlowTwo" />
      <div className="mapSignal mapSignalOne" />
      <div className="mapSignal mapSignalTwo" />
      <div className="mapSignal mapSignalThree" />

      <div className="mapHeader">
        <div>
          <span>Sanitized architecture</span>
          <strong>Traffic → Edge → Kubernetes → Workloads</strong>
        </div>
        <p>No IPs, hostnames, credentials, or internal paths exposed</p>
      </div>

      <div className="mapCanvas">
        <div className="mapColumn outsideZone">
          <div className="zoneLabel">External</div>
          <div className="mapNode externalNode">
            <span>Internet</span>
            <strong>Requests</strong>
          </div>
          <div className="mapNode repoNode">
            <span>GitHub</span>
            <strong>Desired state</strong>
          </div>
        </div>

        <div className="mapConnector connectorA" />

        <div className="mapColumn edgeZone">
          <div className="zoneLabel">Secure edge</div>
          <div className="edgeStack">
            <div className="mapNode edgeNode primary">
              <span>Ingress</span>
              <strong>Controlled routing</strong>
            </div>
            <div className="miniPill">TLS automation</div>
            <div className="miniPill">DNS abstraction</div>
          </div>
        </div>

        <div className="mapConnector connectorB" />

        <div className="clusterZone">
          <div className="zoneLabel">Kubernetes platform</div>
          <div className="clusterShell">
            <div className="controlRing">
              <div className="controlCore">
                <span>K3s</span>
                <strong>Control plane</strong>
              </div>
            </div>

            <div className="platformGrid">
              {platform.map((item) => (
                <div className="platformTile" key={item}>{item}</div>
              ))}
            </div>

            <div className="workloadShelf">
              {workloads.map((item) => (
                <div className="workloadPod" key={item}>
                  <i />
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="mapConnector connectorC" />

        <div className="mapColumn dataZone">
          <div className="zoneLabel">State + signals</div>
          <div className="mapNode dataNode">
            <span>Volumes</span>
            <strong>Persistent data</strong>
          </div>
          <div className="mapNode observeNode">
            <span>Observability</span>
            <strong>Metrics + logs</strong>
          </div>
        </div>
      </div>

      <div className="mapLegend">
        <span><i className="legendPublic" /> Public entry</span>
        <span><i className="legendPrivate" /> Private platform</span>
        <span><i className="legendData" /> State and telemetry</span>
      </div>
    </div>
  );
}

export default function Home() {
  return (
    <main>
      <nav className="topNav" aria-label="Page navigation">
        <a className="brand" href="#top"><span>YL</span> Homelab</a>
        <div>
          {navItems.map(([label, href]) => (
            <a key={href} href={href}>{label}</a>
          ))}
        </div>
      </nav>

      <section id="top" className="hero">
        <div className="heroGrid">
          <div className="heroCopy reveal">
            <p className="eyebrow">AI engineering · Kubernetes · GitOps</p>
            <h1><span>AI-ready</span> homelab platform</h1>
            <p className="lead">
              A polished, security-conscious view of my self-hosted Kubernetes lab — built like a compact platform for
              AI/ML experimentation, product workloads, automation, observability, and production-style GitOps delivery.
            </p>
            <div className="actions">
              <a href="https://github.com/yesid-lopez/homelab">Explore repository</a>
              <a href="#architecture" className="secondary">View architecture</a>
            </div>
            <div className="heroStats" aria-label="Platform highlights">
              {highlights.map((item) => (
                <div key={item.label}>
                  <span>{item.label}</span>
                  <strong>{item.value}</strong>
                </div>
              ))}
            </div>
          </div>
          <NeuralArchitecture />
        </div>
      </section>

      <section className="section introBand reveal" aria-label="Platform positioning">
        {platformStats.map(([title, description]) => (
          <article key={title}>
            <span />
            <h3>{title}</h3>
            <p>{description}</p>
          </article>
        ))}
      </section>

      <Section id="architecture" eyebrow="Architecture" title="A private cloud lab with an AI-engineering aesthetic">
        <p>
          The homelab is a small Kubernetes platform for learning, operating, and deploying real services. It keeps the
          design visible while omitting sensitive hostnames, network addresses, hardware identifiers, credentials, and
          exact implementation details.
        </p>
        <ArchitectureSystemMap />
        <div className="grid three">
          {architectureCards.map((item) => (
            <article className="card featureCard" key={item.name}>
              <div className="cardIcon">{item.icon}</div>
              <p className="tag">{item.role}</p>
              <h3>{item.name}</h3>
              <ul>{item.details.map((detail) => <li key={detail}>{detail}</li>)}</ul>
            </article>
          ))}
        </div>
      </Section>

      <Section id="gitops" eyebrow="GitOps / MLOps mindset" title="The operating model looks like a production delivery loop">
        <div className="pipeline">
          {gitopsFlow.map(([step, title, description]) => (
            <article key={step}>
              <span>{step}</span>
              <h3>{title}</h3>
              <p>{description}</p>
            </article>
          ))}
        </div>
        <div className="note statusNote">
          Repository changes become reviewed infrastructure changes. This public overview explains the workflow without
          publishing commands, tokens, internal paths, or environment-specific values.
        </div>
      </Section>

      <Section id="controllers" eyebrow="Platform capabilities" title="Core services presented as clean building blocks">
        <div className="grid two capabilityGrid">
          {controllers.map(([name, description]) => (
            <article className="card compact capabilityCard" key={name}>
              <span />
              <h3>{name}</h3>
              <p>{description}</p>
            </article>
          ))}
        </div>
      </Section>

      <Section id="networking" eyebrow="Networking, DNS, TLS" title="A controlled edge without exposing reconnaissance details">
        <p>
          Web traffic is routed through a dedicated ingress setup with automated TLS. The public overview avoids listing
          hostnames, IP ranges, DNS provider configuration, and other details that could make enumeration easier.
        </p>
        <div className="chips fancyChips">
          <span>Ingress routing</span>
          <span>Automated TLS</span>
          <span>DNS automation</span>
          <span>Sanitized public details</span>
        </div>
      </Section>

      <Section id="apps" eyebrow="Workloads" title="A self-hosted runtime for products, analytics, automation, and AI-adjacent experiments">
        <div className="appList">
          {apps.map((app) => (
            <article className="appCard" key={app.name}>
              <div>
                <p className="tag">Workload class</p>
                <h3>{app.name}</h3>
                <p>{app.purpose}</p>
              </div>
              <ul>{app.details.map((detail) => <li key={detail}>{detail}</li>)}</ul>
            </article>
          ))}
        </div>
      </Section>

      <Section id="observability" eyebrow="Observability" title="Operational signals make the lab feel like a real platform">
        <div className="dashboardGrid">
          <article className="signalPanel large">
            <span>Telemetry</span>
            <h3>Metrics, logs, dashboards, alerts</h3>
            <div className="bars"><i /><i /><i /><i /><i /></div>
          </article>
          <article className="signalPanel">
            <span>Feedback loop</span>
            <h3>Detect issues quickly</h3>
            <p>Signals help understand workload health without exposing internal dashboards or service addresses.</p>
          </article>
          <article className="signalPanel">
            <span>Operations</span>
            <h3>Traceable changes</h3>
            <p>Commits and pull requests document what changed and why.</p>
          </article>
        </div>
      </Section>

      <Section id="security" eyebrow="Security" title="Designed to look good publicly without leaking private internals">
        <p>
          This page focuses on the engineering story and visual architecture while intentionally avoiding details that
          could make the environment easier to enumerate or target.
        </p>
        <div className="securityGrid">
          {securityPractices.map((item) => (
            <article className="securityCard" key={item}>
              <span>✓</span>
              <h3>{item}</h3>
            </article>
          ))}
        </div>
      </Section>

      <Section id="validation" eyebrow="Quality gates" title="Validation keeps changes consistent before deployment">
        <div className="chips fancyChips">
          {validation.map((item) => <span key={item}>{item}</span>)}
        </div>
        <p>
          Automated checks reduce the risk of broken manifests reaching the platform and keep the GitOps workflow tidy.
        </p>
      </Section>

      <footer>
        <p>Built with Next.js from a sanitized GitOps homelab repository.</p>
        <a href="https://github.com/yesid-lopez/homelab">github.com/yesid-lopez/homelab</a>
      </footer>
    </main>
  );
}
