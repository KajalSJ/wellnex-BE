import { Router } from "express"
import { getChatBotDetail } from "../domains/openai.domain.js"
import businessModel from "../models/business.model.js"
import { OpenAI } from "openai"
import Subscription from "../models/subscription.model.js"
import Lead from "../models/lead.model.js"
import awsEmailExternal from "../externals/send.email.external.js"

const { sendingMail } = awsEmailExternal
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
const openaiRouter = Router()

// Store active chat sessions
const activeSessions = new Map()

// Start a new chat session
openaiRouter.post("/start-chat", async (req, res) => {
  try {
    const { businessId, isRestart } = req.body
    const business = await businessModel.findById({ _id: businessId })

    if (!business || !business.questions || business.questions.length === 0) {
      return res.status(200).json({
        status: true,
        message:
          "Thank you for your interest! Our chatbot is currently being customized to better serve you. Please check back soon or contact us directly for immediate assistance.",
        data: {
          isSetupIncomplete: true,
          contactInfo: business?.email || "support@wellnexai.com",
        },
      })
    }

    // Check subscription status
    let subscription = await Subscription.findOne({
      userId: businessId,
      status: { $in: ["active", "trialing", "canceled", "paused"] },
      currentPeriodStart: { $lt: new Date() },
      currentPeriodEnd: { $gte: new Date() },
    }).sort({ createdAt: 1 })

    const cancelledSubscription = await Subscription.findOne({
      userId: businessId,
      status: "canceled",
      cancelAtPeriodEnd: true,
      $or: [{ currentPeriodEnd: { $gte: new Date() } }, { currentPeriodStart: { $lt: new Date() } }],
    })

    if (!subscription && !cancelledSubscription) {
      return res.status(200).json({
        status: false,
        message: "Your subscription has expired. Please renew your subscription to continue using the chatbot.",
        data: {
          subscriptionExpired: true,
        },
      })
    }

    // Create a new session
    const sessionId = Date.now().toString()
    activeSessions.set(sessionId, {
      businessId,
      currentQuestionIndex: 0,
      answers: [],
      questions: business.questions,
      services: business.services,
      keywords: business.keywords || [],
      businessType: business.type || "",
      businessName: business.name || "",
      phase: "structured_questions",
      initialQuery: null,
      structuredAnswers: [],
      needsForm: false,
      serviceCategory: null,
      preferredTime: null,
      conversationContext: {
        mentionedServices: [],
        userPreferences: {},
        conversationTone: "neutral",
        previousTopics: [],
        userQuestions: [],
      },
    })

    // Generate personalized greeting based on business hours
    const currentHour = new Date().getHours()
    let timeGreeting = "Hello"
    if (currentHour < 12) timeGreeting = "Good morning"
    else if (currentHour < 17) timeGreeting = "Good afternoon"
    else timeGreeting = "Good evening"

    // Get first question from database and ask immediately
    const firstQuestion = business.questions[0].name

    // Return greeting and first question immediately
    res.json({
      sessionId,
      messages: [
        {
          type: "greeting",
          content: isRestart
            ? `Welcome back! I'm here to help you again. 👋`
            : `${timeGreeting}! Welcome to ${business.name}. 👋 I'm your virtual assistant and I'm here to help you with our services.`,
        },
        {
          type: "info",
          content: "I'll ask you a few quick questions to better understand your needs.",
        },
        {
          type: "question",
          content: firstQuestion,
          questionNumber: 1,
          totalQuestions: business.questions.length,
        },
      ],
      progress: {
        current: 1,
        total: business.questions.length,
      },
    })
  } catch (err) {
    console.error("Start Chat Error:", err)
    res.status(500).json({ error: "Internal server error" })
  }
})

