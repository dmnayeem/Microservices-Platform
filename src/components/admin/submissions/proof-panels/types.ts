/**
 * Shared types for the per-task-type submission proof panels.
 *
 * The admin submissions page (`src/app/admin/submissions/page.tsx`) renders
 * one `<SubmissionProofPanel>` per row; the panel branches on `task.type`
 * and dispatches to the right child panel.
 */

export interface PanelSubmission {
  id: string;
  status: string;
  proof: string | null;
  proofImages: string[];
  answers: unknown;
  metadata: unknown;
  score: number | null;
  rejectionReason: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface PanelTask {
  id: string;
  type: string;
  title: string;
  duration: number | null;
  videoConfig: unknown;
  articleConfig: unknown;
  surveyConfig: unknown;
  customConfig: unknown;
  socialConfig: unknown;
  appInstallConfig: unknown;
  questions: unknown;
  contentUrl: string | null;
  proxyInstructions: string | null;
  socialPlatform: string | null;
  socialAction: string | null;
  socialUrl: string | null;
}
