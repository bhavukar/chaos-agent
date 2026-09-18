// Chaos-Agent Interactive Simulation State & Engine

const RECIPES = {
  network_jitter: {
    code: 'RECIPE-01',
    name: 'Latency Jitter & Packet Drops',
    defaultLatency: 1400,
    defaultRate: 35,
    score: '87.5% RESILIENT',
    vulnTag: '1 Vulnerability Detected',
    logs: [
      { type: 'info', text: '[00:00.00] Hooking into transport layer via network-relay proxy...' },
      { type: 'chaos', text: '[00:00.35] INJECT: Introducing 1,400ms synthetic jitter on tool "execute_sql"...' },
      { type: 'info', text: '[00:01.75] Tool response delayed. Agent thread waiting on async promise...' },
      { type: 'chaos', text: '[00:01.80] INJECT: Dropping TCP socket packet (ECONNRESET)...' },
      { type: 'error', text: '[00:01.85] ERROR: Unhandled socket reset in execute_sql! No retry backoff invoked.' },
      { type: 'info', text: '[00:02.10] Fuzzing test 2 of 4: "fetch_webpage" with 800ms latency...' },
      { type: 'success', text: '[00:02.95] SUCCESS: Agent gracefully recovered via cached snapshot fallback.' }
    ],
    findings: [
      {
        severity: 'high',
        tool: 'execute_sql',
        title: 'Unhandled ETIMEDOUT on Latency Spikes > 1200ms',
        desc: 'The agent failed to trigger exponential retry backoff and crashed with an unhandled promise rejection.',
        remedy: 'Configure maxRetries: 3 with jitter backoff via network-relay hook.'
      }
    ]
  },
  schema_poisoning: {
    code: 'RECIPE-02',
    name: 'Adversarial Schema Poisoning',
    defaultLatency: 200,
    defaultRate: 50,
    score: '75.0% RESILIENT',
    vulnTag: '2 Vulnerabilities Detected',
    logs: [
      { type: 'info', text: '[00:00.00] Generating adversarial schema payloads for 6 registered MCP tools...' },
      { type: 'chaos', text: '[00:00.22] INJECT: Injecting 64KB string buffer into string parameter "path"...' },
      { type: 'success', text: '[00:00.45] PASS: Schema validator truncated buffer at 4096 bytes cleanly.' },
      { type: 'chaos', text: '[00:00.60] INJECT: Passing NaN and cyclic object to "query" parameter...' },
      { type: 'error', text: '[00:00.68] CRITICAL: JSON.stringify threw TypeError: Converting circular structure to JSON.' },
      { type: 'chaos', text: '[00:00.85] INJECT: Null byte sequence "\\u0000\\u001F" into file path...' },
      { type: 'error', text: '[00:00.92] HIGH: Path traversal sanitizer failed to strip null byte before disk open.' }
    ],
    findings: [
      {
        severity: 'critical',
        tool: 'write_file_patch',
        title: 'Uncaught Circular Object TypeError during serialization',
        desc: 'Passing cyclic parameter references causes agent process to terminate abruptly.',
        remedy: 'Use safe JSON serializer (e.g. fast-safe-stringify) in tool dispatch pipeline.'
      },
      {
        severity: 'high',
        tool: 'read_resource',
        title: 'Null Byte Truncation Vulnerability in file path resolution',
        desc: 'Null bytes permit bypassing path prefix guardrails on certain filesystem implementations.',
        remedy: 'Sanitize strings using regex /^[^\\x00-\\x1F]*$/ before path.resolve().'
      }
    ]
  },
  cascade_outage: {
    code: 'RECIPE-03',
    name: 'Upstream 504 & 429 Cascade',
    defaultLatency: 2200,
    defaultRate: 60,
    score: '91.7% RESILIENT',
    vulnTag: '1 Vulnerability Detected',
    logs: [
      { type: 'info', text: '[00:00.00] Simulating sudden upstream rate-limiting across 10 concurrent agent tasks...' },
      { type: 'chaos', text: '[00:00.15] INJECT: Upstream returned HTTP 429 Too Many Requests (Retry-After: 5s)...' },
      { type: 'success', text: '[00:00.20] PASS: Agent queued requests and observed exponential jitter pause.' },
      { type: 'chaos', text: '[00:01.40] INJECT: Primary database returned HTTP 504 Gateway Timeout...' },
      { type: 'success', text: '[00:01.55] PASS: Rerouted read transaction to secondary replica (0 downtime).' },
      { type: 'chaos', text: '[00:02.10] INJECT: Upstream authentication token revoked mid-stream...' },
      { type: 'error', text: '[00:02.22] MEDIUM: Re-authentication loop caused 3 redundant token refresh requests.' }
    ],
    findings: [
      {
        severity: 'high',
        tool: 'auth_session_refresh',
        title: 'Thundering Herd on Expired Bearer Token',
        desc: 'Concurrent subagents simultaneously refresh credentials without mutex deduplication.',
        remedy: 'Implement singleflight promise locking for token refresh routine.'
      }
    ]
  },
  recursion_trap: {
    code: 'RECIPE-04',
    name: 'Subagent Circular Deadlock',
    defaultLatency: 600,
    defaultRate: 40,
    score: '83.3% RESILIENT',
    vulnTag: '1 Vulnerability Detected',
    logs: [
      { type: 'info', text: '[00:00.00] Testing recursive subagent spawn boundaries with depth test suite...' },
      { type: 'chaos', text: '[00:00.18] INJECT: Subagent "ResearchAgent" requested subagent "FactCheckAgent"...' },
      { type: 'chaos', text: '[00:00.42] INJECT: "FactCheckAgent" requested "ResearchAgent" with identical task...' },
      { type: 'info', text: '[00:00.80] Cycle detected at recursion depth 4. Token burn rate: 4,800 tok/sec.' },
      { type: 'success', text: '[00:01.05] PASS: Recursion depth limit (maxDepth: 5) intercepted loop.' },
      { type: 'chaos', text: '[00:01.30] INJECT: Memory heap usage spiked beyond 450MB threshold...' },
      { type: 'error', text: '[00:01.65] HIGH: Garbage collection pause caused subagent heartbeat timeout.' }
    ],
    findings: [
      {
        severity: 'high',
        tool: 'subagent_dispatch',
        title: 'Memory Context Leak in Cyclic Subagent Tree',
        desc: 'Retaining entire parent context across circular subagents causes heap exhaustion.',
        remedy: 'Prune conversational memory and pass only explicit task delta to spawned subagents.'
      }
    ]
  }
};

