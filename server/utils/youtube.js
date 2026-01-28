const YT_PATTERNS = [
  /(?:https?:\/\/)?(?:www\.)?youtu\.be\/([a-zA-Z0-9_-]{6,})/, // youtu.be/ID
  /(?:https?:\/\/)?(?:www\.)?youtube\.com\/watch\?v=([a-zA-Z0-9_-]{6,})/, // watch?v=ID
  /(?:https?:\/\/)?(?:www\.)?youtube\.com\/shorts\/([a-zA-Z0-9_-]{6,})/, // shorts/ID
  /(?:https?:\/\/)?(?:www\.)?youtube\.com\/embed\/([a-zA-Z0-9_-]{6,})/ // embed/ID
];

const extractVideoId = (input = "") => {
  const trimmed = input.trim();
  if (!trimmed) return null;
  if (/^[a-zA-Z0-9_-]{6,}$/.test(trimmed)) return trimmed;

  for (const pattern of YT_PATTERNS) {
    const match = trimmed.match(pattern);
    if (match && match[1]) return match[1];
  }

  try {
    const parsed = new URL(trimmed);
    if (parsed.searchParams.has("v")) {
      return parsed.searchParams.get("v");
    }
  } catch {
    return null;
  }

  return null;
};

export { extractVideoId };
