import type { AvgVarState } from '$lib/types.js';

/**
 * Averaging variable class for computing sliding window average.
 * Based on meshlog algorithm (labelFilter.py:139-146).
 *
 * Algorithm: weighted sliding average with exponential decay
 * - First maxIterations: average grows incrementally (0/1, 1/2, 2/3...)
 * - After maxIterations: curI fixed at maxIterations-1
 *
 * CRITICAL: getIterations() returns current value FIRST, then increments (postfix)
 */
export class AvgVar {
  private state: AvgVarState;

  constructor(maxIterations: number = 15) {
    this.state = {
      avg: 0,
      iterations: 0,
      maxIterations
    };
  }

  /**
   * Get current iteration count and increment (postfix increment).
   * Mirrors meshlog getIterations() behavior.
   * @returns Current iteration value before increment
   */
  private getIterations(): number {
    const i = this.state.iterations;
    if (this.state.iterations < this.state.maxIterations) {
      this.state.iterations++;
    }
    return i;
  }

  /**
   * Update average with new value.
   * Formula: avg * (curI / (curI + 1)) + value / (curI + 1)
   * @param value - New numeric value to add to average
   * @param ndigits - Decimal places for rounding (default: 0)
   * @returns Updated average value
   */
  update(value: number, ndigits: number = 0): number {
    // Get current iteration (postfix: returns 0, 1, 2... then increments)
    const curI = this.getIterations();

    // Calculate weighted average using meshlog formula
    const multiplier = curI / (curI + 1);
    const addition = value / (curI + 1);
    const rawAvg = this.state.avg * multiplier + addition;

    // Round to specified decimal places
    this.state.avg = Number(rawAvg.toFixed(ndigits));

    // If ndigits=0, convert to int (meshlog behavior)
    if (ndigits === 0) {
      this.state.avg = Math.floor(this.state.avg);
    }

    return this.state.avg;
  }

  /**
   * Get current average value.
   */
  getAverage(): number {
    return this.state.avg;
  }

  /**
   * Get current state (for serialization).
   */
  getState(): AvgVarState {
    return { ...this.state };
  }

  /**
   * Reset average to initial state.
   */
  reset(): void {
    this.state.avg = 0;
    this.state.iterations = 0;
  }
}
