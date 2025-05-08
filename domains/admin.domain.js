import responseHelper from "../helpers/response.helper.js";
import ConstHelper from "../helpers/message.helper.js";
import __dirname from "../configurations/dir.config.js";
import validator from "../configurations/validation.config.js";
import adminService from "../services/admin.service.js";
import signupValidator from "../validators/signup.validator.js";
import signinValidator from "../validators/signin.validator.js";
import helpers from "../helpers/index.helper.js";
import bcrypt from "bcrypt";
import moment from "moment-timezone";
import awsEmailExternal from "../externals/send.email.external.js";
import jwtMiddleware from "../middlewares/jwt.middleware.js";
import businessService from "../services/business.service.js";
import upload from "../middlewares/upload.middleware.js";

const { send200, send401, send400 } = responseHelper,
  { createAdmin, updateAdmin, retriveAdmin } = adminService,
  { validationThrowsError } = validator,
  { sendingMail } = awsEmailExternal,
  { verifyToken: jwtAuthGuard } = jwtMiddleware,
  { generateToken, daysBetweenTwoDates } = helpers,
  { retrieveAllBusiness } = businessService,
  {
    MESSAGES: { JWT_EXPIRED_ERR },
  } = ConstHelper;

const adminSignup = [
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
        body: { email, password, name },
      } = req;
      try {
        let existingAdmin = await retriveAdmin({
          email: email.toLowerCase(),
        });
        if (existingAdmin) {
          send400(res, {
            status: false,
            message: "Email already exist",
            data: null,
          });
        } else {
          let create_Admin = await createAdmin({
            hash: password,
            name,
            password: await bcrypt.hash(password, await bcrypt.genSalt(10)),
            email: email.toLowerCase(),
          });
          send200(res, {
            status: true,
            message: "Register successfully",
            data: create_Admin,
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
  adminSignin = [
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
          let existingAdmin = await retriveAdmin({
            email: email.toLowerCase(),
          });
          if (!existingAdmin) {
            send400(res, {
              status: false,
              message: "Email not registered",
              data: null,
            });
          } else {
            if (!(await bcrypt.compare(password, existingAdmin.password)))
              send400(res, {
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
  getBusinessList = [
    jwtAuthGuard,
    async (req, res) => {
      try {
        const filter = { /* your filter object */ };
        const sort = { [req.query.sort]: Number(req.query.sort_order) }; // sort order
        const limit = req.query.limit; // number of records to return
        const offset = req.query.skip; // starting index of records to return
        const select = ['name', 'email', 'contact_name', '_id', 'logo', "website_url", "instagram_url", "themeColor", "keywords", "isEmailVerified"]; // fields to include in the response

        let businessList = await retrieveAllBusiness(filter, sort, limit, offset, select);
        send200(res, {
          status: true,
          message: "Business List",
          data: businessList,
        });
      } catch (err) {
        send401(res, {
          status: false,
          message: err.message,
          data: null,
        });
      }
    }],
  getBusinessDetail = [
    jwtAuthGuard,
    async (req, res) => {
      try {
        const {
          params: { _id },
          user: { _id: businessId },
        } = req;
        let existingAdmin = await retriveAdmin({
          _id: businessId
        });
        if (!existingAdmin) {
          send400(res, {
            status: false,
            message: "Email not registered",
            data: null,
          });
        } else {
          const filter = { _id };
          const sort = {}; // sort order
          const limit = 1; // number of records to return
          const offset = 0; // starting index of records to return
          const select = ['name', 'email', 'contact_name', '_id', 'logo', "website_url", "instagram_url", "themeColor", "keywords", "isEmailVerified"]; // fields to include in the response
          let businessDetail = await retrieveAllBusiness(filter, sort, limit, offset, select);
          send200(res, {
            status: true,
            message: "Business Detail",
            data: businessDetail,
          });
        }
      } catch (err) {
        send401(res, {
          status: false,
          message: err.message,
          data: null,
        });
      }
    },
  ],
  adminDomain = {
    adminSignup,
    adminSignin,
    getBusinessList,
    getBusinessDetail,
  };

export default adminDomain;
