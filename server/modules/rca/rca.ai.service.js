const { buildRcaPrompt } = require("./rca.prompt");
const { getClient, getModel } = require("./ai/provider");

const safeJsonParse = (text) => {
  try {
    return JSON.parse(text);
  } catch {
    return {
      incident_summary: "AI returned invalid JSON",
      likely_root_cause: "Could not determine",
      confidence: 40,
      severity: "medium",
      evidence: [text],
      blast_radius: "Unknown",
      recommended_fixes: ["Check logs manually"],
      preventive_actions: ["Improve prompt or parsing"],
    };
  }
};

const generateRCA = async (context) => {
  const genAI = getClient();
  const modelName = getModel();
  const prompt = buildRcaPrompt(context);

  const model = genAI.getGenerativeModel({
    model: modelName,
  });

  const result = await model.generateContent(prompt);
  const response = await result.response;
  const text = response.text();

  return safeJsonParse(text);
};

module.exports = { generateRCA };