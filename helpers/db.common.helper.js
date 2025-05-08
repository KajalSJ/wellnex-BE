const createOne = async (model, data) => {
  return await model.create({ ...data });
},
  retrieveOne = async (model, filter, populate = undefined) => {
    const data = await model.findOne({ ...filter });
    if (populate) await data.populate(populate);
    return data;
  },
  updateOne = async (model, filter, data) => {
    return await model.findOneAndUpdate(
      { ...filter },
      { ...data },
      { new: true }
    );
  },
  upsertOneNew = async (model, filter, data, sort = undefined) => {
    return await model.findOneAndUpdate(
      { ...filter },
      { ...data },
      { ...sort }
    );
  },
  updateMany = async (model, filter, data) => {
    return await model.updateMany({ ...filter }, { ...data }, { multi: true });
  },
  retrieveById = async (model, id) => {
    return await model.findById(id);
  },
  retrieveMany = async (model, filter, sort, populate_data = "") => {
    const data = await model
      .find({ ...filter })
      .sort({ ...sort })
      .populate(populate_data.ref, populate_data.fields);
    return data;
  },
  retrieveManyWithPagination = async (
    model,
    filter,
    sort,
    limit,
    offset,
    select = undefined,
    populate = undefined
  ) => {
    return await model.paginate(
      { ...filter },
      { sort, limit, offset, select, populate }
    );
  },
  retrieveManyWithPaginationAggregation = async (
    model,
    aggregatePipeline,
    limit,
    page
  ) => {
    let FilteredData = model.aggregate(aggregatePipeline);
    return await model.aggregatePaginate(FilteredData, { limit, page });
  },
  retrieveManyWithAggregation = async (model, aggregatePipeline) => {
    return await model.aggregate(aggregatePipeline);
  },
  deleteOne = async (model, filter) => {
    return await model.deleteOne({ ...filter });
  },
  deleteMany = async (model, filter) => {
    return await model.deleteMany({ ...filter });
  },
  upsertOne = async (model, filter, update) => {
    return await model.findOneAndUpdate(
      { ...filter },
      { ...update },
      {
        upsert: true,
        new: true,
        setDefaultsOnInsert: true,
      }
    );
  },
  fetchFields = async (model, query = {}, fields = {}) => {
    try {
      const selectString = Object.keys(fields).reduce((acc, key) => {
        return acc + (fields[key] ? ` ${key}` : '');
      }, '');
      const data = await model.find(query).select(selectString.trim());
      return data;
    } catch (error) {
      console.error('Error fetching fields:', error);
      throw error;
    }
  },
  aggregate = async (model, pipeline) => {
    try {
      return await model.aggregate(pipeline);
    } catch (error) {
      throw error;
    }
  },
  commonHelper = {
    createOne,
    retrieveManyWithAggregation,
    retrieveMany,
    retrieveOne,
    updateOne,
    updateMany,
    retrieveById,
    deleteOne,
    upsertOneNew,
    deleteMany,
    upsertOne,
    retrieveManyWithPagination,
    retrieveManyWithPaginationAggregation,
    fetchFields,
    aggregate,
  };

export default commonHelper;
