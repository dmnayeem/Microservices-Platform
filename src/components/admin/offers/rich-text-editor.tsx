"use client";

import { promptDialog } from "@/lib/confirm";

import { useState } from "react";
import { useEditor, EditorContent, useEditorState, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import TextAlign from "@tiptap/extension-text-align";
// Tiptap v3: TextStyle + Color both live in @tiptap/extension-text-style.
import { TextStyle, Color } from "@tiptap/extension-text-style";
import Image from "@tiptap/extension-image";
import { TableKit } from "@tiptap/extension-table";
import Youtube from "@tiptap/extension-youtube";
import Highlight from "@tiptap/extension-highlight";
import { Placeholder, CharacterCount } from "@tiptap/extensions";
// Aliased: `DOMParser` alone would shadow the browser one used just below it.
import { DOMParser as ProseMirrorDOMParser } from "@tiptap/pm/model";
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Strikethrough,
  Highlighter,
  Heading1,
  Heading2,
  Heading3,
  Heading4,
  Pilcrow,
  List,
  ListOrdered,
  Quote,
  SquareCode,
  Minus,
  Link as LinkIcon,
  Unlink,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  Undo,
  Redo,
  Baseline,
  ImagePlus,
  Youtube as YoutubeIcon,
  Table as TableIcon,
  Eraser,
  Code,
  Maximize2,
  Minimize2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { OFFER_RICHTEXT_CLASS } from "@/lib/offers";
import { looksLikeMarkdown, markdownToHtml } from "@/lib/markdown-paste";

const TEXT_COLORS = [
  "#ffffff", "#94a3b8", "#ef4444", "#f59e0b",
  "#eab308", "#22c55e", "#06b6d4", "#3b82f6",
  "#8b5cf6", "#ec4899",
];

const HIGHLIGHTS = ["#fde68a", "#bbf7d0", "#bae6fd", "#fbcfe8", "#ddd6fe"];

/**
 * The one rich-text editor for staff-written content: task instructions,
 * offer pages, the blog and popups.
 *
 * Headings H1–H4, lists, quotes, code blocks, tables, YouTube embeds, images
 * with alt text, text colour and highlight, links, alignment, a word count,
 * a full-screen mode and an HTML source view. The toolbar sticks to the top
 * while a long article scrolls under it.
 */
export function RichTextEditor({
  value,
  onChange,
  onPickImage,
  minHeightClass = "min-h-32",
  placeholder = "Start writing…",
  showCount = false,
}: {
  value: string;
  onChange: (html: string) => void;
  /**
   * Supply a picker (the media library) for the image button. Without it the
   * button falls back to asking for a URL, which is no use for a screenshot
   * that has not been uploaded anywhere yet.
   */
  onPickImage?: () => Promise<string | null> | void;
  minHeightClass?: string;
  placeholder?: string;
  /** Show the word / character count under the editor (the blog uses it). */
  showCount?: boolean;
}) {
  const [showSource, setShowSource] = useState(false);
  const [source, setSource] = useState(value);
  const [fullscreen, setFullscreen] = useState(false);

  const editor = useEditor({
    immediatelyRender: false, // required for Next.js SSR (no hydration mismatch)
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3, 4] },
        link: {
          openOnClick: false,
          autolink: true,
          HTMLAttributes: { rel: "noopener noreferrer", target: "_blank" },
        },
      }),
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      TextStyle,
      Color,
      Highlight.configure({ multicolor: true }),
      Image.configure({ inline: true, allowBase64: false }),
      TableKit.configure({ table: { resizable: false } }),
      Youtube.configure({ nocookie: true, modestBranding: true, width: 640, height: 360 }),
      Placeholder.configure({ placeholder }),
      CharacterCount,
    ],
    content: value || "<p></p>",
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
    editorProps: {
      attributes: {
        class: `${OFFER_RICHTEXT_CLASS} ${minHeightClass} px-3 py-2 focus:outline-none`,
      },
      /**
       * Paste from ChatGPT.
       *
       * A rich `text/html` flavour (a web page, a word processor) already
       * pastes correctly, so it is left alone. ChatGPT's plain-text flavour is
       * Markdown, which used to arrive as literal `##` and `**` with every
       * heading flattened. Convert it — but only when it really looks like
       * Markdown, so ordinary prose is never rewritten.
       */
      handlePaste: (view, event) => {
        const html = event.clipboardData?.getData("text/html");
        if (html && html.trim()) return false; // rich paste: Tiptap handles it
        const text = event.clipboardData?.getData("text/plain") ?? "";
        if (!looksLikeMarkdown(text)) return false;
        event.preventDefault();
        const { state, dispatch } = view;
        const parsed = new DOMParser().parseFromString(
          markdownToHtml(text),
          "text/html"
        );
        const slice = ProseMirrorDOMParser.fromSchema(state.schema).parseSlice(
          parsed.body,
          { preserveWhitespace: false }
        );
        dispatch(state.tr.replaceSelection(slice).scrollIntoView());
        return true;
      },
    },
  });

  const toggleSource = () => {
    if (!editor) return;
    if (showSource) {
      editor.commands.setContent(source); // apply edited HTML back
      onChange(source);
      setShowSource(false);
    } else {
      setSource(editor.getHTML());
      setShowSource(true);
    }
  };

  if (!editor) {
    return (
      <div className="rounded-lg border border-slate-700 bg-slate-950 min-h-40 animate-pulse" />
    );
  }

  return (
    <div
      className={cn(
        "rounded-lg border border-slate-700 bg-slate-950",
        // Full screen: the page behind is covered and the editor scrolls itself.
        fullscreen ? "fixed inset-2 sm:inset-6 z-[80] flex flex-col shadow-2xl" : "relative"
      )}
    >
      {showSource ? (
        <>
          <div className="flex items-center justify-between border-b border-slate-800 bg-slate-900 px-2 py-1.5 rounded-t-lg">
            <span className="text-xs text-slate-400 px-1">HTML source</span>
            <Btn title="Back to editor" active onClick={toggleSource}>
              <Code className="w-4 h-4" />
            </Btn>
          </div>
          <textarea
            value={source}
            onChange={(e) => {
              setSource(e.target.value);
              onChange(e.target.value);
            }}
            spellCheck={false}
            className={cn(
              "w-full px-3 py-2 bg-slate-950 text-slate-200 font-mono text-xs focus:outline-none resize-y",
              fullscreen ? "flex-1" : "min-h-40"
            )}
          />
        </>
      ) : (
        <>
          <Toolbar
            editor={editor}
            onToggleSource={toggleSource}
            onPickImage={onPickImage}
            fullscreen={fullscreen}
            onToggleFullscreen={() => setFullscreen((v) => !v)}
          />
          <div className={cn(fullscreen && "flex-1 overflow-y-auto")}>
            <EditorContent editor={editor} />
          </div>
          {showCount && <Counter editor={editor} />}
        </>
      )}
    </div>
  );
}

