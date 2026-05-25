function normalizeDisplayName(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

function looksLikeCleanDisplayName(value) {
  return /^[\p{L}][\p{L}\s.'-]*[\p{L}]$/u.test(value) || /^[\p{L}]$/u.test(value);
}

function isGenericDisplayName(value) {
  const normalized = String(value || "").trim().toLowerCase();

  return normalized === "admin" || normalized === "user" || normalized === "unknown";
}

function getPreferredDisplayName({ fullName, username, telegramId }) {
  const normalizedFullName = normalizeDisplayName(fullName);
  const normalizedUsername = normalizeDisplayName(username);

  if (normalizedFullName && looksLikeCleanDisplayName(normalizedFullName) && !isGenericDisplayName(normalizedFullName)) {
    return normalizedFullName;
  }

  if (normalizedUsername) {
    return `@${normalizedUsername.replace(/^@/, "")}`;
  }

  return telegramId ? `User ${telegramId}` : "Unknown";
}

module.exports = {
  getPreferredDisplayName,
  isGenericDisplayName,
  normalizeDisplayName,
};