// Enhanced exit detection
async function checkIfUserWantsToEnd(userInput, session, currentQuestion, openai) {
  const conversationHistory = session.structuredAnswers
    .map((qa, i) => `Q${i + 1}: ${qa.question}\nA${i + 1}: ${qa.answer}`)
    .join("\n")

  const exitDetectionPrompt = `You are analyzing if a user wants to end a consultation conversation.

CONTEXT:
- This is a ${session.businessType} business consultation
- Current question: "${currentQuestion}"
- User's response: "${userInput}"

CONVERSATION HISTORY:
${conversationHistory || "No previous conversation"}

TASK:
Determine if the user wants to END the consultation conversation or CONTINUE with questions.

EXAMPLES OF WANTING TO END:
✅ "that's it", "no more questions", "I'm done", "thanks, bye"
✅ "stop", "end", "no that's all", "nothing else"
✅ "thank you, that's enough"

EXAMPLES OF WANTING TO CONTINUE (DO NOT END):
❌ "what do you think is the best?" (asking for help/recommendations)
❌ "what time are you available?" (asking about scheduling)
❌ "what services do you have?" (asking questions - still engaged)
❌ "I don't know" (uncertain but still participating)

IMPORTANT: Only mark as wanting to END if they're clearly trying to stop/finish the conversation.

Respond with JSON:
{
  "wantsToEnd": true/false,
  "confidence": 0-100,
  "reasoning": "brief explanation considering conversation context"
}`

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      temperature: 0.1,
      max_tokens: 200,
      messages: [{ role: "user", content: exitDetectionPrompt }],
      response_format: { type: "json_object" },
    })

    const result = JSON.parse(response.choices[0].message.content)

    return {
      wantsToEnd: result.wantsToEnd && result.confidence > 85,
      confidence: result.confidence,
      reasoning: result.reasoning,
    }
  } catch (error) {
    console.error("Error checking exit intent:", error)
    return {
      wantsToEnd: false,
      confidence: 0,
      reasoning: "Error in analysis - defaulting to continue",
    }
  }
}

