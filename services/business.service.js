import commonHelper from "../helpers/db.common.helper.js";
import businessModel from "../models/business.model.js";

const {
  createOne,
  retrieveOne,
  updateMany,
  updateOne,
  deleteOne,
  retrieveManyWithPagination,
  retrieveMany,
} = commonHelper;

const createBusiness = async (data) => {
    return await createOne(businessModel, { ...data });
  },
  retriveBusiness = async (data) => {
    return await retrieveOne(businessModel, { ...data });
  },
  updateBusiness = async (filter, data, ) => {
    return await updateOne(businessModel, { ...filter }, { ...data }, );
  },
  updateManyBusiness = async (filter, data) => {
    return await updateMany(businessModel, { ...filter }, { ...data });
  },
  deleteBusiness = async (_id) => {
    return await deleteOne(businessModel, { _id });
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
  businessService = {
    updateMultipleBusiness,
    createBusiness,
    retriveBusiness,
    updateBusiness,
    deleteBusiness,
    retrieveAllBusiness,
    retrieveBusinesss,
    updateManyBusiness,
  };
export default businessService;
