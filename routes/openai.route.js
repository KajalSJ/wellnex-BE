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

// Start a new chat session - UNCHANGED
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

    if (!subscription) {
      subscription = await Subscription.findOne({
        userId: businessId,
        status: { $in: ["active", "trialing", "canceled", "paused"] },
        specialOfferExpiry: { $gt: new Date() },
      }).sort({ createdAt: 1 })
    }

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
      wantsToEnd: result.wantsToEnd && result.confidence > 85, // Even higher threshold
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

// ULTRA-ROBUST: Precise conversation classifier with strict rules
async function classifyUserInput(userInput, session, currentQuestion, openai) {
  const conversationHistory = session.structuredAnswers
    .map((qa, i) => `Q${i + 1}: ${qa.question}\nA${i + 1}: ${qa.answer}`)
    .join("\n")

  const classificationPrompt = `You are a PRECISE conversation classifier for a ${session.businessType} business called "${session.businessName}".

BUSINESS CONTEXT:
Available Services: ${session.services.map((s) => `- ${s.name}`).join("\n")}
Business Type: ${session.businessType}
Business Keywords: ${session.keywords.join(", ") || "General business services"}

CURRENT QUESTION: "${currentQuestion}"
USER INPUT: "${userInput}"

CONVERSATION HISTORY:
${conversationHistory || "This is the first interaction"}

CRITICAL CLASSIFICATION RULES:

1. **DIRECT_ANSWER**: User directly answers the current question with a specific choice/preference
   ✅ Q: "What service?" A: "gel manicure" 
   ✅ Q: "First visit?" A: "yes"
   ✅ Q: "What time?" A: "2pm" or "afternoon"

2. **UNCLEAR_ANSWER**: User attempts to answer but is uncertain (STILL AN ANSWER)
   ✅ Q: "First visit?" A: "yes maybe" or "I think so"
   ✅ Q: "What time?" A: "I'm flexible" or "not sure"

3. **ASKING_FOR_HELP**: User asks for recommendations/information (NOT AN ANSWER - DON'T ADVANCE)
   ❌ Q: "What service?" A: "what do you think is the best?" → ASKING_FOR_HELP
   ❌ Q: "What time?" A: "what time are you available?" → ASKING_FOR_HELP  
   ❌ Q: "What service?" A: "what do you recommend?" → ASKING_FOR_HELP
   ❌ Q: "What time?" A: "when are you open?" → ASKING_FOR_HELP

4. **DOMAIN_QUESTION**: User asks about business services/info (NOT AN ANSWER - DON'T ADVANCE)
   ❌ "what services do you have?"
   ❌ "do you do facials?"
   ❌ "what are your prices?"

5. **DOMAIN_RELATED**: User mentions domain but doesn't answer (NOT AN ANSWER - DON'T ADVANCE)
   ❌ "I need something for my nails"
   ❌ "I want to look good"

6. **OFF_DOMAIN**: Completely unrelated (NOT AN ANSWER - DON'T ADVANCE)
   ❌ "what's the weather?"

7. **GREETING**: Social interaction (NOT AN ANSWER - DON'T ADVANCE)
   ❌ "hello", "hi there"

KEY DISTINCTION FOR QUESTIONS:
- If user asks "what do you recommend?" → ASKING_FOR_HELP (they want help choosing)
- If user asks "do you have evening slots?" → ASKING_FOR_HELP (they want information)
- If user says "I prefer evenings" → DIRECT_ANSWER (they stated preference)

ONLY ADVANCE QUESTION FOR: DIRECT_ANSWER, UNCLEAR_ANSWER
NEVER ADVANCE FOR: ASKING_FOR_HELP, DOMAIN_QUESTION, DOMAIN_RELATED, OFF_DOMAIN, GREETING

Respond with JSON:
{
  "category": "DIRECT_ANSWER|UNCLEAR_ANSWER|ASKING_FOR_HELP|DOMAIN_QUESTION|DOMAIN_RELATED|OFF_DOMAIN|GREETING",
  "confidence": 0-100,
  "reasoning": "detailed explanation of why this classification was chosen",
  "shouldAdvanceQuestion": true/false,
  "extractedInfo": {
    "mentionedServices": ["any services mentioned"],
    "userIntent": "what the user seems to want",
    "isAskingForHelp": true/false,
    "interpretedAnswer": "how to interpret their response as an answer if applicable"
  }
}`

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      temperature: 0.05, // Very low temperature for consistency
      max_tokens: 600,
      messages: [{ role: "user", content: classificationPrompt }],
      response_format: { type: "json_object" },
    })

    const result = JSON.parse(response.choices[0].message.content)

    // SAFETY CHECK: Never advance for help-seeking questions
    if (result.category === "ASKING_FOR_HELP" || result.extractedInfo?.isAskingForHelp) {
      result.shouldAdvanceQuestion = false
    }

    return result
  } catch (error) {
    console.error("Error classifying user input:", error)
    return {
      category: "ASKING_FOR_HELP",
      confidence: 50,
      reasoning: "Error in classification - defaulting to asking for help to be safe",
      shouldAdvanceQuestion: false,
      extractedInfo: {
        mentionedServices: [],
        userIntent: "unclear",
        isAskingForHelp: true,
        interpretedAnswer: userInput,
      },
    }
  }
}

