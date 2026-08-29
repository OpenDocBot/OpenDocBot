interface ParsedChunk {
  toolNames: string[];
  isToolBlock: boolean;
}

const TOOL_BLOCK_PATTERNS = ["<tool", "<function-call", "<system-reminder"];

function isToolBlockStart(buffer: string, pos: number): { idx: number; endIdx: number } | null {
  for (const pattern of TOOL_BLOCK_PATTERNS) {
    const idx = buffer.indexOf(pattern, pos);
    if (idx !== -1) {
      // Find the enclosing tag end (>)
      const endIdx = buffer.indexOf(">", idx + pattern.length);
      if (endIdx !== -1) {
        // Get the full opening tag
        const tag = buffer.substring(idx, endIdx + 1);
        // Extract the tag name (without attributes)
        const tagMatch = tag.match(/<(\/?[\w-]+)/);
        if (tagMatch) {
          const tagName = tagMatch[1];
          // Find matching closing tag
          const closingTag = `</${tagName}>`;
          const closeIdx = buffer.indexOf(closingTag, endIdx);
          if (closeIdx !== -1) {
            return { idx, endIdx: closeIdx + closingTag.length };
          }
          // Allow self-closing: <tool_call ... /> or <tool_call name="x" />
          const selfClose = buffer.indexOf("/>", idx);
          if (selfClose !== -1 && selfClose < (closeIdx === -1 ? buffer.length : closeIdx)) {
            return { idx, endIdx: selfClose + 2 };
          }
        }
      }
      // Tag not yet complete — might be split across chunks
      // Return idx but not endIdx to indicate we're inside a potential block
      return null; // wait for next chunk
    }
  }
  return null;
}

export class StreamToolParser {
  private buffer = "";
  private capturedToolNames: string[] = [];

  feed(chunk: string): ParsedChunk {
    this.buffer += chunk;
    const toolNames: string[] = [];

    let pos = 0;
    while (pos < this.buffer.length) {
      const block = isToolBlockStart(this.buffer, pos);
      if (block) {
        const xmlBlock = this.buffer.substring(block.idx, block.endIdx);
        // Extract tool names: check name="get_selection" attributes and <function-name> tags
        const names = this.extractToolNames(xmlBlock);
        if (names.length > 0) {
          toolNames.push(...names);
          this.capturedToolNames.push(...names);
        }
        // Remove the block from buffer
        this.buffer = this.buffer.substring(0, block.idx) + this.buffer.substring(block.endIdx);
        pos = block.idx;
      } else {
        // Check for incomplete tag at end of buffer that might be a tool block
        const lastLt = this.buffer.lastIndexOf("<");
        if (lastLt !== -1 && lastLt > this.buffer.length - 20) {
          const suffix = this.buffer.substring(lastLt);
          for (const pattern of TOOL_BLOCK_PATTERNS) {
            if (pattern.startsWith(suffix) || suffix.startsWith(pattern)) {
              // Partial match — don't process, wait for more chars
              return { toolNames, isToolBlock: false };
            }
          }
        }
        break;
      }
    }

    return { toolNames, isToolBlock: false };
  }

  flushBuffer(): string {
    return this.buffer;
  }

  reset(): void {
    this.buffer = "";
    this.capturedToolNames = [];
  }

  getCapturedTools(): string[] {
    return [...this.capturedToolNames];
  }

  private extractToolNames(xml: string): string[] {
    const found = new Set<string>();

    // 1. name="get_selection" attributes
    const nameAttrRegex = /name\s*=\s*"([^"]+)"/g;
    let match;
    while ((match = nameAttrRegex.exec(xml)) !== null) {
      found.add(match[1]);
    }

    // 2. <function-name>get_selection</function-name>
    const fnNameRegex = /<function-name>([^<]+)<\/function-name>/g;
    while ((match = fnNameRegex.exec(xml)) !== null) {
      found.add(match[1]);
    }

    // 3. <tool_name> or any word that looks like a snake_case tool name inside tags
    const wordRegex = /<(\w+)>/g;
    while ((match = wordRegex.exec(xml)) !== null) {
      const word = match[1];
      if (
        !word.startsWith("/") &&
        !["tools", "function-calls", "function-call", "function-name", "tool_calls", "tool_call", "system-reminder"].includes(word)
      ) {
        found.add(word);
      }
    }

    return [...found];
  }
}
