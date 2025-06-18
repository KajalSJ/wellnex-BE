import contactUs from "../models/contactUs.js";
import awsEmailExternal from "../externals/send.email.external.js";
import adminService from "./admin.service.js";

const { sendingMail } = awsEmailExternal;

export const createContactSubmission = async (data) => {
    try {
        const contactSubmission = new contactUs(data);
        await contactSubmission.save();

        const filter = {};
        const sort = { createdAt: -1 };
        const select = ['email'];
        // Send email to admin
        await sendingMail({
            email: 'support@wellnexai.com',
            sub: 'New Contact Form Submission - WellnexAI',
            text: `Hi Admin,\n\nA new contact form submission has been received on WellnexAI.\n\nDetails:\nName: ${data.name}\nEmail: ${data.email}\nPhone: ${data.phoneNumber}\nMessage: ${data.message}\nAccepted Terms: ${data.acceptTerms ? 'Yes' : 'No'}\nSubmitted At: ${new Date().toLocaleString()}\n\nPlease respond to this inquiry at your earliest convenience.\n\nBest regards,\nThe WellnexAI Team`,
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                    <div style="text-align: center; margin-bottom: 30px;">
                        <h1 style="color: #333; margin-bottom: 10px;">New Contact Form Submission</h1>
                        <p style="color: #666; font-size: 16px;">WellnexAI Contact Form</p>
                    </div>
                    
                    <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
                        <h2 style="color: #333; margin-bottom: 15px;">Contact Details</h2>
                        <p style="margin: 10px 0;"><strong>Name:</strong> ${data.name}</p>
                        <p style="margin: 10px 0;"><strong>Email:</strong> ${data.email}</p>
                        <p style="margin: 10px 0;"><strong>Phone Number:</strong> ${data.phoneNumber}</p>
                        <p style="margin: 10px 0;"><strong>Message:</strong> ${data.message}</p>
                        <p style="margin: 10px 0;"><strong>Accepted Terms:</strong> ${data.acceptTerms ? 'Yes' : 'No'}</p>
                        <p style="margin: 10px 0;"><strong>Submitted At:</strong> ${new Date().toLocaleString()}</p>
                    </div>

                    <div style="text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee;">
                        <p style="color: #666; margin-bottom: 10px;">Please respond to this inquiry at your earliest convenience.</p>
                        <p style="color: #666; margin-bottom: 5px;">Best regards,</p>
                        <p style="color: #333; font-weight: bold;">The WellnexAI Team</p>
                    </div>

                    <div style="text-align: center; margin-top: 30px; font-size: 12px; color: #999;">
                        <p>This is an automated message from WellnexAI. Please do not reply to this email.</p>
                        <p>For support, please contact <a href="mailto:support@wellnexai.com" style="color: #007bff; text-decoration: none;">support@wellnexai.com</a></p>
                    </div>
                </div>
            `
        });
        return contactSubmission;
    } catch (error) {
        throw error;
    }
}

// Get all contact form submissions
export const getAllSubmissions = async () => {
    try {
        return await contactUs.find().sort({ createdAt: -1 });
    } catch (error) {
        throw error;
    }
}

