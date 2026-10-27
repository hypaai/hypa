type ParsedTranslation = {
  thinkingContent: string | null;
  mainContent: string;
};

export const parseTranslation = (text: string): ParsedTranslation => {
  const completeBlocks = Array.from(
    text.matchAll(/<\|?think>([\s\S]*?)<\/think>/gi),
  );
  const completedThinking = completeBlocks
    .map((match) => match[1].trim())
    .filter(Boolean);
  let mainContent = text.replace(/<\|?think>[\s\S]*?<\/think>/gi, "");

  const orphanOpening = mainContent.search(/<\|?think>/i);
  let orphanThinking = "";
  if (orphanOpening >= 0) {
    orphanThinking = mainContent
      .slice(orphanOpening)
      .replace(/^<\|?think>/i, "")
      .trim();
    mainContent = mainContent.slice(0, orphanOpening);
  }

  mainContent = mainContent.replace(/<\/?\|?think>/gi, "").trim();
  const thinkingContent = [...completedThinking, orphanThinking]
    .filter(Boolean)
    .join("\n\n")
    .replace(/<\/?\|?think>/gi, "")
    .trim();

  return {
    thinkingContent: thinkingContent || null,
    mainContent,
  };
};

export const attachThinking = (translation: string, thinking: string) => {
  const main = parseTranslation(translation).mainContent || translation;
  return `<think>${thinking.trim()}</think>\n${main}`;
};

