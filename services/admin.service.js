import commonHelper from "../helpers/db.common.helper.js";
import adminModel from "../models/admin.model.js";

const {
  createOne,
  retrieveOne,
  updateMany,
  updateOne,
  deleteOne,
  retrieveManyWithPagination,
  retrieveMany,
} = commonHelper;

const createAdmin = async (data) => {
    return await createOne(adminModel, { ...data });
  },
  retriveAdmin = async (data) => {
    return await retrieveOne(adminModel, { ...data });
  },
  updateAdmin = async (filter, data, ) => {
    return await updateOne(adminModel, { ...filter }, { ...data }, );
  },
  updateManyAdmin = async (filter, data) => {
    return await updateMany(adminModel, { ...filter }, { ...data });
  },
  deleteAdmin = async (_id) => {
    return await deleteOne(adminModel, { _id });
  },
  retrieveAllAdmin = async (filter, sort, limit, offset, select) => {
    return await retrieveManyWithPagination(
      adminModel,
      { ...filter },
      { ...sort },
      limit,
      offset,
      select
    );
  },
  retrieveAdmins = async (filter, sort, populate) => {
    return await retrieveMany(adminModel, { ...filter }, { ...sort }, populate);
  },
  updateMultipleAdmin = async (filter, data) => {
    return await updateMany(
      adminModel,
      { _id: { $in: [...filter] } },
      { ...data }
    );
  },
  adminService = {
    updateMultipleAdmin,
    createAdmin,
    retriveAdmin,
    updateAdmin,
    deleteAdmin,
    retrieveAllAdmin,
    retrieveAdmins,
    updateManyAdmin,
  };
export default adminService;
