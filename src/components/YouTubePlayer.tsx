"use client";

interface YouTubePlayerProps {
  url: string;
  className?: string;
}

export function YouTubePlayer({ url, className = "" }: YouTubePlayerProps) {
  // Extract video ID from YouTube URL
  const getVideoId = (url: string): string | null => {
    try {
      const urlObj = new URL(url);

      // Handle youtu.be short links
      if (urlObj.hostname === "youtu.be") {
        return urlObj.pathname.slice(1);
      }

      // Handle youtube.com links
      if (urlObj.hostname.includes("youtube.com")) {
        return urlObj.searchParams.get("v");
      }

      return null;
    } catch {
      return null;
    }
  };

  const videoId = getVideoId(url);

  if (!videoId) {
    return (
      <div className="bg-gray-900 border border-gray-800 rounded-lg p-6 text-center">
        <p className="text-gray-400">Invalid YouTube URL</p>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-indigo-400 hover:text-indigo-300 text-sm mt-2 inline-block"
        >
          Open link in new tab
        </a>
      </div>
    );
  }

  return (
    <div className={`relative w-full ${className}`} style={{ paddingBottom: "56.25%" }}>
      <iframe
        className="absolute top-0 left-0 w-full h-full rounded-lg"
        src={`https://www.youtube.com/embed/${videoId}?playsinline=1&rel=0`}
        title="YouTube video player"
        frameBorder="0"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        allowFullScreen
      />
    </div>
  );
}
