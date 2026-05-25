const { enterPrayerFlow } = require("../services/prayerFlowService");

function registerPrayCommand(bot) {
  bot.command("pray", async (ctx) => {
    await enterPrayerFlow(ctx);
  });
}

module.exports = registerPrayCommand;
