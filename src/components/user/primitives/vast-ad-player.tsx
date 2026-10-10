"use client";

import { useEffect, useRef, useState } from "react";
import { Volume2, VolumeX } from "lucide-react";
import { loadVast, pingVast, type VastAd, type VastEvent } from "@/lib/vast-client";

/**
 * Plays one VAST ad in a slot (src/lib/vast-client.ts). Muted autoplay (the
 * only autoplay browsers allow), tap the sound button to unmute, tap the video
 * to open the advertiser. Fires the network's own impression / quartile /
 * click trackers; our viewability beacon watches the slot around it as usual.
 *
 * `data-ad-filled` on the host tells the measurement layer whether anything
 * played (an empty VAST is not an impression), and `onDone` asks the slot for
 * the next ad when the network had nothing or the video finished.
 */
export function VastAdPlayer({
  tagUrl,
  height,
  onDone,
}: {
  tagUrl: string;
  height: number;
  onDone: (reason: "empty" | "ended") => void;
}) {
  const [ad, setAd] = useState<VastAd | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "empty">("loading");
  const [muted, setMuted] = useState(true);
  const [canSkip, setCanSkip] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const fired = useRef(new Set<string>());
  const doneRef = useRef(onDone);
  useEffect(() => {
    doneRef.current = onDone;
  }, [onDone]);

  useEffect(() => {
    let live = true;
    void loadVast(tagUrl).then((a) => {
      if (!live) return;
      if (!a) {
        setState("empty");
        doneRef.current("empty");
        return;
      }
      setAd(a);
      setState("ready");
    });
    return () => {
      live = false;
    };
  }, [tagUrl]);

  const once = (ev: VastEvent | "impression") => {
    if (!ad || fired.current.has(ev)) return;
    fired.current.add(ev);
    if (ev === "impression") pingVast(ad.impressions);
    else pingVast(ad.tracking[ev]);
  };

  const onTime = () => {
    const v = videoRef.current;
    if (!v || !ad) return;
    const d = v.duration || ad.durationSec || 0;
    if (d > 0) {
      const p = v.currentTime / d;
      if (p >= 0.25) once("firstQuartile");
      if (p >= 0.5) once("midpoint");
      if (p >= 0.75) once("thirdQuartile");
    }
    if (ad.skipAfterSec != null && v.currentTime >= ad.skipAfterSec) setCanSkip(true);
  };

  const finish = () => {
    doneRef.current("ended");
  };

  // "pending" while the tag loads — no marker would read as filled.
  const filled = state === "ready" ? "1" : state === "empty" ? "0" : "pending";

  return (
    <div data-ad-filled={filled} className="relative w-full overflow-hidden rounded-xl bg-black" style={{ height }}>
      {ad && (
        <video
          ref={videoRef}
          src={ad.mediaUrl}
          muted={muted}
          autoPlay
          playsInline
          preload="auto"
          className="h-full w-full object-contain"
          onPlaying={() => {
            once("impression");
            once("start");
          }}
          onTimeUpdate={onTime}
          onEnded={() => {
            once("complete");
            finish();
          }}
          onError={() => {
            pingVast(ad.errors, { ERRORCODE: "405" });
            doneRef.current("empty");
          }}
          onClick={() => {
            pingVast(ad.clickTracking);
            if (ad.clickThrough) window.open(ad.clickThrough, "_blank", "noopener");
          }}
        />
      )}
      {ad && (
        <div className="absolute bottom-2 right-2 flex items-center gap-1.5">
          {canSkip && (
            <button
              type="button"
              onClick={() => {
                once("skip");
                finish();
              }}
              className="rounded-full bg-black/70 px-3 py-1 text-xs font-semibold text-white hover:bg-black/90"
            >
              Skip
            </button>
          )}
          <button
            type="button"
            aria-label={muted ? "Unmute ad" : "Mute ad"}
            onClick={() => {
              const next = !muted;
              setMuted(next);
              pingVast(ad.tracking[next ? "mute" : "unmute"]);
            }}
            className="grid h-7 w-7 place-items-center rounded-full bg-black/70 text-white hover:bg-black/90"
          >
            {muted ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
          </button>
        </div>
      )}
    </div>
  );
}
