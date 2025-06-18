import responseHelper from "../helpers/response.helper.js";
import __dirname from "../configurations/dir.config.js";
import validator from "../configurations/validation.config.js";
import signupValidator from "../validators/signup.validator.js";
import signinValidator from "../validators/signin.validator.js";
import helpers from "../helpers/index.helper.js";
import bcrypt from "bcrypt";
import moment from "moment-timezone";
import awsEmailExternal from "../externals/send.email.external.js";
import forgotPasswordValidator from "../validators/forgot.password.validator.js";
import businessService from "../services/business.service.js";
import jwtMiddleware from "../middlewares/jwt.middleware.js";
import upload from "../middlewares/upload.middleware.js";
import path from 'path';
import fs from 'fs';
import config from "../configurations/app.config.js";
import businessModel from "../models/business.model.js";
import adminService from "../services/admin.service.js";
import { cancelSubscription, cancelSubscriptionImmediately, getActiveSubscriptionDetails, pauseSubscription, resumeSubscription, updateSubscriptionStatusHandler } from "../services/subscription.service.js";
import Subscription from "../models/subscription.model.js";
import Stripe from "stripe";

const { send200, send401, send400 } = responseHelper,
    { createBusiness, updateBusiness, retriveBusiness } = businessService,
    { validationThrowsError } = validator,
    { sendingMail } = awsEmailExternal,
    { generateToken, verifyToken } = helpers,
    { verifyToken: jwtAuthGuard } = jwtMiddleware,
    { updateAdmin, retriveAdmin } = adminService;

