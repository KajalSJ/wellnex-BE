import commonHelper from "../helpers/db.common.helper.js";
import businessModel from "../models/business.model.js";
import Subscription from "../models/subscription.model.js";
import createAuditLog from "../helpers/audit.log.helper.js";
import mongoose from "mongoose";
import config from "../configurations/app.config.js";
import Stripe from "stripe";
const stripe = Stripe(config.STRIPE_KEY);

const {
  createOne,
  retrieveOne,
  updateMany,
  updateOne,
  retrieveManyWithPagination,
  retrieveMany,
} = commonHelper;

const createBusiness = async (data) => {
  return await createOne(businessModel, { ...data });
},
  retriveBusiness = async (data) => {
    return await retrieveOne(businessModel, { ...data });
  },
  updateBusiness = async (filter, data,) => {
    return await updateOne(businessModel, { ...filter }, { ...data },);
  },
  updateManyBusiness = async (filter, data) => {
    return await updateMany(businessModel, { ...filter }, { ...data });
  },
  deleteBusiness = async (businessId, adminId, reason) => {
    try {
      // 1. Validate inputs
      if (!businessId || !adminId || !reason) {
        throw new Error("Missing required parameters: businessId, adminId, and reason are required");
      }

      // Validate businessId format
      if (!mongoose.Types.ObjectId.isValid(businessId)) {
        throw new Error("Invalid business ID format");
      }

      // 2. Check if business exists
      const businessExists = await retrieveOne(businessModel, { _id: businessId });
      if (!businessExists) {
        throw new Error("Business not found");
      }

      if (businessExists.isDeleted) {
        throw new Error("Business is already deleted");
      }

      // 3. Soft delete the business
      const deletedBusiness = await businessModel.findByIdAndUpdate(
        businessId,
        {
          isDeleted: true,
          deletedAt: new Date(),
          deletedBy: adminId,
          deletionReason: reason,
          loginToken: null,
          status: 'inactive'
        },
        { new: true }
      ).lean();

      if (!deletedBusiness) {
        throw new Error("Failed to delete business");
      }

      // 4. Cancel all active subscriptions
      const activeSubscriptions = await Subscription.find({
        userId: businessId,
        status: { $in: ['active', 'trialing'] }
      });
      // first delete all subscriptions, then cancel all subscriptions
      const subscriptionResult = await Subscription.deleteMany({ userId: businessId });
      console.log(subscriptionResult, "subscriptionResult");
      for (const subscription of activeSubscriptions) {
        if (!subscription.stripeSubscriptionId.includes('special_')) {
          // Cancel in Stripe
          let cancelResult = await stripe.subscriptions.cancel(subscription.stripeSubscriptionId);
        }
      }


      // 5. Create audit log
      await createAuditLog({
        action: 'BUSINESS_DELETION',
        businessId,
        adminId,
        reason,
        timestamp: new Date(),
        subscriptionCount: subscriptionResult.modifiedCount
      });

      // 6. Send notifications with complete business data
      // const businessData = {
      //   ...businessExists.toObject(),
      //   ...deletedBusiness
      // };

      return {
        status: true,
        message: "Business deleted successfully",
        data: {
          businessId,
          deletedAt: new Date(),
          reason
        }
      };
    } catch (error) {
      console.error("Business deletion error:", {
        businessId,
        adminId,
        error: error.message,
        timestamp: new Date()
      });

      throw new Error(`Failed to delete business: ${error.message}`);
    }
  },
  retrieveAllBusiness = async (filter, sort, limit, offset, select) => {
    return await retrieveManyWithPagination(
      businessModel,
      { ...filter },
      { ...sort },
      limit,
      offset,
      select
    );
  },
  retrieveBusinesss = async (filter, sort, populate) => {
    return await retrieveMany(businessModel, { ...filter }, { ...sort }, populate);
  },
  updateMultipleBusiness = async (filter, data) => {
    return await updateMany(
      businessModel,
      { _id: { $in: [...filter] } },
      { ...data }
    );
  },
  restoreBusiness = async (businessId) => {
    try {
      const restoredBusiness = await businessModel.findByIdAndUpdate(
        businessId,
        {
          isDeleted: false,
          deletedAt: null,
          deletedBy: null,
          deletionReason: null
        },
        { new: true }
      );

      if (!restoredBusiness) {
        throw new Error("Business not found");
      }

      return {
        status: true,
        message: "Business restored successfully",
        data: restoredBusiness
      };
    } catch (error) {
      throw new Error(error.message);
    }
  };

const businessService = {
  createBusiness,
  retriveBusiness,
  updateBusiness,
  deleteBusiness,
  restoreBusiness,
  retrieveAllBusiness,
  retrieveBusinesss,
  updateMultipleBusiness,
  updateManyBusiness
};

export {
  createBusiness,
  retriveBusiness,
  updateBusiness,
  deleteBusiness,
  restoreBusiness,
  retrieveAllBusiness,
  retrieveBusinesss,
  updateMultipleBusiness,
  updateManyBusiness
};

export default businessService;