let currentRecipeKey = 'network_jitter';
let isRunning = false;

document.addEventListener('DOMContentLoaded', () => {
  setupRecipes();
  setupSliders();
  setupIntensity();
  setupConfigTabs();
  setupRunButton();
});

function setupRecipes() {
  const cards = document.querySelectorAll('.recipe-card');
  cards.forEach(card => {
    card.addEventListener('click', () => {
      cards.forEach(c => c.classList.remove('active'));
      card.classList.add('active');
      currentRecipeKey = card.dataset.recipe;
      const recipe = RECIPES[currentRecipeKey];
      
      // Update sliders
      document.getElementById('input-latency').value = recipe.defaultLatency;
      document.getElementById('val-latency').textContent = `${recipe.defaultLatency.toLocaleString()} ms`;
      document.getElementById('input-rate').value = recipe.defaultRate;
      document.getElementById('val-rate').textContent = `${recipe.defaultRate} %`;

      loadRecipeOutput(recipe);
    });
  });
}

function setupSliders() {
  const latSlider = document.getElementById('input-latency');
  const rateSlider = document.getElementById('input-rate');

  latSlider.addEventListener('input', (e) => {
    document.getElementById('val-latency').textContent = `${parseInt(e.target.value).toLocaleString()} ms`;
  });

  rateSlider.addEventListener('input', (e) => {
    document.getElementById('val-rate').textContent = `${e.target.value} %`;
  });
}

