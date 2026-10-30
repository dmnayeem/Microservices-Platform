import type { Metadata } from "next";
import { BookOpen, Award, Video, Clock } from "lucide-react";
import {
  PageHero,
  Band,
  SectionHead,
  Facts,
  Rows,
  Steps,
  Tile,
  Btn,
  Faq,
  Closing,
} from "@/components/marketing/kit";
import { CoursesMock } from "@/components/marketing/mocks";
import { COMPANY_NAME } from "@/config/company";
import { pageMeta } from "@/lib/seo/page-meta";

// Breadcrumb data comes from this route's layout.tsx.

export function generateMetadata(): Promise<Metadata> {
  return pageMeta({
    title: "Online Courses — Learn Skills or Teach & Earn",
    description: `Take practical online courses with completion certificates on ${COMPANY_NAME}, or apply as a tutor to build and sell your own courses and live classes.`,
    path: "/features/courses",
  });
}

const LEARNER = [
  { icon: <BookOpen />, title: "Practical courses", body: "Video lessons, resources and quizzes on business, tech and creative skills, built by approved tutors." },
  { icon: <Award />, title: "Certificates", body: "Finish a course that offers one and get a certificate you can show on your profile and CV." },
  { icon: <Video />, title: "Live classes", body: "Join scheduled sessions and ask the tutor questions in real time." },
  { icon: <Clock />, title: "Your own pace", body: "Start, pause and pick up again on any device. Your progress is saved." },
];

const TUTOR_STEPS = [
  { title: "Apply to teach", body: "Tell us your subject and experience. Approval unlocks your tutor console." },
  { title: "Build the course", body: "Add video lessons, resources and quizzes, and set your price." },
  { title: "Publish", body: "Go live to learners on the platform and schedule live classes when it suits you." },
  { title: "Earn per enrolment", body: "Every student who enrols adds to your wallet." },
];

const FAQ = [
  {
    q: "Who teaches the courses?",
    a: "Approved tutors. Anyone can apply, and each application is reviewed before the tutor console unlocks.",
  },
  {
    q: "Do I get a certificate?",
    a: "Courses that offer one issue a certificate of completion when you finish. You can share it on your profile.",
  },
  {
    q: "How do tutors get paid?",
    a: "Tutors earn from each enrolment, paid to their wallet and withdrawn under the usual withdrawal rules. Affiliates can also promote a course for a commission.",
  },
  {
    q: "Can I learn on my phone?",
    a: "Yes. Courses work on any device, and your progress follows you between them.",
  },
];

export default function CoursesFeaturePage() {
  return (
    <>
      <PageHero
        kicker="Courses"
        title="Learn a skill that pays."
        accent="Or teach the one you have."
        lead="Practical courses with video lessons, quizzes and a certificate when you finish — taught by approved tutors who build, price and sell their own classes here."
        actions={
          <>
            <Btn href="/register">Start learning</Btn>
            <Btn href="/profile/become-tutor" variant="secondary">
              Become a tutor
            </Btn>
          </>
        }
        note="Free to join · Learn on any device"
        visual={<CoursesMock />}
      />

      <div className="mx-auto max-w-7xl px-4 pt-12 sm:px-6 lg:px-8">
        <Facts
          items={[
            { value: "Video", label: "Lessons, resources, quizzes" },
            { value: "Live", label: "Classes with the tutor" },
            { value: "Certified", label: "On completion" },
            { value: "Any device", label: "Progress saved" },
          ]}
        />
      </div>

      <Band labelledBy="learn-title">
        <SectionHead
          id="learn-title"
          n="01"
          label="For learners"
          title="Built for learning that sticks"
          lead="Short lessons, a quiz to check you got it, and a certificate to show for it."
        />
        <Rows items={LEARNER} />
      </Band>

      <Band id="teach" labelledBy="teach-title" alt>
        <SectionHead
          id="teach-title"
          n="02"
          label="For tutors"
          title="Turn what you know into income"
          lead="Approved tutors get a full console to build, publish and sell courses and live classes."
        />
        <Steps items={TUTOR_STEPS} />
        <div className="mt-12">
          <Btn href="/profile/become-tutor">Apply to become a tutor</Btn>
        </div>
      </Band>

      <Band labelledBy="why-title">
        <SectionHead id="why-title" n="03" label="Why teach here" title="Your course, your terms" />
        <div className="grid gap-4 md:grid-cols-3">
          <Tile title="You set the price" body="Decide what your course is worth and run discounts whenever you like." />
          <Tile
            title="An audience already here"
            body={`Your course sits alongside the micro-task and marketplace community already using ${COMPANY_NAME}.`}
          />
          <Tile
            href="/features/affiliate"
            cta="How affiliates promote courses"
            title="Others can sell it for you"
            body="Let affiliates share your course for a commission and grow enrolments without extra work."
          />
        </div>
      </Band>

      <Band labelledBy="faq-title" alt>
        <Faq id="faq-title" items={FAQ} />
      </Band>

      <div className="pt-[clamp(3.5rem,8vw,7rem)]">
        <Closing
          title="Start learning — or start teaching."
          lead="Joining is free. Enrol in your first course, or apply to open your own classroom."
          primary={{ href: "/register", label: "Create a free account" }}
          secondary={{ href: "/profile/become-tutor", label: "Become a tutor" }}
        />
      </div>
    </>
  );
}
