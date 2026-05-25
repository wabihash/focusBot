function isTextCommand(text) {
  return typeof text === "string" && text.trim().startsWith("/");
}

function registerFallbackHandlers(bot) {
  bot.on("text", async (ctx) => {
    const text = ctx.message.text.trim();

    if (isTextCommand(text)) {
      await ctx.reply(
        [
          "*❓ Unknown command.*",
          "",
          "Use /start to see available commands.",
        ].join("\n"),
        { parse_mode: "Markdown" }
      );
      return;
    }

    await ctx.reply(
      [
        "🙏 Please use /pray to submit a prayer request.",
        "",
        "Use /start to see available commands.",
      ].join("\n"),
      { parse_mode: "Markdown" }
    );
  });

  bot.on("message", async (ctx) => {
    await ctx.reply("🙏 Please use /start to see available commands.");
  });
}

module.exports = registerFallbackHandlers;
