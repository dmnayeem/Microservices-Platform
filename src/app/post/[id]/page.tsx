import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Heart, MessageCircle, Share2, BadgeCheck } from "lucide-react";
import {
  absoluteMediaUrl,
  getPublicPost,
  postSummary,
  publicPostUrl,
  SITE_URL,
} from "@/lib/public-post";
import { getPostBackground } from "@/lib/post-backgrounds";
import { PublicPostShare } from "@/components/public/public-post-share";

/**
 * The logged-out post page — the address every Share button hands out.
 *
 * This route sits at the TOP level of `src/app`, deliberately outside the
 * `(main)` group: that layout opens with `redirect("/login")` for anyone
 * without a session, so a shared link placed anywhere inside it can only ever
 * be a login wall. That was the bug — `/social/<id>` was pasted into the share
 * sheet and no such route existed at all, so every link the platform has ever
 * produced 404'd for the person who received it.
 *
 * What a stranger gets here is narrow on purpose: the post, the author's name,
 * public counts, and a way to join. No engagement controls (a Like button that
 * 401s is worse than no Like button), no other users, no ad slots — the ad
 * placement catalog has no space on this route and this page must not be the
 * one that invents one.
 */

interface PageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const post = await getPublicPost(id);

  // A private, hidden, group or banned-author post gets the SAME metadata as a
  // post that does not exist. Anything else — an author name, a snippet of the
  // text — would make the unfurler itself a way to read a post you were refused,
  // which is exactly the leak this page exists to avoid.
  if (!post) {
    return {
      title: "Post not found · EarnGPT",
      robots: { index: false, follow: false },
    };
  }

  const url = publicPostUrl(post.id);
  const description =
    postSummary(post.content) ||
    `A post by ${post.author.name} on EarnGPT.`;
  const title = `${post.author.name} on EarnGPT`;

  // Only a real post image is set here. When there is none, this key is left
  // undefined so Next's file convention (`opengraph-image.tsx`, next door) fills
  // it with the generated card — a text-only post still unfurls with a picture
  // rather than the bare site icon.
  const images = post.images.length
    ? [{ url: absoluteMediaUrl(post.images[0]), alt: description.slice(0, 120) }]
    : undefined;

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      type: "article",
      url,
      siteName: "EarnGPT",
      title,
      description,
      images,
      publishedTime: post.createdAt.toISOString(),
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: images?.map((i) => i.url),
    },
  };
}

