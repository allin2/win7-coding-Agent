import { RunnerErrorCode } from './types';
import { StreamEncoding } from './output';
export interface ExecutableProfile {
    id: string;
    executablePath: string;
    sha256: string;
    risk: 'low' | 'high';
    outputEncoding?: StreamEncoding;
    workingDirectoryRoots: string[];
    validateArgs?: (args: readonly string[]) => boolean;
    aclPolicy?: {
        acceptanceRoot: string;
        perRunRoot: string;
        applyLowIntegrityToWorkDir: boolean;
    };
}
export interface ResolvedExecutableProfile extends ExecutableProfile {
    canonicalExecutablePath: string;
}
export declare class ProfileResolutionError extends Error {
    readonly code: RunnerErrorCode;
    constructor(code: RunnerErrorCode, message: string);
}
/** Immutable, product-injected executable allow-list. Callers only select IDs. */
export declare class ExecutableProfileRegistry {
    private readonly profiles;
    constructor(profiles: readonly ExecutableProfile[]);
    resolve(id: string, args: readonly string[], workDir: string): Promise<ResolvedExecutableProfile>;
}
//# sourceMappingURL=profiles.d.ts.map