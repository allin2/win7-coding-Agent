import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const { createDesktopHost } = require('../../product/desktop-host') as { createDesktopHost: (options?: any) => any };
const stateModule = require('../../../state/dist');

describe('A8-05 Desktop Host durable Review projection', () => {
  let workspaceRoot: string;
  let reviewDirectory: string;
  let firstHost: any;
  let secondHost: any;

  beforeEach(() => {
    workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'a8-host-persistence-workspace-'));
    reviewDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'a8-host-persistence-review-'));
    fs.writeFileSync(path.join(workspaceRoot, 'sample.ts'), 'const before = true;\n', 'utf8');
  });

  afterEach(() => {
    if (firstHost) firstHost.dispose();
    if (secondHost) secondHost.dispose();
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
    fs.rmSync(reviewDirectory, { recursive: true, force: true });
  });

  function durableCatalog(): any {
    const catalog = new stateModule.A8SessionCatalog({
      idFactory: (() => {
        let n = 0;
        return () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`;
      })(),
      clock: (() => {
        let n = 0;
        return () => `2026-08-21T00:00:0${n++}.000Z`;
      })(),
    });
    const tasks = new Map<string, any>();
    const reviews = new Map<string, any>();
    const reviewFiles = new Map<string, any[]>();
    const validations = new Map<string, any[]>();
    catalog.persistTask = (task: any) => tasks.set(task.taskId, task);
    catalog.listTasks = (sessionId?: string) => Array.from(tasks.values()).filter((task: any) => !sessionId || task.sessionId === sessionId);
    catalog.persistReview = (review: any) => reviews.set(review.reviewId, review);
    catalog.getReview = (reviewId: string) => reviews.get(reviewId);
    catalog.persistReviewFiles = (reviewId: string, _revision: number, files: any[]) => reviewFiles.set(reviewId, files);
    catalog.getReviewFiles = (reviewId: string) => reviewFiles.get(reviewId) || [];
    catalog.persistValidation = (validation: any) => validations.set(validation.reviewId, [...(validations.get(validation.reviewId) || []).filter((item) => item.validationRunId !== validation.validationRunId), validation]);
    catalog.listValidations = (reviewId: string) => validations.get(reviewId) || [];
    return catalog;
  }

  async function waitForReview(host: any, events: any[]): Promise<any> {
    for (let index = 0; index < 200; index += 1) {
      host.flushEvents();
      const event = events.find((item) => item.eventKind === 'review.created');
      if (event) return event;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    throw new Error('review.created timeout');
  }

  it('reopens Session/Task/Review from durable projections and marks external drift STALE', async () => {
    const catalog = durableCatalog();
    const events: any[] = [];
    firstHost = createDesktopHost({ sessionCatalog: catalog, reviewDirectory, onTaskEvent: (event: any) => events.push(event) });
    await firstHost.selectWorkspace(workspaceRoot);
    const session = firstHost.createSession({ label: 'persistent' });
    const accepted = firstHost.submitTask({
      sessionId: session.sessionId,
      prompt: 'restart Review',
      scenario: 'review',
      reviewProposals: [{ relativePath: 'sample.ts', operation: 'MODIFY', afterContent: Buffer.from('const after = true;\n') }],
    });
    await waitForReview(firstHost, events);
    firstHost.decideReview({ sessionId: session.sessionId, taskId: accepted.taskId, relativePath: 'sample.ts', decision: 'ACCEPTED' });
    expect(catalog.listTasks(session.sessionId)).toEqual(expect.arrayContaining([expect.objectContaining({ state: 'AWAITING_REVIEW', currentReviewId: expect.any(String) })]));
    expect(catalog.getReviewFiles(catalog.listTasks(session.sessionId)[0].currentReviewId)).toHaveLength(1);
    firstHost.dispose();
    firstHost = null;
    fs.writeFileSync(path.join(workspaceRoot, 'sample.ts'), 'external drift\n', 'utf8');

    secondHost = createDesktopHost({ sessionCatalog: catalog, reviewDirectory });
    await secondHost.selectWorkspace(workspaceRoot);
    const reopened = secondHost.listSessions()[0];
    expect(reopened.taskCount).toBe(1);
    const projection = secondHost.getSessionProjection(session.sessionId);
    expect(projection.persistedTasks).toEqual([expect.objectContaining({ state: 'AWAITING_REVIEW' })]);
    expect(secondHost.getReview({ sessionId: session.sessionId, taskId: accepted.taskId }).review.status).toBe('STALE');
  });
});
