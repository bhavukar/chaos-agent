import { ChaosFaultConfig } from './types.js';

export class NetworkChaosHook {
  /**
   * Simulates network layer instability (integrates with network-relay mechanisms).
   */
  public static async applyNetworkFault(fault: ChaosFaultConfig): Promise<{ intercepted: boolean; error?: string }> {
    const roll = Math.random();
    if (roll > fault.probability) {
      return { intercepted: false };
    }

    if (fault.type === 'latency_spike') {
      const delay = fault.latencyMs || 1500;
      await new Promise((resolve) => setTimeout(resolve, delay));
      return { intercepted: true };
    }

    if (fault.type === 'packet_drop') {
      throw new Error('ECONNRESET: Socket closed abruptly (Chaos Injected Packet Drop)');
    }

    if (fault.type === 'rate_limit_429') {
      throw new Error('HTTP 429: Too Many Requests - Rate limit quota exceeded. Retry-After: 30s');
    }

    if (fault.type === 'timeout_504') {
      throw new Error('HTTP 504: Gateway Timeout - Upstream MCP agent service unresponsive after 5000ms');
    }

    return { intercepted: false };
  }
}
