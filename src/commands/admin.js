const adminOnly = require("../middlewares/auth");
const { buildPrayerRequestsExport, EXPORT_SCOPES } = require("../services/exportService");
const { cancelPrayerFlow, enterPrayerFlow } = require("../services/prayerFlowService");
const {
  broadcastAnnouncement,
  sendPrayerSearchResults,
  sendPrayerStatsReport,
  sendWeeklyPrayerRequestsReport,
} = require("../services/adminService");
const { setPrayerRequestCarryOverForCurrentWeek, getCarryOverRequests } = require("../services/weeklyRollService");
const { enableCarryOver, disableCarryOverAndMarkPrayed } = require("../services/carryOverService");
const { findPrayerRequestByIdentifier, markAsPrayed, markAsUrgent } = require("../services/prayerStatusService");
const { findUserByUsername } = require("../services/userService");
const { formatCarryOverRequestsReport, splitMessage } = require("../utils/formatter");

function parseArgs(text = "") {
  return text.trim().split(/\s+/).slice(1);
}

async function showAdminMenu(ctx) {
  const message = [
    "🙏 Prayer Request Admin Panel",
    "",
    "Weekly request work:",
    "/weeklyrequests — View this week's detailed request list",
    "",
    "Statistics:",
    "/stats — View all-time totals up to now",
    "",
    "Other leader tools:",
    "/search <name | username | text | status>",
    "/export <weekly | all | prayed | urgent>",
    "/prayed <request_id | @username> — Marks prayed and notifies the user",
    "/urgent <request_id | @username> — Marks urgent and notifies the user",
    "/carryover <request_id | @username> — Preserve this week's request(s) for next week",
    "/nocarryover <request_id | @username> — Clear carry-over for this week's request(s)",
    "/carryoverlist — Show all requests that currently have carry-over enabled",
    "/announce <message>",
    "/notify @username <message> — Send a private message to one user",
  ].join("\n");

  await ctx.reply(message);
}

async function handleStatusUpdate(ctx, requestId, status) {
  if (!requestId) {
    const examples = {
      prayed: "/prayed 6829f2d7c4a1 or /prayed @username",
      urgent: "/urgent 6829f2d7c4a1 or /urgent @username",
    };

    const labels = {
      prayed: "🙏 Please provide the prayer request ID or @username.",
      urgent: "🔴 Please provide the prayer request ID or @username.",
    };

    await ctx.reply(
      [
        labels[status] || "🙏 Please provide a prayer request ID or @username.",
        "",
        "Examples:",
        examples[status] || "/prayed 6829f2d7c4a1",
      ].join("\n")
    );
    return;
  }

  try {
    let result;

    if (status !== "urgent" && status !== "prayed") {
      await ctx.reply("⚠️ Invalid status. Only 'prayed' and 'urgent' are supported.");
      return;
    }

    result =
      status === "urgent"
        ? await markAsUrgent(ctx.telegram, requestId)
        : await markAsPrayed(ctx.telegram, requestId);

    if (!result.success) {
      await ctx.reply(result.reason || "❌ Failed to update prayer request.");
      return;
    }

    const statusMessages = {
      prayed: "✅ Prayer request marked as prayed for.",
      urgent: "🔴 Prayer request marked as urgent.",
    };

    const lines = [
      statusMessages[status] || "✅ Prayer request updated.",
      `ID: ${result.updated._id}`,
      `Name: ${result.updated.fullName || "Unknown"}`,
      `Username: ${result.updated.username ? `@${result.updated.username}` : "N/A"}`,
      `Status: ${result.previousStatus} → ${result.newStatus}`,
    ];

    if (status === "prayed" && result.notificationSent) {
      lines.push("📩 User notified about their prayer being answered.");
    } else if (status === "prayed" && result.notificationResult?.alreadyNotified) {
      lines.push("ℹ️ User was already notified previously.");
    } else if (status === "prayed" && !result.notificationSent) {
      lines.push("⚠️ Could not notify user privately.");
    } else if (status === "urgent" && result.notificationSent) {
      lines.push("📩 User notified about the urgent update.");
    } else if (status === "urgent" && !result.notificationSent) {
      lines.push("⚠️ Could not notify user privately.");
    }

    await ctx.reply(lines.join("\n\n"));
  } catch (error) {
    console.error(`[admin] status update failed:`, error);
    await ctx.reply(`⚠️ An error occurred: ${error.message}`);
  }
}

