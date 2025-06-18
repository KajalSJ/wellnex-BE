import { Router } from "express";
import { getChatBotDetail } from "../domains/openai.domain.js";
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
    const { businessId, isRestart } = req.body;
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
    // First try to find an active subscription for today
    let subscription = await Subscription.findOne({
      userId: businessId,
      status: { $in: ['active', 'trialing', 'canceled', 'paused'] },
      currentPeriodStart: { $lt: new Date() },
      currentPeriodEnd: { $gt: new Date() }
    }).sort({ createdAt: 1 });

    // If no active subscription found, look for a valid special offer
    if (!subscription) {
      subscription = await Subscription.findOne({
        userId: businessId,
        status: { $in: ['active', 'trialing', 'canceled', 'paused'] },
        specialOfferExpiry: { $gt: new Date() }
      }).sort({ createdAt: 1 });
    }

    const cancelledSubscription = await Subscription.findOne({
      userId: businessId,
      status: 'canceled',
      cancelAtPeriodEnd: true,
      $or: [
        { currentPeriodEnd: { $gt: new Date() } },
        { currentPeriodStart: { $lt: new Date() } }
      ]
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
      messages: [
        {
          type: "greeting",
          content: isRestart
            ? `Welcome back! Let's start a new consultation. 👋`
            : `${timeGreeting}! Welcome to ${business.name}. 👋 I'm your virtual assistant here to help you navigate our services.`
        },
        {
          type: "info",
          content: "I'll ask you a few quick questions to understand your needs better."
        },
        {
          type: "question",
          content: business.questions[0].name,
          isLastQuestion: business.questions.length === 1
        }
      ]
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

    // If all questions have been answered, only ask about sharing details
    if (session.currentQuestionIndex >= session.questions.length) {
      // If user has already been asked about specialist and answered no
      if (answer.toLowerCase().includes("no") || answer.toLowerCase().includes("just browsing")) {
        activeSessions.delete(sessionId);
        return res.json({
          message: "Thank you for your time! Feel free to reach out if you have any questions in the future.",
          sessionEnded: true,
          options: [
            {
              type: "start_new",
              label: "Start New Consultation",
              action: "start_new"
            }
          ]
        });
      }

      if (!session.askedAboutSpecialist) {
        session.askedAboutSpecialist = true;
        return res.json({
          sessionId,
          needsClarification: true,
          messages: [
            {
              type: "info",
              content: "Would you like to share your details so we can forward your query to our specialists?"
            }
          ],
          nextSteps: [
            "Yes, connect me",
            "No, just browsing"
          ]
        });
      }

      // If we've already asked about specialist and user hasn't said no, they must have said yes
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
            name: "consent",
            label: "I consent to being contacted by a specialist",
            type: "checkbox",
            required: true,
            value: false
          }
        ]
      });
    }

    const businessData = businessModel.findById(session.businessId)

    const currentQuestion = session.questions[session.currentQuestionIndex].name;

    // Check if the answer is a greeting
    const greetingKeywords = ['hi', 'hello', 'hey', 'good morning', 'good afternoon', 'good evening', 'greetings'];
    const isGreeting = greetingKeywords.some(keyword =>
      answer.toLowerCase().includes(keyword)
    );

    if (isGreeting) {
      // Generate a greeting response
      const greetingPrompt = `The customer has sent a greeting. Please provide a friendly response that:
1. Acknowledges their greeting
2. Introduces the consultation process
3. Keeps the tone warm and professional
4. DO NOT introduce yourself with a name
5. DO NOT use phrases like "my name is" or "I am"
6. DO NOT make any assumptions about the customer's needs
7. DO NOT suggest any services not explicitly listed
8. DO NOT GIVE DETAILED SUGGESTIONS

Example good responses:
- "Hello! Welcome to our consultation service. I'm here to help you find the best services for your needs."
- "Hi there! Thank you for reaching out. I'll guide you through our consultation process to better understand your needs."
- "Good morning! Welcome to our service. I'm ready to help you explore our available options."

Customer's greeting: "${answer}"`;

      const greetingResponse = await openai.chat.completions.create({
        model: "gpt-4o",
        temperature: 0.5,
        max_tokens: 500,
        messages: [{ role: "user", content: greetingPrompt }],
      });

      return res.json({
        sessionId,
        messages: [
          {
            type: "greeting",
            content: greetingResponse.choices[0].message.content
          },
          {
            type: "info",
            content: "I'll ask you a few questions to better understand your needs."
          },
          {
            type: "question",
            content: currentQuestion,
            isLastQuestion: session.currentQuestionIndex === session.questions.length - 1
          }
        ]
      });
    }

    // Check if the answer is actually a question about services
    const serviceQuestionKeywords = ['what', 'which', 'tell me about', 'do you offer', 'do you have', 'what kind of', 'what types of', 'what services', 'what treatments'];
    const isServiceQuestion = serviceQuestionKeywords.some(keyword =>
      answer.toLowerCase().includes(keyword)
    );

    if (isServiceQuestion) {
      // Generate a response about available services
      const servicesPrompt = `The customer is asking about our services. Here are our available services:
${session.services.map(s => `- ${s.name}`).join('\n')}

Please provide a friendly response that:
1. Acknowledges their question
2. Lists ONLY the services from the provided list
3. DO NOT suggest any services not in the list
4. DO NOT make assumptions about what services they might need
5. DO NOT provide extra suggestions or recommendations
6. Keep the tone professional and helpful

Customer's question: "${answer}"`;

      const serviceResponse = await openai.chat.completions.create({
        model: "gpt-4o",
        temperature: 0.5,
        max_tokens: 500,
        messages: [{ role: "user", content: servicesPrompt }],
      });

      return res.json({
        sessionId,
        messages: [
          {
            type: "info",
            content: serviceResponse.choices[0].message.content
          },
          {
            type: "question",
            content: currentQuestion,
            isLastQuestion: session.currentQuestionIndex === session.questions.length - 1
          }
        ]
      });
    }

    // Check answer relevance with improved understanding
    const relevancePrompt = `Given the following question and answer, determine if the answer is relevant and appropriate. 
    Consider that answers can be:
    - Simple and direct (yes, no, maybe)
    - Descriptive (providing details or explanations)
    - Negative statements (not interested, don't want)
    - Uncertain (not sure, maybe later)
    - Related to the question's context
    For example:
    - If question is about hair length, answers like "long", "short", "medium", "very long", "not long", "hairs are wrong" are all valid
    - If question is about skin type, answers like "dry", "oily", "normal", "sensitive", "not sure" are all valid
    - If question is about previous treatments, answers like "yes", "no", "never", "sometimes" are all valid

    Important:
    - DO NOT make assumptions about the user's needs
    - DO NOT suggest services not in the provided list
    - DO NOT provide extra recommendations
    
    Question: "${currentQuestion}"
    Answer: "${answer}"
    
    Please provide your response in JSON format with the following fields:
    1. "isRelevant": true/false (be very lenient in determining relevance)
    2. "explanation": brief explanation of why it is/isn't relevant
    3. "suggestion": if not relevant, provide a brief suggestion for what kind of answer would be more appropriate
    4. "friendlyMessage": a friendly, apologetic message explaining that we didn't understand their answer and need more information
    5. "interpretedAnswer": what you think the user meant (if answer is relevant)
    6. "keywords": array of relevant keywords found in the answer`;

    const relevanceCheck = await openai.chat.completions.create({
      model: "gpt-4o",
      temperature: 0.5,
      max_tokens: 500,
      messages: [{ role: "user", content: relevancePrompt }],
      response_format: { type: "json_object" }
    });

    const relevanceResult = JSON.parse(relevanceCheck.choices[0].message.content);

    // Check if the answer contains any service-related keywords
    const serviceKeywords = session.services.map(service =>
      service.name.toLowerCase().split(' ')
    ).flat();

    const hasServiceKeywords = serviceKeywords.some(keyword =>
      answer.toLowerCase().includes(keyword)
    );

    // If the answer contains service keywords, consider it relevant
    if (hasServiceKeywords) {
      relevanceResult.isRelevant = true;
    }

    // Check if the answer indicates user wants to end conversation
    const exitPhrases = [
      'no that\'s it', 'that\'s it', 'thank you', 'thanks', 'let it be', 'end', 'stop', 'bye', 'goodbye',
      'sure', 'okay', 'ok', 'alright', 'fine', 'that\'s all', 'nothing else', 'no more',
      'i\'m done', 'that\'s enough', 'no more questions', 'no further questions',
      'i think that\'s all', 'that should be it', 'that\'s everything'
    ];
    const wantsToEnd = exitPhrases.some(phrase =>
      answer.toLowerCase().includes(phrase)
    );

    if (wantsToEnd) {
      if (!session.askedAboutSpecialist) {
        session.askedAboutSpecialist = true;
        return res.json({
          sessionId,
          needsClarification: true,
          messages: [
            {
              type: "info",
              content: "Would you like to share your details so we can forward your query to our specialists?"
            }
          ],
          nextSteps: [
            "Yes, connect me",
            "No, just browsing"
          ]
        });
      }
    }

    if (!relevanceResult.isRelevant) {
      // First, try to understand and respond to the user's query
      const clarificationPrompt = `Given the following question and answer, and knowing this is a ${businessData.type || ''} company, provide a helpful response that:
      1. Acknowledges the user's query in a positive way
      2. Politely explains that this query is about a different type of service
      3. Offers to forward their query to specialists who can help them better
      4. DO NOT make assumptions about what services they might need
      5. DO NOT suggest any services not in the provided list
      6. DO NOT provide extra recommendations
      
      Question: "${currentQuestion}"
      Answer: "${answer}"
      
      Respond with a JSON object containing:
      1. "response": A friendly, helpful response
      2. "needsSpecialist": true/false
      3. "isCompletelyIrrelevant": true/false (true if the query is completely unrelated to the business type)`;

      const clarificationCheck = await openai.chat.completions.create({
        model: "gpt-4o",
        temperature: 0.5,
        max_tokens: 500,
        messages: [{ role: "user", content: clarificationPrompt }],
        response_format: { type: "json_object" }
      });

      const clarificationResult = JSON.parse(clarificationCheck.choices[0].message.content);

      // If the query is completely irrelevant to the business type
      if (clarificationResult.isCompletelyIrrelevant) {
        // If the user hasn't been asked about specialist consultation yet
        if (!session.askedAboutSpecialist) {
          session.askedAboutSpecialist = true;
          return res.json({
            sessionId,
            needsClarification: true,
            messages: [
              {
                type: "info",
                content: clarificationResult.response
              },
              {
                type: "question",
                content: "Would you like to share your details so we can forward your query to our specialists?",
                isLastQuestion: true
              }
            ],
            nextSteps: [
              "Yes, connect me",
              "No, just browsing"
            ],
          });
        }
      }
      //  else {
      // If the query is somewhat relevant but not exactly matching the current question
      // Continue with the consultation but acknowledge their query
      //   return res.json({
      //     sessionId,
      //     needsClarification: true,
      //     messages: [
      //       {
      //         type: "info",
      //         content: "I understand you're interested in that. Let me ask you a few more questions to better understand your needs."
      //       },
      //       {
      //         type: "question",
      //         content: currentQuestion,
      //         isLastQuestion: session.currentQuestionIndex === session.questions.length - 1
      //       }
      //     ]
      //   });
      // }

      // If user hasn't agreed to specialist consultation yet
      return res.json({
        sessionId,
        needsClarification: true,
        messages: [
          {
            type: "info",
            content: "Would you like to share your details so we can forward your query to our specialists?"
          }
        ],
        askForSpecialist: true
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
        model: "gpt-4o",
        temperature: 0.5,
        max_tokens: 500,
        messages: [{ role: "user", content: prompt }],
      });

      const responseContent = aiResponse.choices[0].message.content;

      // Check if the response contains any services not in the list
      let serviceFound = false;
      for (const service of session.services) {
        const serviceName = service.name.toLowerCase();
        const responseText = responseContent.toLowerCase();

        // Check for exact match or if service name is part of a word
        const isExactMatch = responseText.includes(serviceName);
        // Check if service name is mentioned as part of a phrase
        const isPartOfPhrase = responseText.includes(`${serviceName} `) ||
          responseText.includes(` ${serviceName}`) ||
          responseText.includes(`${serviceName}.`) ||
          responseText.includes(`${serviceName},`);

        const isMatch = isExactMatch || isPartOfPhrase;
        if (isMatch) {
          serviceFound = true;
          break;
        }
      }

      const hasNonListedServices = !serviceFound;

      // If the response doesn't match any services or has specific concerns, ask for specialist
      if (hasNonListedServices) {
        if (!session.askedAboutSpecialist) {
          session.askedAboutSpecialist = true;
          return res.json({
            sessionId,
            needsClarification: true,
            messages: [
              {
                type: "info",
                content: "Based on your responses, I think it would be best to connect you with our specialists for a more detailed consultation. Would you like to share your details?"
              }
            ],
            nextSteps: [
              "Yes, connect me",
              "No, just browsing"
            ]
          });
        }
      }

      // If we have a good response with matching services, show it
      return res.json({
        isComplete: true,
        messages: [
          {
            type: "recommendation",
            content: responseContent
          },
          {
            type: "conclusion",
            content: "Would you like to connect with a specialist for more detailed information about these recommendations?"
          }
        ],
        nextSteps: [
          "Yes, connect me",
          "No, just browsing"
        ]
      });
    }

    // Return next question
    const nextQuestion = session.questions[session.currentQuestionIndex].name;

    res.json({
      sessionId,
      messages: [
        {
          type: "ack",
          content: session.currentQuestionIndex === 1 ? "Got it, thank you!" : "Thank you!"
        },
        {
          type: "question",
          content: nextQuestion,
          isLastQuestion: false
        }
      ],
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

// Add new endpoint to handle user's choice after consultation
openaiRouter.post('/handle-consultation-choice', async (req, res) => {
  try {
    const { sessionId, choice } = req.body;
    const session = activeSessions.get(sessionId);

    if (!session) {
      return res.status(404).json({ error: "Chat session not found" });
    }

    if (choice === "Yes, connect me") {
      // Keep session active and return form fields
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
            name: "consent",
            label: "I consent to being contacted by a specialist",
            type: "checkbox",
            required: true,
            value: false
          }
        ]
      });
    } else {
      // User chose not to connect, mark as declined and delete the session
      session.hasDeclinedDetails = true;
      activeSessions.delete(sessionId);
      return res.json({
        message: "Thank you for your time! Feel free to reach out if you have any questions in the future.",
        sessionEnded: true,
        options: [
          {
            type: "start_new",
            label: "Start New Consultation",
            action: "start_new"
          }
        ]
      });
    }
  } catch (err) {
    console.error("Handle Consultation Choice Error:", err);
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
    res.status(500).json({ error: err.message ?? "Internal server error" });
  }
});

