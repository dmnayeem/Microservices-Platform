/**
 * Maps a task `type` to the route that runs it (the page where the user actually
 * does the task). Centralises routing so every surface (earn hub, search, tasks
 * hub, the /tasks/[id] dispatcher) opens the same correct run experience instead
 * of each guessing. Types with a dedicated detail/player route deep-link to it;
 * the rest go to their list page (which contains the run flow). SOCIAL deep-links
 * with `?task=` so the list auto-opens that task's submit sheet.
 */
export function taskRunHref(type: string | null | undefined, id: string): string {
  switch ((type ?? "").toUpperCase()) {
    case "VIDEO":
      return `/video-tasks/${id}`;
    case "ARTICLE":
      return `/article-tasks/${id}`;
    case "SURVEY":
      return `/survey-tasks/${id}`;
    case "CUSTOM":
      return `/custom-tasks/${id}`;
    case "APPINSTALL":
      return `/app-install-tasks/${id}`;
    case "VISIT":
      return `/visit-tasks/${id}`;
    case "SOCIAL":
      return `/social-tasks/${id}`;
    case "QUIZ":
      return "/quiz-tasks";
    case "MANUAL":
      return "/custom-tasks";
    case "PROXY":
      return "/proxy-tasks";
    case "BOARD":
      return "/board-tasks";
    case "OFFERWALL":
      return "/earn#offerwall";
    default:
      return "/tasks";
  }
}
