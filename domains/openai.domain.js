import { OpenAI } from "openai";
import businessService from "../services/business.service.js";
import responseHelper from "../helpers/response.helper.js";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const { retriveBusiness } = businessService,
    { send200, send401, send400 } = responseHelper;

export async function generateServiceRecommendation(prompt) {
    const res = await openai.chat.completions.create({
        model: "o4-mini",
        messages: [{ role: "user", content: prompt }],
    });

    return res.choices[0].message.content;
}
export const handleChatbotFlow = async (req, res) => {
    const { answers, businessId } = req.body;

    const business = await retriveBusiness({ _id: businessId });
    if (business) {
        const services = business?.keywords?.map((k) => k.name);

        const prompt = buildChatPrompt(answers, services);

        const suggestion = await generateServiceRecommendation(prompt);

        return res.json({ suggestion });
    };
    res.json({ message: "Business not found" });
}
export function buildChatPrompt(answers, services) {
    let prompt = `You are an AI consultant for a company. A client just completed a mini consultation. Here are their responses:\n\n`;

    answers.forEach((answer, index) => {
        prompt += `Q${index + 1}: ${answer}\n`;
    });

    prompt += `\nThe business offers the following services/products:\n`;
    prompt += services.map((s) => `- ${s}`).join("\n");

    prompt += `\n\nBased on the responses above and the available services, suggest the most suitable option for the client. Keep the answer simple, helpful, and tailored. I cllient asked invalid questions, please ignore them and continue with the next question by saying please give valid answer.`;

    return prompt;
}

export const sendLeadEmail = async (to, leadData, chatTranscript) => {
    const data = {
        from: '"Wellnex AI" <no-reply@wellnexai.com>',
        to,
        subject: "New Lead Captured from Chatbot",
        html: `<h2>New Client Lead</h2><p>${leadData.name}, ${leadData.email}, ${leadData.phone}</p><pre>${chatTranscript}</pre>`,
    }
};
export const getChatBotDetail = async (req, res) => {
    const {
        body: { businessId },
    } = req;
    try {
        let existingBusiness = await retriveBusiness({
            _id: businessId,
        });
        if (!existingBusiness) {
            send400(res, {
                status: false,
                message: "Email not registered",
                data: null,
            });
        } else {
            send200(res, {
                status: true,
                message: "Business details fetched successfully",
                data: {
                    name: existingBusiness.name,
                    website_url: existingBusiness.website_url,
                    logo: existingBusiness.logo,
                    themeColor: existingBusiness.themeColor,
                },
            });
        }
    } catch (err) {
        send401(res, {
            status: false,
            message: err.message,
            data: null,
        });
    }
}
