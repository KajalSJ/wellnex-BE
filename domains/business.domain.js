import responseHelper from "../helpers/response.helper.js";
import ConstHelper from "../helpers/message.helper.js";
import __dirname from "../configurations/dir.config.js";
import validator from "../configurations/validation.config.js";
import signupValidator from "../validators/signup.validator.js";
import signinValidator from "../validators/signin.validator.js";
import helpers from "../helpers/index.helper.js";
import bcrypt from "bcrypt";
import moment from "moment-timezone";
import awsEmailExternal from "../externals/send.email.external.js";
import forgotPasswordValidator from "../validators/forgot.password.validator.js";
import resetPasswordValidator from "../validators/reset.password.validator.js";
import businessService from "../services/business.service.js";
import jwtMiddleware from "../middlewares/jwt.middleware.js";
import upload from "../middlewares/upload.middleware.js";
import path from 'path';
import fs from 'fs';

const { send200, send401, send400 } = responseHelper,
    { createBusiness, updateBusiness, retriveBusiness } = businessService,
    { validationThrowsError } = validator,
    { sendingMail } = awsEmailExternal,
    { generateToken, verifyToken } = helpers,
    { verifyToken: jwtAuthGuard } = jwtMiddleware,
    {
        MESSAGES: { JWT_EXPIRED_ERR },
    } = ConstHelper;

const businessSignup = [
    signupValidator.name,
    signupValidator.email,
    signupValidator.password,
    async (req, res) => {
        const errors = validationThrowsError(req);
        if (errors.length)
            send400(res, {
                status: false,
                message: errors[0]?.msg,
                data: null,
            });
        else {
            const {
                body: { email, password, name, contact_name, website_url, instagram_url },
            } = req;
            try {
                let existingBusiness = await retriveBusiness({
                    email: email.toLowerCase(),
                });
                if (existingBusiness) {
                    send400(res, {
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
                    });
                    send200(res, {
                        status: true,
                        message: "Register successfully",
                        data: create_Business,
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
                send400(res, {
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
                        send400(res, {
                            status: false,
                            message: "Email not registered",
                            data: null,
                        });
                    } else {
                        if (!(await bcrypt.compare(password, existingBusiness.password)))
                            send400(res, {
                                status: false,
                                message: "Invalid password",
                                data: null,
                            });
                        else if (!existingBusiness.isEmailVerified)
                            send400(res, {
                                status: false,
                                message: "Email not verified",
                                data: null,
                            });
                        else {
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
                                data: update_Business,
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
                send400(res, {
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
                        send400(res, {
                            status: false,
                            message: "Email not registered",
                            data: null,
                        });
                    } else {
                        let update_Business = await updateBusiness(
                            {
                                _id: existingBusiness._id,
                            },
                            {
                                resetPasswordToken: generateToken({
                                    _id: existingBusiness._id,
                                    firstName: existingBusiness.name,
                                    email: existingBusiness.email.toLowerCase(),
                                    roles: existingBusiness.roles[0],
                                    createdAt: existingBusiness.createdAt,
                                    updatedAt: existingBusiness.updatedAt,
                                }),
                            }
                        )
                        send200(res, {
                            status: true,
                            message: "Reset Password link has been sent to your email",
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
    resetPassword = [
        async (req, res) => {
            const errors = validationThrowsError(req);
            if (errors.length)
                send400(res, {
                    status: false,
                    message: errors[0]?.msg,
                    data: null,
                });
            else {
                const {
                    body: { email, token, password },
                } = req;
                try {

                    let existingBusiness = await retriveBusiness({
                        email: email.toLowerCase(),
                    });
                    if (!existingBusiness) {
                        send400(res, {
                            status: false,
                            message: "Email not registered",
                            data: null,
                        });
                    } else {
                        if (existingBusiness.resetPasswordToken != token) {
                            send400(res, {
                                status: false,
                                message: "Invalid Token",
                                data: null,
                            });
                        } else {
                            let update_Business = await updateBusiness(
                                {
                                    _id: existingBusiness._id,
                                },
                                {
                                    resetPasswordToken: null,
                                    password: await bcrypt.hash(password, 10),
                                }
                            )
                            send200(res, {
                                status: true,
                                message: "Password has been reset successfully",
                                data: update_Business,
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
                        return send400(res, {
                            status: false,
                            message: "Email not registered",
                            data: null,
                        });
                    } else {
                        let update_Business = await updateBusiness(
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
                            data: update_Business,
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
                send400(res, {
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
                        send400(res, {
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
                send400(res, {
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
                        send400(res, {
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
                            }
                        )
                        send200(res, {
                            status: true,
                            message: "Theme color has been updated successfully",
                            data: {
                                themeColor: req.body.themeColor,
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
                send400(res, {
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
                        send400(res, {
                            status: false,
                            message: "Email not registered",
                            data: null,
                        });
                    } else {
                        const update_Business = await updateBusiness(
                            {
                                _id: existingBusiness._id,
                            },
                            {
                                $addToSet: { keywords: { $each: keywords } }
                            }
                        )
                        send200(res, {
                            status: true,
                            message: "Business keywords updated successfully",
                            data: { keywords: update_Business.keywords },
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
                send400(res, {
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
                        send400(res, {
                            status: false,
                            message: "Email not registered",
                            data: null,
                        });
                    } else {
                        let verificationToken = await generateToken({
                            id: existingBusiness._id,
                            email: existingBusiness.email,
                        });
                        await sendingMail({
                            email: existingBusiness.email,
                            sub: "Verify your email",
                            text: "Verify your email",
                            html: `<p>Verify your email by clicking on the link below</p><a href="http://localhost:3000/verifyEmail/${existingBusiness._id}?token=${verificationToken}">Verify email</a>`,
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
                send400(res, {
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
    updateBusinessDetail = [
        jwtAuthGuard,
        upload.single("logo"),
        async (req, res) => {
            const errors = validationThrowsError(req);
            if (errors.length)
                send400(res, {
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
                        send400(res, {
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
                        const update_Business = await updateBusiness(
                            {
                                _id: existingBusiness._id,
                            },
                            {
                                ...req.body,
                            })
                        send200(res, {
                            status: true,
                            message: "Business details updated successfully",
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
                    send400(res, {
                        status: false,
                        message: "Email not registered",
                        data: null,
                    });
                } else {
                    send200(res, {
                        status: true,
                        message: "Business details fetched successfully",
                        data: existingBusiness,
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
                    send400(res, {
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
                send400(res, {
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
                        send400(res, {
                            status: false,
                            message: "Business not found",
                            data: null,
                        });
                    } else {
                        const keywordIndex = existingBusiness.keywords.findIndex(
                            (keyword) => keyword._id.toString() === keywords._id
                        );
                        console.log(keywordIndex, existingBusiness.keywords);

                        if (keywordIndex === -1) {
                            send400(res, {
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
                    send400(res, {
                        status: false,
                        message: "Business not found",
                        data: null,
                    });
                } else {
                    const keywordIndex = existingBusiness.keywords.findIndex(
                        (keyword) => keyword._id.toString() === keywordId
                    );
                    if (keywordIndex === -1) {
                        send400(res, {
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
                    send400(res, {
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
        updateBusinessDetail,
        getBusinessDetail,
        addBusinessKeywords,
        updateOneKeyWord,
        getKeywords,
        deleteKeyword,
        deleteAllKeywords,
    };

export default businessDomain;
