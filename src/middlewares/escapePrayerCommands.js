function getTelegramCommandName(text) {
  if (!text || !text.startsWith("/")) {
    return null;
  }

  return text
    .slice(1)
    .split(/\s+/)[0]
    .split("@")[0]
    .toLowerCase();
}

function escapePrayerCommands() {
  return async (ctx, next) => {
    const activeScene = ctx.session?.__scenes?.current;
    const commandName = getTelegramCommandName(ctx.message?.text?.trim());

    if (activeScene !== "prayer-request" || !commandName) {
      return next();
    }

    if (commandName === "cancel") {
      return next();
    }

    // Reset the scene session before command handlers run.
    ctx.session ??= {};
    ctx.session.__scenes = {};

    return next();
  };
}

module.exports = escapePrayerCommands;
