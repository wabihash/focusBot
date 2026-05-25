const { buildMainKeyboard } = require("../utils/keyboard");
const { isAdminUser } = require("../middlewares/auth");

async function enterPrayerFlow(ctx) {
  if (!ctx.scene) {
    await ctx.reply("Prayer scenes are not available yet. Make sure the bot has scene middleware enabled.");
    return;
  }

  if (ctx.scene.current?.id === "prayer-request") {
    await ctx.scene.leave();
  }

  await ctx.scene.enter("prayer-request");
}

async function cancelPrayerFlow(ctx) {
  const activeSceneId = ctx.scene?.current?.id;
  const keyboard = buildMainKeyboard(isAdminUser(ctx.from?.id));

  if (activeSceneId === "prayer-request") {
    await ctx.scene.leave();
    await ctx.reply(
      [
        "*❌ Prayer request cancelled.*",
        "",
        "*📖 “The Lord is near to all who call on Him.”*",
        "— Psalm 145:18",
        "",
        "You can start again anytime using:",
        "/pray",
      ].join("\n"),
      {
        parse_mode: "Markdown",
      }
    );
    await ctx.reply("Use the buttons below to continue.", keyboard);
    return true;
  }

  await ctx.reply("ℹ️ There is no active prayer request to cancel.", keyboard);
  return false;
}

module.exports = {
  cancelPrayerFlow,
  enterPrayerFlow,
};