// ENHANCED: Contextual response generator with better help responses
async function generateContextualResponse(classification, userInput, session, currentQuestion, openai) {
  let responsePrompt = ""

  switch (classification.category) {
    case "ASKING_FOR_HELP":
      responsePrompt = `User is asking for help: "${userInput}" in response to question: "${currentQuestion}"

BUSINESS INFO:
Services: ${session.services.map((s) => s.name).join(", ")}
Business Name: ${session.businessName}
Business Type: ${session.businessType}

IMPORTANT RULES:
- NEVER provide fake time slots, staff names, or specific details not in the business data
- For scheduling questions: redirect to "our team will coordinate scheduling"
- For staff questions: mention "experienced professionals" without fake names
- For service questions: use only the actual services listed

CONTEXT EXAMPLES:
- Q: "What service?" A: "what do you think is best?" → Recommend from actual services list
- Q: "What time?" A: "what time are you available?" → "Our team will coordinate scheduling with you"
- Q: "What service?" A: "what do you recommend?" → Suggest from actual services only

Generate a helpful response that:
1. Uses ONLY real business information (services list)
2. For scheduling/staff: redirects to "our team will coordinate with you"
3. Provides 2-3 concrete options from actual services
4. Guides them toward making a choice from real options
5. NEVER mentions fake times, staff names, or unavailable services

Keep it helpful and honest. Respond with just the message text (no JSON).`
      break

    case "UNCLEAR_ANSWER":
      responsePrompt = `User gave an uncertain answer: "${userInput}" to question: "${currentQuestion}"

Generate a brief acknowledgment that:
1. Accepts their uncertainty positively
2. Shows we understand their response
3. Transitions naturally to next question

Examples:
- "No worries at all! I understand you're not completely sure."
- "That's perfectly fine - we'll work with that."
- "Got it! We can definitely help with that."

Keep it SHORT and positive. Respond with just the message text (no JSON).`
      break

    case "DOMAIN_QUESTION":
      responsePrompt = `User asked: "${userInput}" about our ${session.businessType} business.

BUSINESS INFO:
Services: ${session.services.map((s) => s.name).join(", ")}
Business Name: ${session.businessName}
Current Question: "${currentQuestion}"

IMPORTANT: Only provide information that exists in the business data. For scheduling, staff, or pricing questions, redirect to "our team will provide those details."

Generate a helpful response that:
1. Answers their question using ONLY available business data
2. For unavailable info: "Our team will provide those specific details"
3. Naturally transitions back to the consultation
4. Asks them to answer the current question

Example: "We offer [actual services from list]. Our team will coordinate scheduling details with you. Now, ${currentQuestion.toLowerCase()}"

Respond with just the message text (no JSON).`
      break

    case "DOMAIN_RELATED":
      responsePrompt = `User said: "${userInput}" which is related to our ${session.businessType} business but doesn't directly answer: "${currentQuestion}"

BUSINESS INFO:
Services: ${session.services.map((s) => s.name).join(", ")}
Mentioned Services: ${classification.extractedInfo.mentionedServices.join(", ") || "none"}

Generate a response that:
1. Acknowledges what they said
2. Connects it to our services if possible
3. Guides back to the consultation naturally
4. Asks the current question

Example: "I understand you're interested in [topic]. We have [relevant services]. ${currentQuestion}"

Respond with just the message text (no JSON).`
      break

    case "OFF_DOMAIN":
      responsePrompt = `User asked about something unrelated: "${userInput}" 

Our business: ${session.businessType} called ${session.businessName}
Current question: "${currentQuestion}"

Generate a polite response that:
1. Politely declines to help with unrelated topics
2. Redirects back to our business services
3. Maintains friendly tone
4. Asks the current consultation question

Example: "I'm a [business type] assistant and can only help with our services. ${currentQuestion}"

Respond with just the message text (no JSON).`
      break

    case "GREETING":
      responsePrompt = `User greeted with: "${userInput}"
Current question: "${currentQuestion}"

Generate a friendly response that:
1. Acknowledges their greeting warmly
2. Transitions back to the consultation
3. Asks the current question naturally

Example: "Hello! Nice to meet you. ${currentQuestion}"

Respond with just the message text (no JSON).`
      break

    default:
      return `Thank you for your response. ${currentQuestion}`
  }

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      temperature: 0.3,
      max_tokens: 250,
      messages: [{ role: "user", content: responsePrompt }],
    })

    return response.choices[0].message.content.trim()
  } catch (error) {
    console.error("Error generating contextual response:", error)
    return `Thank you for your response. ${currentQuestion}`
  }
}

