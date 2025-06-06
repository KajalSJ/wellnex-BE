import responseHelper from "../helpers/response.helper.js";
import awsEmailExternal from "../externals/send.email.external.js";
import Career from "../models/career.model.js";
import config from "../configurations/app.config.js";
import path from "path";
import adminService from "../services/admin.service.js";

const { send200, send400, send401 } = responseHelper;
const { sendingMail } = awsEmailExternal;

export const submitApplication = async (req, res) => {
  try {
    const { name, email, phone, position } = req.body;
    const resumeFile = req.file;

    if (!resumeFile) {
      return send400(res, {
        status: false,
        message: "Resume file is required",
        data: null,
      });
    }

    const application = await Career.create({
      name,
      email,
      phone,
      position,
      resume: resumeFile.filename, // Store only the filename
    });
    const filter = {};
    const sort = { createdAt: -1 };
    const select = ['email'];
    const admins = await adminService.retrieveAdmins(filter, sort, select);
    admins.forEach(async (admin) => {
      // Send email to admin
      await sendingMail({
        email: admin.email,
        sub: "New Career Application Received - WellnexAI",
        text: `Hi Admin,\n\nA new career application has been received on WellnexAI.\n\nDetails:\nName: ${name}\nEmail: ${email}\nPhone: ${phone}\nPosition: ${position}\nSubmitted At: ${new Date().toLocaleString()}\n\nPlease review the application in the admin dashboard.\n\nBest regards,\nThe WellnexAI Team`,
        html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333;">New Career Application Received</h2>
          <p>Hi Admin,</p>
          <p>A new career application has been received on WellnexAI.</p>
          <div style="background-color: #f8f9fa; padding: 15px; border-radius: 5px; margin: 20px 0;">
            <p style="margin: 5px 0;"><strong>Name:</strong> ${name}</p>
            <p style="margin: 5px 0;"><strong>Email:</strong> ${email}</p>
            <p style="margin: 5px 0;"><strong>Phone:</strong> ${phone}</p>
            <p style="margin: 5px 0;"><strong>Position:</strong> ${position}</p>
            <p style="margin: 5px 0;"><strong>Submitted At:</strong> ${new Date().toLocaleString()}</p>
          </div>
          <p>Please review the application in the admin dashboard.</p>
          <p>Best regards,<br>The WellnexAI Team</p>
        </div>
      `,
        attachments: [{
          filename: resumeFile.originalname,
          path: resumeFile.path
        }]
      });
    });
    send200(res, {
      status: true,
      message: "Application submitted successfully",
      data: application,
    });
  } catch (err) {
    send401(res, {
      status: false,
      message: err.message,
      data: null,
    });
  }
};

export const getAllApplications = async (req, res) => {
  try {
    const applications = await Career.find().sort({ createdAt: -1 });

    send200(res, {
      status: true,
      message: "Applications fetched successfully",
      data: applications,
    });
  } catch (err) {
    send401(res, {
      status: false,
      message: err.message,
      data: null,
    });
  }
};

export const getApplicationById = async (req, res) => {
  try {
    const application = await Career.findById(req.params.id);

    if (!application) {
      return send400(res, {
        status: false,
        message: "Application not found",
        data: null,
      });
    }

    send200(res, {
      status: true,
      message: "Application fetched successfully",
      data: application,
    });
  } catch (err) {
    send401(res, {
      status: false,
      message: err.message,
      data: null,
    });
  }
};

export const updateApplicationStatus = async (req, res) => {
  try {
    const { status } = req.body;

    const application = await Career.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true, runValidators: true }
    );

    if (!application) {
      return send400(res, {
        status: false,
        message: "Application not found",
        data: null,
      });
    }

    // Send email to applicant about status update
    await sendingMail({
      email: application.email,
      sub: `Your Application Status Update - WellnexAI`,
      text: `Hi ${application.name},\n\nYour application for the position of ${application.position} has been ${status}.\n\nWe will contact you if we need any further information.\n\nBest regards,\nThe WellnexAI Team`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333;">Application Status Update</h2>
          <p>Hi ${application.name},</p>
          <p>Your application for the position of <strong>${application.position}</strong> has been <strong>${status}</strong>.</p>
          <p>We will contact you if we need any further information.</p>
          <p>Best regards,<br>The WellnexAI Team</p>
        </div>
      `,
    });

    send200(res, {
      status: true,
      message: "Application status updated successfully",
      data: application,
    });
  } catch (err) {
    send401(res, {
      status: false,
      message: err.message,
      data: null,
    });
  }
};

export default {
  submitApplication,
  getAllApplications,
  getApplicationById,
  updateApplicationStatus,
}; 