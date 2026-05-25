const PrayerRequest = require("../models/PrayerRequest");
const { getPrayerRequests, getCurrentPrayerWeekWindow } = require("./prayerService");

const EXPORT_SCOPES = new Set(["weekly", "all", "prayed", "urgent"]);

function formatDateForFilename(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function formatDateForCsv(value) {
  if (!value) {
    return "";
  }

  return new Date(value).toISOString();
}

function escapeCsv(value) {
  const text = String(value ?? "");
  return `"${text.replace(/"/g, '""')}"`;
}

function getPriorityLabel(status) {
  return status === "urgent" ? "Urgent" : "";
}

function buildCsv(headers, rows) {
  return [headers, ...rows]
    .map((row) => row.map(escapeCsv).join(","))
    .join("\n");
}

function buildWeeklyPrayerCsv(requests) {
  const headers = [
    "Request ID",
    "Name",
    "Username",
    "Status",
    "Priority",
    "Carry Over",
    "Submitted At",
    "Prayer Request",
  ];

  const rows = requests.map((request) => [
    request._id,
    request.fullName,
    request.username ? `@${request.username}` : "",
    request.status,
    getPriorityLabel(request.status),
    request.carryOver ? "Yes" : "",
    formatDateForCsv(request.createdAt),
    request.prayerRequest,
  ]);

  return buildCsv(headers, rows);
}

function buildAllTimePrayerCsv(requests) {
  const headers = [
    "Request ID",
    "Name",
    "Username",
    "Status",
    "Carry Over",
    "Submitted At",
    "Prayed At",
    "Prayer Request",
  ];

  const rows = requests.map((request) => [
    request._id,
    request.fullName,
    request.username ? `@${request.username}` : "",
    request.status,
    request.carryOver ? "Yes" : "",
    formatDateForCsv(request.createdAt),
    formatDateForCsv(request.prayedAt),
    request.prayerRequest,
  ]);

  return buildCsv(headers, rows);
}

async function getRequestsForExport(scope = "weekly") {
  const normalizedScope = EXPORT_SCOPES.has(scope) ? scope : "weekly";

  const { weekStart, weekEnd } = getCurrentPrayerWeekWindow(new Date());

  if (normalizedScope === "weekly") {
    const requests = await PrayerRequest.find({
      createdAt: {
        $gte: weekStart,
        $lt: weekEnd,
      },
      $or: [{ status: { $in: ["new", "urgent"] } }, { carryOver: true }],
    })
      .sort({ createdAt: 1 })
      .lean();

    return {
      scope: normalizedScope,
      label: "Current prayer-week requests (new, urgent, and carry-over active)",
      requests,
      csvType: "weekly",
      meta: { weekStart, weekEnd },
    };
  }

  if (normalizedScope === "urgent") {
    const requests = await PrayerRequest.find({
      createdAt: {
        $gte: weekStart,
        $lt: weekEnd,
      },
      status: "urgent",
    })
      .sort({ createdAt: 1 })
      .lean();

    return {
      scope: normalizedScope,
      label: "Current prayer-week urgent requests",
      requests,
      csvType: "weekly",
      meta: { weekStart, weekEnd },
    };
  }

  if (normalizedScope === "prayed") {
    return {
      scope: normalizedScope,
      label: "All-time prayed requests",
      requests: await getPrayerRequests({ status: "prayed" }),
      csvType: "all-time",
      meta: {},
    };
  }

  // all: all-time requests across every status
  return {
    scope: normalizedScope,
    label: "All-time prayer requests (all statuses)",
    requests: await getPrayerRequests({ status: "all" }),
    csvType: "all-time",
    meta: {},
  };
}

async function buildPrayerRequestsExport(scope = "weekly") {
  const exportData = await getRequestsForExport(scope);
  const csv =
    exportData.csvType === "weekly"
      ? buildWeeklyPrayerCsv(exportData.requests)
      : buildAllTimePrayerCsv(exportData.requests);
  const filename = `prayer-requests-${exportData.scope}-${formatDateForFilename()}.csv`;

  return {
    ...exportData,
    csv,
    filename,
  };
}

module.exports = {
  buildPrayerRequestsExport,
  EXPORT_SCOPES,
};
