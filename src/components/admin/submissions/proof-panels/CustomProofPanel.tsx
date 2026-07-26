import {
  Type,
  AlignLeft,
  Link as LinkIcon,
  Mail,
  Phone,
  Hash,
  Image as ImageIcon,
  Images,
  Paperclip,
  Video as VideoIcon,
  ChevronDown,
  CheckSquare,
} from "lucide-react";
import {
  type CustomConfig,
  type CustomField,
  type CustomFieldType,
  type CustomAnswers,
  FIELD_TYPE_LABEL,
} from "@/lib/custom-tasks";
import type { PanelSubmission, PanelTask } from "./types";
import { SmartImage } from "@/components/user/primitives/smart-image";

interface Props {
  submission: PanelSubmission;
  task: PanelTask;
}

const TYPE_ICON: Record<CustomFieldType, typeof Type> = {
  TEXT: Type,
  TEXTAREA: AlignLeft,
  LINK: LinkIcon,
  EMAIL: Mail,
  PHONE: Phone,
  NUMBER: Hash,
  IMAGE: ImageIcon,
  IMAGES: Images,
  FILE: Paperclip,
  VIDEO: VideoIcon,
  SELECT: ChevronDown,
  CHECKBOX_GROUP: CheckSquare,
};

export function CustomProofPanel({ submission, task }: Props) {
  const cfg = task.customConfig as CustomConfig | null;
  const meta = (submission.metadata ?? {}) as { customAnswers?: CustomAnswers };
  const answers: CustomAnswers = meta.customAnswers ?? {};

  if (!cfg || !Array.isArray(cfg.fields) || cfg.fields.length === 0) {
    return (
      <p className="text-xs text-gray-500 italic">
        Custom task config missing on the task — can&apos;t render answers.
      </p>
    );
  }

  const fields = [...cfg.fields].sort((a, b) => a.order - b.order);

  return (
    <div className="space-y-3">
      {fields.map((f) => (
        <CustomAnswerRow key={f.id} field={f} value={answers[f.id]} />
      ))}
    </div>
  );
}

function CustomAnswerRow({
  field,
  value,
}: {
  field: CustomField;
  value: CustomAnswers[string] | undefined;
}) {
  const Icon = TYPE_ICON[field.type] ?? Type;
  return (
    <div className="rounded-lg border border-gray-800 bg-gray-950 p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-bold text-white inline-flex items-center gap-2">
          <Icon className="w-3.5 h-3.5 text-indigo-400" />
          {field.label}
          {field.required && <span className="text-red-400">*</span>}
        </p>
        <span className="text-[10px] uppercase tracking-wider font-bold text-gray-500">
          {FIELD_TYPE_LABEL[field.type]}
        </span>
      </div>
      <CustomAnswerValue field={field} value={value} />
    </div>
  );
}

function CustomAnswerValue({
  field,
  value,
}: {
  field: CustomField;
  value: CustomAnswers[string] | undefined;
}) {
  const isEmpty =
    value === null ||
    value === undefined ||
    (typeof value === "string" && value.trim() === "") ||
    (Array.isArray(value) && value.length === 0);

  if (isEmpty) {
    return <p className="text-xs italic text-gray-600">— (no answer)</p>;
  }

  switch (field.type) {
    case "IMAGE":
      return typeof value === "string" ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={value}
          alt=""
          className="max-w-xs max-h-64 rounded-lg object-cover bg-gray-900 border border-gray-800"
        />
      ) : null;

    case "IMAGES":
      return Array.isArray(value) ? (
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
          {(value as string[]).map((url, i) => (
            <a
              key={i}
              href={url}
              target="_blank"
              rel="noreferrer noopener"
              className="relative block aspect-square rounded-lg overflow-hidden bg-gray-900 border border-gray-800 hover:border-indigo-500/50"
            >
              <SmartImage src={url} alt="" fill sizes="200px" className="object-cover" />
            </a>
          ))}
        </div>
      ) : null;

    case "FILE":
    case "VIDEO":
      return typeof value === "string" ? (
        <a
          href={value}
          target="_blank"
          rel="noreferrer noopener"
          className="text-xs font-mono text-indigo-400 hover:text-indigo-300 underline break-all"
        >
          {value}
        </a>
      ) : null;

    case "LINK":
      return typeof value === "string" ? (
        <a
          href={value}
          target="_blank"
          rel="noreferrer noopener"
          className="text-xs font-mono text-indigo-400 hover:text-indigo-300 underline break-all"
        >
          {value}
        </a>
      ) : null;

    case "TEXTAREA":
      return (
        <p className="text-sm text-gray-200 whitespace-pre-wrap leading-relaxed">
          {String(value)}
        </p>
      );

    case "CHECKBOX_GROUP":
      return Array.isArray(value) ? (
        <div className="flex flex-wrap gap-1.5">
          {(value as string[]).map((v, i) => (
            <span
              key={i}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-300 border border-emerald-500/30 text-[11px] font-semibold"
            >
              ✓ {v}
            </span>
          ))}
        </div>
      ) : null;

    default:
      return <p className="text-sm text-gray-200">{String(value)}</p>;
  }
}
