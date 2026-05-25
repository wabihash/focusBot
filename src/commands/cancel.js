const { cancelPrayerFlow } = require("../services/prayerFlowService");

function registerCancelCommand(bot) {
  bot.command("cancel", async (ctx) => {
    await cancelPrayerFlow(ctx);
  });
}

module.exports = registerCancelCommand;