// UNIVERSAL ROBUST CLASSIFICATION SYSTEM
async function classifyUserInputUniversal(userInput, session, currentQuestion, openai) {
  const conversationHistory = session.structuredAnswers
    .map((qa, i) => `Q${i + 1}: ${qa.question}\nA${i + 1}: ${qa.answer}`)
    .join("\n")

  const classificationPrompt = `You are a UNIVERSAL conversation classifier that works for ANY business type using CONTEXT-AWARE validation.

BUSINESS CONTEXT:
Business Type: ${session.businessType}
Business Name: ${session.businessName}
Available Services: ${session.services.map((s) => `- ${s.name}`).join("\n")}

CURRENT QUESTION: "${currentQuestion}"
USER INPUT: "${userInput}"

CONVERSATION HISTORY:
${conversationHistory || "This is the first interaction"}

UNIVERSAL THREE-LAYER VALIDATION:

LAYER 1: QUESTION RELEVANCE
Does the user's response attempt to answer the current question?
- Q: "What cars do you want?" A: "BMW" → ✅ YES (naming a car)
- Q: "What food do you like?" A: "pizza" → ✅ YES (naming food)
- Q: "What's your budget?" A: "50k" → ✅ YES (stating amount)
- Q: "What cars do you want?" A: "what's the weather?" → ❌ NO (unrelated)

LAYER 2: BUSINESS DOMAIN CONTEXT
Given the business type, does their answer make sense in this domain?

BUSINESS DOMAIN EXAMPLES:
- Car Business + Answer: "BMW/Toyota/sedan/SUV/creta/verna" → ✅ RELEVANT
- Restaurant + Answer: "pizza/burger/Italian food" → ✅ RELEVANT  
- Salon + Answer: "haircut/facial/manicure" → ✅ RELEVANT
- Real Estate + Answer: "2BHK/apartment/villa" → ✅ RELEVANT
- Healthcare + Answer: "headache/fever/checkup" → ✅ RELEVANT

LAYER 3: INTENT CLASSIFICATION
What is the user trying to do?

INTENT CATEGORIES:
1. **DIRECT_ANSWER**: Layers 1 ✅ + 2 ✅ (ADVANCE)
   - Answering question + relevant to business domain

2. **UNCLEAR_ANSWER**: Layers 1 ✅ + 2 ✅ but uncertain (ADVANCE)
   - "I'm not sure" / "maybe" / "flexible" but still relevant

3. **ASKING_FOR_HELP**: Layer 1 ❌ - seeking guidance (DON'T ADVANCE)
   - "what do you recommend?" / "what's available?" / "help me choose"

4. **BUSINESS_QUESTION**: Layer 1 ❌ - asking about business (DON'T ADVANCE)
   - "what are your prices?" / "what services do you have?"

5. **DOMAIN_MISMATCH**: Layer 1 ✅ + Layer 2 ❌ (DON'T ADVANCE)
   - Answers question but wrong domain (car business + "pizza")

6. **OFF_TOPIC**: Layer 1 ❌ - completely unrelated (DON'T ADVANCE)
   - Weather, politics, random topics

7. **GREETING**: Layer 1 ❌ - social interaction (DON'T ADVANCE)
   - "hello" / "hi" / "how are you"

CRITICAL EXAMPLES FOR ROBUSTNESS:

Car Business:
- Q: "What cars?" A: "BMW" → DIRECT_ANSWER ✅ (car model in car business)
- Q: "What cars?" A: "creta" → DIRECT_ANSWER ✅ (car model in car business)
- Q: "What cars?" A: "verna" → DIRECT_ANSWER ✅ (car model in car business)
- Q: "What cars?" A: "pizza" → DOMAIN_MISMATCH ❌ (food in car business)
- Q: "Budget?" A: "50 lakhs" → DIRECT_ANSWER ✅ (money amount for budget)
- Q: "Budget?" A: "14lakh" → DIRECT_ANSWER ✅ (money amount for budget)

Restaurant:
- Q: "What food?" A: "pizza" → DIRECT_ANSWER ✅ (food item in restaurant)
- Q: "What food?" A: "BMW" → DOMAIN_MISMATCH ❌ (car in restaurant)

Salon:
- Q: "What service?" A: "haircut" → DIRECT_ANSWER ✅ (beauty service in salon)
- Q: "What service?" A: "car wash" → DOMAIN_MISMATCH ❌ (car service in salon)

UNIVERSAL RULES:
- If user answers the question AND it fits the business domain → ADVANCE
- If user asks for help/info OR answer doesn't fit domain → DON'T ADVANCE
- Business domain is determined by business type, NOT service list
- Focus on CONTEXTUAL RELEVANCE, not exact service matching

ONLY ADVANCE FOR: DIRECT_ANSWER, UNCLEAR_ANSWER

Respond with JSON:
{
  "category": "DIRECT_ANSWER|UNCLEAR_ANSWER|ASKING_FOR_HELP|BUSINESS_QUESTION|DOMAIN_MISMATCH|OFF_TOPIC|GREETING",
  "confidence": 0-100,
  "layerOneResult": {
    "answersQuestion": true/false,
    "reasoning": "does this attempt to answer the current question?"
  },
  "layerTwoResult": {
    "fitsBusinessDomain": true/false,
    "domainReasoning": "does this answer make sense for a [business type] business?",
    "contextualRelevance": "explanation of domain fit"
  },
  "layerThreeResult": {
    "userIntent": "what is the user trying to accomplish?",
    "shouldAdvance": true/false
  },
  "extractedInfo": {
    "mentionedItems": ["any specific items/services/products mentioned"],
    "userPreference": "what the user seems to prefer",
    "interpretedAnswer": "clean version of their answer"
  },
  "reasoning": "overall classification explanation with layer analysis"
}`

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      temperature: 0.1,
      max_tokens: 800,
      messages: [{ role: "user", content: classificationPrompt }],
      response_format: { type: "json_object" },
    })

    const result = JSON.parse(response.choices[0].message.content)

    // Universal validation: Only advance if all layers pass
    const shouldAdvance =
      result.layerOneResult?.answersQuestion &&
      result.layerTwoResult?.fitsBusinessDomain &&
      ["DIRECT_ANSWER", "UNCLEAR_ANSWER"].includes(result.category)

    result.shouldAdvanceQuestion = shouldAdvance

    return result
  } catch (error) {
    console.error("Error in universal classification:", error)
    return {
      category: "ASKING_FOR_HELP",
      confidence: 50,
      layerOneResult: { answersQuestion: false, reasoning: "Error in analysis" },
      layerTwoResult: { fitsBusinessDomain: false, domainReasoning: "Error", contextualRelevance: "Error" },
      layerThreeResult: { userIntent: "unclear", shouldAdvance: false },
      shouldAdvanceQuestion: false,
      extractedInfo: { mentionedItems: [], userPreference: "unclear", interpretedAnswer: userInput },
      reasoning: "Error in classification - defaulting to safe option",
    }
  }
}