const businessSignup = [
    signupValidator.name,
    signupValidator.email,
    signupValidator.password,
    signupValidator.mobile,
    async (req, res) => {
        const errors = validationThrowsError(req);
        if (errors.length)
            return send400(res, {
                status: false,
                message: errors[0]?.msg,
                data: null,
            });
        else {
            const {
                body: { email, password, name, contact_name, website_url, instagram_url, mobile },
            } = req;
            try {
                let existingAdmin = await retriveAdmin({
                    email: email.toLowerCase(),
                });
                if (existingAdmin) {
                    return send400(res, {
                        status: false,
                        message: "Email already exist",
                        data: null,
                    });
                }
                let existingBusiness = await retriveBusiness({
                    email: email.toLowerCase(),
                });
                if (existingBusiness) {
                    return send400(res, {
                        status: false,
                        message: "Email already exist",
                        data: null,
                    });
                } else {
                    let create_Business = await createBusiness({
                        hash: password,
                        name,
                        password: await bcrypt.hash(password, await bcrypt.genSalt(10)),
                        email: email.toLowerCase(),
                        contact_name, website_url, instagram_url,
                        mobile,
                    });
                    let update_Business = await updateBusiness(
                        {
                            _id: create_Business._id,
                        },
                        {
                            loginToken: generateToken({
                                _id: create_Business._id,
                                firstName: create_Business.name,
                                email: create_Business.email.toLowerCase(),
                                roles: create_Business.roles[0],
                                createdAt: create_Business.createdAt,
                                updatedAt: create_Business.updatedAt,
                            }),
                            loginTime: new Date(moment().utc()),
                            nextStep: 'step-1',
                        }
                    );

                    // Send welcome email
                    const loginLink = `${config.APP_URL}/signin`;
                    await sendingMail({
                        email: create_Business.email,
                        sub: "Welcome to WellnexAI! Your Dashboard Awaits",
                        text: `Hi ${create_Business.name},\n\nWelcome to WellnexAI, your new 24/7 AI-powered assistant for client consultations.\n\nYou can now log in, personalize your chatbot, and begin turning website visitors into leads.\n\nStart Here: ${loginLink}\n\nNeed help? Reply to this email or visit our Help Center.\n\nLet's scale your brand — together.\n\n— The WellnexAI Team`,
                        html: `
                            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                                <h2 style="color: #333;">Welcome to WellnexAI! Your Dashboard Awaits</h2>
                                <p>Hi ${create_Business.name},</p>
                                <p>Welcome to WellnexAI, your new 24/7 AI-powered assistant for client consultations.</p>
                                <p>You can now log in, personalize your chatbot, and begin turning website visitors into leads.</p>
                                <p><a href="${loginLink}" style="display: inline-block; padding: 10px 20px; background-color: #007bff; color: white; text-decoration: none; border-radius: 5px;">Start Here</a></p>
                                <p>Need help? Reply to this email or visit our Help Center.</p>
                                <p>Let's scale your brand — together.</p>
                                <p>— The WellnexAI Team</p>
                            </div>
                        `
                    });

                    send200(res, {
                        status: true,
                        message: "Register successfully",
                        data: update_Business,
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
    },
],
    businessSignin = [
        signinValidator.email,
        signinValidator.password,
        async (req, res) => {
            const errors = validationThrowsError(req);
            if (errors.length)
                return send400(res, {
                    status: false,
                    message: errors[0]?.msg,
                    data: null,
                });
            else {
                const {
                    body: { email, password },
                } = req;
                try {

                    let existingBusiness = await retriveBusiness({
                        email: email.toLowerCase(),
                    });
                    if (!existingBusiness) {
                        let existingAdmin = await retriveAdmin({
                            email: email.toLowerCase(),
                        });
                        if (!existingAdmin) {
                            return send400(res, {
                                status: false,
                                message: "Email not registered",
                                data: null,
                            });
                        } else {
                            if (!(await bcrypt.compare(password, existingAdmin.password)))
                                return send400(res, {
                                    status: false,
                                    message: "Invalid password",
                                    data: null,
                                });
                            else {
                                let update_Admin = await updateAdmin(
                                    {
                                        _id: existingAdmin._id,
                                    },
                                    {
                                        loginToken: generateToken({
                                            _id: existingAdmin._id,
                                            firstName: existingAdmin.name,
                                            email: existingAdmin.email.toLowerCase(),
                                            roles: existingAdmin.roles[0],
                                            createdAt: existingAdmin.createdAt,
                                            updatedAt: existingAdmin.updatedAt,
                                        }),
                                        loginTime: new Date(moment().utc()),
                                    }
                                );
                                send200(res, {
                                    status: true,
                                    message: "Admin Login Successfully",
                                    data: update_Admin,
                                });
                            }
                        }
                    } else {
                        if (!(await bcrypt.compare(password, existingBusiness.password)))
                            return send400(res, {
                                status: false,
                                message: "Invalid password",
                                data: null,
                            });
                        // else if (existingBusiness.nextStep !== '')
                        //     return send400(res, {
                        //         status: false,
                        //         message: "Please complete the onboarding process",
                        //         data: { nextStep: existingBusiness.nextStep },
                        //     });
                        // else if (!existingBusiness.isEmailVerified)
                        //     return send400(res, {
                        //         status: false,
                        //         message: "Email not verified",
                        //         data: null,
                        //     });
                        else {
                            // check if this business have valid subscription
                            // First try to find an active subscription for today
                            let subscription = await Subscription.findOne({
                                userId: existingBusiness._id,
                                status: { $in: ['active', 'trialing', 'canceled', 'paused'] },
                                currentPeriodStart: { $lt: new Date() },
                                currentPeriodEnd: { $gt: new Date() }
                            }).sort({ createdAt: 1 });

                            // If no active subscription found, look for a valid special offer
                            if (!subscription) {
                                subscription = await Subscription.findOne({
                                    userId: existingBusiness._id,
                                    status: { $in: ['active', 'trialing', 'canceled', 'paused'] },
                                    specialOfferExpiry: { $gt: new Date() }
                                }).sort({ createdAt: 1 });
                            }

                            let update_Business = await updateBusiness(
                                {
                                    _id: existingBusiness._id,
                                },
                                {
                                    loginToken: generateToken({
                                        _id: existingBusiness._id,
                                        firstName: existingBusiness.name,
                                        email: existingBusiness.email.toLowerCase(),
                                        roles: existingBusiness.roles[0],
                                        createdAt: existingBusiness.createdAt,
                                        updatedAt: existingBusiness.updatedAt,
                                    }),
                                    loginTime: new Date(moment().utc()),
                                }
                            );
                            send200(res, {
                                status: true,
                                message: "Business Login Successfully",
                                data: {
                                    ...update_Business._doc,
                                    subscription
                                },
                            });
                        }
                    }
                } catch (err) {
                    send401(res, {
                        status: false,
                        message: err.message,
                        data: null,
                    });
                }
            }
        },
    ],
    forgotPassword = [
        forgotPasswordValidator.email,
        async (req, res) => {
            const errors = validationThrowsError(req);
            if (errors.length)
                return send400(res, {
                    status: false,
                    message: errors[0]?.msg,
                    data: null,
                });
            else {
                const {
                    body: { email },
                } = req;
                try {
                    let existingBusiness = await retriveBusiness({
                        email: email.toLowerCase(),
                    });
                    if (!existingBusiness) {
                        return send400(res, {
                            status: false,
                            message: "Email not registered",
                            data: null,
                        });
                    } else {
                        // Generate reset token
                        const resetToken = generateToken({
                            _id: existingBusiness._id,
                            email: existingBusiness.email.toLowerCase(),
                            type: 'password_reset'
                        });

                        // Create reset password link
                        const resetLink = `${config.APP_URL}/reset-password?token=${resetToken}`;

                        // Send reset password email
                        await sendingMail({
                            email: existingBusiness.email,
                            sub: "Reset Your WellnexAI Password",
                            text: `Hi ${existingBusiness.name},\n\nWe received a request to reset your password. Click the link below to reset your password:\n\n${resetLink}\n\nThis link will expire in 1 hour.\n\nIf you didn't request this, please ignore this email.\n\nBest regards,\nThe WellnexAI Team`,
                            html: `
                                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                                    <h2 style="color: #333;">Reset Your WellnexAI Password</h2>
                                    <p>Hi ${existingBusiness.name},</p>
                                    <p>We received a request to reset your password. Click the link below to reset your password:</p>
                                    <p><a href="${resetLink}" style="display: inline-block; padding: 10px 20px; background-color: #007bff; color: white; text-decoration: none; border-radius: 5px;">Reset Password</a></p>
                                    <p>This link will expire in 1 hour.</p>
                                    <p>If you didn't request this, please ignore this email.</p>
                                    <p>Best regards,<br>The WellnexAI Team</p>
                                </div>
                            `
                        });

                        // Store reset token in database
                        let update_Business = await updateBusiness(
                            {
                                _id: existingBusiness._id,
                            },
                            {
                                resetPasswordToken: resetToken,
                                resetPasswordExpires: new Date(Date.now() + 3600000) // Token expires in 1 hour
                            }
                        );

                        send200(res, {
                            status: true,
                            message: "Password reset instructions have been sent to your email",
                            data: null,
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
        }
    ],
    resetPassword = [
        async (req, res) => {
            const errors = validationThrowsError(req);
            if (errors.length)
                return send400(res, {
                    status: false,
                    message: errors[0]?.msg,
                    data: null,
                });
            else {
                const {
                    body: { token, password },
                } = req;
                try {
                    // Verify token
                    const decoded = await verifyToken(token);

                    if (!decoded || decoded.sub.type !== 'password_reset') {
                        return send400(res, {
                            status: false,
                            message: "Invalid or expired reset token",
                            data: null,
                        });
                    }
                    let existingBusiness1 = await retriveBusiness({
                        _id: decoded.sub._id,
                        resetPasswordToken: token,
                    });
                    let existingBusiness2 = await retriveBusiness({
                        _id: decoded.sub._id,
                    });

                    let existingBusiness = await retriveBusiness({
                        _id: decoded.sub._id,
                        resetPasswordExpires: { $gt: new Date(Date.now()) }
                    });

                    if (!existingBusiness) {
                        return send400(res, {
                            status: false,
                            message: "Invalid or expired reset token",
                            data: null,
                        });
                    }

                    // Update password and clear reset token
                    let update_Business = await updateBusiness(
                        {
                            _id: existingBusiness._id,
                        },
                        {
                            resetPasswordToken: null,
                            resetPasswordExpires: null,
                            password: await bcrypt.hash(password, await bcrypt.genSalt(10)),
                        }
                    );

                    // Send confirmation email
                    await sendingMail({
                        email: existingBusiness.email,
                        sub: "Your WellnexAI Password Has Been Reset",
                        text: `Hi ${existingBusiness.name},\n\nYour password has been successfully reset.\n\nIf you didn't make this change, please contact our support team immediately.\n\nBest regards,\nThe WellnexAI Team`,
                        html: `
                            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                                <h2 style="color: #333;">Your WellnexAI Password Has Been Reset</h2>
                                <p>Hi ${existingBusiness.name},</p>
                                <p>Your password has been successfully reset.</p>
                                <p>If you didn't make this change, please contact our support team immediately.</p>
                                <p>Best regards,<br>The WellnexAI Team</p>
                            </div>
                        `
                    });

                    send200(res, {
                        status: true,
                        message: "Password has been reset successfully",
                        data: null,
                    });
                } catch (err) {
                    send401(res, {
                        status: false,
                        message: err.message,
                        data: null,
                    });
                }
            }
        }
    ],
    logoutBusiness = [
        jwtAuthGuard,
        async (req, res) => {
            if (!req.body) {
                return send400(res, {
                    status: false,
                    message: "No data found",
                    data: null,
                });
            }
            const errors = validationThrowsError(req);
            if (errors.length) {
                return send400(res, {
                    status: false,
                    message: errors[0]?.msg,
                    data: null,
                });
            } else {
                const {
                    user: { _id: businessId },
                } = req;
                try {
                    let existingBusiness = await retriveBusiness({
                        _id: businessId,
                    });
                    if (!existingBusiness) {
                        let existingAdmin = await retriveAdmin({
                            _id: businessId,
                        });
                        if (!existingAdmin) {
                            return send400(res, {
                                status: false,
                                message: "Email not registered",
                                data: null,
                            });
                        } else {
                            await updateAdmin(
                                {
                                    _id: existingAdmin._id,
                                },
                                {
                                    loginToken: null,
                                }
                            );
                            send200(res, {
                                status: true,
                                message: "Logout successfully",
                                data: null,
                            });
                        }
                    } else {
                        await updateBusiness(
                            {
                                _id: existingBusiness._id,
                            },
                            {
                                loginToken: null,
                            }
                        )
                        return send200(res, {
                            status: true,
                            message: "Logout successfully",
                            data: null,
                        });
                    }
                } catch (err) {
                    return send401(res, {
                        status: false,
                        message: err.message,
                        data: null,
                    });
                }
            }
        }
    ],
    uploadBusinessLogo = [
        jwtAuthGuard,
        upload.single("logo"),
        async (req, res) => {
            const errors = validationThrowsError(req);
            if (errors.length)
                return send400(res, {
                    status: false,
                    message: errors[0]?.msg,
                    data: null,
                });
            else {
                const {
                    body: { businessId },
                } = req;
                try {
                    let existingBusiness = await retriveBusiness({
                        _id: businessId,
                    });
                    if (!existingBusiness) {
                        return send400(res, {
                            status: false,
                            message: "Email not registered",
                            data: null,
                        });
                    } else {
                        if (existingBusiness.logo) {
                            const filePath = path.join(__dirname, '../uploads/business-logos/', existingBusiness.logo);
                            if (fs.existsSync(filePath)) {
                                fs.unlinkSync(filePath);
                            }
                        }
                        let update_Business = await updateBusiness(
                            {
                                _id: existingBusiness._id,
                            },
                            {
                                logo: req?.file?.filename,
                                nextStep: 'step-2',
                            }
                        )
                        send200(res, {
                            status: true,
                            message: "Logo has been updated successfully",
                            data: update_Business,
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
        }
    ],
    setBusinessThemeColor = [
        jwtAuthGuard,
        async (req, res) => {
            const errors = validationThrowsError(req);
            if (errors.length)
                return send400(res, {
                    status: false,
                    message: errors[0]?.msg,
                    data: null,
                });
            else {
                const {
                    body: { businessId },
                } = req;
                try {
                    let existingBusiness = await retriveBusiness({
                        _id: businessId,
                    });
                    if (!existingBusiness) {
                        return send400(res, {
                            status: false,
                            message: "Email not registered",
                            data: null,
                        });
                    } else {
                        await updateBusiness(
                            {
                                _id: existingBusiness._id,
                            },
                            {
                                themeColor: req.body.themeColor,
                                nextStep: 'step-3',
                            }
                        )
                        send200(res, {
                            status: true,
                            message: "Theme color has been updated successfully",
                            data: {
                                themeColor: req.body.themeColor,
                                nextStep: 'step-3',
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
        }
    ],
    addBusinessKeywords = [
        jwtAuthGuard,
        async (req, res) => {
            const errors = validationThrowsError(req);
            if (errors.length)
                return send400(res, {
                    status: false,
                    message: errors[0]?.msg,
                    data: null,
                });
            else {
                const {
                    body: { keywords, businessId },
                } = req;
                // Validate keywords array
                if (!keywords || !Array.isArray(keywords)) {
                    return send400(res, {
                        status: false,
                        message: "Keywords must be an array",
                        data: null,
                    });
                }

                // Validate each keyword has a name
                for (const keyword of keywords) {
                    if (!keyword.name || typeof keyword.name !== 'string') {
                        return send400(res, {
                            status: false,
                            message: "Each keyword must have a name property",
                            data: null,
                        });
                    }
                }

                try {
                    let existingBusiness = await retriveBusiness({
                        _id: businessId,
                    });
                    if (!existingBusiness) {
                        return send400(res, {
                            status: false,
                            message: "Email not registered",
                            data: null,
                        });
                    } else {
                        // Filter out keywords that already exist
                        const existingKeywordNames = existingBusiness.keywords.map(k => k.name.toLowerCase());
                        const newKeywords = keywords.filter(keyword =>
                            !existingKeywordNames.includes(keyword.name.toLowerCase())
                        );
                        if (newKeywords.length === 0) {
                            return send400(res, {
                                status: false,
                                message: "Keyword already exist",
                                data: existingBusiness.keywords,
                            });
                        }
                        const update_Business = await updateBusiness(
                            {
                                _id: existingBusiness._id,
                            },
                            {
                                $addToSet: { keywords: { $each: newKeywords } },
                                nextStep: 'step-4',
                            }
                        )
                        send200(res, {
                            status: true,
                            message: "Business keywords updated successfully",
                            data: { keywords: update_Business.keywords, nextStep: 'step-4' },
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
        }
    ],
    sendVerificationEmail = [
        jwtAuthGuard,
        async (req, res) => {
            const errors = validationThrowsError(req);
            if (errors.length)
                return send400(res, {
                    status: false,
                    message: errors[0]?.msg,
                    data: null,
                });
            else {
                const {
                    user: { _id: businessId },
                } = req;
                try {
                    let existingBusiness = await retriveBusiness({
                        _id: businessId,
                    });
                    if (!existingBusiness) {
                        return send400(res, {
                            status: false,
                            message: "Email not registered",
                            data: null,
                        });
                    } else {
                        let verificationToken = await generateToken({
                            id: existingBusiness._id,
                            email: existingBusiness.email,
                        });
                        let verifyLink = `${config.APP_URL}/verifyEmail/${existingBusiness._id}?token=${verificationToken}`;
                        await sendingMail({
                            email: existingBusiness.email,
                            sub: "Verify your email to access WellnexAI!",
                            text: `Hi ${existingBusiness.name},\n\nWelcome to WellnexAI, your new 24/7 AI-powered assistant for client consultations.\n\nPlease click on the link below to verify your email.\n\n— The WellnexAI Team`,
                            html: `
                                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                                    <h2 style="color: #333;">Welcome to WellnexAI! Your Dashboard Awaits</h2>
                                    <p>Hi ${existingBusiness.name},</p>
                                    <p>Welcome to WellnexAI, your new 24/7 AI-powered assistant for client consultations.</p>
                                    <p>Please click on the link below to verify your email.</p>
                                    <p><a href="${verifyLink}" style="display: inline-block; padding: 10px 20px; background-color: #007bff; color: white; text-decoration: none; border-radius: 5px;">Verify Email</a></p>
                                    <p>Need help? Reply to this email or visit our Help Center.</p>
                                    <p>Let's scale your brand — together.</p>
                                    <p>— The WellnexAI Team</p>
                                </div>
                            `
                        })
                        await updateBusiness(
                            {
                                _id: existingBusiness._id,
                            },
                            {
                                isEmailVerified: false,
                            }
                        )
                        send200(res, {
                            status: true,
                            message: "Verification email has been sent successfully",
                            data: null,
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
        }
    ],
    verifyEmailByLink = [
        async (req, res) => {
            const errors = validationThrowsError(req);
            if (errors.length)
                return send400(res, {
                    status: false,
                    message: errors[0]?.msg,
                    data: null,
                });
            else {
                try {
                    const result = await verifyToken(req.body.verificationToken);
                    if (result?.sub?.id == req.body._id) {
                        let existingBusiness = await retriveBusiness({
                            _id: req.body._id,
                        });
                        if (!existingBusiness) {
                            return send400(res, {
                                status: false,
                                message: "Email not registered",
                                data: null,
                            });
                        }
                        await updateBusiness(
                            {
                                _id: existingBusiness._id,
                            },
                            {
                                isEmailVerified: true,
                                nextStep: '',
                            }
                        )

                        return send200(res, {
                            status: true,
                            message: "Email has been verified successfully",
                            data: null,
                        });
                    } else {
                        return send400(res, {
                            status: false,
                            message: "Invalid verification token",
                            data: null,
                        });
                    }
                } catch (err) {
                    return send401(res, {
                        status: false,
                        message: err.message,
                        data: null,
                    });
                }
            }
        }
    ],
    checkEmailVerified = [
        jwtAuthGuard,
        async (req, res) => {
            const {
                user: { _id: businessId },
            } = req;
            try {
                let existingBusiness = await retriveBusiness({
                    _id: businessId,
                });
                if (!existingBusiness) {
                    return send400(res, {
                        status: false,
                        message: "Email not registered",
                        data: null,
                    });
                } else {
                    send200(res, {
                        status: true,
                        message: existingBusiness.isEmailVerified ? "Email verified" : "Email not verified",
                        data: { isEmailVerified: existingBusiness.isEmailVerified },
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
    ],
    updateBusinessDetail = [
        jwtAuthGuard,
        upload.single("logo"),
        async (req, res) => {
            const errors = validationThrowsError(req);
            if (errors.length)
                return send400(res, {
                    status: false,
                    message: errors[0]?.msg,
                    data: null,
                });
            else {
                const {
                    body: { businessId },
                } = req;
                try {
                    let existingBusiness = await retriveBusiness({
                        _id: businessId,
                    });
                    let responseMessage = "";
                    if (!existingBusiness) {
                        return send400(res, {
                            status: false,
                            message: "Email not registered",
                            data: null,
                        });
                    } else {
                        if (req?.file?.filename) {
                            if (existingBusiness.logo) {
                                const filePath = path.join(__dirname, '../uploads/business-logos/', existingBusiness.logo);
                                if (fs.existsSync(filePath)) {
                                    fs.unlinkSync(filePath);
                                }
                            }
                            await updateBusiness(
                                {
                                    _id: existingBusiness._id,
                                },
                                {
                                    logo: req?.file?.filename,
                                }
                            )
                        }
                        // First try to find an active subscription for today
                        let subscription = await Subscription.findOne({
                            userId: existingBusiness._id,
                            status: { $in: ['active', 'trialing', 'canceled', 'paused'] },
                            currentPeriodStart: { $lt: new Date() },
                            currentPeriodEnd: { $gt: new Date() }
                        }).sort({ createdAt: 1 });

                        // If no active subscription found, look for a valid special offer
                        if (!subscription) {
                            subscription = await Subscription.findOne({
                                userId: existingBusiness._id,
                                status: { $in: ['active', 'trialing', 'canceled', 'paused'] },
                                specialOfferExpiry: { $gt: new Date() }
                            }).sort({ createdAt: 1 });
                        }

                        if (subscription) {
                            console.log(subscription.status, "subscription.status", req.body.subscriptionStatus);
                            // check if subscription in canceled or it will be canceled at period end
                            if (subscription.status === 'canceled') {
                                responseMessage = "Business details updated successfully but subscription status cannot be updated for canceled subscriptions";
                            } else if ((req.body.subscriptionStatus && req.body.subscriptionStatus !== subscription.status)
                                || (subscription.status === 'active' && subscription.cancelAtPeriodEnd && req.body.subscriptionStatus === 'active')) {
                                await updateSubscriptionStatusHandler(subscription.stripeSubscriptionId, req.body.subscriptionStatus);
                                responseMessage = "Business details and subscription status updated successfully";
                            } else {
                                responseMessage = "Business details updated successfully";
                            }
                        } else {
                            responseMessage = "Business details updated successfully but no active subscription found";
                        }
                        const update_Business = await updateBusiness(
                            {
                                _id: existingBusiness._id,
                            },
                            {
                                ...req.body,
                            }
                        );
                        send200(res, {
                            status: true,
                            message: responseMessage,
                            data: update_Business,
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
        }
    ],
    getBusinessDetail = [
        jwtAuthGuard,
        async (req, res) => {
            const {
                body: { businessId },
            } = req;
            try {
                let existingBusiness = await retriveBusiness({
                    _id: businessId,
                });
                if (!existingBusiness) {
                    return send400(res, {
                        status: false,
                        message: "Email not registered",
                        data: null,
                    });
                } else {
                    // GET SUBSCRIPTION DETAIL
                    const subscriptionDetail = await getActiveSubscriptionDetails(existingBusiness._id);

                    send200(res, {
                        status: true,
                        message: "Business details fetched successfully",
                        data: { ...existingBusiness._doc, subscriptionDetail },
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
    ],
    getKeywords = [
        jwtAuthGuard,
        async (req, res) => {
            const {
                body: { businessId },
            } = req;
            try {
                let existingBusiness = await retriveBusiness({
                    _id: businessId,
                });
                if (!existingBusiness) {
                    return send400(res, {
                        status: false,
                        message: "Email not registered",
                        data: null,
                    });
                } else {
                    send200(res, {
                        status: true,
                        message: "Business keywords fetched successfully",
                        data: existingBusiness.keywords,
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
    ],
    updateOneKeyWord = [
        jwtAuthGuard,
        async (req, res) => {
            const errors = validationThrowsError(req);
            if (errors.length)
                return send400(res, {
                    status: false,
                    message: errors[0]?.msg,
                    data: null,
                });
            else {
                const {
                    body: { keywords, businessId },
                } = req;

                try {
                    let existingBusiness = await retriveBusiness({
                        _id: businessId,
                    });
                    if (!existingBusiness) {
                        return send400(res, {
                            status: false,
                            message: "Business not found",
                            data: null,
                        });
                    } else {
                        const keywordIndex = existingBusiness.keywords.findIndex(
                            (keyword) => keyword._id.toString() === keywords._id
                        );

                        if (keywordIndex === -1) {
                            return send400(res, {
                                status: false,
                                message: "Keyword not found",
                                data: null,
                            });
                        } else {
                            existingBusiness.keywords[keywordIndex] = {
                                ...existingBusiness.keywords[keywordIndex],
                                ...keywords,
                            };
                            await existingBusiness.save();
                            send200(res, {
                                status: true,
                                message: "Keyword updated successfully",
                                data: existingBusiness.keywords[keywordIndex],
                            });
                        }
                    }
                } catch (err) {
                    send401(res, {
                        status: false,
                        message: err.message,
                        data: null,
                    });
                }

            }
        }
    ],

    addBusinessServices = [
        jwtAuthGuard,
        async (req, res) => {
            const errors = validationThrowsError(req);
            if (errors.length)
                return send400(res, {
                    status: false,
                    message: errors[0]?.msg,
                    data: null,
                });
            else {
                const {
                    body: { services, businessId },
                } = req;

                // Validate services array
                if (!services || !Array.isArray(services)) {
                    return send400(res, {
                        status: false,
                        message: "Services must be an array",
                        data: null,
                    });
                }

                // Validate each service has a name
                for (const service of services) {
                    if (!service.name || typeof service.name !== 'string') {
                        return send400(res, {
                            status: false,
                            message: "Each service must have a name property",
                            data: null,
                        });
                    }
                }

                try {
                    let existingBusiness = await retriveBusiness({
                        _id: businessId,
                    });
                    if (!existingBusiness) {
                        return send400(res, {
                            status: false,
                            message: "Business not found",
                            data: null,
                        });
                    } else {
                        // Filter out services that already exist
                        const existingServiceNames = existingBusiness.services.map(s => s.name.toLowerCase());
                        const newServices = services.filter(service =>
                            !existingServiceNames.includes(service.name.toLowerCase())
                        );

                        if (newServices.length === 0) {
                            return send400(res, {
                                status: false,
                                message: "Service already exist",
                                data: existingBusiness.services,
                            });
                        }

                        const update_Business = await updateBusiness(
                            {
                                _id: existingBusiness._id,
                            },
                            {
                                $addToSet: { services: { $each: newServices } },
                                nextStep: 'step-5',
                            }
                        )
                        send200(res, {
                            status: true,
                            message: "Business services updated successfully",
                            data: { services: update_Business.services, nextStep: 'step-5' },
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
        }
    ],

    getServicesList = [
        jwtAuthGuard,
        async (req, res) => {
            const {
                body: { businessId },
            } = req;
            try {
                let existingBusiness = await retriveBusiness({
                    _id: businessId,
                });
                if (!existingBusiness) {
                    return send400(res, {
                        status: false,
                        message: "Business not found",
                        data: null,
                    });
                } else {
                    send200(res, {
                        status: true,
                        message: "Business services fetched successfully",
                        data: existingBusiness.services,
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
    ],

    updateOneService = [
        jwtAuthGuard,
        async (req, res) => {
            const errors = validationThrowsError(req);
            if (errors.length)
                return send400(res, {
                    status: false,
                    message: errors[0]?.msg,
                    data: null,
                });
            else {
                const {
                    body: { service, businessId },
                } = req;

                try {
                    let existingBusiness = await retriveBusiness({
                        _id: businessId,
                    });
                    if (!existingBusiness) {
                        return send400(res, {
                            status: false,
                            message: "Business not found",
                            data: null,
                        });
                    } else {
                        const serviceIndex = existingBusiness.services.findIndex(
                            (ser) => ser._id.toString() === service._id
                        );

                        if (serviceIndex === -1) {
                            return send400(res, {
                                status: false,
                                message: "Service not found",
                                data: null,
                            });
                        } else {
                            existingBusiness.services[serviceIndex] = {
                                ...existingBusiness.services[serviceIndex],
                                ...service
                            };
                            await existingBusiness.save();
                            send200(res, {
                                status: true,
                                message: "Service updated successfully",
                                data: existingBusiness.services[serviceIndex],
                            });
                        }
                    }
                } catch (err) {
                    send401(res, {
                        status: false,
                        message: err.message,
                        data: null,
                    });
                }
            }
        }
    ],

    deleteService = [
        jwtAuthGuard,
        async (req, res) => {
            const {
                body: { serviceId, businessId },
            } = req;

            try {
                let existingBusiness = await retriveBusiness({
                    _id: businessId,
                });
                if (!existingBusiness) {
                    return send400(res, {
                        status: false,
                        message: "Business not found",
                        data: null,
                    });
                } else {
                    const serviceIndex = existingBusiness.services.findIndex(
                        (ser) => ser._id.toString() === serviceId
                    );
                    if (serviceIndex === -1) {
                        return send400(res, {
                            status: false,
                            message: "Service not found",
                            data: null,
                        });
                    } else {
                        existingBusiness.services.splice(serviceIndex, 1);
                        await existingBusiness.save();
                        send200(res, {
                            status: true,
                            message: "Service deleted successfully",
                            data: existingBusiness.services,
                        });
                    }
                }
            } catch (err) {
                send401(res, {
                    status: false,
                    message: err.message,
                    data: null,
                });
            }
        }
    ],

    deleteKeyword = [
        jwtAuthGuard,
        async (req, res) => {
            const {
                body: { keywordId, businessId },
            } = req;

            try {
                let existingBusiness = await retriveBusiness({
                    _id: businessId,
                });
                if (!existingBusiness) {
                    return send400(res, {
                        status: false,
                        message: "Business not found",
                        data: null,
                    });
                } else {
                    const keywordIndex = existingBusiness.keywords.findIndex(
                        (keyword) => keyword._id.toString() === keywordId
                    );
                    if (keywordIndex === -1) {
                        return send400(res, {
                            status: false,
                            message: "Keyword not found",
                            data: null,
                        });
                    } else {
                        existingBusiness.keywords.splice(keywordIndex, 1);
                        await existingBusiness.save();
                        send200(res, {
                            status: true,
                            message: "Keyword deleted successfully",
                            data: existingBusiness.keywords,
                        });
                    }
                }
            } catch (err) {
                send401(res, {
                    status: false,
                    message: err.message,
                    data: null,
                });
            }
        }
    ],
    deleteAllKeywords = [
        jwtAuthGuard,
        async (req, res) => {
            const {
                body: { businessId },
            } = req;
            try {
                let existingBusiness = await retriveBusiness({
                    _id: businessId,
                });
                if (!existingBusiness) {
                    return send400(res, {
                        status: false,
                        message: "Business not found",
                        data: null,
                    });
                } else {
                    existingBusiness.keywords = [];
                    await existingBusiness.save();
                    send200(res, {
                        status: true,
                        message: "Keywords deleted successfully",
                        data: existingBusiness.keywords,
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
    ],

    addBusinessQuestions = [
        jwtAuthGuard,
        async (req, res) => {
            const errors = validationThrowsError(req);
            if (errors.length)
                return send400(res, {
                    status: false,
                    message: errors[0]?.msg,
                    data: null,
                });
            else {
                const {
                    body: { questions, businessId },
                } = req;
                // Validate questions array
                if (!questions || !Array.isArray(questions)) {
                    return send400(res, {
                        status: false,
                        message: "Questions must be an array",
                        data: null,
                    });
                }

                // Validate each question has required properties
                for (const question of questions) {
                    if (!question.name || typeof question.name !== 'string') {
                        return send400(res, {
                            status: false,
                            message: "Each question must have a name property",
                            data: null,
                        });
                    }
                }

                try {
                    let existingBusiness = await retriveBusiness({
                        _id: businessId,
                    });
                    if (!existingBusiness) {
                        return send400(res, {
                            status: false,
                            message: "Business not found",
                            data: null,
                        });
                    } else {
                        // Filter out questions that already exist
                        const existingQuestionTexts = existingBusiness.questions.map(q => q.name.toLowerCase());
                        const newQuestions = questions.filter(question =>
                            !existingQuestionTexts.includes(question.name.toLowerCase())
                        );

                        if (newQuestions.length === 0) {
                            return send400(res, {
                                status: false,
                                message: "Question already exist",
                                data: existingBusiness.questions,
                            });
                        }

                        const update_Business = await updateBusiness(
                            {
                                _id: existingBusiness._id,
                            },
                            {
                                $addToSet: { questions: { $each: newQuestions } }, nextStep: 'step-6'
                            }
                        )
                        send200(res, {
                            status: true,
                            message: "Business questions updated successfully",
                            data: { questions: update_Business.questions, nextStep: 'step-6' },
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
        }
    ],

    getQuestions = [
        jwtAuthGuard,
        async (req, res) => {
            const {
                body: { businessId },
            } = req;
            try {
                let existingBusiness = await retriveBusiness({
                    _id: businessId,
                });
                if (!existingBusiness) {
                    return send400(res, {
                        status: false,
                        message: "Business not found",
                        data: null,
                    });
                } else {
                    send200(res, {
                        status: true,
                        message: "Business questions fetched successfully",
                        data: existingBusiness.questions,
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
    ],

    updateOneQuestion = [
        jwtAuthGuard,
        async (req, res) => {
            const errors = validationThrowsError(req);
            if (errors.length)
                return send400(res, {
                    status: false,
                    message: errors[0]?.msg,
                    data: null,
                });
            else {
                const {
                    body: { questions, businessId },
                } = req;

                try {
                    let existingBusiness = await retriveBusiness({
                        _id: businessId,
                    });
                    if (!existingBusiness) {
                        return send400(res, {
                            status: false,
                            message: "Business not found",
                            data: null,
                        });
                    } else {
                        const questionIndex = existingBusiness.questions.findIndex(
                            (question) => question._id.toString() === questions._id
                        );

                        if (questionIndex === -1) {
                            return send400(res, {
                                status: false,
                                message: "Question not found",
                                data: null,
                            });
                        } else {
                            existingBusiness.questions[questionIndex] = {
                                ...existingBusiness.questions[questionIndex],
                                ...questions
                            };
                            await existingBusiness.save();
                            send200(res, {
                                status: true,
                                message: "Question updated successfully",
                                data: existingBusiness.questions[questionIndex],
                            });
                        }
                    }
                } catch (err) {
                    send401(res, {
                        status: false,
                        message: err.message,
                        data: null,
                    });
                }
            }
        }
    ],

    deleteQuestion = [
        jwtAuthGuard,
        async (req, res) => {
            const {
                body: { questionId, businessId },
            } = req;

            try {
                let existingBusiness = await retriveBusiness({
                    _id: businessId,
                });
                if (!existingBusiness) {
                    return send400(res, {
                        status: false,
                        message: "Business not found",
                        data: null,
                    });
                } else {
                    const questionIndex = existingBusiness.questions.findIndex(
                        (question) => question._id.toString() === questionId
                    );
                    if (questionIndex === -1) {
                        return send400(res, {
                            status: false,
                            message: "Question not found",
                            data: null,
                        });
                    } else {
                        existingBusiness.questions.splice(questionIndex, 1);
                        await existingBusiness.save();
                        send200(res, {
                            status: true,
                            message: "Question deleted successfully",
                            data: existingBusiness.questions,
                        });
                    }
                }
            } catch (err) {
                send401(res, {
                    status: false,
                    message: err.message,
                    data: null,
                });
            }
        }
    ],

    deleteAllQuestions = [
        jwtAuthGuard,
        async (req, res) => {
            const {
                body: { businessId },
            } = req;
            try {
                let existingBusiness = await retriveBusiness({
                    _id: businessId,
                });
                if (!existingBusiness) {
                    return send400(res, {
                        status: false,
                        message: "Business not found",
                        data: null,
                    });
                } else {
                    existingBusiness.questions = [];
                    await existingBusiness.save();
                    send200(res, {
                        status: true,
                        message: "Questions deleted successfully",
                        data: existingBusiness.questions,
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
    ],
    // not in use
    setupChatbot = [
        // jwtAuthGuard,
        async (req, res) => {
            try {
                const { questions, keywords, services } = req.body;
                const businessId = req.params.businessId;

                // First get the business to ensure we have the correct ID
                const existingBusiness = await businessModel.findById(businessId);
                if (!existingBusiness) {
                    return res.status(404).json({ error: "Business not found" });
                }

                const business = await businessModel.findByIdAndUpdate(
                    businessId,
                    {
                        questions,
                        keywords,
                        services,
                    },
                    { new: true, upsert: true }
                );

                // Send embed code email
                const embedCode = `&lt;script src="https://embed.wellnexai.com/chatbot.js" data-business-id="${existingBusiness._id}"&gt;&lt;/script&gt;`;

                await sendingMail({
                    email: existingBusiness.email,
                    sub: "Your WellnexAI chatbot code is ready",
                    text: `Hi ${existingBusiness.name},\n\nYour chatbot is live!\n\nHere's your unique chatbot embed code — copy and paste it into your site:\n\n${embedCode}\n\nWhere to place it: before the closing </body> tag\n\nNeed help? Visit our support portal or reply to this email.\n\nLet's convert more visitors into bookings!\n\n– The WellnexAI Team`,
                    html: `
                        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                            <h2 style="color: #333;">Your WellnexAI chatbot code is ready</h2>
                            <p>Hi ${existingBusiness.name},</p>
                            <p>Your chatbot is live!</p>
                            <p>Here's your unique chatbot embed code — copy and paste it into your site:</p>
                            <div style="background-color: #f5f5f5; padding: 15px; border-radius: 5px; margin: 20px 0;">
                                <code style="font-family: monospace; word-break: break-all;">${embedCode}</code>
                            </div>
                            <p><strong>Where to place it:</strong> before the closing &lt;/body&gt; tag</p>
                            <p>Need help? Visit our support portal or reply to this email.</p>
                            <p>Let's convert more visitors into bookings!</p>
                            <p>– The WellnexAI Team</p>
                        </div>
                    `,
                    attachments: [{
                        filename: 'How_to_Install.pdf',
                        path: path.join(__dirname, '../public/How_to_Install.pdf')
                    }]
                });

                res.json({ message: "Chatbot config saved successfully", business });
            } catch (err) {
                console.error("Setup Chatbot Error:", err);
                res.status(500).json({ error: "Internal server error" });
            }
        }
    ],
    getBusinessEmail = [
        jwtAuthGuard,
        async (req, res) => {
            const {
                body: { businessId },
            } = req;
            try {
                let existingBusiness = await retriveBusiness({
                    _id: businessId,
                });
                if (!existingBusiness) {
                    return send400(res, {
                        status: false,
                        message: "Business not found",
                        data: null,
                    });
                } else {
                    send200(res, {
                        status: true,
                        message: "Business email fetched successfully",
                        data: {
                            email: existingBusiness.email
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
    ],
    businessDomain = {
        businessSignup,
        businessSignin,
        forgotPassword,
        resetPassword,
        logoutBusiness,
        uploadBusinessLogo,
        setBusinessThemeColor,
        sendVerificationEmail,
        verifyEmailByLink,
        checkEmailVerified,
        updateBusinessDetail,
        getBusinessDetail,
        addBusinessKeywords,
        updateOneKeyWord,
        addBusinessServices,
        updateOneService,
        getServicesList,
        deleteService,
        getKeywords,
        deleteKeyword,
        deleteAllKeywords,
        addBusinessQuestions,
        getQuestions,
        updateOneQuestion,
        deleteQuestion,
        deleteAllQuestions,
        setupChatbot,
        getBusinessEmail,
    };

export default businessDomain;