// ULTRA-ROBUST: Submit answer with strict advancement rules
openaiRouter.post("/submit-answer", async (req, res) => {
  try {
    const { sessionId, answer } = req.body
    const session = activeSessions.get(sessionId)

    if (!session) {
      return res.status(404).json({ error: "Chat session not found" })
    }

    if (session.phase === "structured_questions") {
      const currentQuestion = session.questions[session.currentQuestionIndex].name

      // Smart exit detection with higher threshold
      console.log("=== SMART EXIT DETECTION ===")
      const exitCheck = await checkIfUserWantsToEnd(answer, session, currentQuestion, openai)

      console.log("Exit check result:", exitCheck)

      if (exitCheck.wantsToEnd) {
        console.log("=== ENDING CONVERSATION - AI DETECTED EXIT INTENT ===")
        // DON'T delete session yet - let handle-consultation-choice handle it
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

      // ULTRA-PRECISE conversation classification
      console.log("=== ULTRA-PRECISE CLASSIFICATION ===")
      console.log("User input:", answer)
      console.log("Current question:", currentQuestion)

      const classification = await classifyUserInput(answer, session, currentQuestion, openai)

      console.log("=== CLASSIFICATION RESULT ===")
      console.log("Category:", classification.category)
      console.log("Confidence:", classification.confidence)
      console.log("Should advance question:", classification.shouldAdvanceQuestion)
      console.log("Is asking for help:", classification.extractedInfo?.isAskingForHelp)
      console.log("Reasoning:", classification.reasoning)

      // Update conversation context with extracted info
      if (classification.extractedInfo.mentionedServices.length > 0) {
        session.conversationContext.mentionedServices = [
          ...new Set([
            ...session.conversationContext.mentionedServices,
            ...classification.extractedInfo.mentionedServices,
          ]),
        ]
      }

      // STRICT RULE: Only advance for DIRECT_ANSWER and UNCLEAR_ANSWER
      const shouldAdvanceCategories = ["DIRECT_ANSWER", "UNCLEAR_ANSWER"]

      if (shouldAdvanceCategories.includes(classification.category) && classification.shouldAdvanceQuestion) {
        console.log(`=== ${classification.category} - ADVANCING TO NEXT QUESTION ===`)

        // Generate contextual response for unclear answers
        let contextualResponse = ""
        if (classification.category === "UNCLEAR_ANSWER") {
          contextualResponse = await generateContextualResponse(
            classification,
            answer,
            session,
            currentQuestion,
            openai,
          )
        }

        // Store the answer and advance
        session.structuredAnswers.push({
          question: currentQuestion,
          answer: answer,
          interpretedAnswer: classification.extractedInfo.interpretedAnswer || answer,
          contextualInfo: classification.extractedInfo,
        })

        session.currentQuestionIndex++

        // Check if completed all questions
        if (session.currentQuestionIndex >= session.questions.length) {
          // DON'T delete session yet - let handle-consultation-choice handle it
          session.phase = "awaiting_choice"

          const finalResponsePrompt = `A customer has completed our consultation process. Here's their information:

Structured Questions and Answers:
${session.structuredAnswers.map((qa, i) => `Q${i + 1}: ${qa.question}\nA${i + 1}: ${qa.answer}`).join("\n")}

Available Services: ${session.services.map((s) => s.name).join(", ")}
Business Type: ${session.businessType}
Business Name: ${session.businessName}

CONVERSATION INSIGHTS:
- Services they showed interest in: ${session.conversationContext.mentionedServices.join(", ") || "None specific"}

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

        // Add contextual response if generated
        if (contextualResponse) {
          messages.push({
            type: "contextual_response",
            content: contextualResponse,
          })
        }

        // Add transition and next question
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
        // Handle categories that DON'T advance (ASKING_FOR_HELP, DOMAIN_QUESTION, etc.)
        console.log(`=== HANDLING ${classification.category} - NOT ADVANCING QUESTION ===`)

        const contextualResponse = await generateContextualResponse(
          classification,
          answer,
          session,
          currentQuestion,
          openai,
        )

        console.log("Generated response:", contextualResponse)

        // Return contextual response + current question (DON'T advance)
        return res.json({
          sessionId,
          messages: [
            {
              type: "contextual_response",
              content: contextualResponse,
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
          content: "I'm not sure how to help with that. Our specialists may be able to help you. Would you like to share your details?",
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

// UPDATED: Handle consultation choice - now handles session cleanup
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
      // Clean up session
      activeSessions.delete(sessionId)
      return res.json({
        message: "Thank you for your time! Feel free to reach out if you have any questions in the future.",
        sessionEnded: true,
      })
    } else if (choice === "start_new") {
      console.log("=== USER WANTS TO START NEW CONSULTATION ===")
      // Clean up current session
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

    // Clean up session after storing lead
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
        <li><strong>Services of Interest:</strong> ${lead.conversationContext.mentionedServices?.join(", ") || "None specific"}</li>
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