// FIXED: Enhanced response generator - NO DUPLICATE QUESTIONS
async function generateUniversalResponse(classification, userInput, session, currentQuestion, openai) {
  let responsePrompt = ""

  switch (classification.category) {
    case "ASKING_FOR_HELP":
      responsePrompt = `User is asking for help: "${userInput}" in response to question: "${currentQuestion}"

BUSINESS CONTEXT:
Business Type: ${session.businessType}
Services: ${session.services.map((s) => s.name).join(", ")}
Business Name: ${session.businessName}

Generate a helpful response that:
1. Acknowledges their request for help
2. Provides relevant options based on business type and services
3. Guides them to make a choice
4. DOES NOT repeat the question (it will be asked separately)

For a ${session.businessType} business, provide helpful guidance without making up specific details.

Example: "We offer [actual services]. Which of these interests you most?"

IMPORTANT: Do NOT include the question "${currentQuestion}" in your response.

Respond with just the message text (no JSON).`
      break

    case "UNCLEAR_ANSWER":
      responsePrompt = `User gave an uncertain but relevant answer: "${userInput}" to question: "${currentQuestion}"

Generate a brief, positive acknowledgment that:
1. Accepts their uncertainty
2. Shows understanding
3. Transitions to next question

Examples: "No worries! We can work with that." or "That's perfectly fine."

Keep it SHORT and positive. Respond with just the message text (no JSON).`
      break

    case "BUSINESS_QUESTION":
      responsePrompt = `User asked: "${userInput}" about our ${session.businessType} business.

BUSINESS INFO:
Services: ${session.services.map((s) => s.name).join(", ")}
Business Name: ${session.businessName}

Generate a helpful response that:
1. Answers using available business information
2. For specific details: "Our team will provide those details"
3. Transitions back to consultation
4. DOES NOT repeat the question (it will be asked separately)

Example: "We offer [services]. Our team will provide specific details."

IMPORTANT: Do NOT include the question "${currentQuestion}" in your response.

Respond with just the message text (no JSON).`
      break

    case "DOMAIN_MISMATCH":
      responsePrompt = `User answered: "${userInput}" but it doesn't fit our ${session.businessType} business domain.

Current question: "${currentQuestion}"
Layer analysis: ${classification.reasoning}

Generate a friendly response that:
1. Acknowledges their response politely
2. Explains we specialize in ${session.businessType}
3. Redirects to our business domain
4. DOES NOT repeat the question (it will be asked separately)

Example: "I understand, but we specialize in ${session.businessType} services."

IMPORTANT: Do NOT include the question "${currentQuestion}" in your response.

Respond with just the message text (no JSON).`
      break

    case "OFF_TOPIC":
      responsePrompt = `User said something unrelated: "${userInput}"

Our business: ${session.businessType} called ${session.businessName}
Current question: "${currentQuestion}"

Generate a polite response that:
1. Politely redirects to our business
2. Maintains friendly tone
3. DOES NOT repeat the question (it will be asked separately)

Example: "I'm here to help with ${session.businessType} services."

IMPORTANT: Do NOT include the question "${currentQuestion}" in your response.

Respond with just the message text (no JSON).`
      break

    case "GREETING":
      responsePrompt = `User greeted: "${userInput}"
Current question: "${currentQuestion}"

Generate a warm response that:
1. Acknowledges greeting
2. Transitions to consultation
3. DOES NOT repeat the question (it will be asked separately)

Example: "Hello! Nice to meet you."

IMPORTANT: Do NOT include the question "${currentQuestion}" in your response.

Respond with just the message text (no JSON).`
      break

    default:
      return "Thank you for your response."
  }

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      temperature: 0.3,
      max_tokens: 200,
      messages: [{ role: "user", content: responsePrompt }],
    })

    return response.choices[0].message.content.trim()
  } catch (error) {
    console.error("Error generating universal response:", error)
    return "Thank you for your response."
  }
}