function setupIntensity() {
  const btns = document.querySelectorAll('.btn-intensity');
  btns.forEach(btn => {
    btn.addEventListener('click', () => {
      btns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });
}

function setupRunButton() {
  const btn = document.getElementById('btn-run-chaos');
  btn.addEventListener('click', () => {
    if (isRunning) return;
    executeChaosRun();
  });
}

function executeChaosRun() {
  isRunning = true;
  const stateBadge = document.getElementById('sim-state-badge');
  const runText = document.getElementById('run-text');
  const termBody = document.getElementById('terminal-body');

  stateBadge.textContent = 'EXECUTING';
  stateBadge.className = 'panel-state running';
  runText.textContent = '⏳ INJECTING FAULTS...';
  termBody.innerHTML = '';

  const recipe = RECIPES[currentRecipeKey];
  let logIndex = 0;

  const interval = setInterval(() => {
    if (logIndex < recipe.logs.length) {
      const log = recipe.logs[logIndex];
      const line = document.createElement('div');
      line.className = `log-line ${log.type}`;
      line.textContent = log.text;
      termBody.appendChild(line);
      termBody.scrollTop = termBody.scrollHeight;
      logIndex++;
    } else {
      clearInterval(interval);
      isRunning = false;
      stateBadge.textContent = 'COMPLETE';
      stateBadge.className = 'panel-state';
      runText.textContent = '⚡ EXECUTE CHAOS ATTACK SUITE';
      loadRecipeOutput(recipe);
    }
  }, 400);
}

function loadRecipeOutput(recipe) {
  // Update Scorecard
  document.getElementById('score-badge').textContent = recipe.score;
  document.getElementById('vuln-count-tag').textContent = recipe.vulnTag;

  // Render Findings
  const container = document.getElementById('findings-list');
  container.innerHTML = '';

  recipe.findings.forEach(f => {
    const el = document.createElement('div');
    el.className = 'finding-item';
    el.innerHTML = `
      <div class="finding-top">
        <span class="severity-badge ${f.severity}">${f.severity.toUpperCase()} SEVERITY</span>
        <span class="finding-tool">Tool: ${f.tool}</span>
      </div>
      <h4 class="finding-title">${f.title}</h4>
      <p class="finding-desc">${f.desc}</p>
      <div class="finding-remedy">
        <span class="remedy-label">Remediation:</span> ${f.remedy}
      </div>
    `;
    container.appendChild(el);
  });
}

window.clearLogs = function() {
  document.getElementById('terminal-body').innerHTML = '<div class="log-line info">[00:00.00] Terminal logs cleared. Ready for next test run.</div>';
};

function setupConfigTabs() {
  const tabs = document.querySelectorAll('.config-tab');
  const snippet = document.getElementById('code-snippet');

  const configs = {
    cli: `# Run autonomous chaos suite against any MCP server
npx chaos-agent test --target ./my-mcp-server --severity aggressive

# Export JUnit / JSON test resilience scorecard
npx chaos-agent test --output report.json`,
    ci: `# .github/workflows/mcp-chaos-test.yml
name: MCP Resilience Test
on: [push, pull_request]

jobs:
  chaos:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Run Autonomous Chaos Fuzzing
        run: |
          npx chaos-agent test --target ./src/server.ts --fail-threshold 80`,
    relay: `// Integration with Network-Relay for realistic transport latency & drops
import { ChaosRunner } from 'chaos-agent';
import { NetworkRelayProxy } from 'network-relay';

const relay = new NetworkRelayProxy({ jitterMs: 800, dropRate: 0.15 });
const runner = new ChaosRunner({ transport: relay });

const report = await runner.runSuite({ severity: 'aggressive' });
console.log('Resilience Score:', report.resilienceScore);`,
    sdk: `import { ChaosRunner, SchemaFuzzer } from 'chaos-agent';

const runner = new ChaosRunner();
const report = await runner.runSuite({
  id: 'custom-mcp-suite',
  name: 'Production Pre-Flight',
  severity: 'aggressive',
  faults: [
    { type: 'latency_spike', probability: 0.4, latencyMs: 1500 },
    { type: 'malformed_payload', probability: 0.3 }
  ]
});`
  };

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      snippet.textContent = configs[tab.dataset.tab] || '';
    });
  });
}

window.copyCli = function() {
  navigator.clipboard.writeText('npx chaos-agent test --target ./my-mcp-server').then(() => {
    alert('Copied CLI command to clipboard!');
  });
};

window.copySnippet = function() {
  const code = document.getElementById('code-snippet').textContent;
  navigator.clipboard.writeText(code).then(() => {
    alert('Code snippet copied to clipboard!');
  });
};
