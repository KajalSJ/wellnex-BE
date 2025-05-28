import nodemailer from "nodemailer";
import config from "../configurations/app.config.js";

const { EMAIL_USER, EMAIL_PASS } = config;

// Create transporter object
const transporter = nodemailer.createTransport({
  service: "gmail", // `host` is not needed when using a service like Gmail
  port: 465,
  secure: true,
  auth: {
    user: EMAIL_USER,
    pass: EMAIL_PASS,
  },
});

// Sending mail function
const sendingMail = ({ sub, text, html, email, attachments }) => {
  const msg = {
    from: EMAIL_USER,
    to: email,
    subject: sub,
    text: text,
    html: html,
    // attachments: attachments,
  };
  return new Promise((resolve, reject) => {
    transporter.sendMail(msg, (err, data) => {
      console.log("Mail sent successfully.", data, err);
      if (err) {
        console.error("Error sending email:", err.message);
        return reject(err.message);
      }
      resolve({ msg: "Mail sent successfully.", data });
    });
  });
};
           
// Receiving mail function
const recivingMail = ({ sub, text, html, email }) => {
  const msg = {
    from: email,
    to: EMAIL_USER,
    subject: sub,
    text: text,
    html: html,
  };
  return new Promise((resolve, reject) => {
    transporter.sendMail(msg, (err, data) => {
      if (err) {
        console.error("Error receiving email:", err.message);
        return reject(err.message);
      }
      resolve({ msg: "Mail received successfully.", data });
    });
  });
};

// Exporting the functions
const awsEmailExternal = { sendingMail, recivingMail };
export default awsEmailExternal;
