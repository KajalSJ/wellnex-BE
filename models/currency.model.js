import mongoose from "mongoose";
import mongoosePaginate from "mongoose-paginate-v2";

const { Schema } = mongoose;

const currencySchema = new Schema(
    {
        code: {
            type: String,
            required: true,
            unique: true,
            uppercase: true
        },
        name: {
            type: String,
            required: true
        },
        symbol: {
            type: String,
            required: true
        },
        isActive: {
            type: Boolean,
            default: true
        },
        isDefault: {
            type: Boolean,
            default: false
        }
    },
    {
        versionKey: false,
        timestamps: true
    }
);

currencySchema.plugin(mongoosePaginate);

const currencyModel = mongoose.model("currency", currencySchema);

export default currencyModel; 