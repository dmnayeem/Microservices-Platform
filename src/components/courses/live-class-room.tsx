"use client";

interface Props {
  meetingUrl: string;
  title: string;
}

/**
 * Embeds a live class. If `meetingUrl` is a full URL it is iframed directly;
 * otherwise it's treated as a Jitsi Meet room name (meet.jit.si — no key needed).
 */
export function LiveClassRoom({ meetingUrl, title }: Props) {
  const src = /^https?:\/\//i.test(meetingUrl)
    ? meetingUrl
    : `https://meet.jit.si/${encodeURIComponent(meetingUrl.trim())}`;

  if (!meetingUrl.trim()) {
    return (
      <div className="rounded-xl border border-(--app-line) bg-(--app-surface) p-8 text-center text-sm text-(--app-ink-3)">
        The room for this class hasn&apos;t been set yet. Check back near the start time.
      </div>
    );
  }

  return (
    <div className="w-full h-[70vh] rounded-xl overflow-hidden border border-(--app-line) bg-black">
      <iframe
        src={src}
        title={title}
        allow="camera; microphone; fullscreen; display-capture; autoplay"
        className="w-full h-full"
      />
    </div>
  );
}
