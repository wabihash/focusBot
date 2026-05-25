const User = require("../models/User");
const { getPreferredDisplayName } = require("../utils/displayName");

function escapeRegex(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function findUserByUsername(username) {
  const normalized = String(username || "").trim().replace(/^@/, "");

  if (!normalized) {
    return null;
  }

  return User.findOne({
    username: new RegExp(`^${escapeRegex(normalized)}$`, "i"),
  }).lean();
}

async function upsertUserFromContext(ctx) {
  if (!ctx.from || !ctx.chat) {
    return null;
  }

  const fullName = getPreferredDisplayName({
    fullName: [ctx.from.first_name, ctx.from.last_name].filter(Boolean).join(" ").trim(),
    username: ctx.from.username || "",
    telegramId: ctx.from.id,
  });

  return User.findOneAndUpdate(
    { telegramId: ctx.from.id },
    {
      telegramId: ctx.from.id,
      chatId: ctx.chat.id,
      username: ctx.from.username || "",
      fullName,
      lastSeenAt: new Date(),
    },
    {
      upsert: true,
      returnDocument: "after",
      setDefaultsOnInsert: true,
    }
  );
}

module.exports = {
  findUserByUsername,
  upsertUserFromContext,
};
