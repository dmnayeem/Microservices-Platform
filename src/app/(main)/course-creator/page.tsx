import { redirect } from "next/navigation";

// This page's form POSTed to /api/courses, which only has GET, so no course
// was ever created from it. The working builder is the tutor studio's (its
// layout sends a non-tutor to apply first).
export default function CourseCreatorPage() {
  redirect("/tutor/courses/new");
}
