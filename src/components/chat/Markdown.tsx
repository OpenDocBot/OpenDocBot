import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Components } from "react-markdown";

function cleanDisplayText(content: string): string {
  return content
    .replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, "")
    .trim();
}

const components: Components = {
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noopener noreferrer" className="text-primary underline decoration-primary/50 hover:decoration-primary">
      {children}
    </a>
  ),
  pre: ({ children }) => (
    <pre className="overflow-x-auto border border-border bg-black/40 text-foreground p-2 font-mono text-xs my-1">
      {children}
    </pre>
  ),
  code: ({ className, children }) => {
    const isBlock = className?.startsWith("language-");
    if (isBlock) {
      return <code className={`${className} font-mono`}>{children}</code>;
    }
    return (
      <code className="bg-muted text-accent-foreground border border-border/60 px-1 py-0.5 font-mono text-[0.85em]">
        {children}
      </code>
    );
  },
};

export function Markdown({ content }: { content: string }) {
  return (
    <div className="prose prose-sm max-w-none prose-p:my-1 prose-ul:my-1 prose-ol:my-1 prose-li:my-0.5 prose-headings:my-2 prose-hr:my-2 prose-invert prose-headings:text-foreground prose-strong:text-foreground prose-blockquote:text-muted-foreground prose-blockquote:border-l-primary">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {cleanDisplayText(content)}
      </ReactMarkdown>
    </div>
  );
}
