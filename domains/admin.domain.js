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
import { getAllActiveSubscriptions, getSubscriptionCountsHandler, getPaymentListHandler, updateSubscriptionStatusHandler, getActiveSubscriptionDetails, getLatestSubscriptionStatusCounts } from "../services/subscription.service.js";
import Subscription from "../models/subscription.model.js";

const { send200, send401, send400 } = responseHelper,
  { createAdmin, updateAdmin, retriveAdmin } = adminService,
  { validationThrowsError } = validator,
  { sendingMail } = awsEmailExternal,
  { verifyAdminToken: jwtAuthGuard } = jwtMiddleware,
  { generateToken, } = helpers,
  { retrieveAllBusiness, retriveBusiness } = businessService,
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
        // Build filter object
        const filter = {
          // isDeleted: { $ne: true } // Exclude deleted businesses
        };

        // Add search filter if search parameter exists
        if (req.query.search) {
          filter.$or = [
            { name: { $regex: req.query.search, $options: 'i' } },
            { email: { $regex: req.query.search, $options: 'i' } },
            { contact_name: { $regex: req.query.search, $options: 'i' } }
          ];
        }

        // Build sort object
        const sort = {};
        if (req.query.sort && req.query.sort_order) {
          sort[req.query.sort] = Number(req.query.sort_order);
        } else {
          sort.createdAt = -1; // Default sort by creation date
        }

        // Parse pagination parameters
        const limit = parseInt(req.query.limit) || 10;
        const offset = parseInt(req.query.skip) || 0;

        // Fields to select
        const select = [
          'name',
          'email',
          'contact_name',
          '_id',
          'logo',
          'website_url',
          'instagram_url',
          'themeColor',
          'keywords',
          'services',
          'questions',
          'isEmailVerified',
          'createdAt',
          'status'
        ];

        const businessList = await retrieveAllBusiness(filter, sort, limit, offset, select);

        if (!businessList) {
          return send400(res, {
            status: false,
            message: "Failed to fetch business list",
            data: null
          });
        }

        // Get subscription details for each business
        const businessesWithSubscriptions = await Promise.all(
          businessList.docs.map(async (business) => {
            // First try to find an active subscription for today
            let subscriptionDetail = await Subscription.findOne({
              userId: business._id,
              status: { $in: ['active', 'trialing', 'canceled', 'paused'] },
              currentPeriodStart: { $lt: new Date() },
            }).sort({ createdAt: -1 });

            return {
              ...business._doc,
              subscriptionDetail
            };
          })
        );

        send200(res, {
          status: true,
          message: "Business List",
          data: {
            businesses: businessesWithSubscriptions,
            totalDocs: businessList.totalDocs,
            offset: businessList.offset,
            limit: businessList.limit,
            totalPages: businessList.totalPages,
            page: businessList.page,
            pagingCounter: businessList.pagingCounter,
            hasPrevPage: businessList.hasPrevPage,
            hasNextPage: businessList.hasNextPage,
            prevPage: businessList.prevPage,
            nextPage: businessList.nextPage
          }
        });
      } catch (err) {
        console.error('Error in getBusinessList:', err);
        send401(res, {
          status: false,
          message: err.message || "Failed to fetch business list",
          data: null
        });
      }
    }
  ],
  getBusinessDetail = [
    jwtAuthGuard,
    async (req, res) => {
      try {
        const {
          body: { businessId },
        } = req;
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
    },
  ],
  getActiveSubscriptions = [
    jwtAuthGuard,
    async (req, res) => {
      try {
        const filter = { /* your filter object */ };
        const sort = { [req.query.sort]: Number(req.query.sort_order) }; // sort order
        const limit = parseInt(req.query.limit) || 10; // number of records to return
        const offset = parseInt(req.query.skip) || 0; // starting index of records to return

        let subscriptions = await getAllActiveSubscriptions(filter, sort, limit, offset);
        send200(res, {
          status: true,
          message: "Active Subscriptions List",
          data: subscriptions,
        });
      } catch (err) {
        send401(res, {
          status: false,
          message: err.message,
          data: null,
        });
      }
    },
  ],
  getSubscriptionCounts = [
    jwtAuthGuard,
    async (req, res) => {
      try {
        const counts = await getLatestSubscriptionStatusCounts();
        send200(res, {
          status: true,
          message: "Subscription Counts",
          data: counts,
        });
      } catch (err) {
        send401(res, {
          status: false,
          message: err.message,
          data: null,
        });
      }
    },
  ],
  updateSubscriptionStatus = [
    jwtAuthGuard,
    async (req, res) => {
      try {
        const { subscriptionId, status } = req.body;

        if (!subscriptionId || !status) {
          return send400(res, {
            status: false,
            message: "Subscription ID and status are required",
            data: null
          });
        }

        const updatedSubscription = await updateSubscriptionStatusHandler(subscriptionId, status);
        send200(res, {
          status: true,
          message: "Subscription status updated successfully",
          data: updatedSubscription
        });
      } catch (err) {
        send401(res, {
          status: false,
          message: err.message,
          data: null
        });
      }
    }
  ],
  getPaymentList = [
    jwtAuthGuard,
    async (req, res) => {
      try {
        const filter = {};

        // Add date range filter if provided
        if (req.query.startDate && req.query.endDate) {
          filter.created = {
            gte: Math.floor(new Date(req.query.startDate).getTime() / 1000),
            lte: Math.floor(new Date(req.query.endDate).getTime() / 1000)
          };
        }

        // Add status filter if provided
        if (req.query.status) {
          filter.status = req.query.status;
        }

        const limit = parseInt(req.query.limit) || 10;
        const offset = parseInt(req.query.skip) || 0;

        const payments = await getPaymentListHandler(filter, limit, offset);
        send200(res, {
          status: true,
          message: "Payment List",
          data: payments,
        });
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
    getActiveSubscriptions,
    getSubscriptionCounts,
    getPaymentList,
    updateSubscriptionStatus
  };

export default adminDomain;
