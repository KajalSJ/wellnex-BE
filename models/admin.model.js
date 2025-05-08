import mongoose from "mongoose";
import mongoosePaginate from "mongoose-paginate-v2";

const { Schema } = mongoose,
  adminSchema = new Schema(
    {
      name: {
        type: String,
        required: true,
      },
      avatar: {
        type: String,
        default: null,
      },
      email: {
        type: String,
        required: true,
      },
      password: {
        type: String,
        default: null,
      },
      timezone: {
        type: String,
        default: null,
      },
      roles: {
        type: Array,
        default: ["admin"],
      },
      loginToken: {
        type: String,
        default: null,
      },
      active: {
        type: Number,
        default: 0,
      },
      inactive: {
        type: Number,
        default: 0,
      },
      mincharge: {
        type: Number,
        default: 0,
      },
      loginTime: {
        type: Date,
        default: null,
      },
    },
    {
      versionKey: false,
      timestamps: true,
    }
  );

adminSchema.plugin(mongoosePaginate);

const adminModel = mongoose.model("admin", adminSchema);

export default adminModel;
