const { isAdminUser } = require("../middlewares/auth");
const { buildMainKeyboard } = require("../utils/keyboard");

function buildWelcomeMessage(isAdmin) {
  const lines = [
    "🙏 *Welcome to FOCUS FINFINNEE prayer request bot*",
    "",
    "_\"For where two or three gather in my name, there am I with them.\"_",
    "— Matthew 18:20",
    "",
    "This bot is a place to share prayer requests, encourage one another, and stand together in faith as a fellowship.",
    "",
    "Use the buttons below or the commands listed here.",
    "",
    "✨ *User Commands*",
    "/pray — Submit a prayer request",
    "/cancel — Cancel the current prayer flow",
  ];

  if (isAdmin) {
    lines.push(
      "",
      "👥 *Leader Commands*",
      "/weeklyrequests — View this week's detailed requests",
      "/search — Search by name, username, text, or status",
      "/stats — View all-time prayer statistics",
      "/export weekly — Export current prayer-week requests (new, urgent, carry-over active)",
      "/export urgent — Export current prayer-week urgent requests only",
      "/export prayed — Export all-time prayed requests",
      "/export all — Export all-time prayer requests (all statuses)",
      "/prayed — Mark a request as prayed for and notify the user",
      "/urgent — Mark a request as urgent and notify the user",
      "/carryover <id | @username> — Preserve this week's request(s) for next week",
      "/nocarryover <id | @username> — Clear the carry-over flag for this week's request(s)",
      "/carryoverlist — Show all requests with carry-over enabled",
      "/announce — Send a community announcement",
      "/notify @username <message> — Send a private message to one user"
    );
  }

  lines.push(
    "",
    "📖 _“Do not be anxious about anything, but in every situation, by prayer and petition, with thanksgiving, present your requests to God.”_",
    "— Philippians 4:6",
    "",
    "💙 We are praying with you."
  );

  return lines.join("\n");
}

function registerStartCommand(bot) {
  bot.start(async (ctx) => {
    const isAdmin = isAdminUser(ctx.from?.id);
    const welcomeMessage = buildWelcomeMessage(isAdmin);
    await ctx.reply(welcomeMessage, {
      parse_mode: "Markdown",
      ...buildMainKeyboard(isAdmin),
    });
  });
}

module.exports = registerStartCommand;
