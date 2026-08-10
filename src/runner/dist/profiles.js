"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ExecutableProfileRegistry = exports.ProfileResolutionError = void 0;
const crypto_1 = require("crypto");
const fs_1 = require("fs");
const path = __importStar(require("path"));
const runner_1 = require("./runner");
const types_1 = require("./types");
class ProfileResolutionError extends Error {
    constructor(code, message) {
        super(message);
        this.code = code;
        this.name = 'ProfileResolutionError';
    }
}
exports.ProfileResolutionError = ProfileResolutionError;
/** Immutable, product-injected executable allow-list. Callers only select IDs. */
class ExecutableProfileRegistry {
    constructor(profiles) {
        this.profiles = new Map();
        for (const profile of profiles) {
            if (!/^[a-z0-9][a-z0-9._-]{0,63}$/i.test(profile.id) || this.profiles.has(profile.id)) {
                throw new TypeError(`Invalid or duplicate executable profile id: ${profile.id}`);
            }
            if ((0, runner_1.findProhibitedShellHost)(profile.id) || (0, runner_1.findProhibitedShellHost)(profile.executablePath)) {
                throw new TypeError(`Shell hosts cannot be registered: ${profile.id}`);
            }
            if (!/^[a-f0-9]{64}$/.test(profile.sha256)) {
                throw new TypeError(`Profile ${profile.id} must pin a lowercase SHA-256`);
            }
            if (!isAbsolute(profile.executablePath) || profile.workingDirectoryRoots.length === 0) {
                throw new TypeError(`Profile ${profile.id} requires absolute executable and work roots`);
            }
            this.profiles.set(profile.id, Object.freeze({ ...profile }));
        }
    }
    async resolve(id, args, workDir) {
        const profile = this.profiles.get(id);
        if (!profile)
            throw new ProfileResolutionError(types_1.RunnerErrorCode.PROFILE_NOT_FOUND, `Executable profile is not registered: ${id}`);
        if (profile.risk !== 'low')
            throw new ProfileResolutionError(types_1.RunnerErrorCode.PROFILE_RISK_REJECTED, `High-risk profile is not permitted locally: ${id}`);
        if (profile.validateArgs && !profile.validateArgs(args)) {
            throw new ProfileResolutionError(types_1.RunnerErrorCode.INVALID_REQUEST, `Arguments are outside profile policy: ${id}`);
        }
        let canonicalExecutablePath;
        let canonicalWorkDir;
        try {
            canonicalExecutablePath = await fs_1.promises.realpath(profile.executablePath);
            canonicalWorkDir = await fs_1.promises.realpath(workDir);
        }
        catch (error) {
            throw new ProfileResolutionError(types_1.RunnerErrorCode.PROFILE_PATH_INVALID, `Profile path resolution failed: ${String(error)}`);
        }
        const allowed = await Promise.all(profile.workingDirectoryRoots.map(async (root) => {
            try {
                return within(canonicalWorkDir, await fs_1.promises.realpath(root));
            }
            catch (_error) {
                return false;
            }
        }));
        if (!allowed.some(Boolean)) {
            throw new ProfileResolutionError(types_1.RunnerErrorCode.PROFILE_PATH_INVALID, `Working directory is outside profile roots: ${workDir}`);
        }
        const digest = (0, crypto_1.createHash)('sha256').update(await fs_1.promises.readFile(canonicalExecutablePath)).digest('hex');
        if (digest !== profile.sha256) {
            throw new ProfileResolutionError(types_1.RunnerErrorCode.PROFILE_HASH_MISMATCH, `Executable hash mismatch for profile: ${id}`);
        }
        return { ...profile, canonicalExecutablePath };
    }
}
exports.ExecutableProfileRegistry = ExecutableProfileRegistry;
function isAbsolute(value) {
    return path.isAbsolute(value) || /^[A-Za-z]:[\\/]/.test(value);
}
function within(candidate, root) {
    const normalize = (value) => path.resolve(value).replace(/\\/g, '/').toLowerCase();
    const child = normalize(candidate);
    const parent = normalize(root).replace(/\/$/, '');
    return child === parent || child.startsWith(`${parent}/`);
}
//# sourceMappingURL=profiles.js.map