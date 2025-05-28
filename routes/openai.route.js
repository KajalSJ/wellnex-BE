import { Router } from "express";
import { getChatBotDetail, handleChatbotFlow } from "../domains/openai.domain.js";
import businessModel from "../models/business.model.js";
import { OpenAI } from "openai";
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const openaiRouter = Router();

// Store active chat sessions
const activeSessions = new Map();

// Start a new chat session
openaiRouter.post('/start-chat', async (req, res) => {
  try {
    const { businessId } = req.body;
    const business = await businessModel.findById({ _id: businessId });

    if (!business || !business.questions || business.questions.length === 0) {
      return res.status(200).json({
        status: true,
        message: "Thank you for your interest! Our chatbot is currently being customized to better serve you. Please check back soon or contact us directly for immediate assistance.",
        data: {
          isSetupIncomplete: true,
          contactInfo: business?.email || "support@wellnexai.com"
        }
      });
    }

    // Create a new session
    const sessionId = Date.now().toString();
    activeSessions.set(sessionId, {
      businessId,
      currentQuestionIndex: 0,
      answers: [],
      questions: business.questions,
      services: business.services
    });

    // Return first question
    res.json({
      sessionId,
      question: business.questions[0].name,
      isLastQuestion: business.questions.length === 1
    });
  } catch (err) {
    console.error("Start Chat Error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Submit answer and get next question
openaiRouter.post('/submit-answer', async (req, res) => {
  try {
    const { sessionId, answer } = req.body;
    const session = activeSessions.get(sessionId);

    if (!session) {
      return res.status(404).json({ error: "Chat session not found" });
    }

    const currentQuestion = session.questions[session.currentQuestionIndex].name;

    // Check answer relevance
    const relevancePrompt = `Given the following question and answer, determine if the answer is relevant and appropriate. 
    Question: "${currentQuestion}"
    Answer: "${answer}"
    
    Respond with a JSON object containing:
    1. "isRelevant": true/false
    2. "explanation": brief explanation of why it is/isn't relevant
    3. "suggestion": if not relevant, provide a brief suggestion for what kind of answer would be more appropriate
    4. "friendlyMessage": a friendly, apologetic message explaining that we didn't understand their answer and need more information`;

    const relevanceCheck = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [{ role: "user", content: relevancePrompt }],
      response_format: { type: "json_object" }
    });

    const relevanceResult = JSON.parse(relevanceCheck.choices[0].message.content);

    if (!relevanceResult.isRelevant) {
      return res.json({
        sessionId,
        question: currentQuestion,
        isLastQuestion: session.currentQuestionIndex === session.questions.length - 1,
        needsClarification: true,
        clarification: relevanceResult.friendlyMessage || `I apologize, but I didn't quite understand your answer. ${relevanceResult.suggestion}`,
        previousAnswer: answer
      });
    }

    // Store the answer if it's relevant
    session.answers.push({
      question: currentQuestion,
      answer: answer
    });

    // Move to next question
    session.currentQuestionIndex++;

    // If we've answered all questions, return the recommendation
    if (session.currentQuestionIndex >= session.questions.length) {
      const prompt = buildChatPrompt(session.answers, session.questions, session.services);

      const aiResponse = await openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [{ role: "user", content: prompt }],
      });

      // Clean up the session
      activeSessions.delete(sessionId);

      return res.json({
        isComplete: true,
        recommendation: aiResponse.choices[0].message.content
      });
    }

    // Return next question
    res.json({
      sessionId,
      question: session.questions[session.currentQuestionIndex].name,
      isLastQuestion: session.currentQuestionIndex === session.questions.length - 1
    });
  } catch (err) {
    console.error("Submit Answer Error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

function buildChatPrompt(answers, questions, services) {
  let prompt = `A customer completed a consultation. Here are their responses:\n\n`;

  answers.forEach((answer, i) => {
    prompt += `Q${i + 1}: ${answer.question}\nA${i + 1}: ${answer.answer}\n\n`;
  });

  prompt += `Based on the following services:\n`;
  prompt += services.map((s) => `- ${s.name}`).join("\n");
  prompt += `\n\nSuggest the most suitable option for the client in a helpful and friendly tone.`;

  return prompt;
}

openaiRouter.post('/getChatBotDetail', getChatBotDetail);
export default openaiRouter;
