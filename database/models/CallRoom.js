const { Schema, model } = require("mongoose");

// Calls temporárias criadas pelo sistema "Calls temporárias" (sobrevivem a reinício do bot)
const callRoomSchema = new Schema({
  guildId: { type: String, required: true },
  channelId: { type: String, required: true, unique: true },
  ownerId: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
});

module.exports = model("CallRoom", callRoomSchema);
