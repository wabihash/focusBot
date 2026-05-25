function getAdminIds() {
  const rawIds = process.env.ADMIN_IDS || process.env.ADMIN_ID || "";

  return new Set(
    rawIds
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean)
  );
}

function isAdminUser(userId) {
  if (!userId) {
    return false;
  }

  return getAdminIds().has(String(userId));
}

function adminOnly() {
  return async (ctx, next) => {
    const adminIds = getAdminIds();

    if (!adminIds.size) {
      await ctx.reply("Admin access is not configured yet. Add ADMIN_IDS to your .env file.");
      return;
    }

    const userId = String(ctx.from?.id || "");

    if (!adminIds.has(userId)) {
      await ctx.reply("❌ You are not authorized to use this command.");
      return;
    }

    return next();
  };
}

module.exports = adminOnly;
module.exports.getAdminIds = getAdminIds;
module.exports.isAdminUser = isAdminUser;
