/// <reference types="node" />
export declare function isForbiddenTrustedShellEnvironmentName(name: string): boolean;
export declare function createTrustedShellEnvironment(inherited: NodeJS.ProcessEnv, overlay: Record<string, string>, sensitiveValues?: readonly string[]): NodeJS.ProcessEnv;
/**
 * Only non-secret workspace variables may cross the helper boundary. Values
 * are deliberately never included in errors or audit text.
 */
export declare function validateTrustedShellEnvironmentOverlay(overlay: Record<string, string>, sensitiveValues?: readonly string[]): Record<string, string>;
//# sourceMappingURL=trusted-shell-environment.d.ts.map