async function handleAnnouncement(ctx, announcement) {
  if (!announcement) {
    await ctx.reply(
      [
        "📢 Please write an announcement message after the command.",
        "",
        "Example:",
        "/announce Tonight we will pray together at 8 PM.",
      ].join("\n")
    );
    return;
  }

  const summary = await broadcastAnnouncement(ctx.telegram, announcement);

  await ctx.reply(
    [
      "✅ Announcement sent successfully.",
      `📨 Delivered: ${summary.successCount}`,
      `❌ Failed: ${summary.failedCount}`,
    ].join("\n")
  );
}

function parseNotifyCommand(text = "") {
  const match = String(text).trim().match(/^\/notify(?:@\w+)?\s+(@\S+)\s+([\s\S]+)$/i);

  if (!match) {
    return null;
  }

  return {
    username: match[1].trim(),
    message: match[2].trim(),
  };
}

async function handleNotify(ctx) {
  const parsed = parseNotifyCommand(ctx.message?.text || "");

  if (!parsed) {
    await ctx.reply(
      [
        "📩 Use this format:",
        "/notify @username Your message here",
        "",
        "Example:",
        "/notify @username Your prayer team update is ready.",
      ].join("\n")
    );
    return;
  }

  const { username, message } = parsed;

  if (!username.startsWith("@")) {
    await ctx.reply("⚠️ Username must start with @.");
    return;
  }

  if (!message.trim()) {
    await ctx.reply("⚠️ Please provide a non-empty message to send.");
    return;
  }

  try {
    const user = await findUserByUsername(username);

    if (!user) {
      console.error(`[admin] notify failed: user not found for ${username}`);
      await ctx.reply(`⚠️ No user found for ${username}.`);
      return;
    }

    const privateMessage = [
      `Hello ${user.fullName || username},`,
      "",
      message,
    ].join("\n");

    await ctx.telegram.sendMessage(user.telegramId, privateMessage);

    console.log(`[admin] notify sent to ${username} (${user.telegramId})`);
    await ctx.reply(`✅ Message sent to ${username}.`);
  } catch (error) {
    console.error("[admin] notify failed:", error);
    await ctx.reply(`⚠️ Failed to send the message: ${error.message}`);
  }
}

async function handleCarryOverUpdate(ctx, requestId, carryOver) {
  if (!requestId) {
    await ctx.reply(
      [
        "🔁 Please provide the prayer request ID.",
        "",
        "Examples:",
        "/carryover 6829f2d7c4a1",
        "/carryover @username",
        "/nocarryover 6829f2d7c4a1",
        "/nocarryover @username",
      ].join("\n")
    );
    return;
  }

  let resolvedId = requestId;
  try {
    const resolved = await findPrayerRequestByIdentifier(requestId);
    if (resolved) {
      resolvedId = String(resolved._id);
    }
  } catch (err) {
    // Let downstream validation handle invalid identifiers.
  }

  if (carryOver) {
    try {
      const updated = await enableCarryOver(resolvedId);

      await ctx.reply(
        [
          "✅ Carry-over enabled.",
          `ID: ${updated._id}`,
          `Name: ${updated.fullName || "Unknown"}`,
          `Username: ${updated.username ? `@${updated.username}` : "N/A"}`,
          `Carry Over: Yes`,
        ].join("\n\n")
      );
    } catch (error) {
      throw error;
    }
    return;
  }

  try {
    const result = await disableCarryOverAndMarkPrayed(ctx.telegram, resolvedId);
    const { updated, prayedNow, notificationSent, alreadyPrayed } = result;

    const lines = [
      "✅ Carry-over disabled.",
      `ID: ${updated._id}`,
      `Name: ${updated.fullName || "Unknown"}`,
      `Username: ${updated.username ? `@${updated.username}` : "N/A"}`,
      `Carry Over: No`,
    ];

    if (prayedNow) {
      lines.push(`✅ Automatically marked as prayed.`);
      lines.push(
        notificationSent
          ? "📩 User notified about their prayer being answered."
          : "⚠️ User could not be notified about the prayer update."
      );
    } else if (alreadyPrayed) {
      lines.push("ℹ️ Request was already marked as prayed, carry-over just disabled.");
    }

    await ctx.reply(lines.join("\n\n"));
  } catch (error) {
    throw error;
  }
}

