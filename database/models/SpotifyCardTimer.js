const { Schema, model } = require("mongoose");

// Cards do n!spotify que ainda vão ser apagados sozinhos (sobrevive a reinício do bot).
const spotifyCardTimerSchema = new Schema({
  guildId: { type: String, required: true },
  channelId: { type: String, required: true },
  messageId: { type: String, required: true, unique: true },
  deleteAt: { type: Date, required: true, index: true },
});

module.exports = model("SpotifyCardTimer", spotifyCardTimerSchema);
