import { Router } from "express";
import { getChatBotDetail, handleChatbotFlow } from "../domains/openai.domain.js";
import businessModel from "../models/business.model.js";
import { OpenAI } from "openai";
import Subscription from "../models/subscription.model.js";
import Lead from '../models/lead.model.js';
import awsEmailExternal from "../externals/send.email.external.js";
const { sendingMail } = awsEmailExternal;
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

    // Check subscription status
    const subscription = await Subscription.findOne({
      userId: businessId,
      status: { $in: ['active', 'trialing'] },
      currentPeriodEnd: { $gt: new Date() }
    });

    const cancelledSubscription = await Subscription.findOne({
      userId: businessId,
      status: 'canceled',
      cancelAtPeriodEnd: true,
      currentPeriodEnd: { $gt: new Date() }
    });

    if (!subscription && !cancelledSubscription) {
      return res.status(200).json({
        status: false,
        message: "Your subscription has expired. Please renew your subscription to continue using the chatbot.",
        data: {
          subscriptionExpired: true,
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
      services: business.services,
      needsForm: false,
      serviceCategory: null,
      preferredTime: null
    });

    // Generate personalized greeting based on business hours
    const currentHour = new Date().getHours();
    let timeGreeting = "Hello";
    if (currentHour < 12) timeGreeting = "Good morning";
    else if (currentHour < 17) timeGreeting = "Good afternoon";
    else timeGreeting = "Good evening";

    // Return greeting and first question
    res.json({
      sessionId,
      greeting: `${timeGreeting}! Welcome to ${business.name}. 👋 I'm your virtual beauty consultant, here to help you discover the perfect services for your needs. Let's start with a few questions to create your personalized beauty journey.`,
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

    // Check answer relevance with improved understanding
    const relevancePrompt = `Given the following question and answer, determine if the answer is relevant and appropriate. 
    Consider that answers can be simple, direct, or even contain negative statements.
    For example:
    - If question is about hair length, answers like "long", "short", "medium", "very long", "not long", "hairs are wrong" are all valid
    - If question is about skin type, answers like "dry", "oily", "normal", "sensitive", "not sure" are all valid
    - If question is about previous treatments, answers like "yes", "no", "never", "sometimes" are all valid
    
    Question: "${currentQuestion}"
    Answer: "${answer}"
    
    Respond with a JSON object containing:
    1. "isRelevant": true/false (be lenient in determining relevance)
    2. "explanation": brief explanation of why it is/isn't relevant
    3. "suggestion": if not relevant, provide a brief suggestion for what kind of answer would be more appropriate
    4. "friendlyMessage": a friendly, apologetic message explaining that we didn't understand their answer and need more information
    5. "interpretedAnswer": what you think the user meant (if answer is relevant)`;

    const relevanceCheck = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [{ role: "user", content: relevancePrompt }],
      response_format: { type: "json_object" }
    });

    const relevanceResult = JSON.parse(relevanceCheck.choices[0].message.content);

    if (!relevanceResult.isRelevant) {
      // First, try to understand and respond to the user's query
      const clarificationPrompt = `Given the following question and answer, provide a helpful response that:
      1. Acknowledges the user's query
      2. Explains what we can help with
      3. Asks if they'd like to speak with a specialist
      
      Question: "${currentQuestion}"
      Answer: "${answer}"
      
      Respond with a JSON object containing:
      1. "response": A friendly, helpful response
      2. "needsSpecialist": true/false
      3. "suggestedServices": Array of relevant services we offer`;

      const clarificationCheck = await openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [{ role: "user", content: clarificationPrompt }],
        response_format: { type: "json_object" }
      });

      const clarificationResult = JSON.parse(clarificationCheck.choices[0].message.content);

      // If the user hasn't been asked about specialist consultation yet
      if (!session.askedAboutSpecialist) {
        session.askedAboutSpecialist = true;
        return res.json({
          sessionId,
          needsClarification: true,
          message: clarificationResult.response,
          suggestedServices: clarificationResult.suggestedServices,
          askForSpecialist: true,
          currentQuestion: currentQuestion,
          question: currentQuestion
        });
      }

      // If user has already been asked about specialist and answered yes
      if (answer.toLowerCase().includes('yes') || answer.toLowerCase().includes('sure') || answer.toLowerCase().includes('okay')) {
        session.needsForm = true;
        return res.json({
          sessionId,
          needsForm: true,
          message: "Based on the information you provided, we believe our specialized treatments might be a great option for you. However, to ensure you receive the most personalized and expert advice, we will forward your details to one of our specialists who will contact you to consult further and help book your appointment.",
          formFields: [
            {
              name: "name",
              label: "Full Name",
              type: "text",
              required: true,
              placeholder: "Enter your full name"
            },
            {
              name: "email",
              label: "Email Address",
              type: "email",
              required: true,
              placeholder: "Enter your email address"
            },
            {
              name: "phone",
              label: "Phone Number",
              type: "tel",
              required: true,
              placeholder: "Enter your phone number"
            },
            {
              name: "postalCode",
              label: "Postal Code",
              type: "text",
              required: true,
              placeholder: "Enter your postal code"
            },
            {
              name: "consent",
              label: "I consent to being contacted by a specialist",
              type: "checkbox",
              required: true,
              value: false
            }
          ]
        });
      }

      // If user hasn't agreed to specialist consultation yet
      return res.json({
        sessionId,
        needsClarification: true,
        message: "I understand you might have more specific questions. Would you like me to connect you with one of our specialists who can provide more detailed information and help you book an appointment?",
        askForSpecialist: true,
        currentQuestion: currentQuestion,
        question: currentQuestion
      });
    }

    // Store the answer if it's relevant, including the interpreted answer
    session.answers.push({
      question: currentQuestion,
      answer: answer,
      interpretedAnswer: relevanceResult.interpretedAnswer || answer
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
        recommendation: aiResponse.choices[0].message.content,
        conclusion: "Thank you for completing our consultation! 🎉 To ensure you receive the most personalized and expert advice, we would like to connect you with one of our specialists. Would you like to share your contact details so our specialist can get in touch with you?",
        nextSteps: [
          "Share contact details with specialist",
          "Learn more about our services"
        ]
      });
    }

    // Return next question
    const nextQuestion = session.questions[session.currentQuestionIndex].name;
    res.json({
      sessionId,
      question: nextQuestion,
      isLastQuestion: session.currentQuestionIndex === session.questions.length - 1,
      progress: {
        current: session.currentQuestionIndex + 1,
        total: session.questions.length
      }
    });
  } catch (err) {
    console.error("Submit Answer Error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Store lead information
openaiRouter.post('/store-lead', async (req, res) => {
  try {
    const { sessionId, formData } = req.body;
    const session = activeSessions.get(sessionId);

    if (!session) {
      return res.status(404).json({ error: "Chat session not found" });
    }

    // Create new lead
    const lead = new Lead({
      businessId: session.businessId,
      name: formData.name,
      email: formData.email,
      phone: formData.phone,
      postalCode: formData.postalCode,
      consent: formData.consent,
      answers: session.answers
    });

    // Save lead to database
    await lead.save();

    // Get business details
    const business = await businessModel.findById(session.businessId);

    // Send email notification
    const emailSent = await sendLeadNotification(lead, business);

    // Clean up the session
    activeSessions.delete(sessionId);

    res.json({
      status: true,
      message: "Thank you for sharing your details! Our specialist will contact you shortly.",
      data: {
        leadId: lead._id,
        emailSent
      }
    });
  } catch (err) {
    console.error("Store Lead Error:", err);
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
export const sendLeadNotification = async (lead, business) => {
  try {
    const emailContent = `
      <h2>New Lead Generated</h2>
      <p><strong>Business:</strong> ${business.name}</p>
      <p><strong>Lead Details:</strong></p>
      <ul>
        <li><strong>Name:</strong> ${lead.name}</li>
        <li><strong>Email:</strong> ${lead.email}</li>
        <li><strong>Phone:</strong> ${lead.phone}</li>
        <li><strong>Postal Code:</strong> ${lead.postalCode}</li>
        <li><strong>Consent Given:</strong> ${lead.consent ? 'Yes' : 'No'}</li>
      </ul>
      <h3>Consultation Answers:</h3>
      <ul>
        ${lead.answers.map(answer => `
          <li>
            <strong>Q:</strong> ${answer.question}<br>
            <strong>A:</strong> ${answer.answer}<br>
            <strong>Interpreted:</strong> ${answer.interpretedAnswer}
          </li>
        `).join('')}
      </ul>
      <p><strong>Generated At:</strong> ${new Date(lead.createdAt).toLocaleString()}</p>
    `;

    const mailData = {
      email: business.email,
      sub: `New Lead for ${business.name}`,
      text: `New Lead for ${business.name}`,
      html: emailContent
    };

    const result = await sendingMail(mailData);
    return result;
  } catch (error) {
    console.error('Email sending failed:', error);
    return false;
  }
};
openaiRouter.post('/getChatBotDetail', getChatBotDetail);


export default openaiRouter;
