const { Schema, model } = require("mongoose");

const commentSchema = new Schema(
  {
    userId: { type: String, required: true },
    text: { type: String, required: true },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

// Um registro por post publicado pelo bot (messageId = mensagem enviada pelo webhook)
const postSchema = new Schema({
  guildId: { type: String, required: true },
  channelId: { type: String, required: true },
  messageId: { type: String, required: true, unique: true },
  authorId: { type: String, required: true },
  content: { type: String, default: "" },
  mediaFiles: { type: [String], default: [] },
  likes: { type: [String], default: [] },
  comments: { type: [commentSchema], default: [] },
  createdAt: { type: Date, default: Date.now },
});

module.exports = model("Post", postSchema);