function formatDate(d: Date): string {
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default async function PublicPostPage({ params }: PageProps) {
  const { id } = await params;
  const post = await getPublicPost(id);
  if (!post) notFound();

  const bg = post.images.length === 0 ? getPostBackground(post.backgroundStyle) : null;
  const url = publicPostUrl(post.id);

  return (
    <div className="min-h-screen bg-(--app-page) text-(--app-ink)">
      {/* Header — the only navigation a stranger gets, and it points at the
          product rather than at the app shell they cannot enter. */}
      <header className="sticky top-0 z-30 border-b border-(--app-line) bg-(--app-page)/85 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-2xl items-center justify-between gap-3 px-4">
          <Link href="/" className="text-base font-extrabold text-white">
            Earn<span className="text-(--app-accent-ink)">GPT</span>
          </Link>
          <div className="flex items-center gap-2">
            <Link
              href="/login"
              className="inline-flex h-10 items-center rounded-lg px-3 text-sm font-semibold text-(--app-ink-2) hover:text-white"
            >
              Log in
            </Link>
            <Link
              href="/register"
              className="inline-flex h-10 items-center rounded-lg bg-(--app-cta) px-4 text-sm font-semibold text-(--app-on-cta) hover:bg-(--app-cta)"
            >
              Sign up
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-2xl px-4 py-6">
        <article className="overflow-hidden rounded-2xl border border-(--app-line) bg-(--app-surface)">
          {/* Author */}
          <div className="flex items-center gap-3 px-4 pt-4">
            {post.author.avatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={post.author.avatar}
                alt=""
                width={44}
                height={44}
                className="h-11 w-11 shrink-0 rounded-full object-cover"
              />
            ) : (
              <span
                aria-hidden
                className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-(--app-cta)/20 text-base font-bold text-(--app-accent-ink)"
              >
                {post.author.name.slice(0, 1).toUpperCase()}
              </span>
            )}
            <div className="min-w-0">
              <p className="inline-flex min-w-0 items-center gap-1 text-sm font-semibold text-white">
                <span className="truncate">{post.author.name}</span>
                {post.author.isBlueVerified && (
                  <BadgeCheck className="h-4 w-4 shrink-0 text-sky-400" />
                )}
              </p>
              {/* No profile link: every profile route lives under the
                  authenticated shell, so linking it would send a logged-out
                  reader straight into a login redirect. */}
              <p className="text-xs text-(--app-ink-3)">
                {post.author.username ? `@${post.author.username} · ` : ""}
                <time dateTime={post.createdAt.toISOString()}>
                  {formatDate(post.createdAt)}
                </time>
              </p>
            </div>
          </div>

          {/* Body */}
          {bg ? (
            <div
              className={`mt-4 grid min-h-64 place-items-center px-6 py-10 ${bg.className}`}
            >
              <p
                className={`whitespace-pre-wrap break-words text-center text-2xl font-bold ${bg.textClass}`}
              >
                {post.content}
              </p>
            </div>
          ) : (
            post.content.trim().length > 0 && (
              <p className="mt-3 whitespace-pre-wrap break-words px-4 text-[15px] leading-relaxed text-(--app-ink)">
                {post.content}
              </p>
            )
          )}

          {/* Images — the media proxy serves these without a session, which is
              also why the og:image above resolves for Facebook's crawler. */}
          {post.images.length > 0 && (
            <div className="mt-3 grid gap-1 sm:grid-cols-2">
              {post.images.slice(0, 4).map((src, i) => (
                <div
                  key={`${src}-${i}`}
                  className={
                    post.images.length === 1
                      ? "relative aspect-4/3 w-full sm:col-span-2"
                      : "relative aspect-square w-full"
                  }
                >
                  <Image
                    src={src}
                    alt=""
                    fill
                    sizes="(max-width: 640px) 100vw, 640px"
                    className="object-cover"
                    unoptimized
                  />
                </div>
              ))}
            </div>
          )}

          {/* Link preview card of a URL inside the post. Rendered as static
              markup, not re-fetched: the OG fetch happened once at create time
              behind the SSRF guard in src/lib/link-preview.ts, and a public page
              must not become a way to make the server fetch arbitrary URLs. */}
          {post.linkPreview?.url && (
            <a
              href={post.linkPreview.url}
              target="_blank"
              rel="noopener noreferrer nofollow ugc"
              className="mx-4 mt-3 block overflow-hidden rounded-xl border border-(--app-line) bg-(--app-page) hover:border-(--app-line)"
            >
              {post.linkPreview.image && (
                <div className="relative aspect-[1.91/1] w-full">
                  <Image
                    src={post.linkPreview.image}
                    alt=""
                    fill
                    sizes="(max-width: 640px) 100vw, 640px"
                    className="object-cover"
                    unoptimized
                  />
                </div>
              )}
              <div className="p-3">
                {post.linkPreview.siteName && (
                  <p className="text-[11px] uppercase tracking-wide text-(--app-ink-3)">
                    {post.linkPreview.siteName}
                  </p>
                )}
                <p className="mt-0.5 line-clamp-2 text-sm font-semibold text-white">
                  {post.linkPreview.title ?? post.linkPreview.url}
                </p>
                {post.linkPreview.description && (
                  <p className="mt-1 line-clamp-2 text-xs text-(--app-ink-3)">
                    {post.linkPreview.description}
                  </p>
                )}
              </div>
            </a>
          )}

          {/* Counts, as STATIC text. There is deliberately no Like or Comment
              button: both POST to session-guarded routes, so a logged-out tap
              could only ever fail. The call to action below is the one control
              on the page that works. */}
          <div className="mt-4 flex items-center gap-5 border-t border-(--app-line) px-4 py-3 text-sm text-(--app-ink-3)">
            <span className="inline-flex items-center gap-1.5">
              <Heart className="h-4 w-4" aria-hidden />
              <span className="tabular-nums">{post.likesCount}</span>
              <span className="sr-only">reactions</span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <MessageCircle className="h-4 w-4" aria-hidden />
              <span className="tabular-nums">{post.commentsCount}</span>
              <span className="sr-only">comments</span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Share2 className="h-4 w-4" aria-hidden />
              <span className="tabular-nums">{post.sharesCount}</span>
              <span className="sr-only">shares</span>
            </span>
          </div>
        </article>

        <PublicPostShare url={url} title={`${post.author.name} on EarnGPT`} text={postSummary(post.content, 120)} />

        <section className="mt-4 rounded-2xl border border-(--app-accent-edge)/30 bg-(--app-cta)/10 p-5 text-center">
          <h2 className="text-lg font-bold text-white">Join the conversation</h2>
          <p className="mx-auto mt-1 max-w-sm text-sm text-(--app-ink-2)">
            Create a free EarnGPT account to react, comment and start earning
            from what you post.
          </p>
          <Link
            href="/register"
            className="mt-4 inline-flex h-11 items-center rounded-lg bg-(--app-cta) px-6 text-sm font-semibold text-(--app-on-cta) hover:bg-(--app-cta)"
          >
            Create a free account
          </Link>
        </section>

        <footer className="mt-6 flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-(--app-ink-3)">
          <Link href="/privacy" className="hover:text-white">
            Privacy
          </Link>
          <Link href="/terms" className="hover:text-white">
            Terms
          </Link>
          <a href={SITE_URL} className="hover:text-white">
            © {new Date().getFullYear()} EarnGPT
          </a>
        </footer>
      </main>
    </div>
  );
}
