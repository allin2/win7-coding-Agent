import { ApprovalLevel } from './types';
import { ToolRegistry, ToolSpec } from './tools';

/**
 * Model-facing seam for A8 Review staging.
 *
 * The call is deliberately read-only from Core's policy perspective: it only
 * hands a bounded, structured proposal envelope to the product host. The host
 * owns decoding, path validation, secret blocking, blob persistence and all
 * eventual workspace writes. Keeping this tool separate from the ordinary
 * Workspace catalog prevents a Review task from exposing a direct write tool.
 */
export function reviewToolSpecs(): ToolSpec[] {
  return [
    {
      schemaVersion: '2.0',
      name: 'workspace.review_prepare',
      description: 'Create a private multi-file Review proposal; this call never writes the target workspace and is followed by explicit per-file decisions.',
      approvalLevel: ApprovalLevel.READ_ONLY,
      capability: 'workspace.read',
      inputSchema: {
        properties: {
          proposalsJson: {
            type: 'string',
            description: 'JSON array of bounded relative-path CREATE/MODIFY/DELETE proposals. Content is base64 and is decoded only inside the trusted product host.',
          },
        },
        required: ['proposalsJson'],
        additionalProperties: false,
      },
    },
  ];
}

export function registerReviewTools(registry: ToolRegistry): void {
  for (const spec of reviewToolSpecs()) registry.register(spec);
}
