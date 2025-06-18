import mongoose from "mongoose";
import mongoosePaginate from "mongoose-paginate-v2";

const { Schema } = mongoose,
    // Define the Question subdocument schema
    QuestionSchema = new Schema({
        name: {
            type: String,
            required: true
        }
    }, {
        timestamps: true
    }),
    ServiceSchema = new Schema({
        name: {
            type: String,
            required: true
        }
    }, {
        timestamps: true
    }),
    KeywordSchema = new Schema({
        name: {
            type: String,
            required: true
        }
    }, {
        timestamps: true
    }),
    businessSchema = new Schema(
        {
            name: {
                type: String,
                required: true,
            },
            contact_name: {
                type: String,
                required: true,
            },
            email: {
                type: String,
                required: true,
            },
            password: {
                type: String,
                default: null,
            },
            roles: {
                type: Array,
                default: ["business"],
            },
            loginToken: {
                type: String,
                default: null,
            },
            resetPasswordToken: {
                type: String,
                default: null,
            },
            resetPasswordExpires: {
                type: String,
                default: null,
            },
            loginTime: {
                type: Date,
                default: null,
            },
            website_url: {
                type: String,
                default: null,
            },
            instagram_url: {
                type: String,
                default: null,
            },
            mobile: {
                type: String,
                default: null,
            },
            nextStep: {
                type: String,
                default: null,
            },
            logo: {
                type: String,
                default: null,
            },
            themeColor: {
                type: String,
                default: null,
            },
            keywords: {
                type: [KeywordSchema],
                default: []
            },
            questions: {
                type: [QuestionSchema],
                default: []
            },
            services: {
                type: [ServiceSchema],
                default: []
            },
            isEmailVerified: {
                type: Boolean,
                default: false,
            },
            stripeCustomerId: {
                type: String,
                default: null
            },
            preferredCurrency: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'currency',
            },
            isDeleted: {
                type: Boolean,
                default: false
            },
            deletedAt: {
                type: Date,
                default: null
            },
            deletedBy: {
                type: Schema.Types.ObjectId,
                ref: 'admin',
                default: null
            },
            deletionReason: {
                type: String,
                default: null
            }
        },
        {
            versionKey: false,
            timestamps: true,
        }
    );

// Add middleware to exclude deleted businesses from queries
businessSchema.pre('find', function () {
    this.where({ isDeleted: false });
});

businessSchema.pre('countDocuments', function () {
    this.where({ isDeleted: false });
});

businessSchema.pre('findOne', function () {
    this.where({ isDeleted: false });
});

businessSchema.pre('findById', function () {
    this.where({ isDeleted: false });
});

businessSchema.plugin(mongoosePaginate);

const businessModel = mongoose.model("business", businessSchema);

export default businessModel;
