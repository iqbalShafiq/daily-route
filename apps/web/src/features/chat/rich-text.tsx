import type { ReactNode } from "react";

/**
 * A small renderer for the assistant's prose.
 *
 * The model is asked for plain text, but a fallback provider sometimes
 * returns a bold label or a numbered list. Those are display details, not
 * data: every station, fare and duration still comes from a semantic card.
 * No HTML is injected.
 */
export function RichText({ text }: { text: string }) {
  const lines = text.split("\n");
  const blocks: ReactNode[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;

  const flush = (): void => {
    if (!list) return;
    const Tag = list.ordered ? "ol" : "ul";
    blocks.push(
      <Tag key={`list-${blocks.length}`} className="my-1 space-y-0.5 pl-4">
        {list.items.map((item, index) => (
          <li key={index} className="list-outside">
            {inline(item)}
          </li>
        ))}
      </Tag>,
    );
    list = null;
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    const bullet = /^\s*[-*]\s+(.*)$/.exec(line);
    const numbered = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    if (bullet || numbered) {
      const ordered = numbered !== null;
      const content = (bullet?.[1] ?? numbered?.[1] ?? "").trim();
      if (!list || list.ordered !== ordered) {
        flush();
        list = { ordered, items: [] };
      }
      list.items.push(content);
      continue;
    }
    flush();
    if (line.trim().length === 0) {
      blocks.push(<div key={`space-${blocks.length}`} className="h-2" />);
    } else {
      blocks.push(
        <p key={`line-${blocks.length}`} className="whitespace-pre-wrap">
          {inline(line)}
        </p>,
      );
    }
  }
  flush();
  return <div>{blocks}</div>;
}

function inline(text: string): ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, index) =>
    part.startsWith("**") && part.endsWith("**") && part.length > 4 ? (
      <strong key={index} className="font-semibold text-ink">
        {part.slice(2, -2)}
      </strong>
    ) : (
      <span key={index}>{part}</span>
    ),
  );
}
