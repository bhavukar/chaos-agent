export type FaultType = 
  | 'latency_spike' 
  | 'packet_drop' 
  | 'malformed_payload' 
  | 'schema_violation' 
  | 'rate_limit_429' 
  | 'timeout_504' 
  | 'subagent_deadlock';

export type ChaosSeverity = 'low' | 'moderate' | 'aggressive' | 'nuclear';

export interface ChaosFaultConfig {
  type: FaultType;
  probability: number; // 0.0 to 1.0
  latencyMs?: number;
  payloadMutations?: string[];
}

export interface ChaosRecipe {
  id: string;
  name: string;
  description: string;
  severity: ChaosSeverity;
  faults: ChaosFaultConfig[];
}

export interface FuzzCase {
  id: string;
  name: string;
  toolName: string;
  payload: any;
  faultType: FaultType;
}

export interface VulnerabilityFinding {
  id: string;
  title: string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  toolName: string;
  description: string;
  reproductionPayload: any;
  remediation: string;
}

export interface ResilienceReport {
  timestamp: string;
  target: string;
  totalTests: number;
  passed: number;
  failed: number;
  resilienceScore: number; // 0 - 100
  findings: VulnerabilityFinding[];
}