function Counter({ editor }: { editor: Editor }) {
  const { words, chars } = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      words: e.storage.characterCount.words() as number,
      chars: e.storage.characterCount.characters() as number,
    }),
  });
  return (
    <div className="flex items-center justify-end gap-3 border-t border-slate-800 px-3 py-1.5 text-[11px] text-slate-500 tabular-nums">
      <span>{words.toLocaleString()} words</span>
      <span>{chars.toLocaleString()} characters</span>
      <span>~{Math.max(1, Math.round(words / 200))} min read</span>
    </div>
  );
}

function Btn({
  active,
  disabled,
  onClick,
  title,
  children,
}: {
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "p-1.5 rounded text-slate-300 hover:bg-slate-800 disabled:opacity-40",
        active && "bg-slate-800 text-white"
      )}
    >
      {children}
    </button>
  );
}

const Sep = () => <span className="w-px h-5 bg-slate-700 mx-1" />;

function Toolbar({
  editor,
  onToggleSource,
  onPickImage,
  fullscreen,
  onToggleFullscreen,
}: {
  editor: Editor;
  onToggleSource: () => void;
  onPickImage?: () => Promise<string | null> | void;
  fullscreen: boolean;
  onToggleFullscreen: () => void;
}) {
  const [colorOpen, setColorOpen] = useState(false);
  const [markOpen, setMarkOpen] = useState(false);
  // Re-render on every transaction so the active states follow the cursor.
  useEditorState({ editor, selector: ({ transactionNumber }) => transactionNumber });

  const setLink = async () => {
    const prev = editor.getAttributes("link").href as string | undefined;
    const url = await promptDialog({ title: "Link URL", defaultValue: prev ?? "https://", tone: "info", confirmLabel: "Set link" });
    if (url === null) return;
    if (url === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    // Links inside the site stay in the same tab; outside ones open a new one.
    const external = /^https?:\/\//i.test(url);
    editor
      .chain()
      .focus()
      .extendMarkRange("link")
      .setLink({ href: url, target: external ? "_blank" : null })
      .run();
  };

  const insertImage = async () => {
    // A screenshot the admin just took is not at a URL yet, so prefer the host's
    // picker (the media library, which uploads) and keep the URL prompt only as
    // the fallback for hosts that have not supplied one.
    let src: string | null | void = null;
    if (onPickImage) src = await onPickImage();
    else src = await promptDialog({ title: "Image URL", defaultValue: "https://", tone: "info", confirmLabel: "Next" });
    if (!src) return;
    // Alt text is what search engines and screen readers read for the image.
    const alt = await promptDialog({
      title: "Describe the image (alt text)",
      defaultValue: "",
      tone: "info",
      confirmLabel: "Insert",
    });
    editor.chain().focus().setImage({ src, alt: alt ?? "" }).run();
  };

  const insertVideo = async () => {
    const url = await promptDialog({ title: "YouTube link", defaultValue: "https://www.youtube.com/watch?v=", tone: "info", confirmLabel: "Embed" });
    if (!url) return;
    const ok = editor.chain().focus().setYoutubeVideo({ src: url }).run();
    if (!ok) await promptDialog({ title: "That is not a YouTube link", defaultValue: url, tone: "warning", confirmLabel: "OK" });
  };

  const inTable = editor.isActive("table");
  const currentColor =
    (editor.getAttributes("textStyle").color as string | undefined) ?? "#ffffff";

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-0.5 border-b border-slate-800 bg-slate-900 px-2 py-1.5 rounded-t-lg",
        // Stays in view while a long article scrolls under it.
        !fullscreen && "sticky top-0 z-10"
      )}
    >
      <Btn title="Paragraph" active={editor.isActive("paragraph")} onClick={() => editor.chain().focus().setParagraph().run()}>
        <Pilcrow className="w-4 h-4" />
      </Btn>
      <Btn title="Heading 1" active={editor.isActive("heading", { level: 1 })} onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}>
        <Heading1 className="w-4 h-4" />
      </Btn>
      <Btn title="Heading 2" active={editor.isActive("heading", { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>
        <Heading2 className="w-4 h-4" />
      </Btn>
      <Btn title="Heading 3" active={editor.isActive("heading", { level: 3 })} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}>
        <Heading3 className="w-4 h-4" />
      </Btn>
      <Btn title="Heading 4" active={editor.isActive("heading", { level: 4 })} onClick={() => editor.chain().focus().toggleHeading({ level: 4 }).run()}>
        <Heading4 className="w-4 h-4" />
      </Btn>

      <Sep />
      <Btn title="Bold" active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()}>
        <Bold className="w-4 h-4" />
      </Btn>
      <Btn title="Italic" active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()}>
        <Italic className="w-4 h-4" />
      </Btn>
      <Btn title="Underline" active={editor.isActive("underline")} onClick={() => editor.chain().focus().toggleUnderline().run()}>
        <UnderlineIcon className="w-4 h-4" />
      </Btn>
      <Btn title="Strikethrough" active={editor.isActive("strike")} onClick={() => editor.chain().focus().toggleStrike().run()}>
        <Strikethrough className="w-4 h-4" />
      </Btn>

      {/* Text color */}
      <div className="relative">
        <Btn title="Text color" active={colorOpen} onClick={() => setColorOpen((v) => !v)}>
          <Baseline className="w-4 h-4" style={{ color: currentColor }} />
        </Btn>
        {colorOpen && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setColorOpen(false)} />
            <div className="absolute left-0 top-full mt-1 z-50 w-48 p-2 rounded-lg bg-slate-900 border border-slate-700 shadow-xl">
              <div className="grid grid-cols-5 gap-1.5">
                {TEXT_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    title={c}
                    onClick={() => {
                      editor.chain().focus().setColor(c).run();
                      setColorOpen(false);
                    }}
                    className="w-7 h-7 rounded-full border border-white/10"
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
              <div className="flex items-center gap-2 mt-2">
                <input
                  type="color"
                  onChange={(e) => editor.chain().focus().setColor(e.target.value).run()}
                  className="w-8 h-8 rounded bg-transparent cursor-pointer"
                  title="Custom color"
                />
                <button
                  type="button"
                  onClick={() => {
                    editor.chain().focus().unsetColor().run();
                    setColorOpen(false);
                  }}
                  className="flex-1 text-xs text-slate-300 hover:text-white rounded bg-slate-800 py-1.5"
                >
                  Default
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Highlight */}
      <div className="relative">
        <Btn title="Highlight" active={editor.isActive("highlight") || markOpen} onClick={() => setMarkOpen((v) => !v)}>
          <Highlighter className="w-4 h-4" />
        </Btn>
        {markOpen && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setMarkOpen(false)} />
            <div className="absolute left-0 top-full mt-1 z-50 p-2 rounded-lg bg-slate-900 border border-slate-700 shadow-xl flex items-center gap-1.5">
              {HIGHLIGHTS.map((c) => (
                <button
                  key={c}
                  type="button"
                  title={c}
                  onClick={() => {
                    editor.chain().focus().toggleHighlight({ color: c }).run();
                    setMarkOpen(false);
                  }}
                  className="w-7 h-7 rounded-full border border-white/10"
                  style={{ backgroundColor: c }}
                />
              ))}
              <button
                type="button"
                onClick={() => {
                  editor.chain().focus().unsetHighlight().run();
                  setMarkOpen(false);
                }}
                className="px-2 h-7 text-xs text-slate-300 hover:text-white rounded bg-slate-800"
              >
                None
              </button>
            </div>
          </>
        )}
      </div>

      <Sep />
      <Btn title="Bullet list" active={editor.isActive("bulletList")} onClick={() => editor.chain().focus().toggleBulletList().run()}>
        <List className="w-4 h-4" />
      </Btn>
      <Btn title="Numbered list" active={editor.isActive("orderedList")} onClick={() => editor.chain().focus().toggleOrderedList().run()}>
        <ListOrdered className="w-4 h-4" />
      </Btn>
      <Btn title="Quote" active={editor.isActive("blockquote")} onClick={() => editor.chain().focus().toggleBlockquote().run()}>
        <Quote className="w-4 h-4" />
      </Btn>
      <Btn title="Code block" active={editor.isActive("codeBlock")} onClick={() => editor.chain().focus().toggleCodeBlock().run()}>
        <SquareCode className="w-4 h-4" />
      </Btn>
      <Btn title="Divider line" onClick={() => editor.chain().focus().setHorizontalRule().run()}>
        <Minus className="w-4 h-4" />
      </Btn>

      <Sep />
      <Btn title="Link" active={editor.isActive("link")} onClick={setLink}>
        <LinkIcon className="w-4 h-4" />
      </Btn>
      <Btn title="Remove link" disabled={!editor.isActive("link")} onClick={() => editor.chain().focus().extendMarkRange("link").unsetLink().run()}>
        <Unlink className="w-4 h-4" />
      </Btn>
      <Btn title="Insert image (with alt text)" onClick={insertImage}>
        <ImagePlus className="w-4 h-4" />
      </Btn>
      <Btn title="Embed YouTube video" onClick={insertVideo}>
        <YoutubeIcon className="w-4 h-4" />
      </Btn>
      <Btn title="Insert table" active={inTable} onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}>
        <TableIcon className="w-4 h-4" />
      </Btn>

      <Sep />
      <Btn title="Align left" active={editor.isActive({ textAlign: "left" })} onClick={() => editor.chain().focus().setTextAlign("left").run()}>
        <AlignLeft className="w-4 h-4" />
      </Btn>
      <Btn title="Align center" active={editor.isActive({ textAlign: "center" })} onClick={() => editor.chain().focus().setTextAlign("center").run()}>
        <AlignCenter className="w-4 h-4" />
      </Btn>
      <Btn title="Align right" active={editor.isActive({ textAlign: "right" })} onClick={() => editor.chain().focus().setTextAlign("right").run()}>
        <AlignRight className="w-4 h-4" />
      </Btn>
      <Btn title="Justify" active={editor.isActive({ textAlign: "justify" })} onClick={() => editor.chain().focus().setTextAlign("justify").run()}>
        <AlignJustify className="w-4 h-4" />
      </Btn>

      <Sep />
      <Btn title="Clear formatting" onClick={() => editor.chain().focus().unsetAllMarks().clearNodes().run()}>
        <Eraser className="w-4 h-4" />
      </Btn>
      <Btn title="Undo" disabled={!editor.can().undo()} onClick={() => editor.chain().focus().undo().run()}>
        <Undo className="w-4 h-4" />
      </Btn>
      <Btn title="Redo" disabled={!editor.can().redo()} onClick={() => editor.chain().focus().redo().run()}>
        <Redo className="w-4 h-4" />
      </Btn>

      <span className="ml-auto" />
      <Btn title={fullscreen ? "Exit full screen" : "Full screen"} active={fullscreen} onClick={onToggleFullscreen}>
        {fullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
      </Btn>
      <Btn title="Edit HTML source" onClick={onToggleSource}>
        <Code className="w-4 h-4" />
      </Btn>

      {/* Table tools appear only while the cursor is in a table. */}
      {inTable && (
        <div className="basis-full flex flex-wrap items-center gap-1 pt-1.5 mt-1 border-t border-slate-800 text-[11px]">
          <span className="text-slate-500 mr-1">Table:</span>
          {(
            [
              ["+ Row above", () => editor.chain().focus().addRowBefore().run()],
              ["+ Row below", () => editor.chain().focus().addRowAfter().run()],
              ["− Row", () => editor.chain().focus().deleteRow().run()],
              ["+ Col left", () => editor.chain().focus().addColumnBefore().run()],
              ["+ Col right", () => editor.chain().focus().addColumnAfter().run()],
              ["− Col", () => editor.chain().focus().deleteColumn().run()],
              ["Header row", () => editor.chain().focus().toggleHeaderRow().run()],
              ["Merge/split", () => editor.chain().focus().mergeOrSplit().run()],
              ["Delete table", () => editor.chain().focus().deleteTable().run()],
            ] as const
          ).map(([label, run]) => (
            <button
              key={label}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={run}
              className={cn(
                "rounded px-2 py-1 bg-slate-800 hover:bg-slate-700",
                label === "Delete table" ? "text-red-300" : "text-slate-200"
              )}
            >
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
