// Chaos-Agent Interactive Playground Engine

const RECIPES = {
  network_jitter: {
    name: 'Network Jitter & Drops',
    defaultLatency: 1400,
    defaultRate: 35,
    score: '87.5%',
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
    name: 'Adversarial Schema Fuzz',
    defaultLatency: 200,
    defaultRate: 50,
    score: '75.0%',
    vulnTag: '2 Vulnerabilities Detected',
    logs: [
      { type: 'info', text: '[00:00.00] Generating adversarial schema payloads for registered MCP tools...' },
      { type: 'chaos', text: '[00:00.22] INJECT: Injecting 64KB string buffer into parameter "path"...' },
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
    name: 'Upstream 504 / 429 Surge',
    defaultLatency: 2200,
    defaultRate: 60,
    score: '91.7%',
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
    name: 'Subagent Recursion Trap',
    defaultLatency: 600,
    defaultRate: 40,
    score: '83.3%',
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

let currentRecipe = 'network_jitter';
let isRunning = false;

document.addEventListener('DOMContentLoaded', () => {
  setupRecipes();
  setupSliders();
  setupIntensity();
  setupConfigTabs();
  setupExecuteButton();
});

function setupRecipes() {
  const pills = document.querySelectorAll('.recipe-pill');
  pills.forEach(pill => {
    pill.addEventListener('click', () => {
      pills.forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      currentRecipe = pill.dataset.recipe;
      const recipe = RECIPES[currentRecipe];
      
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
  const btns = document.querySelectorAll('.int-btn');
  btns.forEach(btn => {
    btn.addEventListener('click', () => {
      btns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });
}

function setupExecuteButton() {
  const btn = document.getElementById('btn-execute-chaos');
  btn.addEventListener('click', () => {
    if (isRunning) return;
    runChaosExecution();
  });
}

function runChaosExecution() {
  isRunning = true;
  const btnText = document.getElementById('btn-execute-text');
  const feed = document.getElementById('terminal-feed');

  btnText.textContent = 'Injecting Faults...';
  feed.innerHTML = '';

  const recipe = RECIPES[currentRecipe];
  let logIndex = 0;

  const interval = setInterval(() => {
    if (logIndex < recipe.logs.length) {
      const log = recipe.logs[logIndex];
      const line = document.createElement('div');
      line.className = `feed-line ${log.type}`;
      line.textContent = log.text;
      feed.appendChild(line);
      feed.scrollTop = feed.scrollHeight;
      logIndex++;
    } else {
      clearInterval(interval);
      isRunning = false;
      btnText.textContent = 'Run Chaos Attack Suite';
      loadRecipeOutput(recipe);
    }
  }, 400);
}

function loadRecipeOutput(recipe) {
  document.getElementById('score-number').textContent = recipe.score;
  document.getElementById('vuln-indicator').textContent = recipe.vulnTag;

  const container = document.getElementById('findings-feed');
  container.innerHTML = '';

  recipe.findings.forEach(f => {
    const el = document.createElement('div');
    el.className = 'finding-card';
    el.innerHTML = `
      <div class="finding-header">
        <span class="vuln-tag ${f.severity}">${f.severity.toUpperCase()} SEVERITY</span>
        <span class="vuln-target">Tool: ${f.tool}</span>
      </div>
      <h4 class="finding-headline">${f.title}</h4>
      <p class="finding-text">${f.desc}</p>
      <div class="remediation-box">
        <span class="remediation-label">Fix:</span> ${f.remedy}
      </div>
    `;
    container.appendChild(el);
  });
}

window.clearTerminal = function() {
  document.getElementById('terminal-feed').innerHTML = '<div class="feed-line info">[00:00.00] Terminal feed cleared. Ready for next test run.</div>';
};

function setupConfigTabs() {
  const tabs = document.querySelectorAll('.config-tab');
  const snippet = document.getElementById('code-content');

  const configs = {
    cli: `# Run pre-flight chaos test suite
npx havoc test --target ./my-server --severity aggressive

# Export JUnit / JSON test resilience scorecard
npx havoc test --output report.json`,
    ci: `# .github/workflows/havoc-test.yml
name: Autonomous Resilience Test
on: [push, pull_request]

jobs:
  chaos:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Run Havoc Resilience Fuzzing
        run: |
          npx havoc test --target ./src/server.ts --fail-threshold 80`,
    relay: `// Integration with Network-Relay for realistic transport latency & drops
import { HavocRunner } from 'havoc-core';
import { NetworkRelayProxy } from 'network-relay';

const relay = new NetworkRelayProxy({ jitterMs: 800, dropRate: 0.15 });
const runner = new HavocRunner({ transport: relay });

const report = await runner.runSuite({ severity: 'aggressive' });
console.log('Resilience Score:', report.resilienceScore);`,
    sdk: `import { HavocRunner, SchemaFuzzer } from 'havoc-core';

const runner = new HavocRunner();
const report = await runner.runSuite({
  id: 'custom-tool-suite',
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
  navigator.clipboard.writeText('npx havoc test --target ./my-server').then(() => {
    alert('Copied "npx havoc test" to clipboard.');
  });
};

window.copySnippet = function() {
  const code = document.getElementById('code-content').textContent;
  navigator.clipboard.writeText(code).then(() => {
    alert('Code snippet copied to clipboard.');
  });
};