// Submit answer and get next question - ENHANCED with universal classification
openaiRouter.post("/submit-answer", async (req, res) => {
  try {
    const { sessionId, answer } = req.body
    const session = activeSessions.get(sessionId)

    if (!session) {
      return res.status(404).json({ error: "Chat session not found" })
    }

    if (session.phase === "structured_questions") {
      const currentQuestion = session.questions[session.currentQuestionIndex].name

      // Smart exit detection
      console.log("=== SMART EXIT DETECTION ===")
      const exitCheck = await checkIfUserWantsToEnd(answer, session, currentQuestion, openai)

      console.log("Exit check result:", exitCheck)

      if (exitCheck.wantsToEnd) {
        console.log("=== ENDING CONVERSATION - AI DETECTED EXIT INTENT ===")
        session.phase = "awaiting_choice"
        return res.json({
          sessionId,
          messages: [
            {
              type: "conclusion",
              content:
                "Based on your responses, I think it would be best to connect you with our specialists for a more detailed consultation. Would you like to share your details?",
            },
          ],
          nextSteps: [
            {
              type: "share_details",
              label: "Yes, connect me",
              action: "share_details",
            },
            {
              type: "decline",
              label: "No, thanks",
              action: "decline",
            },
          ],
        })
      }

      // UNIVERSAL CLASSIFICATION
      console.log("=== UNIVERSAL THREE-LAYER CLASSIFICATION ===")
      console.log("User input:", answer)
      console.log("Current question:", currentQuestion)
      console.log("Business type:", session.businessType)

      const classification = await classifyUserInputUniversal(answer, session, currentQuestion, openai)

      console.log("=== CLASSIFICATION RESULT ===")
      console.log("Category:", classification.category)
      console.log("Confidence:", classification.confidence)
      console.log("Layer 1 - Answers Question:", classification.layerOneResult?.answersQuestion)
      console.log("Layer 2 - Fits Business Domain:", classification.layerTwoResult?.fitsBusinessDomain)
      console.log("Layer 3 - Should Advance:", classification.layerThreeResult?.shouldAdvance)
      console.log("Should advance question:", classification.shouldAdvanceQuestion)
      console.log("Domain reasoning:", classification.layerTwoResult?.domainReasoning)

      // Update conversation context
      if (classification.extractedInfo.mentionedItems.length > 0) {
        session.conversationContext.mentionedServices = [
          ...new Set([
            ...session.conversationContext.mentionedServices,
            ...classification.extractedInfo.mentionedItems,
          ]),
        ]
      }

      // UNIVERSAL ADVANCEMENT: Only advance if all three layers pass
      if (classification.shouldAdvanceQuestion) {
        console.log(`=== ${classification.category} - ALL LAYERS PASSED - ADVANCING ===`)

        // Generate contextual response for unclear answers
        let contextualResponse = ""
        if (classification.category === "UNCLEAR_ANSWER") {
          contextualResponse = await generateUniversalResponse(classification, answer, session, currentQuestion, openai)
        }

        // Store the answer and advance
        session.structuredAnswers.push({
          question: currentQuestion,
          answer: answer,
          interpretedAnswer: classification.extractedInfo.interpretedAnswer || answer,
          contextualInfo: {
            ...classification.extractedInfo,
            validationLayers: {
              answersQuestion: classification.layerOneResult?.answersQuestion,
              fitsBusinessDomain: classification.layerTwoResult?.fitsBusinessDomain,
              domainReasoning: classification.layerTwoResult?.domainReasoning,
              userIntent: classification.layerThreeResult?.userIntent,
            },
          },
        })

        session.currentQuestionIndex++

        // Check if completed all questions
        if (session.currentQuestionIndex >= session.questions.length) {
          session.phase = "awaiting_choice"

          const finalResponsePrompt = `A customer has completed our consultation process. Here's their information:

Structured Questions and Answers:
${session.structuredAnswers.map((qa, i) => `Q${i + 1}: ${qa.question}\nA${i + 1}: ${qa.answer}`).join("\n")}

Available Services: ${session.services.map((s) => s.name).join(", ")}
Business Type: ${session.businessType}
Business Name: ${session.businessName}

CONVERSATION INSIGHTS:
- Items they showed interest in: ${session.conversationContext.mentionedServices.join(", ") || "None specific"}

Provide a natural conclusion that thanks them and acknowledges completion.`

          const finalResponse = await openai.chat.completions.create({
            model: "gpt-4o",
            temperature: 0.3,
            max_tokens: 400,
            messages: [{ role: "user", content: finalResponsePrompt }],
          })

          return res.json({
            sessionId,
            messages: [
              {
                type: "summary",
                content: finalResponse.choices[0].message.content,
              },
              {
                type: "conclusion",
                content:
                  "Hang in there, we'll forward these requirements to our specialists who will get back to you soon. Would you like to share your details?",
              },
            ],
            isComplete: true,
            nextSteps: [
              {
                type: "share_details",
                label: "Yes, connect me",
                action: "share_details",
              },
              {
                type: "decline",
                label: "No, thanks",
                action: "decline",
              },
            ],
          })
        }

        // Return next question with optional contextual response
        const nextQuestion = session.questions[session.currentQuestionIndex].name
        const messages = []

        if (contextualResponse) {
          messages.push({
            type: "contextual_response",
            content: contextualResponse,
          })
        }

        const friendlyTransitions = [
          "Perfect! Next question:",
          "Great! Let me ask you:",
          "Awesome! One more thing:",
          "Thanks! Now I'd like to know:",
        ]
        const selectedTransition = friendlyTransitions[Math.floor(Math.random() * friendlyTransitions.length)]

        messages.push(
          {
            type: "transition",
            content: selectedTransition,
          },
          {
            type: "question",
            content: nextQuestion,
            questionNumber: session.currentQuestionIndex + 1,
            totalQuestions: session.questions.length,
          },
        )

        return res.json({
          sessionId,
          messages,
          progress: {
            current: session.currentQuestionIndex + 1,
            total: session.questions.length,
          },
        })
      } else {
        // FIXED: Handle responses that don't pass all layers - NO DUPLICATE QUESTIONS
        console.log(`=== HANDLING ${classification.category} - LAYER VALIDATION FAILED ===`)
        console.log("Providing contextual response and asking same question")

        const contextualResponse = await generateUniversalResponse(
          classification,
          answer,
          session,
          currentQuestion,
          openai,
        )

        // FIXED: Return ONLY contextual response + question (no duplication)
        return res.json({
          sessionId,
          messages: [
            {
              type: "contextual_response",
              content: contextualResponse,
            },
            {
              type: "question",
              content: currentQuestion,
              questionNumber: session.currentQuestionIndex + 1,
              totalQuestions: session.questions.length,
            },
          ],
          progress: {
            current: session.currentQuestionIndex + 1,
            total: session.questions.length,
          },
        })
      }
    }

    return res.json({
      sessionId,
      messages: [
        {
          type: "info",
          content:
            "I'm not sure how to help with that. Our specialists may be able to help you. Would you like to share your details?",
        },
      ],
      isComplete: true,
      nextSteps: [
        {
          type: "share_details",
          label: "Yes, connect me",
          action: "share_details",
        },
        {
          type: "decline",
          label: "No, thanks",
          action: "decline",
        },
      ],
    })
  } catch (err) {
    console.error("Submit Answer Error:", err)
    res.status(500).json({ error: "Internal server error" })
  }
})