async function handleCarryOverList(ctx) {
  try {
    const requests = await getCarryOverRequests();

    if (!requests.length) {
      await ctx.reply("🙏 No carry-over requests found.");
      return;
    }

    const text = formatCarryOverRequestsReport(requests);
    for (const chunk of splitMessage(text, 3500)) {
      await ctx.reply(chunk, { parse_mode: "Markdown" });
    }
  } catch (error) {
    console.error('[admin] carryoverlist failed:', error);
    await ctx.reply(`⚠️ ${error.message}`);
  }
}

async function handleExport(ctx, scope = "weekly") {
  const normalizedScope = scope.toLowerCase();

  if (!EXPORT_SCOPES.has(normalizedScope)) {
    await ctx.reply(
      [
        "📤 Please choose a valid export type.",
        "",
        "Examples:",
        "/export weekly — current prayer-week requests (new, urgent, carry-over active)",
        "/export urgent — current prayer-week urgent requests only",
        "/export prayed — all-time prayed requests",
        "/export all — all-time prayer requests (all statuses)",
      ].join("\n")
    );
    return;
  }

  const result = await buildPrayerRequestsExport(normalizedScope);

  if (!result.requests.length) {
    await ctx.reply("🙏 No prayer requests found for this export.");
    return;
  }

  await ctx.replyWithDocument(
    {
      source: Buffer.from(result.csv, "utf8"),
      filename: result.filename,
    },
    {
      caption: [
        "✅ Export created successfully.",
        `📄 Type: ${result.label}`,
        `📊 Requests: ${result.requests.length}`,
      ].join("\n"),
    }
  );
}

