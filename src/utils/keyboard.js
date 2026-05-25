const { Markup } = require("telegraf");

function buildMainKeyboard(isAdmin = false) {
  const rows = [["🙏 Pray", "❌ Cancel"]];

  if (isAdmin) {
    rows.push(["👥 Admin"]);
  }

  return Markup.keyboard(rows).resize().persistent();
}

module.exports = {
  buildMainKeyboard,
};