// Handle consultation choice
openaiRouter.post("/handle-consultation-choice", async (req, res) => {
  try {
    const { sessionId, choice } = req.body
    const session = activeSessions.get(sessionId)

    if (!session) {
      return res.status(404).json({ error: "Chat session not found" })
    }

    console.log("=== HANDLING CONSULTATION CHOICE ===")
    console.log("Choice:", choice)
    console.log("Session phase:", session.phase)

    if (choice === "share_details" || choice === "Yes, connect me") {
      console.log("=== USER WANTS TO SHARE DETAILS ===")
      return res.json({
        sessionId,
        needsForm: true,
        message: "",
        formFields: [
          {
            name: "name",
            label: "Full Name",
            type: "text",
            required: true,
            placeholder: "Enter your full name",
          },
          {
            name: "email",
            label: "Email Address",
            type: "email",
            required: true,
            placeholder: "Enter your email address",
          },
          {
            name: "phone",
            label: "Phone Number",
            type: "tel",
            required: true,
            placeholder: "Enter your phone number",
          },
          {
            name: "consent",
            label: "I consent to being contacted by a specialist",
            type: "checkbox",
            required: true,
            value: false,
          },
        ],
      })
    } else if (choice === "decline" || choice === "No, thanks") {
      console.log("=== USER DECLINED TO SHARE DETAILS ===")
      activeSessions.delete(sessionId)
      return res.json({
        message: "Thank you for your time! Feel free to reach out if you have any questions in the future.",
        sessionEnded: true,
      })
    } else if (choice === "start_new") {
      console.log("=== USER WANTS TO START NEW CONSULTATION ===")
      activeSessions.delete(sessionId)
      return res.json({
        message: "Starting a new consultation...",
        sessionEnded: true,
        shouldRestart: true,
      })
    } else {
      console.log("=== UNKNOWN CHOICE ===")
      return res.status(400).json({ error: "Invalid choice" })
    }
  } catch (err) {
    console.error("Handle Consultation Choice Error:", err)
    res.status(500).json({ error: "Internal server error" })
  }
})

