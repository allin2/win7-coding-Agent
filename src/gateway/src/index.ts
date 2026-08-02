/**
 * Win7 Coding Agent — Model Gateway
 *
 * Versioned streaming protocol client for remote model inference.
 * Target: Windows 7 SP1 x64, Electron 22.3.27 / Node 16.17.1
 */

export const GATEWAY_VERSION = '0.1.0';

// Re-export all modules
export * from './types';
export * from './protocol';
export * from './transport';
export * from './security';
export * from './provider';
