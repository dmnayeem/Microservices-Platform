// Shared types for the course player

export interface PlayerLessonProgress {
  watchedSeconds: number;
  totalSeconds: number;
  lastPosition: number;
  isCompleted: boolean;
  notes: unknown;
  bookmarks: unknown;
}

export interface PlayerLesson {
  id: string;
  title: string;
  description: string | null;
  content: string | null;
  // The raw video URL is never sent to the client; it's fetched on demand as a
  // short-lived signed URL via /api/courses/[id]/lessons/[lessonId]/stream.
  hasVideo: boolean;
  subtitlesUrl: string | null;
  duration: number;
  isPreview: boolean;
  lessonType: string;
  resources: unknown;
  quizId: string | null;
  assignmentId: string | null;
  liveClassId: string | null;
  progress: PlayerLessonProgress | null;
}

export interface PlayerModule {
  id: string;
  title: string;
  description: string | null;
  lessons: PlayerLesson[];
}

export interface NoteEntry {
  id: string;
  body: string;
  position: number; // seconds offset into the lesson
  createdAt: string;
}

export interface BookmarkEntry {
  id: string;
  label: string;
  position: number;
  createdAt: string;
}
