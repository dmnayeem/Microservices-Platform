"use client";

import type { BuilderState } from "../types";
import { Field, SectionHeader } from "../shared";
import { ImageUploadField } from "@/components/admin/shared/ImageUploadField";

interface Props {
  state: BuilderState;
  update: <K extends keyof BuilderState>(key: K, value: BuilderState[K]) => void;
}

export function MediaStep({ state, update }: Props) {
  return (
    <div className="space-y-5">
      <SectionHeader
        title="Cover media"
        subtitle="Thumbnail powers the catalog card. Banner is the landing-page hero. Promo video sells the course before enrolment."
      />

      <Field label="Thumbnail" required hint="Roughly 16:9 ratio works best.">
        <ImageUploadField
          value={state.thumbnail}
          onChange={(url) => update("thumbnail", url)}
          title="Pick a thumbnail"
          previewSize="lg"
        />
      </Field>

      <Field label="Banner (landing page hero)" hint="Wider/larger than the thumbnail. Optional but recommended.">
        <ImageUploadField
          value={state.bannerUrl}
          onChange={(url) => update("bannerUrl", url)}
          title="Pick a banner image"
          previewSize="lg"
        />
      </Field>

      <Field
        label="Promo video URL"
        hint="MP4, HLS, or a YouTube/Vimeo URL works. Shown on the landing page as a trailer."
      >
        <ImageUploadField
          value={state.promoVideoUrl}
          onChange={(url) => update("promoVideoUrl", url)}
          fileType="VIDEO"
          previewSize="lg"
          urlPlaceholder="…or paste an MP4 / HLS / YouTube / Vimeo URL"
        />
      </Field>
    </div>
  );
}
