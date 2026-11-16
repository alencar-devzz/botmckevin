const mongoose = require("mongoose");
const Sorteio = require("../../database/models/Sorteio");
const { dropSources } = require("../msgBuilder/store");
const D = require("./defaults");

const validId = (id) => mongoose.isValidObjectId(id);

async function createDraft({ guildId, hostId, name, prize }) {
  const doc = await Sorteio.create({
    guildId,
    hostId,
    name: String(name).slice(0, D.LIMITS.name),
    prize: String(prize ?? "").slice(0, D.LIMITS.prize),
    blocks: [{ text: D.DEFAULT_TEXT }],
  });
  return doc.toObject();
}

async function getSorteio(id) {
  if (!validId(id)) return null;
  return Sorteio.findById(id).lean();
}

const listSorteios = (guildId) => Sorteio.find({ guildId }).sort({ createdAt: -1 }).lean();

// patch aceita chaves com ponto (ex.: "req.messages", "blocks.0.text")
async function updateSorteio(id, patch) {
  if (!validId(id)) return null;
  return Sorteio.findByIdAndUpdate(id, { $set: patch }, { new: true }).lean();
}

const blockSources = (b) => [b?.image, b?.thumb].filter(Boolean);
const docSources = (doc) => (doc?.blocks ?? []).flatMap(blockSources);

async function removeSorteio(id) {
  const doc = await getSorteio(id);
  if (!doc) return null;
  await Sorteio.deleteOne({ _id: id });
  await dropSources(docSources(doc)).catch(() => {});
  return doc;
}

module.exports = { createDraft, getSorteio, listSorteios, updateSorteio, removeSorteio, blockSources, docSources };