function buildChatPrompt(answers, questions, services) {
  let prompt = `A customer completed a consultation. Here are their responses:\n\n`;

  // Add all answers with their interpreted versions
  answers.forEach((answer, i) => {
    prompt += `Q${i + 1}: ${answer.question}\nA${i + 1}: ${answer.answer}\nInterpreted A${i + 1}: ${answer.interpretedAnswer}\n\n`;
  });

  prompt += `Available Services:\n`;
  services.forEach((s, index) => {
    prompt += `${index + 1}. ${s.name}\n`;
  });

  prompt += `\nImportant Instructions:
1. First, analyze if the customer has any specific concerns or needs:
   - Look for mentions of specific problems, issues, or requirements
   - Check for preferences or desired outcomes
   - Note any allergies or sensitivities mentioned
   - Consider if they're just browsing or have a specific goal

2. If the customer has specific concerns or needs:
   - Match their needs with available services
   - Recommend the most relevant service(s)
   - Explain why each service matches their needs
   - If they have special requirements, suggest specialist consultation

3. If the customer has NO specific concerns (just browsing or general interest):
   - Simply list the available services
   - Keep the response brief and informative
   - Do NOT make specific recommendations
   - Do NOT assume their needs or preferences
   - Example response: "Thank you for your interest! We offer the following services: [list services]. Feel free to let us know if you have any specific needs or questions."

4. Response Format:
   - Start with a friendly acknowledgment
   - If they have specific needs: provide targeted recommendations
   - If they're just browsing: list available services
   - Keep the tone professional and helpful
   - Make sure to mention specific services from the list above

5. Important Rules:
   - Only recommend services from the provided list
   - DO NOT make specific claims about ingredients, methods, or treatments not explicitly mentioned in the service name
   - If the customer has specific concerns (like allergies, sensitivities, or special requirements):
     * Acknowledge their concerns
     * Recommend relevant services from the list
     * Explain that a specialist will provide detailed information about specific ingredients and treatments
     * Encourage them to share their details for a specialist consultation
   - If the customer has NO specific concerns:
     * Simply list the available services
     * Do NOT make assumptions about their needs
     * Do NOT suggest specific treatments
     * Keep the response brief and informative
   - Don't make assumptions about specific details not mentioned
   - If unsure, suggest connecting with specialists
   - Always maintain context from their previous answers
   - Never suggest services that aren't in the list

Based on the customer's responses and available services, provide a personalized recommendation that includes specific services from the list above:`;

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
