require("dotenv").config();

if (!globalThis.crypto) {
  globalThis.crypto = require("node:crypto").webcrypto;
}

const express = require("express");
const { Telegraf, Scenes, session } = require("telegraf");
const connectDB = require("./config/db");
const escapePrayerCommands = require("./middlewares/escapePrayerCommands");
const registerStartCommand = require("./commands/start");
const registerPrayCommand = require("./commands/pray");
const registerCancelCommand = require("./commands/cancel");
const registerUiCommands = require("./commands/ui");
const registerAdminCommands = require("./commands/admin");
const registerFallbackHandlers = require("./middlewares/fallbackHandlers");
const prayerScene = require("./scenes/prayerScene");
const {
  initializeWeeklyRolloverOnStartup,
  startWeeklyRolloverScheduler,
  setBotInstance,
} = require("./services/weeklyRollService");

const botToken = process.env.BOT_TOKEN;
const app = express();
const port = process.env.PORT || 3000;

app.get("/", (req, res) => {
  res.send("Prayer Bot is running smoothly!");
});

if (!botToken) {
  console.error("BOT_TOKEN is missing. Add it to your .env file before starting the bot.");
  process.exit(1);
}

const bot = new Telegraf(botToken);
const stage = new Scenes.Stage([prayerScene]);

module.exports = bot;

bot.use(session());
bot.use(escapePrayerCommands());
bot.use(stage.middleware());

bot.use(async (ctx, next) => {
  if (ctx.from && process.env.MONGO_URI) {
    try {
      const { upsertUserFromContext } = require("./services/userService");
      await upsertUserFromContext(ctx);
    } catch (error) {
      console.error("[bot] user sync failed:", error.message);
    }
  }

  return next();
});

registerStartCommand(bot);
registerPrayCommand(bot);
registerCancelCommand(bot);
registerUiCommands(bot);
registerAdminCommands(bot);
registerFallbackHandlers(bot);

bot.catch((error, ctx) => {
  console.error("[bot] unexpected error:", error);
  console.error("[bot] update:", ctx.update);
});

async function startBot() {
  const dbConnected = await connectDB();

  setBotInstance(bot);

  if (dbConnected) {
    await initializeWeeklyRolloverOnStartup().catch((error) => {
      console.error("[weekly-roll] Startup initialization failed:", error);
    });
    startWeeklyRolloverScheduler();
  } else {
    console.warn("[weekly-roll] Scheduler is disabled because the database is not connected.");
  }

  await bot.launch();

  console.log("Prayer bot is running.");
}

app.listen(port, () => {
  console.log(`Server is listening on port ${port}`);
});

startBot().catch((error) => {
  console.error("Failed to start bot:", error);
  process.exit(1);
});

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