function registerAdminCommands(bot) {
  bot.command("admin", adminOnly(), async (ctx) => {
    await showAdminMenu(ctx);
  });

  bot.command("weeklyrequests", adminOnly(), async (ctx) => {
    try {
      await sendWeeklyPrayerRequestsReport(ctx);
    } catch (error) {
      console.error("[admin] weeklyrequests failed:", error);
      await ctx.reply(`⚠️ ${error.message}`);
    }
  });

  bot.command("search", adminOnly(), async (ctx) => {
    const searchTerm = parseArgs(ctx.message.text).join(" ").trim();

    if (!searchTerm) {
      await ctx.reply(
        [
          "🔎 Please provide something to search for.",
          "",
          "Examples:",
          "/search Wabi",
          "/search education",
          "/search @Focusrehobot",
          "/search prayed",
        ].join("\n")
      );
      return;
    }

    try {
      await sendPrayerSearchResults(ctx, searchTerm);
    } catch (error) {
      console.error("[admin] search failed:", error);
      await ctx.reply(`⚠️ ${error.message}`);
    }
  });

  bot.command("stats", adminOnly(), async (ctx) => {
    try {
      await sendPrayerStatsReport(ctx);
    } catch (error) {
      console.error("[admin] stats failed:", error);
      await ctx.reply(`⚠️ ${error.message}`);
    }
  });

  bot.command("export", adminOnly(), async (ctx) => {
    const [scope = "weekly"] = parseArgs(ctx.message.text);

    try {
      await handleExport(ctx, scope);
    } catch (error) {
      console.error("[admin] export failed:", error);
      await ctx.reply(`⚠️ ${error.message}`);
    }
  });

  bot.command("prayed", adminOnly(), async (ctx) => {
    const [requestId] = parseArgs(ctx.message.text);

    try {
      await handleStatusUpdate(ctx, requestId, "prayed");
    } catch (error) {
      console.error("[admin] prayed failed:", error);
      await ctx.reply(`⚠️ ${error.message}`);
    }
  });

  bot.command("urgent", adminOnly(), async (ctx) => {
    const [requestId] = parseArgs(ctx.message.text);

    try {
      await handleStatusUpdate(ctx, requestId, "urgent");
    } catch (error) {
      console.error("[admin] urgent failed:", error);
      await ctx.reply(`⚠️ ${error.message}`);
    }
  });

  bot.command("carryover", adminOnly(), async (ctx) => {
    const [requestId] = parseArgs(ctx.message.text);

    try {
      await handleCarryOverUpdate(ctx, requestId, true);
    } catch (error) {
      console.error("[admin] carryover failed:", error);
      await ctx.reply(`⚠️ ${error.message}`);
    }
  });

  bot.command("nocarryover", adminOnly(), async (ctx) => {
    const [requestId] = parseArgs(ctx.message.text);

    try {
      await handleCarryOverUpdate(ctx, requestId, false);
    } catch (error) {
      console.error("[admin] nocarryover failed:", error);
      await ctx.reply(`⚠️ ${error.message}`);
    }
  });

  bot.command("carryoverlist", adminOnly(), async (ctx) => {
    try {
      await handleCarryOverList(ctx);
    } catch (error) {
      console.error("[admin] carryoverlist failed:", error);
      await ctx.reply(`⚠️ ${error.message}`);
    }
  });

  bot.command("announce", adminOnly(), async (ctx) => {
    const announcement = ctx.message.text.replace(/^\/announce(@\w+)?\s*/i, "").trim();

    try {
      await handleAnnouncement(ctx, announcement);
    } catch (error) {
      console.error("[admin] announce failed:", error);
      await ctx.reply(`⚠️ ${error.message}`);
    }
  });

  bot.command("notify", adminOnly(), async (ctx) => {
    try {
      await handleNotify(ctx);
    } catch (error) {
      console.error("[admin] notify failed:", error);
      await ctx.reply(`⚠️ ${error.message}`);
    }
  });

  bot.action(/^admin:menu$/, adminOnly(), async (ctx) => {
    await ctx.answerCbQuery();
    await showAdminMenu(ctx);
  });

  bot.action(/^admin:pray$/, adminOnly(), async (ctx) => {
    try {
      await ctx.answerCbQuery("Opening prayer flow...");
      await enterPrayerFlow(ctx);
    } catch (error) {
      console.error("[admin] pray action failed:", error);
      await ctx.reply(`⚠️ ${error.message}`);
    }
  });

  bot.action(/^admin:cancel$/, adminOnly(), async (ctx) => {
    try {
      await ctx.answerCbQuery("Canceling prayer flow...");
      await cancelPrayerFlow(ctx);
    } catch (error) {
      console.error("[admin] cancel action failed:", error);
      await ctx.reply(`⚠️ ${error.message}`);
    }
  });

  bot.action(/^admin:weeklyrequests$/, adminOnly(), async (ctx) => {
    try {
      await ctx.answerCbQuery("Loading this week's requests...");
      await sendWeeklyPrayerRequestsReport(ctx);
    } catch (error) {
      console.error("[admin] weeklyrequests action failed:", error);
      await ctx.reply(`⚠️ ${error.message}`);
    }
  });

  bot.action(/^admin:stats$/, adminOnly(), async (ctx) => {
    try {
      await ctx.answerCbQuery("Loading statistics...");
      await sendPrayerStatsReport(ctx);
    } catch (error) {
      console.error("[admin] stats action failed:", error);
      await ctx.reply(`⚠️ ${error.message}`);
    }
  });

  bot.action(/^admin:prayed:(.+)$/, adminOnly(), async (ctx) => {
    const requestId = ctx.match[1];

    try {
      await ctx.answerCbQuery("Updating request...");
      await handleStatusUpdate(ctx, requestId, "prayed");
    } catch (error) {
      console.error("[admin] prayed action failed:", error);
      await ctx.reply(`⚠️ ${error.message}`);
    }
  });

  bot.action(/^admin:urgent:(.+)$/, adminOnly(), async (ctx) => {
    const requestId = ctx.match[1];

    try {
      await ctx.answerCbQuery("Updating request...");
      await handleStatusUpdate(ctx, requestId, "urgent");
    } catch (error) {
      console.error("[admin] urgent action failed:", error);
      await ctx.reply(`⚠️ ${error.message}`);
    }
  });
}

module.exports = registerAdminCommands;
module.exports.showAdminMenu = showAdminMenu;
