const { cancelPrayerFlow, enterPrayerFlow } = require("../services/prayerFlowService");
const { isAdminUser } = require("../middlewares/auth");
const adminModule = require("./admin");

function registerUiCommands(bot) {
	bot.hears("🙏 Pray", async (ctx) => {
		await enterPrayerFlow(ctx);
	});

	bot.hears("❌ Cancel", async (ctx) => {
		await cancelPrayerFlow(ctx);
	});

	bot.hears("👥 Admin", async (ctx) => {
		if (!isAdminUser(ctx.from?.id)) {
			await ctx.reply("⚠️ You are not authorized to use admin commands.");
			return;
		}

		if (typeof adminModule.showAdminMenu === "function") {
			await adminModule.showAdminMenu(ctx);
		} else {
			await ctx.reply("Admin menu is unavailable.");
		}
	});
}

module.exports = registerUiCommands;
