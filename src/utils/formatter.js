const { getPreferredDisplayName } = require("./displayName");

function formatDateTime(value) {
  if (!value) {
    return "Unknown";
  }

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatDate(value) {
  if (!value) {
    return "Unknown";
  }

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
  }).format(new Date(value));
}

function shortenId(id, visibleChars = 7) {
  if (!id) {
    return "Unknown";
  }

  const value = String(id);

  if (value.length <= visibleChars) {
    return value;
  }

  return `${value.slice(0, visibleChars)}...`;
}

function truncateText(text, maxLength = 120) {
  if (!text) {
    return "";
  }

  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, maxLength).trim()}...`;
}

function escapeMarkdown(text) {
  if (!text) {
    return "";
  }

  return text.replace(/([_*[\]()`])/g, "\\$1");
}

function formatAnnouncementMessage(message) {
  return [
    "*📢 Community Announcement*",
    "",
    escapeMarkdown(message),
    "",
    "📖 “Again I say unto you, That if two of you shall agree on earth as touching anything that they shall ask, it shall be done for them.”",
    "— Matthew 18:19",
    "",
    "💙 Thank you for staying connected in prayer.",
  ].join("\n");
}

function getStatusLabel(status) {
  switch (status) {
    case "new":
      return "🟡 New";
    case "prayed":
      return "🙏 Prayed";
    case "urgent":
      return "🔴 Urgent";
    default:
      return "⚪ Unknown";
  }
}

function countRequestsByStatus(requests) {
  return requests.reduce(
    (accumulator, request) => {
      const key = ["new", "prayed", "urgent"].includes(request.status) ? request.status : "new";
      accumulator.total += 1;
      accumulator[key] += 1;
      if (request.carryOver && request.status !== "prayed") {
        accumulator.carryOver += 1;
      }
      return accumulator;
    },
    {
      total: 0,
      new: 0,
      prayed: 0,
      urgent: 0,
      carryOver: 0,
    }
  );
}

function formatPrayerRequestCard(request, index) {
  const statusLabel = getStatusLabel(request.status);
  const dateLabel = formatDateTime(request.createdAt);
  const name = escapeMarkdown(
    getPreferredDisplayName({
      fullName: request.fullName,
      username: request.username,
      telegramId: request.telegramId,
    })
  );
  const username = request.username ? `@${escapeMarkdown(request.username)}` : "N/A";
  const message = escapeMarkdown(truncateText(request.prayerRequest, 500));
  const carryOverLine = request.carryOver && request.status !== "prayed" ? "🔁 Carry Over: Yes" : null;

  return [
    `🙏 Request #${index + 1}`,
    `🆔 ID: ${shortenId(request._id)}`,
    `👤 Name: ${name}`,
    `📱 Username: ${username}`,
    `📌 Status: ${statusLabel}`,
    carryOverLine,
    `📅 Date: ${dateLabel}`,
    "",
    "📝 Request:",
    message,
  ].join("\n");
}

function formatWeeklyPrayerRequestCard(request, index) {
  const dateLabel = formatDateTime(request.createdAt);
  const name = escapeMarkdown(
    getPreferredDisplayName({
      fullName: request.fullName,
      username: request.username,
      telegramId: request.telegramId,
    })
  );
  const username = request.username ? `@${escapeMarkdown(request.username)}` : "N/A";
  const message = escapeMarkdown(truncateText(request.prayerRequest, 500));
  const urgentLine = request.status === "urgent" ? "🔴 Priority: Urgent" : null;
  const carryOverLine = request.carryOver && request.status !== "prayed" ? "🔁 Carry Over: Yes" : null;

  return [
    `🙏 Request #${index + 1}`,
    `🆔 ID: ${shortenId(request._id)}`,
    `👤 Name: ${name}`,
    `📱 Username: ${username}`,
    urgentLine,
    carryOverLine,
    `📅 Submitted: ${dateLabel}`,
    "",
    "📝 Prayer Request:",
    message,
  ].filter(Boolean).join("\n");
}

function formatWeeklyPrayerSummary(requests, weekStart, weekEnd) {
  const summary = countRequestsByStatus(requests);

  return [
    "📖 *This Week's Prayer Requests*",
    "",
    `📅 Starts: ${formatDateTime(weekStart)}`,
    `📅 Ends: ${formatDateTime(weekEnd)}`,
    "",
    "These are the requests pending for the next prayer gathering.",
    "Urgent requests are highlighted for leaders.",
    "",
    "📊 *Weekly Summary*",
    `Requests to Pray For: ${summary.total}`,
    `🟡 New This Week: ${summary.new}`,
    `🔴 Urgent This Week: ${summary.urgent}`,
    `🔁 Carry-Over: ${summary.carryOver}`,
  ].join("\n");
}

function formatSearchResults(requests) {
  const separator = "━━━━━━━━━━━━━━";
  const cards = requests.map((request, index) => formatPrayerRequestCard(request, index));

  return [
    "🔎 Search Results",
    "",
    separator,
    "",
    cards.join(`\n\n${separator}\n\n`),
    "",
    separator,
    "",
    `📊 Results Found: ${requests.length}`,
  ].join("\n");
}

function formatCarryOverRequestsReport(requests) {
  const separator = "━━━━━━━━━━━━━━";
  const cards = requests.map((request, index) => formatPrayerRequestCard(request, index));

  return [
    "🔁 *Carry-Over Requests*",
    "",
    `📊 Total Carry-Over Requests: ${requests.length}`,
    "These requests are currently flagged to skip rollover.",
    "",
    separator,
    "",
    cards.join(`\n\n${separator}\n\n`),
    "",
    separator,
  ].join("\n");
}

function formatPrayerStats(stats) {
  return [
    "📊 *Prayer Request Statistics*",
    "",
    "Overall totals up to now.",
    "",
    `📌 Total Requests: ${stats.totalRequests}`,
    `👥 Unique Users: ${stats.uniqueUsers}`,
    "",
    "📖 *Current Prayer Week*",
    `Requests Waiting for Prayer: ${stats.weekly.waitingForPrayer}`,
    `🟡 New This Week: ${stats.weekly.new}`,
    `🔴 Urgent This Week: ${stats.weekly.urgent}`,
    `🔁 Carry-Over This Week: ${stats.weekly.carryOver}`,
    "",
    "🕊️ *All-Time Status Totals*",
    `🙏 Prayed So Far: ${stats.allTime.prayed}`,
    `🔴 Urgent So Far: ${stats.allTime.urgent}`,
  ].join("\n");
}

function splitMessage(text, limit = 3500) {
  const chunks = [];
  let remaining = text;

  while (remaining.length > limit) {
    let sliceIndex = remaining.lastIndexOf("\n", limit);

    if (sliceIndex <= 0) {
      sliceIndex = limit;
    }

    chunks.push(remaining.slice(0, sliceIndex).trim());
    remaining = remaining.slice(sliceIndex).trim();
  }

  if (remaining.trim()) {
    chunks.push(remaining.trim());
  }

  return chunks;
}

module.exports = {
  countRequestsByStatus,
  escapeMarkdown,
  formatAnnouncementMessage,
  formatCarryOverRequestsReport,
  formatDate,
  formatDateTime,
  formatPrayerRequestCard,
  formatPrayerStats,
  formatSearchResults,
  formatWeeklyPrayerRequestCard,
  formatWeeklyPrayerSummary,
  getStatusLabel,
  shortenId,
  splitMessage,
  truncateText,
};
