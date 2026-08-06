import { SurveyAnswerDetail } from "../survey-answer-detail";
import type { SurveyConfig, SurveyAnswers } from "@/lib/survey-tasks";
import { VideoProofPanel } from "./VideoProofPanel";
import { ArticleProofPanel } from "./ArticleProofPanel";
import { QuizProofPanel } from "./QuizProofPanel";
import { SocialProofPanel } from "./SocialProofPanel";
import { ProxyProofPanel } from "./ProxyProofPanel";
import { GenericProofPanel } from "./GenericProofPanel";
import { CustomProofPanel } from "./CustomProofPanel";
import { AppInstallProofPanel } from "./AppInstallProofPanel";
import type { PanelSubmission, PanelTask } from "./types";

interface Props {
  submission: PanelSubmission;
  task: PanelTask;
}

/**
 * Branches the submission proof rendering on `task.type`. Server-friendly —
 * no client state. Used inline within the admin submissions page.
 */
export function SubmissionProofPanel({ submission, task }: Props) {
  switch (task.type) {
    case "VIDEO":
      return <VideoProofPanel submission={submission} task={task} />;
    case "ARTICLE":
      return <ArticleProofPanel submission={submission} task={task} />;
    case "QUIZ":
      return <QuizProofPanel submission={submission} task={task} />;
    case "SURVEY":
      return (
        <SurveyAnswerDetail
          config={task.surveyConfig as SurveyConfig | null}
          answers={submission.answers as SurveyAnswers | null}
        />
      );
    case "SOCIAL":
      return <SocialProofPanel submission={submission} task={task} />;
    case "PROXY":
      return <ProxyProofPanel submission={submission} task={task} />;
    case "CUSTOM":
      return <CustomProofPanel submission={submission} task={task} />;
    case "APPINSTALL":
      return <AppInstallProofPanel submission={submission} task={task} />;
    case "OFFERWALL":
    default:
      return <GenericProofPanel submission={submission} />;
  }
}

export type { PanelSubmission, PanelTask } from "./types";
