const { Scenes } = require("telegraf");
const { createPrayerRequest } = require("../services/prayerService");
const { cancelPrayerFlow, enterPrayerFlow } = require("../services/prayerFlowService");
const { isAdminUser } = require("../middlewares/auth");
const { buildMainKeyboard } = require("../utils/keyboard");
const { getPreferredDisplayName } = require("../utils/displayName");
const adminCommands = require("../commands/admin");

const prayerScene = new Scenes.BaseScene("prayer-request");

prayerScene.enter(async (ctx) => {
  await ctx.reply(
    [
      "Please send your prayer request in one message.",
      "",
      "You can also use the buttons below if you changed your mind.",
    ].join("\n"),
    buildMainKeyboard(isAdminUser(ctx.from?.id))
  );
});

prayerScene.hears("🙏 Pray", async (ctx) => {
  await enterPrayerFlow(ctx);
});

prayerScene.hears("❌ Cancel", async (ctx) => {
  await cancelPrayerFlow(ctx);
});

prayerScene.command("cancel", async (ctx) => {
  await cancelPrayerFlow(ctx);
});

prayerScene.on("text", async (ctx) => {
  const prayerText = ctx.message.text.trim();

  // Ignore reply-keyboard labels that should not be saved as prayer requests.
  const ignoredLabels = [
    "👥 Admin",
    "This Week's Requests",
    "Stats",
    "Refresh menu",
  ];

  if (ignoredLabels.includes(prayerText)) {
    if (prayerText === "👥 Admin") {
      if (isAdminUser(ctx.from?.id) && typeof adminCommands.showAdminMenu === "function") {
        await adminCommands.showAdminMenu(ctx);
        return;
      }

      await ctx.reply("⚠️ You are not authorized to use admin commands.");
      return;
    }

    // Other keyboard labels should be ignored while collecting the prayer text.
    return;
  }

  if (!prayerText) {
    await ctx.reply("Please send a non-empty prayer request, or /cancel.");
    return;
  }

  if (prayerText.startsWith("/")) {
    await ctx.reply("Please send the prayer request text, or use /cancel to exit.");
    return;
  }

  try {
    const displayName = getPreferredDisplayName({
      fullName: [ctx.from.first_name, ctx.from.last_name].filter(Boolean).join(" ").trim(),
      username: ctx.from.username || "",
      telegramId: ctx.from.id,
    });
    const savedPrayer = await createPrayerRequest({
      telegramId: ctx.from.id,
      chatId: ctx.chat.id,
      username: ctx.from.username || "",
      fullName: displayName,
      prayerRequest: prayerText,
    });

    await ctx.reply(
      [
        "Your prayer request has been saved successfully.",
        `Request ID: ${savedPrayer._id}`,
        "Thank you for sharing. We will keep praying with you.",
      ].join("\n")
    );

    await ctx.scene.leave();
  } catch (error) {
    console.error("[prayerScene] save failed:", error);
    await ctx.reply("Sorry, I could not save your prayer request right now. Please try again.");
  }
});

module.exports = prayerScene;