// Store lead information
openaiRouter.post("/store-lead", async (req, res) => {
  try {
    const { sessionId, formData } = req.body
    const session = activeSessions.get(sessionId)

    if (!session) {
      return res.status(404).json({ error: "Chat session not found" })
    }

    const lead = new Lead({
      businessId: session.businessId,
      name: formData.name,
      email: formData.email,
      phone: formData.phone,
      consent: formData.consent,
      answers: session.structuredAnswers,
      conversationContext: session.conversationContext,
    })

    await lead.save()

    const business = await businessModel.findById(session.businessId)
    const emailSent = await sendLeadNotification(lead, business)

    activeSessions.delete(sessionId)

    res.json({
      status: true,
      message: "Thank you for sharing your details! Our specialist will contact you shortly.",
      sessionEnded: true,
      data: {
        leadId: lead._id,
        emailSent,
      },
    })
  } catch (err) {
    console.error("Store Lead Error:", err)
    res.status(500).json({ error: err.message ?? "Internal server error" })
  }
})

export const sendLeadNotification = async (lead, business) => {
  try {
    const conversationInsights = lead.conversationContext
      ? `
      <h3>Conversation Insights:</h3>
      <ul>
        <li><strong>Items of Interest:</strong> ${lead.conversationContext.mentionedServices?.join(", ") || "None specific"}</li>
        <li><strong>User Preferences:</strong> ${JSON.stringify(lead.conversationContext.userPreferences) || "None captured"}</li>
        <li><strong>Conversation Tone:</strong> ${lead.conversationContext.conversationTone || "Neutral"}</li>
        <li><strong>Topics Discussed:</strong> ${lead.conversationContext.previousTopics?.join(", ") || "Standard consultation"}</li>
      </ul>
      `
      : ""

    const emailContent = `
      <h2>New Lead Generated</h2>
      <p><strong>Business:</strong> ${business.name}</p>
      <p><strong>Lead Details:</strong></p>
      <ul>
        <li><strong>Name:</strong> ${lead.name}</li>
        <li><strong>Email:</strong> ${lead.email}</li>
        <li><strong>Phone:</strong> ${lead.phone}</li>
        <li><strong>Consent Given:</strong> ${lead.consent ? "Yes" : "No"}</li>
      </ul>
      
      ${conversationInsights}
      
      <h3>Consultation Answers:</h3>
      <ul>
        ${lead.answers
        .map(
          (answer) => `
          <li>
            <strong>Q:</strong> ${answer.question}<br>
            <strong>A:</strong> ${answer.answer}<br>
            <strong>Interpreted:</strong> ${answer.interpretedAnswer}
          </li>
        `,
        )
        .join("")}
      </ul>
      <p><strong>Generated At:</strong> ${new Date(lead.createdAt).toLocaleString()}</p>
    `

    const mailData = {
      email: business.email,
      sub: `New Lead for ${business.name}`,
      text: `New Lead for ${business.name}`,
      html: emailContent,
    }

    const result = await sendingMail(mailData)
    return result
  } catch (error) {
    console.error("Email sending failed:", error)
    return false
  }
}

openaiRouter.post("/getChatBotDetail", getChatBotDetail)

export default openaiRouter
