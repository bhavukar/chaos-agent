#!/usr/bin/env node
import { ChaosRunner } from './runner.js';

console.log('\x1b[33m[CHAOS-AGENT]\x1b[0m Initializing Autonomous AI Resilience Hunter...');

const runner = new ChaosRunner();
runner.runSuite({
  id: 'standard-suite',
  name: 'Standard MCP Stress Suite',
  description: 'Adversarial fuzzing and network fault injection',
  severity: 'aggressive',
  faults: [
    { type: 'latency_spike', probability: 0.3, latencyMs: 1200 },
    { type: 'malformed_payload', probability: 0.2 }
  ]
}).then((report) => {
  console.log(`\n\x1b[32m=== RESILIENCE REPORT ===\x1b[0m`);
  console.log(`Target: ${report.target}`);
  console.log(`Tests Executed: ${report.totalTests} | Passed: ${report.passed} | Failed: ${report.failed}`);
  console.log(`Resilience Score: \x1b[36m${report.resilienceScore}%\x1b[0m`);
  if (report.findings.length > 0) {
    console.log(`\n\x1b[31m[!] Detected ${report.findings.length} Vulnerabilities:\x1b[0m`);
    report.findings.forEach((f) => {
      console.log(`- [${f.severity}] ${f.title} (${f.toolName})`);
      console.log(`  Fix: ${f.remediation}\n`);
    });
  }
});
