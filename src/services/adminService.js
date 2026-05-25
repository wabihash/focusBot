const mongoose = require("mongoose");
const User = require("../models/User");
const {
  getPrayerRequestsForCurrentWeek,
  getPrayerRequestStats,
  markPrayerRequestAsPrayed,
  searchPrayerRequests,
  setPrayerRequestStatus,
} = require("./prayerService");
const {
  formatAnnouncementMessage,
  formatPrayerStats,
  formatPrayerRequestCard,
  formatSearchResults,
  formatWeeklyPrayerRequestCard,
  formatWeeklyPrayerSummary,
  splitMessage,
} = require("../utils/formatter");
const {
  getPrayerCompletionMessage,
  getUrgentPrayerStatusMessage,
  notifyPrayerCompletion,
} = require("./notificationService");

async function sendWeeklyPrayerRequestsReport(ctx) {
  const { weekStart, weekEnd, requests } = await getPrayerRequestsForCurrentWeek();

  if (!requests.length) {
    return ctx.reply("🙏 No prayer requests are pending for this week's prayer gathering yet.");
  }

  const text = formatWeeklyPrayerSummary(requests, weekStart, weekEnd);
  const chunks = splitMessage(text, 3500);

  for (const chunk of chunks) {
    await ctx.reply(chunk, { parse_mode: "Markdown" });
  }

  for (const [index, request] of requests.entries()) {
    await ctx.reply(formatWeeklyPrayerRequestCard(request, index), { parse_mode: "Markdown" });
  }
}

async function sendPrayerSearchResults(ctx, searchTerm) {
  const requests = await searchPrayerRequests(searchTerm);

  if (!requests.length) {
    return ctx.reply("❌ No matching prayer requests found.");
  }

  const text = formatSearchResults(requests);
  const chunks = splitMessage(text, 3500);

  for (const chunk of chunks) {
    await ctx.reply(chunk, { parse_mode: "Markdown" });
  }
}

async function sendPrayerStatsReport(ctx) {
  const stats = await getPrayerRequestStats();
  await ctx.reply(formatPrayerStats(stats), { parse_mode: "Markdown" });
}

async function setPrayerAsPrayed(requestId) {
  return markPrayerRequestAsPrayed(requestId);
}

async function setPrayerAsUrgent(requestId) {
  return setPrayerRequestStatus(requestId, "urgent");
}

function getPrayerStatusNotification(status) {
  const notifications = {
    prayed: getPrayerCompletionMessage(),
    urgent: getUrgentPrayerStatusMessage(),
  };

  return notifications[status];
}

async function updatePrayerStatusAndNotify(telegram, requestId, status) {
  const updaters = {
    prayed: markPrayerRequestAsPrayed,
    urgent: (id) => setPrayerRequestStatus(id, "urgent"),
  };

  const updater = updaters[status];
  const message = getPrayerStatusNotification(status);

  if (!updater || !message) {
    throw new Error("Unsupported prayer status.");
  }

  const updatedRequest = await updater(requestId);
  let notificationSent = false;

  // For "prayed" status, use the notification service
  if (status === "prayed") {
    const notificationResult = await notifyPrayerCompletion(telegram, updatedRequest);
    notificationSent = notificationResult.success && notificationResult.notificationSent;
  } else if (status === "urgent") {
    // For other statuses, keep the original notification logic
    const recipientId = updatedRequest.telegramId || updatedRequest.chatId;
    if (recipientId) {
      try {
        await telegram.sendMessage(recipientId, message);
        notificationSent = true;
      } catch (error) {
        console.error("[admin] user notification failed:", error.message);
      }
    }
  }

  return {
    updatedRequest,
    notificationSent,
  };
}

async function broadcastAnnouncement(telegram, message) {
  if (mongoose.connection.readyState !== 1) {
    throw new Error("Database is not connected yet, so announcements cannot be broadcast to saved users.");
  }

  const users = await User.find({}, { telegramId: 1, chatId: 1 }).lean();
  const recipientIds = [
    ...new Set(
      users
        .map((user) => user.telegramId || user.chatId)
        .filter(Boolean)
    ),
  ];

  const formattedMessage = formatAnnouncementMessage(message);
  let successCount = 0;
  let failedCount = 0;

  for (const recipientId of recipientIds) {
    try {
      await telegram.sendMessage(recipientId, formattedMessage, {
        parse_mode: "Markdown",
      });
      successCount += 1;
    } catch (error) {
      failedCount += 1;
      console.error(`[admin] announcement failed for ${recipientId}:`, error.message);
    }
  }

  return {
    total: recipientIds.length,
    successCount,
    failedCount,
  };
}

module.exports = {
  sendWeeklyPrayerRequestsReport,
  sendPrayerSearchResults,
  sendPrayerStatsReport,
  setPrayerAsPrayed,
  setPrayerAsUrgent,
  broadcastAnnouncement,
  updatePrayerStatusAndNotify,
};
